import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Transaction {
  id: string;
  amount: number;
  merchant_name: string;
  category: string | null;
  date: string;
  description: string | null;
}

interface MerchantGroup {
  merchant_name: string;
  transactions: Transaction[];
  amounts: number[];
  dates: Date[];
  category: string | null;
}

interface DetectedSubscription {
  merchant_name: string;
  amount: number;
  currency: string;
  frequency: string;
  next_charge_date: string;
  risk_score: number;
  category: string | null;
  status: string;
  detected_at: string;
}

// Categories generally considered essential/necessary
const ESSENTIAL_CATEGORIES = [
  "housing",
  "rent",
  "mortgage",
  "utilities",
  "electricity",
  "water",
  "gas",
  "internet",
  "phone",
  "insurance",
  "health",
  "healthcare",
  "medical",
  "education",
];

// Categories generally considered discretionary
const DISCRETIONARY_CATEGORIES = [
  "entertainment",
  "streaming",
  "gaming",
  "music",
  "subscription",
  "shopping",
  "food_delivery",
  "lifestyle",
  "fitness",
  "dating",
  "news",
  "cloud_storage",
  "software",
];

/**
 * Calculate the average interval in days between a sorted list of dates.
 */
function averageIntervalDays(dates: Date[]): number {
  if (dates.length < 2) return 0;

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  let totalDays = 0;

  for (let i = 1; i < sorted.length; i++) {
    const diffMs = sorted[i].getTime() - sorted[i - 1].getTime();
    totalDays += diffMs / (1000 * 60 * 60 * 24);
  }

  return totalDays / (sorted.length - 1);
}

/**
 * Determine the standard deviation of intervals to assess regularity.
 */
function intervalStdDev(dates: Date[]): number {
  if (dates.length < 3) return 0;

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const intervals: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const diffDays =
      (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24);
    intervals.push(diffDays);
  }

  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const variance =
    intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;

  return Math.sqrt(variance);
}

/**
 * Check whether amounts are similar enough to be the same subscription.
 * Allows up to 15% variation to handle taxes/currency fluctuations.
 */
function amountsAreSimilar(amounts: number[]): boolean {
  if (amounts.length < 2) return true;

  const median = [...amounts].sort((a, b) => a - b)[
    Math.floor(amounts.length / 2)
  ];
  if (median === 0) return false;

  return amounts.every(
    (a) => Math.abs(a - median) / Math.abs(median) <= 0.15
  );
}

/**
 * Detect frequency from the average interval in days.
 */
function detectFrequency(avgDays: number): string | null {
  if (avgDays >= 5 && avgDays <= 9) return "weekly";
  if (avgDays >= 12 && avgDays <= 18) return "biweekly";
  if (avgDays >= 25 && avgDays <= 35) return "monthly";
  if (avgDays >= 55 && avgDays <= 70) return "bimonthly";
  if (avgDays >= 80 && avgDays <= 100) return "quarterly";
  if (avgDays >= 160 && avgDays <= 200) return "semiannual";
  if (avgDays >= 340 && avgDays <= 395) return "yearly";
  return null;
}

/**
 * Compute the next expected charge date based on frequency and last charge.
 */
function computeNextChargeDate(lastDate: Date, frequency: string): Date {
  const next = new Date(lastDate);

  switch (frequency) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "bimonthly":
      next.setMonth(next.getMonth() + 2);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      break;
    case "semiannual":
      next.setMonth(next.getMonth() + 6);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }

  return next;
}

/**
 * Calculate a risk score (0-100) based on how discretionary the subscription is.
 *
 * Factors:
 *  - Category: essential categories get lower risk, discretionary get higher
 *  - Amount: higher amounts are riskier
 *  - Frequency: more frequent charges accumulate faster
 */
function calculateRiskScore(
  amount: number,
  frequency: string,
  category: string | null
): number {
  let score = 50; // baseline

  // Category factor
  const lowerCat = (category || "").toLowerCase();
  if (ESSENTIAL_CATEGORIES.some((c) => lowerCat.includes(c))) {
    score -= 30;
  } else if (DISCRETIONARY_CATEGORIES.some((c) => lowerCat.includes(c))) {
    score += 20;
  }

  // Amount factor (higher = more risk)
  if (amount > 200) {
    score += 15;
  } else if (amount > 100) {
    score += 10;
  } else if (amount > 50) {
    score += 5;
  } else if (amount < 15) {
    score -= 5;
  }

  // Frequency factor (more frequent = accumulates faster = higher risk)
  switch (frequency) {
    case "weekly":
      score += 10;
      break;
    case "biweekly":
      score += 5;
      break;
    case "monthly":
      break; // neutral
    case "quarterly":
      score -= 5;
      break;
    case "semiannual":
      score -= 8;
      break;
    case "yearly":
      score -= 10;
      break;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Analyze a group of transactions for the same merchant and determine
 * if they represent a recurring subscription.
 */
function analyzeGroup(group: MerchantGroup): DetectedSubscription | null {
  const { merchant_name, transactions, amounts, dates, category } = group;

  // Need at least 2 transactions to detect a pattern
  if (transactions.length < 2) return null;

  // Check that amounts are reasonably consistent
  if (!amountsAreSimilar(amounts)) return null;

  const avgInterval = averageIntervalDays(dates);
  const stdDev = intervalStdDev(dates);

  // Detect the frequency from the average interval
  const frequency = detectFrequency(avgInterval);
  if (!frequency) return null;

  // Ensure regularity: standard deviation should be within a reasonable range
  // Allow up to 30% of the average interval as deviation
  if (dates.length >= 3 && stdDev > avgInterval * 0.3) return null;

  // Calculate the median amount as the subscription price
  const sortedAmounts = [...amounts].sort((a, b) => a - b);
  const medianAmount = sortedAmounts[Math.floor(sortedAmounts.length / 2)];

  // Calculate next charge date from the most recent transaction
  const mostRecentDate = new Date(
    Math.max(...dates.map((d) => d.getTime()))
  );
  const nextChargeDate = computeNextChargeDate(mostRecentDate, frequency);

  const riskScore = calculateRiskScore(medianAmount, frequency, category);

  return {
    merchant_name,
    amount: Math.round(medianAmount * 100) / 100,
    currency: "BRL",
    frequency,
    next_charge_date: nextChargeDate.toISOString().split("T")[0],
    risk_score: riskScore,
    category,
    status: "active",
    detected_at: new Date().toISOString(),
  };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate the user from the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create a client with the user's JWT to verify identity
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    // Use service role client for database operations (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 2. Get user's profile for tenant_id
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("tenant_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "User profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantId = profile.tenant_id;

    // 3. Fetch transactions from the last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const cutoffDate = ninetyDaysAgo.toISOString().split("T")[0];

    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("id, amount, merchant_name, category, date, description")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .gte("date", cutoffDate)
      .order("date", { ascending: true });

    if (txError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch transactions", details: txError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!transactions || transactions.length === 0) {
      return new Response(
        JSON.stringify({ detected: [], message: "No transactions found in the last 90 days" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Group transactions by merchant_name
    const merchantGroups = new Map<string, MerchantGroup>();

    for (const tx of transactions as Transaction[]) {
      if (!tx.merchant_name) continue;

      const key = tx.merchant_name.trim().toLowerCase();
      if (!merchantGroups.has(key)) {
        merchantGroups.set(key, {
          merchant_name: tx.merchant_name.trim(),
          transactions: [],
          amounts: [],
          dates: [],
          category: tx.category,
        });
      }

      const group = merchantGroups.get(key)!;
      group.transactions.push(tx);
      group.amounts.push(Math.abs(Number(tx.amount)));
      group.dates.push(new Date(tx.date));

      // Keep the most common category
      if (tx.category && !group.category) {
        group.category = tx.category;
      }
    }

    // 5. Analyze each merchant group for recurring patterns
    const detectedSubscriptions: DetectedSubscription[] = [];

    for (const [, group] of merchantGroups) {
      const result = analyzeGroup(group);
      if (result) {
        detectedSubscriptions.push(result);
      }
    }

    // 6. Get existing subscriptions to determine which ones are new
    const { data: existingSubscriptions } = await supabase
      .from("subscriptions")
      .select("id, merchant_name")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId);

    const existingMerchants = new Set(
      (existingSubscriptions || []).map((s: { merchant_name: string }) =>
        s.merchant_name?.trim().toLowerCase()
      )
    );

    // 7. Upsert detected subscriptions into the subscriptions table
    const upsertedSubscriptions = [];
    const newlyDetected = [];

    for (const sub of detectedSubscriptions) {
      const { data: upserted, error: upsertError } = await supabase
        .from("subscriptions")
        .upsert(
          {
            tenant_id: tenantId,
            user_id: userId,
            merchant_name: sub.merchant_name,
            amount: sub.amount,
            currency: sub.currency,
            frequency: sub.frequency,
            next_charge_date: sub.next_charge_date,
            risk_score: sub.risk_score,
            category: sub.category,
            status: sub.status,
            detected_at: sub.detected_at,
          },
          {
            onConflict: "user_id,merchant_name",
            ignoreDuplicates: false,
          }
        )
        .select()
        .single();

      if (upsertError) {
        // If unique constraint upsert fails, try update by matching user+merchant
        const { data: existing } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", userId)
          .eq("tenant_id", tenantId)
          .ilike("merchant_name", sub.merchant_name)
          .single();

        if (existing) {
          const { data: updated } = await supabase
            .from("subscriptions")
            .update({
              amount: sub.amount,
              frequency: sub.frequency,
              next_charge_date: sub.next_charge_date,
              risk_score: sub.risk_score,
              category: sub.category,
              status: sub.status,
              detected_at: sub.detected_at,
            })
            .eq("id", existing.id)
            .select()
            .single();

          if (updated) upsertedSubscriptions.push(updated);
        } else {
          // Insert as new
          const { data: inserted } = await supabase
            .from("subscriptions")
            .insert({
              tenant_id: tenantId,
              user_id: userId,
              merchant_name: sub.merchant_name,
              amount: sub.amount,
              currency: sub.currency,
              frequency: sub.frequency,
              next_charge_date: sub.next_charge_date,
              risk_score: sub.risk_score,
              category: sub.category,
              status: sub.status,
              detected_at: sub.detected_at,
            })
            .select()
            .single();

          if (inserted) {
            upsertedSubscriptions.push(inserted);
            newlyDetected.push(inserted);
          }
        }
      } else if (upserted) {
        upsertedSubscriptions.push(upserted);

        // Track if this is a newly detected subscription
        const isNew = !existingMerchants.has(
          sub.merchant_name.trim().toLowerCase()
        );
        if (isNew) {
          newlyDetected.push(upserted);
        }
      }
    }

    // 8. Create alerts for newly detected subscriptions
    if (newlyDetected.length > 0) {
      const alerts = newlyDetected.map(
        (sub: {
          id: string;
          merchant_name: string;
          amount: number;
          frequency: string;
        }) => ({
          tenant_id: tenantId,
          user_id: userId,
          type: "subscription_detected",
          message: `New recurring subscription detected: ${sub.merchant_name} - R$${Number(sub.amount).toFixed(2)} (${sub.frequency})`,
          related_entity_id: sub.id,
          is_read: false,
        })
      );

      await supabase.from("alerts").insert(alerts);
    }

    // Mark related transactions as recurring
    for (const sub of upsertedSubscriptions) {
      await supabase
        .from("transactions")
        .update({
          is_recurring: true,
          subscription_id: sub.id,
        })
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .ilike("merchant_name", sub.merchant_name)
        .gte("date", cutoffDate);
    }

    // 9. Return detected subscriptions
    return new Response(
      JSON.stringify({
        detected: upsertedSubscriptions,
        new_count: newlyDetected.length,
        total_count: upsertedSubscriptions.length,
        message: `Detected ${upsertedSubscriptions.length} recurring subscription(s), ${newlyDetected.length} newly found.`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", details: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
