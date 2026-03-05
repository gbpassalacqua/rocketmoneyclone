import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import type { CreditScoreEntry } from "@/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Info,
  Lightbulb,
  CreditCard,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ScoreFactor {
  name: string
  impact: "positive" | "negative" | "neutral"
  description?: string
  value?: string | number
}

function parseFactors(raw: Record<string, unknown> | null): ScoreFactor[] {
  if (!raw) return []
  // Support both array-style and object-style factors
  if (Array.isArray(raw)) return raw as ScoreFactor[]
  if (Array.isArray(raw.factors)) return raw.factors as ScoreFactor[]

  // Object with key/value pairs
  return Object.entries(raw).map(([key, val]) => {
    const v = val as Record<string, unknown> | string
    if (typeof v === "object" && v !== null) {
      return {
        name: (v.name as string) ?? key,
        impact: (v.impact as ScoreFactor["impact"]) ?? "neutral",
        description: (v.description as string) ?? undefined,
        value: (v.value as string | number) ?? undefined,
      }
    }
    return { name: key, impact: "neutral" as const, description: String(v) }
  })
}

function scoreLabel(score: number) {
  if (score >= 800) return "Excellent"
  if (score >= 740) return "Very Good"
  if (score >= 670) return "Good"
  if (score >= 580) return "Fair"
  return "Poor"
}

function scoreColor(score: number) {
  if (score >= 800) return "#22c55e" // green-500
  if (score >= 740) return "#4ade80" // green-400
  if (score >= 670) return "#facc15" // yellow-400
  if (score >= 580) return "#fb923c" // orange-400
  return "#ef4444" // red-500
}

function scoreTailwindColor(score: number) {
  if (score >= 800) return "text-green-500"
  if (score >= 740) return "text-green-400"
  if (score >= 670) return "text-yellow-400"
  if (score >= 580) return "text-orange-400"
  return "text-red-500"
}

// ---------------------------------------------------------------------------
// Circular Gauge via SVG
// ---------------------------------------------------------------------------

function ScoreGauge({ score }: { score: number }) {
  const radius = 90
  const stroke = 14
  const normalizedRadius = radius - stroke / 2
  const circumference = normalizedRadius * 2 * Math.PI
  // Map 300-850 to 0-1
  const pct = Math.min(Math.max((score - 300) / 550, 0), 1)
  const offset = circumference - pct * circumference
  const color = scoreColor(score)

  return (
    <div className="flex flex-col items-center">
      <svg width={radius * 2} height={radius * 2} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/30"
        />
        {/* Score arc */}
        <circle
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          fill="transparent"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {/* Score text centered on the ring */}
      <div className="absolute flex flex-col items-center justify-center" style={{ width: radius * 2, height: radius * 2 }}>
        <span className={`text-5xl font-bold ${scoreTailwindColor(score)}`}>{score}</span>
        <span className="text-sm text-muted-foreground mt-1">{scoreLabel(score)}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score Range Bar
// ---------------------------------------------------------------------------

const RANGES = [
  { label: "Poor", min: 300, max: 579, color: "bg-red-500" },
  { label: "Fair", min: 580, max: 669, color: "bg-orange-400" },
  { label: "Good", min: 670, max: 739, color: "bg-yellow-400" },
  { label: "Very Good", min: 740, max: 799, color: "bg-green-400" },
  { label: "Excellent", min: 800, max: 850, color: "bg-green-500" },
] as const

function ScoreRangeBar({ score }: { score: number }) {
  const totalSpan = 850 - 300
  const pct = ((Math.min(Math.max(score, 300), 850) - 300) / totalSpan) * 100

  return (
    <div className="w-full space-y-2">
      <div className="relative">
        {/* Bar segments */}
        <div className="flex h-3 rounded-full overflow-hidden">
          {RANGES.map((r) => (
            <div
              key={r.label}
              className={`${r.color} h-full`}
              style={{ width: `${((r.max - r.min) / totalSpan) * 100}%` }}
            />
          ))}
        </div>
        {/* Indicator */}
        <div
          className="absolute -top-1 w-1 h-5 bg-foreground rounded-full transition-all duration-500"
          style={{ left: `${pct}%` }}
        />
      </div>
      {/* Labels */}
      <div className="flex justify-between text-[11px] text-muted-foreground">
        {RANGES.map((r) => (
          <span key={r.label}>{r.label}</span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tips
// ---------------------------------------------------------------------------

const TIPS = [
  { icon: CreditCard, text: "Keep credit card balances below 30% of your limit." },
  { icon: Clock, text: "Always pay bills on time -- payment history is the biggest factor." },
  { icon: ShieldCheck, text: "Avoid opening too many new accounts in a short period." },
  { icon: TrendingUp, text: "Keep old accounts open to lengthen your credit history." },
  { icon: Info, text: "Diversify your credit mix with different account types." },
  { icon: Lightbulb, text: "Review your credit report regularly and dispute errors." },
]

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CreditScore() {
  const { user } = useAuthStore()
  const [entries, setEntries] = useState<CreditScoreEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    if (!user) return
    setError(null)
    const { data, error: err } = await supabase
      .from("credit_score_history")
      .select("*")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: true })

    if (err) {
      setError(err.message)
    } else {
      setEntries((data as CreditScoreEntry[]) ?? [])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const handleRefresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      const { error: fnErr } = await supabase.functions.invoke("credit-score")
      if (fnErr) throw fnErr
      await fetchHistory()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to refresh score")
    } finally {
      setRefreshing(false)
    }
  }

  // Derived
  const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null
  const currentScore = latestEntry?.score ?? 0
  const previousScore = entries.length > 1 ? entries[entries.length - 2].score : null
  const scoreDelta = previousScore !== null ? currentScore - previousScore : null
  const factors = latestEntry ? parseFactors(latestEntry.factors) : []
  const positiveFactors = factors.filter((f) => f.impact === "positive")
  const negativeFactors = factors.filter((f) => f.impact === "negative")

  const chartData = entries.map((e) => ({
    date: new Date(e.recorded_at).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    score: e.score,
  }))

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Credit Score</h1>
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 w-32 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-40 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------
  if (!latestEntry) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Credit Score</h1>
            <p className="text-muted-foreground">Monitor and track your credit score.</p>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Fetching..." : "Fetch Score"}
          </Button>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Credit Score Data</h2>
            <p className="text-muted-foreground max-w-md">
              Click the button above to fetch your latest credit score. We will retrieve your score and begin tracking
              it over time.
            </p>
            {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
          </CardContent>
        </Card>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Main content
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Credit Score</h1>
          <p className="text-muted-foreground">Monitor and track your credit score.</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh Score"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Top row: Gauge + Range */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Score Gauge Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Current Score</CardTitle>
            <CardDescription>
              {latestEntry.provider ? `Provider: ${latestEntry.provider}` : ""}
              {latestEntry.recorded_at
                ? ` | Updated ${new Date(latestEntry.recorded_at).toLocaleDateString()}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            <div className="relative flex items-center justify-center">
              <ScoreGauge score={currentScore} />
            </div>

            {scoreDelta !== null && (
              <div className="flex items-center gap-2 text-sm">
                {scoreDelta > 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : scoreDelta < 0 ? (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                ) : null}
                <span className={scoreDelta > 0 ? "text-green-500" : scoreDelta < 0 ? "text-red-500" : "text-muted-foreground"}>
                  {scoreDelta > 0 ? "+" : ""}
                  {scoreDelta} points since last check
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Score Range + Quick Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Score Range</CardTitle>
            <CardDescription>Where you stand on the 300-850 scale</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <ScoreRangeBar score={currentScore} />

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Rating</p>
                <p className={`text-lg font-bold ${scoreTailwindColor(currentScore)}`}>
                  {scoreLabel(currentScore)}
                </p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Score</p>
                <p className={`text-lg font-bold ${scoreTailwindColor(currentScore)}`}>{currentScore}</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">All-Time High</p>
                <p className="text-lg font-bold">{Math.max(...entries.map((e) => e.score))}</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">All-Time Low</p>
                <p className="text-lg font-bold">{Math.min(...entries.map((e) => e.score))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Score History Chart */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Score History</CardTitle>
            <CardDescription>Your credit score over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    stroke="currentColor"
                  />
                  <YAxis
                    domain={[300, 850]}
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    stroke="currentColor"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      backgroundColor: "hsl(var(--card))",
                      color: "hsl(var(--card-foreground))",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={scoreColor(currentScore)}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: scoreColor(currentScore) }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Factors */}
      {factors.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Positive Factors */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Positive Factors
              </CardTitle>
              <CardDescription>What is helping your score</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {positiveFactors.length === 0 ? (
                <p className="text-sm text-muted-foreground">No positive factors reported.</p>
              ) : (
                positiveFactors.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/20 p-3"
                  >
                    <TrendingUp className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{f.name}</p>
                      {f.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                      )}
                      {f.value !== undefined && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5 font-medium">
                          {f.value}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Negative Factors */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <XCircle className="h-5 w-5 text-red-500" />
                Negative Factors
              </CardTitle>
              <CardDescription>What is hurting your score</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {negativeFactors.length === 0 ? (
                <p className="text-sm text-muted-foreground">No negative factors reported.</p>
              ) : (
                negativeFactors.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-3"
                  >
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{f.name}</p>
                      {f.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                      )}
                      {f.value !== undefined && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 font-medium">
                          {f.value}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            Tips to Improve Your Score
          </CardTitle>
          <CardDescription>Actionable recommendations for a healthier credit profile</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TIPS.map((tip, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <tip.icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">{tip.text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
