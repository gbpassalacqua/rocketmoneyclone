import { useEffect, useState, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  DollarSign,
  TrendingDown,
  CreditCard,
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Plus,
  Landmark,
  Lightbulb,
  Receipt,
  Loader2,
  Wallet,
} from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import type { Account, Transaction, Subscription, SmartSavingsConfig } from "@/types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

// ---------------------------------------------------------------------------
// Types for internal state
// ---------------------------------------------------------------------------

interface SpendingPoint {
  month: string
  amount: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, tenantId, isLoading: authLoading } = useAuthStore()

  // Data
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [savings, setSavings] = useState<SmartSavingsConfig | null>(null)

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }

    // If tenantId not loaded yet, try to fetch it
    let currentTenantId = tenantId
    if (!currentTenantId) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single()

      if (!profile?.tenant_id) {
        setLoading(false)
        return
      }
      currentTenantId = profile.tenant_id
    }

    setLoading(true)
    setError(null)

    try {
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      const sixMonthsAgoIso = sixMonthsAgo.toISOString().split("T")[0]

      const [accountsRes, transactionsRes, subscriptionsRes, savingsRes] =
        await Promise.all([
          supabase
            .from("accounts")
            .select("*")
            .eq("tenant_id", currentTenantId),
          supabase
            .from("transactions")
            .select("*")
            .eq("tenant_id", currentTenantId)
            .gte("date", sixMonthsAgoIso)
            .order("date", { ascending: false }),
          supabase
            .from("subscriptions")
            .select("*")
            .eq("tenant_id", currentTenantId)
            .eq("status", "active"),
          supabase
            .from("smart_savings")
            .select("*")
            .eq("tenant_id", currentTenantId)
            .limit(1)
            .maybeSingle(),
        ])

      if (accountsRes.error) throw accountsRes.error
      if (transactionsRes.error) throw transactionsRes.error
      if (subscriptionsRes.error) throw subscriptionsRes.error
      if (savingsRes.error) throw savingsRes.error

      setAccounts(accountsRes.data ?? [])
      setTransactions(transactionsRes.data ?? [])
      setSubscriptions(subscriptionsRes.data ?? [])
      setSavings(savingsRes.data)
    } catch (err) {
      console.error("Dashboard fetch error:", err)
      setError("Failed to load dashboard data. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [user, tenantId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const totalBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0),
    [accounts],
  )

  const currentMonthSpending = useMemo(() => {
    const monthStart = startOfMonth(new Date()).toISOString().split("T")[0]
    return transactions
      .filter((t) => t.date >= monthStart && t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  }, [transactions])

  const activeSubCount = subscriptions.length
  const monthlySubCost = useMemo(
    () => subscriptions.reduce((sum, s) => sum + (s.amount ?? 0), 0),
    [subscriptions],
  )

  const savingsProgress = useMemo(() => {
    if (!savings) return { current: 0, goal: 0, percentage: 0 }
    const pct =
      savings.goal_amount > 0
        ? Math.round((savings.current_amount / savings.goal_amount) * 100)
        : 0
    return {
      current: savings.current_amount,
      goal: savings.goal_amount,
      percentage: Math.min(pct, 100),
    }
  }, [savings])

  // Spending chart – aggregate by month
  const spendingChartData: SpendingPoint[] = useMemo(() => {
    const buckets = new Map<string, number>()

    // Pre-fill last 6 months so chart always has points
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      buckets.set(monthLabel(d), 0)
    }

    transactions
      .filter((t) => t.amount < 0)
      .forEach((t) => {
        const label = monthLabel(new Date(t.date))
        if (buckets.has(label)) {
          buckets.set(label, (buckets.get(label) ?? 0) + Math.abs(t.amount))
        }
      })

    return Array.from(buckets.entries()).map(([month, amount]) => ({
      month,
      amount: Math.round(amount * 100) / 100,
    }))
  }, [transactions])

  const recentTransactions = useMemo(
    () => transactions.slice(0, 5),
    [transactions],
  )

  const upcomingBills = useMemo(() => {
    const today = new Date().toISOString().split("T")[0]
    return [...subscriptions]
      .filter((s) => s.next_charge_date && s.next_charge_date >= today)
      .sort((a, b) =>
        (a.next_charge_date ?? "").localeCompare(b.next_charge_date ?? ""),
      )
      .slice(0, 5)
  }, [subscriptions])

  // -----------------------------------------------------------------------
  // Loading / error states
  // -----------------------------------------------------------------------

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-destructive text-sm">{error}</p>
        <Button variant="outline" onClick={fetchData}>
          Retry
        </Button>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your financial overview at a glance.
        </p>
      </div>

      {/* -------- Summary Cards -------- */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Balance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {accounts.length} account{accounts.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        {/* Monthly Spending */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Monthly Spending</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(currentMonthSpending)}</div>
            <p className="text-xs text-muted-foreground mt-1">Current month</p>
          </CardContent>
        </Card>

        {/* Active Subscriptions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Subscriptions</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSubCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(monthlySubCost)}/mo
            </p>
          </CardContent>
        </Card>

        {/* Savings Progress */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Savings Progress</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(savingsProgress.current)}
            </div>
            <div className="mt-2 space-y-1">
              <Progress value={savingsProgress.percentage} />
              <p className="text-xs text-muted-foreground">
                {savingsProgress.percentage}% of {formatCurrency(savingsProgress.goal)} goal
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* -------- Spending Chart + Recent Transactions -------- */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
        {/* Spending Chart – wider */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Spending Trend</CardTitle>
            <CardDescription>Last 6 months of spending</CardDescription>
          </CardHeader>
          <CardContent>
            {spendingChartData.every((d) => d.amount === 0) ? (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                No spending data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart
                  data={spendingChartData}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Spending"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="hsl(var(--primary))"
                    fill="url(#spendGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Your latest activity</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/transactions")}
            >
              View all
            </Button>
          </CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No transactions yet.
              </p>
            ) : (
              <div className="space-y-4">
                {recentTransactions.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        tx.amount < 0
                          ? "bg-red-500/10 text-red-500 dark:bg-red-500/20"
                          : "bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20"
                      }`}
                    >
                      {tx.amount < 0 ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {tx.merchant_name ?? tx.description ?? "Transaction"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tx.category ?? "Uncategorized"} &middot; {formatDate(tx.date)}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-medium whitespace-nowrap ${
                        tx.amount < 0 ? "text-red-500" : "text-emerald-500"
                      }`}
                    >
                      {tx.amount < 0 ? "-" : "+"}
                      {formatCurrency(Math.abs(tx.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* -------- Upcoming Bills + Quick Actions -------- */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
        {/* Upcoming Bills */}
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Upcoming Bills</CardTitle>
              <CardDescription>Next scheduled charges</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/subscriptions")}
            >
              View all
            </Button>
          </CardHeader>
          <CardContent>
            {upcomingBills.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No upcoming bills.
              </p>
            ) : (
              <div className="space-y-4">
                {upcomingBills.map((sub) => (
                  <div key={sub.id} className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Receipt className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {sub.merchant_name ?? "Subscription"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sub.category ?? "Service"} &middot; Due{" "}
                        {sub.next_charge_date
                          ? formatDate(sub.next_charge_date)
                          : "N/A"}
                      </p>
                    </div>
                    <span className="text-sm font-medium whitespace-nowrap">
                      {formatCurrency(sub.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/settings")}
            >
              <Landmark className="h-4 w-4" />
              Connect Bank
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/transactions")}
            >
              <Plus className="h-4 w-4" />
              Add Transaction
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/insights")}
            >
              <Lightbulb className="h-4 w-4" />
              View Insights
            </Button>

            <Separator className="my-1" />

            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/subscriptions")}
            >
              <CreditCard className="h-4 w-4" />
              Manage Subscriptions
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/goals")}
            >
              <DollarSign className="h-4 w-4" />
              Financial Goals
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/calendar")}
            >
              <Calendar className="h-4 w-4" />
              Bill Calendar
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
