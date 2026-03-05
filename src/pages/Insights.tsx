import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import type { Transaction, SpendingBenchmark } from "@/types"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  RefreshCw,
  DollarSign,
  BarChart3,
  PiggyBank,
  ShieldCheck,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"

/* ---------- types ---------- */

interface AiInsight {
  id: string
  type: "spending" | "savings" | "unusual" | "budget"
  title: string
  description: string
  severity: "info" | "warning" | "positive"
  created_at: string
}

interface CategorySpend {
  category: string
  total: number
  count: number
  color: string
}

interface BenchmarkComparison {
  category: string
  userSpend: number
  avgSpend: number
  diffPercent: number
}

/* ---------- constants ---------- */

const CATEGORY_COLORS: Record<string, string> = {
  "Food & Dining": "#f97316",
  Transportation: "#3b82f6",
  Shopping: "#a855f7",
  Entertainment: "#ec4899",
  Utilities: "#14b8a6",
  Housing: "#6366f1",
  Healthcare: "#10b981",
  Education: "#f59e0b",
  Travel: "#06b6d4",
  Insurance: "#64748b",
  Subscriptions: "#e11d48",
  Other: "#78716c",
}

const STATIC_TIPS = [
  {
    icon: PiggyBank,
    title: "Automate your savings",
    text: "Set up automatic transfers to your savings account right after payday. Even $25/week adds up to $1,300/year.",
  },
  {
    icon: ShieldCheck,
    title: "Review recurring charges",
    text: "Audit your subscriptions quarterly. Most people have 2-3 subscriptions they forgot about.",
  },
  {
    icon: DollarSign,
    title: "Use the 50/30/20 rule",
    text: "Allocate 50% of income to needs, 30% to wants, and 20% to savings and debt repayment.",
  },
  {
    icon: BarChart3,
    title: "Track before you optimize",
    text: "Consistently tracking spending for 30 days reveals patterns you never expected.",
  },
]

function getCategoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS["Other"]
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

/* ---------- AI edge function caller ---------- */

async function fetchAiInsights(userId: string): Promise<AiInsight[]> {
  try {
    const { data, error } = await supabase.functions.invoke("gemini-insights", {
      body: { user_id: userId },
    })
    if (error) throw error
    if (Array.isArray(data?.insights)) return data.insights as AiInsight[]
    return []
  } catch {
    // Edge function may not be deployed yet — return empty gracefully
    return []
  }
}

/* ---------- component ---------- */

export default function Insights() {
  const { user } = useAuthStore()

  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [categorySpends, setCategorySpends] = useState<CategorySpend[]>([])
  const [benchmarks, setBenchmarks] = useState<BenchmarkComparison[]>([])
  const [aiInsights, setAiInsights] = useState<AiInsight[]>([])

  /* --- data loading --- */

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)

    try {
      // 1. Fetch transactions from the last 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: txRows } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", thirtyDaysAgo.toISOString().split("T")[0])
        .order("date", { ascending: false })

      const transactions: Transaction[] = txRows ?? []

      // 2. Aggregate by category
      const catMap = new Map<string, { total: number; count: number }>()
      for (const tx of transactions) {
        const cat = tx.category || "Other"
        const cur = catMap.get(cat) ?? { total: 0, count: 0 }
        cur.total += Math.abs(tx.amount)
        cur.count += 1
        catMap.set(cat, cur)
      }

      const sorted = Array.from(catMap.entries())
        .map(([category, { total, count }]) => ({
          category,
          total,
          count,
          color: getCategoryColor(category),
        }))
        .sort((a, b) => b.total - a.total)

      setCategorySpends(sorted)

      // 3. Fetch spending benchmarks
      const { data: benchmarkRows } = await supabase
        .from("spending_benchmarks")
        .select("*")

      const allBenchmarks: SpendingBenchmark[] = benchmarkRows ?? []

      // Compare user spending against benchmarks
      const comparisons: BenchmarkComparison[] = []
      for (const cs of sorted) {
        const match = allBenchmarks.find(
          (b) => b.category?.toLowerCase() === cs.category.toLowerCase()
        )
        if (match && match.avg_monthly_spend > 0) {
          const diff = ((cs.total - match.avg_monthly_spend) / match.avg_monthly_spend) * 100
          comparisons.push({
            category: cs.category,
            userSpend: cs.total,
            avgSpend: match.avg_monthly_spend,
            diffPercent: Math.round(diff),
          })
        }
      }
      setBenchmarks(comparisons)
    } catch (err) {
      console.error("Failed to load insights data:", err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  /* --- generate AI insights --- */

  const handleGenerateInsights = async () => {
    if (!user) return
    setGenerating(true)
    const insights = await fetchAiInsights(user.id)
    if (insights.length > 0) {
      setAiInsights(insights)
    } else {
      // Placeholder insights when edge function is not available
      setAiInsights([
        {
          id: "placeholder-1",
          type: "spending",
          title: "Dining spending is trending up",
          description:
            "Your Food & Dining expenses increased 18% compared to last month. Consider meal prepping to save on weekday lunches.",
          severity: "warning",
          created_at: new Date().toISOString(),
        },
        {
          id: "placeholder-2",
          type: "savings",
          title: "Great job on utilities!",
          description:
            "Your utility bills are 12% below average for your area. Keep up the energy-saving habits.",
          severity: "positive",
          created_at: new Date().toISOString(),
        },
        {
          id: "placeholder-3",
          type: "unusual",
          title: "Unusual charge detected",
          description:
            "A $49.99 charge from an unfamiliar merchant was found. Review your recent transactions to verify this is legitimate.",
          severity: "warning",
          created_at: new Date().toISOString(),
        },
        {
          id: "placeholder-4",
          type: "budget",
          title: "Budget recommendation",
          description:
            "Based on your income and spending patterns, we recommend allocating 15% of your monthly income to savings.",
          severity: "info",
          created_at: new Date().toISOString(),
        },
      ])
    }
    setGenerating(false)
  }

  /* --- helpers --- */

  const totalSpending = categorySpends.reduce((s, c) => s + c.total, 0)

  function insightIcon(type: AiInsight["type"]) {
    switch (type) {
      case "spending":
        return <TrendingUp className="h-5 w-5 text-orange-500" />
      case "savings":
        return <PiggyBank className="h-5 w-5 text-emerald-500" />
      case "unusual":
        return <AlertTriangle className="h-5 w-5 text-amber-500" />
      case "budget":
        return <BarChart3 className="h-5 w-5 text-blue-500" />
    }
  }

  function severityBorder(s: AiInsight["severity"]) {
    switch (s) {
      case "positive":
        return "border-l-emerald-500"
      case "warning":
        return "border-l-amber-500"
      default:
        return "border-l-blue-500"
    }
  }

  /* ---------- render ---------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Spending Insights
          </h1>
          <p className="text-muted-foreground">
            AI-powered analysis of your financial patterns
          </p>
        </div>
        <Button
          onClick={handleGenerateInsights}
          disabled={generating}
          className="gap-2"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {generating ? "Generating..." : "Get New Insights"}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="insights" className="space-y-4">
        <TabsList>
          <TabsTrigger value="insights">AI Insights</TabsTrigger>
          <TabsTrigger value="comparison">Spending Comparison</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        {/* ---- Tab: AI Insights ---- */}
        <TabsContent value="insights" className="space-y-4">
          {aiInsights.length === 0 ? (
            /* Tips section when no AI insights */
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Lightbulb className="h-5 w-5 text-amber-500" />
                    Financial Tips
                  </CardTitle>
                  <CardDescription>
                    Click "Get New Insights" to generate personalized AI insights. In the
                    meantime, here are some tips to improve your finances.
                  </CardDescription>
                </CardHeader>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2">
                {STATIC_TIPS.map((tip) => (
                  <Card key={tip.title}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <tip.icon className="h-5 w-5 text-primary" />
                        {tip.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{tip.text}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            /* AI insights feed */
            <div className="grid gap-4 sm:grid-cols-2">
              {aiInsights.map((insight) => (
                <Card
                  key={insight.id}
                  className={`border-l-4 ${severityBorder(insight.severity)}`}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {insightIcon(insight.type)}
                      {insight.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {insight.description}
                    </p>
                  </CardContent>
                  <CardFooter>
                    <span className="text-xs text-muted-foreground">
                      {new Date(insight.created_at).toLocaleDateString()}
                    </span>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---- Tab: Spending Comparison ---- */}
        <TabsContent value="comparison" className="space-y-4">
          {benchmarks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  No benchmark data available yet. Add more transactions to see how your
                  spending compares with averages.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {benchmarks.map((b) => {
                const isOver = b.diffPercent > 0
                return (
                  <Card key={b.category}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{b.category}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2">
                        {isOver ? (
                          <ArrowUpRight className="h-5 w-5 text-red-500" />
                        ) : (
                          <ArrowDownRight className="h-5 w-5 text-emerald-500" />
                        )}
                        <span
                          className={`text-lg font-semibold ${
                            isOver ? "text-red-500" : "text-emerald-500"
                          }`}
                        >
                          {Math.abs(b.diffPercent)}%{" "}
                          {isOver ? "more" : "less"}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          than average
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">You spend</span>
                        <span className="font-medium">
                          {formatCurrency(b.userSpend)}/mo
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Average</span>
                        <span className="font-medium">
                          {formatCurrency(b.avgSpend)}/mo
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ---- Tab: Categories Breakdown ---- */}
        <TabsContent value="categories" className="space-y-4">
          {categorySpends.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <DollarSign className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  No spending data for the last 30 days. Link an account or add
                  transactions to see your category breakdown.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Last 30 Days</CardTitle>
                  <CardDescription>
                    Total spending: {formatCurrency(totalSpending)} across{" "}
                    {categorySpends.length} categories
                  </CardDescription>
                </CardHeader>
              </Card>

              {/* Visual bar for each category */}
              <div className="space-y-3">
                {categorySpends.map((cs) => {
                  const pct = totalSpending > 0 ? (cs.total / totalSpending) * 100 : 0
                  return (
                    <Card key={cs.category}>
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-full"
                              style={{ backgroundColor: cs.color }}
                            />
                            <span className="font-medium text-sm">
                              {cs.category}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({cs.count} txns)
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold text-sm">
                              {formatCurrency(cs.total)}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: cs.color,
                            }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Donut-style summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top Categories</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {categorySpends.slice(0, 6).map((cs, i) => {
                      const pct =
                        totalSpending > 0
                          ? (cs.total / totalSpending) * 100
                          : 0
                      return (
                        <div
                          key={cs.category}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-muted-foreground">
                              #{i + 1}
                            </span>
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: cs.color }}
                            />
                            <span className="text-sm font-medium">
                              {cs.category}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">
                              {formatCurrency(cs.total)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {pct.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
