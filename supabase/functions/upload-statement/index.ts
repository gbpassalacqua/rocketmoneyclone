import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function parseCSV(csvText: string): Array<{ date: string; description: string; amount: string }> {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row')
  }

  // Parse header to find column indices
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const dateIdx = header.findIndex((h) => h === 'date')
  const descIdx = header.findIndex((h) => h === 'description')
  const amountIdx = header.findIndex((h) => h === 'amount')

  if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
    throw new Error('CSV must contain columns: date, description, amount')
  }

  const rows: Array<{ date: string; description: string; amount: string }> = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Simple CSV parsing that handles quoted fields
    const fields: string[] = []
    let current = ''
    let inQuotes = false

    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    fields.push(current.trim())

    if (fields.length > Math.max(dateIdx, descIdx, amountIdx)) {
      rows.push({
        date: fields[dateIdx].replace(/^"|"$/g, ''),
        description: fields[descIdx].replace(/^"|"$/g, ''),
        amount: fields[amountIdx].replace(/^"|"$/g, ''),
      })
    }
  }

  return rows
}

function parseDate(dateStr: string): string | null {
  // Try common date formats: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) return dateStr

  const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (usMatch) {
    const [, month, day, year] = usMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Try Date.parse as fallback
  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0]
  }

  return null
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

    // Read CSV from request body
    const contentType = req.headers.get('content-type') || ''
    let csvText: string

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file')
      if (!file || !(file instanceof File)) {
        return new Response(
          JSON.stringify({ error: 'No file found in form data. Send a CSV file with key "file"' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      csvText = await file.text()
    } else {
      // Assume raw CSV in body
      csvText = await req.text()
    }

    if (!csvText || csvText.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Empty CSV body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Parse CSV
    let rows: Array<{ date: string; description: string; amount: string }>
    try {
      rows = parseCSV(csvText)
    } catch (parseErr) {
      return new Response(
        JSON.stringify({ error: `CSV parsing error: ${(parseErr as Error).message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid data rows found in CSV' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Build transaction records
    const transactions = []
    const errors: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const parsedDate = parseDate(row.date)
      const amount = parseFloat(row.amount.replace(/[^0-9.\-]/g, ''))

      if (!parsedDate) {
        errors.push(`Row ${i + 1}: invalid date "${row.date}"`)
        continue
      }

      if (isNaN(amount)) {
        errors.push(`Row ${i + 1}: invalid amount "${row.amount}"`)
        continue
      }

      transactions.push({
        tenant_id: profile.tenant_id,
        user_id: user.id,
        description: row.description,
        merchant_name: row.description,
        amount,
        date: parsedDate,
        category: 'imported',
      })
    }

    if (transactions.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid transactions found in CSV', details: errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Insert in batches of 100
    let insertedCount = 0
    const batchSize = 100

    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize)
      const { data, error: insertError } = await supabase
        .from('transactions')
        .insert(batch)
        .select('id')

      if (insertError) {
        console.error(`Error inserting batch at index ${i}:`, insertError)
        errors.push(`Batch insert error at row ${i + 1}: ${insertError.message}`)
      } else {
        insertedCount += (data?.length || 0)
      }
    }

    return new Response(
      JSON.stringify({
        imported: insertedCount,
        total_rows: rows.length,
        skipped: rows.length - transactions.length,
        errors: errors.length > 0 ? errors : undefined,
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
