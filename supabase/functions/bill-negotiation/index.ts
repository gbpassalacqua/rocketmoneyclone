import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Get user profile for tenant_id
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Parse request body
    const { service_name, current_amount } = await req.json()

    if (!service_name || !current_amount) {
      return new Response(
        JSON.stringify({ error: 'service_name and current_amount are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const currentAmountNum = Number(current_amount)
    if (isNaN(currentAmountNum) || currentAmountNum <= 0) {
      return new Response(
        JSON.stringify({ error: 'current_amount must be a positive number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Simulate negotiation: calculate potential savings (10-30%)
    const savingsPercentage = 10 + Math.random() * 20 // 10% to 30%
    const roundedPercentage = Math.round(savingsPercentage * 10) / 10
    const monthlySavings = Math.round(currentAmountNum * (roundedPercentage / 100) * 100) / 100
    const negotiatedAmount = Math.round((currentAmountNum - monthlySavings) * 100) / 100
    const annualSavings = Math.round(monthlySavings * 12 * 100) / 100

    // Fee is 40% of first year savings (as defined in schema default)
    const feePercentage = 40
    const feeAmount = Math.round(annualSavings * (feePercentage / 100) * 100) / 100

    // Create bill_negotiations record
    const { data: negotiation, error: insertError } = await supabase
      .from('bill_negotiations')
      .insert({
        tenant_id: profile.tenant_id,
        user_id: user.id,
        service_name,
        current_amount: currentAmountNum,
        negotiated_amount: negotiatedAmount,
        annual_savings: annualSavings,
        fee_percentage: feePercentage,
        fee_amount: feeAmount,
        status: 'pending',
        notes: `Estimated ${roundedPercentage}% savings on ${service_name}`,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating bill negotiation:', insertError)
      throw new Error(`Failed to create negotiation: ${insertError.message}`)
    }

    // Create alert for the user
    const { error: alertError } = await supabase
      .from('alerts')
      .insert({
        tenant_id: profile.tenant_id,
        user_id: user.id,
        type: 'bill_negotiation',
        message: `Bill negotiation started for ${service_name}. Potential annual savings: $${annualSavings.toFixed(2)}`,
        related_entity_id: negotiation.id,
      })

    if (alertError) {
      console.error('Error creating alert:', alertError)
      // Non-fatal: negotiation was still created
    }

    return new Response(
      JSON.stringify({
        negotiation: {
          id: negotiation.id,
          service_name,
          current_amount: currentAmountNum,
          negotiated_amount: negotiatedAmount,
          estimated_savings_percentage: roundedPercentage,
          annual_savings: annualSavings,
          fee_percentage: feePercentage,
          fee_amount: feeAmount,
          status: 'pending',
        },
      }),
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
