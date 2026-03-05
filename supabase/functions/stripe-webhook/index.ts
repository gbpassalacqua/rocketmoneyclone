import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

import Stripe from "https://esm.sh/stripe@13.6.0?target=deno"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' })
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Verify webhook signature
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing stripe-signature header' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message)
      return new Response(
        JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`Processing Stripe event: ${event.type}`)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string

        if (customerId && subscriptionId) {
          // Find tenant by stripe_customer_id and upgrade to premium
          const { error } = await supabase
            .from('tenants')
            .update({
              plan: 'premium',
              plan_expires_at: null, // Active subscription, no fixed expiry
            })
            .eq('stripe_customer_id', customerId)

          if (error) {
            console.error('Error updating tenant on checkout.session.completed:', error)
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const status = subscription.status

        // Map Stripe subscription status to plan
        const plan = (status === 'active' || status === 'trialing') ? 'premium' : 'free'
        const planExpiresAt = plan === 'premium'
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null

        const { error } = await supabase
          .from('tenants')
          .update({ plan, plan_expires_at: planExpiresAt })
          .eq('stripe_customer_id', customerId)

        if (error) {
          console.error('Error updating tenant on subscription.updated:', error)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Downgrade to free
        const { error } = await supabase
          .from('tenants')
          .update({ plan: 'free', plan_expires_at: null })
          .eq('stripe_customer_id', customerId)

        if (error) {
          console.error('Error updating tenant on subscription.deleted:', error)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        if (invoice.subscription) {
          // Renew premium plan on successful payment
          const { error } = await supabase
            .from('tenants')
            .update({ plan: 'premium' })
            .eq('stripe_customer_id', customerId)

          if (error) {
            console.error('Error updating tenant on invoice.payment_succeeded:', error)
          }
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
