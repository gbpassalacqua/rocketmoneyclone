import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Insight {
  type: "unusual_spending" | "savings_opportunity" | "budget_recommendation" | "subscription_optimization";
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
}

interface CategorySpending {
  category: string;
  total: number;
  count: number;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ---------- 1. Auth the user ----------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")!;

    // Client scoped to the calling user (respects RLS)
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userId = user.id;

    // ---------- 2. Fetch financial data (service role for aggregation) ----------
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    // Fetch recent transactions, subscriptions, and categories in parallel
    const [transactionsResult, subscriptionsResult, categoriesResult] =
      await Promise.all([
        supabaseAdmin
          .from("transactions")
          .select("amount, category, date, is_recurring")
          .eq("user_id", userId)
          .gte("date", thirtyDaysAgoStr)
          .order("date", { ascending: false }),

        supabaseAdmin
          .from("subscriptions")
          .select("merchant_name, amount, frequency, status, category")
          .eq("user_id", userId)
          .eq("status", "active"),

        supabaseAdmin
          .from("categories")
          .select("name, budget_limit")
          .eq("user_id", userId),
      ]);

    if (transactionsResult.error) {
      throw new Error(`Failed to fetch transactions: ${transactionsResult.error.message}`);
    }
    if (subscriptionsResult.error) {
      throw new Error(`Failed to fetch subscriptions: ${subscriptionsResult.error.message}`);
    }
    if (categoriesResult.error) {
      throw new Error(`Failed to fetch categories: ${categoriesResult.error.message}`);
    }

    const transactions = transactionsResult.data ?? [];
    const subscriptions = subscriptionsResult.data ?? [];
    const budgetCategories = categoriesResult.data ?? [];

    // ---------- 3. Build aggregated summary (no PII) ----------
    const totalSpending = transactions.reduce(
      (sum: number, t: { amount: number }) => sum + Math.abs(Number(t.amount)),
      0,
    );
    const transactionCount = transactions.length;

    // Spending by category
    const categoryMap = new Map<string, { total: number; count: number }>();
    for (const t of transactions) {
      const cat = t.category || "Uncategorized";
      const existing = categoryMap.get(cat) ?? { total: 0, count: 0 };
      existing.total += Math.abs(Number(t.amount));
      existing.count += 1;
      categoryMap.set(cat, existing);
    }

    const spendingByCategory: CategorySpending[] = Array.from(
      categoryMap.entries(),
    ).map(([category, data]) => ({
      category,
      total: Math.round(data.total * 100) / 100,
      count: data.count,
    }));

    // Sort by total descending
    spendingByCategory.sort((a, b) => b.total - a.total);

    const recurringCount = transactions.filter(
      (t: { is_recurring: boolean }) => t.is_recurring,
    ).length;

    // Subscription summary (aggregated, no merchant names sent to AI)
    const totalSubscriptionCost = subscriptions.reduce(
      (sum: number, s: { amount: number }) => sum + Math.abs(Number(s.amount)),
      0,
    );
    const subscriptionCount = subscriptions.length;

    const subscriptionsByCategory = new Map<string, { count: number; total: number }>();
    for (const s of subscriptions) {
      const cat = s.category || "Uncategorized";
      const existing = subscriptionsByCategory.get(cat) ?? { count: 0, total: 0 };
      existing.count += 1;
      existing.total += Math.abs(Number(s.amount));
      subscriptionsByCategory.set(cat, existing);
    }

    const subscriptionCategorySummary = Array.from(
      subscriptionsByCategory.entries(),
    ).map(([category, data]) => ({
      category,
      count: data.count,
      monthlyTotal: Math.round(data.total * 100) / 100,
    }));

    // Budget utilization
    const budgetUtilization = budgetCategories
      .filter((c: { budget_limit: number | null }) => c.budget_limit !== null && Number(c.budget_limit) > 0)
      .map((c: { name: string; budget_limit: number }) => {
        const spent = categoryMap.get(c.name)?.total ?? 0;
        const limit = Number(c.budget_limit);
        return {
          category: c.name,
          budgetLimit: limit,
          spent: Math.round(spent * 100) / 100,
          utilization: Math.round((spent / limit) * 100),
        };
      });

    // ---------- 4. Build prompt and call Gemini ----------
    const prompt = `You are a personal finance analyst. Analyze the following 30-day financial summary and return actionable insights as a JSON array.

Financial Summary (last 30 days):
- Total spending: $${totalSpending.toFixed(2)}
- Total transactions: ${transactionCount}
- Recurring transactions: ${recurringCount}

Spending by category:
${spendingByCategory.map((c) => `  - ${c.category}: $${c.total.toFixed(2)} (${c.count} transactions)`).join("\n")}

Active subscriptions:
- Total active subscriptions: ${subscriptionCount}
- Combined monthly cost: $${totalSubscriptionCost.toFixed(2)}
${subscriptionCategorySummary.length > 0 ? `- By category:\n${subscriptionCategorySummary.map((s) => `    - ${s.category}: ${s.count} subscriptions, $${s.monthlyTotal.toFixed(2)}/month`).join("\n")}` : ""}

${budgetUtilization.length > 0 ? `Budget utilization:\n${budgetUtilization.map((b) => `  - ${b.category}: $${b.spent.toFixed(2)} / $${b.budgetLimit.toFixed(2)} (${b.utilization}%)`).join("\n")}` : "No budgets configured."}

Analyze the data and return a JSON array of insights. Each insight must have:
- "type": one of "unusual_spending", "savings_opportunity", "budget_recommendation", "subscription_optimization"
- "title": a short title (max 60 chars)
- "description": a helpful, specific explanation (1-2 sentences)
- "severity": "low", "medium", or "high"

Return between 3 and 6 insights. Focus on:
1. Unusual spending patterns (categories with disproportionately high spending)
2. Savings opportunities (areas where spending could be reduced)
3. Budget recommendations (suggest budgets for top categories, or flag categories near/over budget)
4. Subscription optimization (too many subscriptions, high total cost, duplicate categories)

Return ONLY the JSON array, no markdown, no explanation.`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errBody = await geminiResponse.text();
      throw new Error(`Gemini API error (${geminiResponse.status}): ${errBody}`);
    }

    const geminiData = await geminiResponse.json();

    // ---------- 5. Parse response and return structured insights ----------
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

    let insights: Insight[];
    try {
      // Strip potential markdown code fences if the model wraps its output
      const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      insights = (Array.isArray(parsed) ? parsed : []).map(
        (item: Record<string, unknown>) => ({
          type: validateType(String(item.type ?? "savings_opportunity")),
          title: String(item.title ?? "").slice(0, 60),
          description: String(item.description ?? ""),
          severity: validateSeverity(String(item.severity ?? "medium")),
        }),
      );
    } catch {
      // If parsing fails, return a fallback insight
      insights = [
        {
          type: "savings_opportunity",
          title: "Review your spending",
          description: `You spent $${totalSpending.toFixed(2)} across ${transactionCount} transactions in the last 30 days. Consider reviewing your top spending categories.`,
          severity: "medium",
        },
      ];
    }

    return new Response(JSON.stringify({ insights }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function validateType(type: string): Insight["type"] {
  const valid: Insight["type"][] = [
    "unusual_spending",
    "savings_opportunity",
    "budget_recommendation",
    "subscription_optimization",
  ];
  return valid.includes(type as Insight["type"])
    ? (type as Insight["type"])
    : "savings_opportunity";
}

function validateSeverity(severity: string): Insight["severity"] {
  const valid: Insight["severity"][] = ["low", "medium", "high"];
  return valid.includes(severity as Insight["severity"])
    ? (severity as Insight["severity"])
    : "medium";
}
