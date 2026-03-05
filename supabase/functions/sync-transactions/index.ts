// supabase/functions/sync-transactions/index.ts
// Syncs transactions from Pluggy API to Supabase database.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PluggyAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
  currencyCode: string;
  itemId: string;
}

interface PluggyTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string | null;
  merchantName: string | null;
  accountId: string;
}

interface SyncSummary {
  connectionsProcessed: number;
  accountsUpserted: number;
  transactionsUpserted: number;
  errors: string[];
}

async function getPluggyApiKey(): Promise<string> {
  const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Missing PLUGGY_CLIENT_ID or PLUGGY_CLIENT_SECRET");
  }

  const response = await fetch("https://api.pluggy.ai/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pluggy auth failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.apiKey;
}

async function fetchPluggyAccounts(
  apiKey: string,
  itemId: string
): Promise<PluggyAccount[]> {
  const response = await fetch(
    `https://api.pluggy.ai/accounts?itemId=${itemId}`,
    {
      headers: { "X-API-KEY": apiKey },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to fetch accounts for item ${itemId} (${response.status}): ${body}`
    );
  }

  const data = await response.json();
  return data.results ?? [];
}

async function fetchPluggyTransactions(
  apiKey: string,
  accountId: string,
  fromDate?: string
): Promise<PluggyTransaction[]> {
  let url = `https://api.pluggy.ai/transactions?accountId=${accountId}`;
  if (fromDate) {
    url += `&from=${fromDate}`;
  }

  const allTransactions: PluggyTransaction[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const pagedUrl = `${url}&page=${page}`;
    const response = await fetch(pagedUrl, {
      headers: { "X-API-KEY": apiKey },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to fetch transactions for account ${accountId} (${response.status}): ${body}`
      );
    }

    const data = await response.json();
    const results: PluggyTransaction[] = data.results ?? [];
    allTransactions.push(...results);

    totalPages = data.totalPages ?? 1;
    page++;
  }

  return allTransactions;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ----------------------------------------------------------------
    // 1. Authenticate the user from the Authorization header
    // ----------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client scoped to the calling user (for auth verification)
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Service-role client for unrestricted DB operations (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // ----------------------------------------------------------------
    // 2. Get user profile (for tenant_id) and bank connections
    // ----------------------------------------------------------------
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "User profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantId = profile.tenant_id;

    const { data: connections, error: connError } = await supabaseAdmin
      .from("bank_connections")
      .select("id, pluggy_item_id, last_sync, status")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId);

    if (connError) {
      throw new Error(`Failed to fetch bank connections: ${connError.message}`);
    }

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No bank connections found",
          summary: {
            connectionsProcessed: 0,
            accountsUpserted: 0,
            transactionsUpserted: 0,
            errors: [],
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ----------------------------------------------------------------
    // 3. Authenticate with Pluggy API
    // ----------------------------------------------------------------
    const pluggyApiKey = await getPluggyApiKey();

    // ----------------------------------------------------------------
    // 4-7. For each connection, sync accounts and transactions
    // ----------------------------------------------------------------
    const summary: SyncSummary = {
      connectionsProcessed: 0,
      accountsUpserted: 0,
      transactionsUpserted: 0,
      errors: [],
    };

    for (const connection of connections) {
      try {
        // Skip inactive connections
        if (connection.status !== "active") {
          continue;
        }

        // 4. Fetch accounts from Pluggy
        const pluggyAccounts = await fetchPluggyAccounts(
          pluggyApiKey,
          connection.pluggy_item_id
        );

        // 6a. Upsert accounts into Supabase
        for (const pa of pluggyAccounts) {
          const { error: accountError } = await supabaseAdmin
            .from("accounts")
            .upsert(
              {
                tenant_id: tenantId,
                user_id: user.id,
                bank_connection_id: connection.id,
                pluggy_account_id: pa.id,
                name: pa.name,
                type: pa.type,
                balance: pa.balance,
                currency: pa.currencyCode ?? "BRL",
              },
              { onConflict: "pluggy_account_id" }
            );

          if (accountError) {
            summary.errors.push(
              `Account upsert failed (${pa.id}): ${accountError.message}`
            );
            continue;
          }

          summary.accountsUpserted++;

          // Look up the internal account id for this pluggy account
          const { data: accountRow } = await supabaseAdmin
            .from("accounts")
            .select("id")
            .eq("pluggy_account_id", pa.id)
            .eq("user_id", user.id)
            .single();

          if (!accountRow) {
            summary.errors.push(
              `Could not find account row for pluggy_account_id ${pa.id}`
            );
            continue;
          }

          // 5. Fetch transactions from Pluggy
          const fromDate = connection.last_sync
            ? connection.last_sync.split("T")[0]
            : undefined;

          const pluggyTransactions = await fetchPluggyTransactions(
            pluggyApiKey,
            pa.id,
            fromDate
          );

          // 6b. Upsert transactions into Supabase
          if (pluggyTransactions.length > 0) {
            // Batch upsert in chunks of 500
            const chunkSize = 500;
            for (let i = 0; i < pluggyTransactions.length; i += chunkSize) {
              const chunk = pluggyTransactions.slice(i, i + chunkSize);
              const rows = chunk.map((pt) => ({
                tenant_id: tenantId,
                user_id: user.id,
                account_id: accountRow.id,
                pluggy_tx_id: pt.id,
                amount: pt.amount,
                description: pt.description,
                merchant_name: pt.merchantName ?? null,
                category: pt.category ?? null,
                date: pt.date ? pt.date.split("T")[0] : null,
              }));

              const { error: txError } = await supabaseAdmin
                .from("transactions")
                .upsert(rows, { onConflict: "pluggy_tx_id" });

              if (txError) {
                summary.errors.push(
                  `Transaction upsert failed for account ${pa.id}: ${txError.message}`
                );
              } else {
                summary.transactionsUpserted += chunk.length;
              }
            }
          }
        }

        // 7. Update bank_connection.last_sync timestamp
        const { error: syncUpdateError } = await supabaseAdmin
          .from("bank_connections")
          .update({ last_sync: new Date().toISOString() })
          .eq("id", connection.id);

        if (syncUpdateError) {
          summary.errors.push(
            `Failed to update last_sync for connection ${connection.id}: ${syncUpdateError.message}`
          );
        }

        summary.connectionsProcessed++;
      } catch (connSyncError) {
        const message =
          connSyncError instanceof Error
            ? connSyncError.message
            : String(connSyncError);
        summary.errors.push(
          `Connection ${connection.id} sync failed: ${message}`
        );
      }
    }

    // ----------------------------------------------------------------
    // 8. Return summary
    // ----------------------------------------------------------------
    return new Response(
      JSON.stringify({ success: true, summary }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
