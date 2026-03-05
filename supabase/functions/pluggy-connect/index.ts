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
    // 1. Authenticate the Supabase user from the Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const pluggyClientId = Deno.env.get('PLUGGY_CLIENT_ID')!
    const pluggyClientSecret = Deno.env.get('PLUGGY_CLIENT_SECRET')!

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Authenticate with the Pluggy API to get an API key
    const authResponse = await fetch('https://api.pluggy.ai/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: pluggyClientId,
        clientSecret: pluggyClientSecret,
      }),
    })

    if (!authResponse.ok) {
      const authErrorBody = await authResponse.text()
      console.error('Pluggy auth failed:', authResponse.status, authErrorBody)
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with Pluggy API' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { apiKey } = await authResponse.json()

    // 3. Create a connect token using the Pluggy API key
    const webhookUrl = `${supabaseUrl}/functions/v1/pluggy-webhook`

    const connectResponse = await fetch('https://api.pluggy.ai/connect_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({
        webhookUrl,
      }),
    })

    if (!connectResponse.ok) {
      const connectErrorBody = await connectResponse.text()
      console.error('Pluggy connect token failed:', connectResponse.status, connectErrorBody)
      return new Response(
        JSON.stringify({ error: 'Failed to create Pluggy connect token' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { accessToken } = await connectResponse.json()

    // 4. Return the connect token to the frontend
    return new Response(
      JSON.stringify({ connectToken: accessToken }),
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
