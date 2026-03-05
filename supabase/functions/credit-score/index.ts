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

    // Fetch financial data in parallel
    const [accountsRes, transactionsRes, subscriptionsRes] = await Promise.all([
      supabase
        .from('accounts')
        .select('id, balance, type, created_at')
        .eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('id, amount, date, is_recurring, category')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(500),
      supabase
        .from('subscriptions')
        .select('id, amount, status, detected_at')
        .eq('user_id', user.id),
    ])

    const accounts = accountsRes.data || []
    const transactions = transactionsRes.data || []
    const subscriptions = subscriptionsRes.data || []

    // --- Calculate simulated credit score factors ---

    // 1. Payment consistency (0-35 points)
    // Based on recurring transactions regularity
    const recurringTx = transactions.filter((t: { is_recurring: boolean }) => t.is_recurring)
    const paymentConsistencyRatio = transactions.length > 0
      ? Math.min(recurringTx.length / Math.max(transactions.length * 0.3, 1), 1)
      : 0
    const paymentConsistencyScore = Math.round(paymentConsistencyRatio * 35)

    // 2. Debt ratio (0-30 points)
    // Lower debt-to-balance ratio is better
    const totalBalance = accounts.reduce(
      (sum: number, a: { balance: number }) => sum + Number(a.balance),
      0,
    )
    const totalDebt = transactions
      .filter((t: { amount: number }) => Number(t.amount) < 0)
      .reduce((sum: number, t: { amount: number }) => sum + Math.abs(Number(t.amount)), 0)
    const debtRatio = totalBalance > 0 ? Math.min(totalDebt / totalBalance, 2) : 1
    const debtRatioScore = Math.round((1 - Math.min(debtRatio, 1)) * 30)

    // 3. Account age (0-15 points)
    // Older accounts are better
    const now = new Date()
    const oldestAccount = accounts.reduce((oldest: Date | null, a: { created_at: string }) => {
      const created = new Date(a.created_at)
      return oldest === null || created < oldest ? created : oldest
    }, null as Date | null)
    const accountAgeMonths = oldestAccount
      ? (now.getTime() - oldestAccount.getTime()) / (1000 * 60 * 60 * 24 * 30)
      : 0
    const accountAgeScore = Math.round(Math.min(accountAgeMonths / 24, 1) * 15)

    // 4. Subscription management (0-20 points)
    // Moderate number of active subscriptions is good, too many is bad
    const activeSubscriptions = subscriptions.filter(
      (s: { status: string }) => s.status === 'active',
    )
    const subCount = activeSubscriptions.length
    let subscriptionScore: number
    if (subCount === 0) {
      subscriptionScore = 10 // No subscriptions: neutral
    } else if (subCount <= 5) {
      subscriptionScore = 20 // Well-managed
    } else if (subCount <= 10) {
      subscriptionScore = 15 // Moderate
    } else {
      subscriptionScore = Math.max(20 - (subCount - 10) * 2, 0) // Too many
    }

    // Base score starts at 300, add factor scores scaled to 300-850 range
    const rawScore = paymentConsistencyScore + debtRatioScore + accountAgeScore + subscriptionScore
    // rawScore is 0-100, map to 300-850
    const creditScore = Math.round(300 + (rawScore / 100) * 550)
    const clampedScore = Math.min(Math.max(creditScore, 300), 850)

    const factors = {
      payment_consistency: {
        score: paymentConsistencyScore,
        max: 35,
        detail: `${recurringTx.length} recurring out of ${transactions.length} transactions`,
      },
      debt_ratio: {
        score: debtRatioScore,
        max: 30,
        detail: `Debt ratio: ${(debtRatio * 100).toFixed(1)}%`,
      },
      account_age: {
        score: accountAgeScore,
        max: 15,
        detail: `Oldest account: ${Math.round(accountAgeMonths)} months`,
      },
      subscription_management: {
        score: subscriptionScore,
        max: 20,
        detail: `${subCount} active subscriptions`,
      },
    }

    // Store in credit_score_history
    const { data: scoreRecord, error: insertError } = await supabase
      .from('credit_score_history')
      .insert({
        tenant_id: profile.tenant_id,
        user_id: user.id,
        score: clampedScore,
        provider: 'simulated',
        factors,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting credit score:', insertError)
      throw new Error(`Failed to store credit score: ${insertError.message}`)
    }

    return new Response(
      JSON.stringify({
        score: clampedScore,
        factors,
        recorded_at: scoreRecord.recorded_at,
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
