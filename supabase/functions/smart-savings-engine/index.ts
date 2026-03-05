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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Get all active smart_savings configs
    const { data: configs, error: configError } = await supabase
      .from('smart_savings')
      .select('*')
      .eq('is_active', true)

    if (configError) {
      throw new Error(`Failed to fetch smart_savings configs: ${configError.message}`)
    }

    if (!configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active smart savings configs found', transfers: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let totalTransfers = 0
    const results: Array<{ user_id: string; amount: number; status: string }> = []

    for (const config of configs) {
      try {
        // Get user's total account balance
        const { data: accounts, error: accountError } = await supabase
          .from('accounts')
          .select('balance')
          .eq('user_id', config.user_id)

        if (accountError || !accounts || accounts.length === 0) {
          results.push({ user_id: config.user_id, amount: 0, status: 'no_accounts' })
          continue
        }

        const totalBalance = accounts.reduce(
          (sum: number, acc: { balance: number }) => sum + Number(acc.balance),
          0,
        )

        // Calculate safe transfer amount
        const availableForSavings = totalBalance - Number(config.min_balance_protection)

        if (availableForSavings <= 0) {
          results.push({ user_id: config.user_id, amount: 0, status: 'insufficient_balance' })
          continue
        }

        // Check if goal has been reached
        const remainingToGoal = Number(config.goal_amount) - Number(config.current_amount)
        if (remainingToGoal <= 0) {
          results.push({ user_id: config.user_id, amount: 0, status: 'goal_reached' })
          continue
        }

        // Calculate transfer amount: min of available, max_per_transfer, and remaining to goal
        const transferAmount = Math.min(
          availableForSavings,
          Number(config.max_per_transfer),
          remainingToGoal,
        )

        if (transferAmount <= 0) {
          results.push({ user_id: config.user_id, amount: 0, status: 'no_transfer_needed' })
          continue
        }

        // Round to 2 decimal places
        const roundedAmount = Math.round(transferAmount * 100) / 100

        // Insert transfer record
        const { error: transferError } = await supabase
          .from('smart_savings_transfers')
          .insert({
            tenant_id: config.tenant_id,
            user_id: config.user_id,
            amount: roundedAmount,
            balance_before: totalBalance,
            balance_after: totalBalance - roundedAmount,
          })

        if (transferError) {
          console.error(`Transfer insert failed for user ${config.user_id}:`, transferError)
          results.push({ user_id: config.user_id, amount: 0, status: 'transfer_insert_failed' })
          continue
        }

        // Update current_amount in smart_savings
        const newCurrentAmount = Number(config.current_amount) + roundedAmount
        const { error: updateError } = await supabase
          .from('smart_savings')
          .update({ current_amount: newCurrentAmount })
          .eq('id', config.id)

        if (updateError) {
          console.error(`Smart savings update failed for user ${config.user_id}:`, updateError)
          results.push({ user_id: config.user_id, amount: roundedAmount, status: 'update_failed' })
          continue
        }

        totalTransfers++
        results.push({ user_id: config.user_id, amount: roundedAmount, status: 'success' })
      } catch (innerErr) {
        console.error(`Error processing config ${config.id}:`, innerErr)
        results.push({ user_id: config.user_id, amount: 0, status: 'error' })
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${configs.length} configs, ${totalTransfers} transfers executed`,
        transfers: totalTransfers,
        results,
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
