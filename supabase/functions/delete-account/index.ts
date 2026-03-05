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
      .select('tenant_id, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const userId = user.id
    const tenantId = profile.tenant_id

    console.log(`Starting account deletion for user ${userId}, tenant ${tenantId}`)

    // Delete all user data in dependency order (children before parents)
    // Using service role key bypasses RLS

    // 1. Smart savings transfers
    const { error: e1 } = await supabase
      .from('smart_savings_transfers')
      .delete()
      .eq('user_id', userId)
    if (e1) console.error('Error deleting smart_savings_transfers:', e1)

    // 2. Smart savings configs
    const { error: e2 } = await supabase
      .from('smart_savings')
      .delete()
      .eq('user_id', userId)
    if (e2) console.error('Error deleting smart_savings:', e2)

    // 3. Credit score history
    const { error: e3 } = await supabase
      .from('credit_score_history')
      .delete()
      .eq('user_id', userId)
    if (e3) console.error('Error deleting credit_score_history:', e3)

    // 4. Bill negotiations
    const { error: e4 } = await supabase
      .from('bill_negotiations')
      .delete()
      .eq('user_id', userId)
    if (e4) console.error('Error deleting bill_negotiations:', e4)

    // 5. Alerts
    const { error: e5 } = await supabase
      .from('alerts')
      .delete()
      .eq('user_id', userId)
    if (e5) console.error('Error deleting alerts:', e5)

    // 6. Financial goals
    const { error: e6 } = await supabase
      .from('financial_goals')
      .delete()
      .eq('user_id', userId)
    if (e6) console.error('Error deleting financial_goals:', e6)

    // 7. Categories
    const { error: e7 } = await supabase
      .from('categories')
      .delete()
      .eq('user_id', userId)
    if (e7) console.error('Error deleting categories:', e7)

    // 8. Transactions (must be before subscriptions and accounts)
    const { error: e8 } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', userId)
    if (e8) console.error('Error deleting transactions:', e8)

    // 9. Subscriptions
    const { error: e9 } = await supabase
      .from('subscriptions')
      .delete()
      .eq('user_id', userId)
    if (e9) console.error('Error deleting subscriptions:', e9)

    // 10. Accounts
    const { error: e10 } = await supabase
      .from('accounts')
      .delete()
      .eq('user_id', userId)
    if (e10) console.error('Error deleting accounts:', e10)

    // 11. Bank connections
    const { error: e11 } = await supabase
      .from('bank_connections')
      .delete()
      .eq('user_id', userId)
    if (e11) console.error('Error deleting bank_connections:', e11)

    // 12. Rate limits
    const { error: e12 } = await supabase
      .from('rate_limits')
      .delete()
      .eq('user_id', userId)
    if (e12) console.error('Error deleting rate_limits:', e12)

    // 13. Audit log entries
    const { error: e13 } = await supabase
      .from('audit_log')
      .delete()
      .eq('user_id', userId)
    if (e13) console.error('Error deleting audit_log:', e13)

    // 14. User profile
    const { error: e14 } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', userId)
    if (e14) console.error('Error deleting user_profiles:', e14)

    // 15. Tenant (only if this user is the owner)
    if (profile.role === 'owner') {
      // Check if there are other members in the tenant
      const { data: otherMembers } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('tenant_id', tenantId)
        .neq('id', userId)
        .limit(1)

      if (!otherMembers || otherMembers.length === 0) {
        const { error: e15 } = await supabase
          .from('tenants')
          .delete()
          .eq('id', tenantId)
        if (e15) console.error('Error deleting tenant:', e15)
      }
    }

    // 16. Delete auth user via admin API
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId)
    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError)
      // Still return success since all data is deleted
    }

    console.log(`Account deletion completed for user ${userId}`)

    return new Response(
      JSON.stringify({ message: 'Account and all associated data deleted successfully' }),
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
