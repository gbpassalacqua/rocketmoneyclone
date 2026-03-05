import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import type { Subscription } from "@/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertTriangle,
  ArrowDownUp,
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Filter,
  Loader2,
  Pause,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Trash2,
  TrendingDown,
  XCircle,
} from "lucide-react"

type StatusFilter = "all" | "active" | "cancelled" | "paused"
type SortField = "amount" | "risk_score" | "next_charge_date" | "merchant_name"
type SortDirection = "asc" | "desc"

function formatCurrency(amount: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(amount)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "N/A"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr))
}

function getRiskLevel(score: number): "low" | "medium" | "high" {
  if (score >= 70) return "high"
  if (score >= 40) return "medium"
  return "low"
}

function RiskBadge({ score }: { score: number }) {
  const level = getRiskLevel(score)
  const config = {
    low: {
      label: "Low Risk",
      className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      icon: ShieldCheck,
    },
    medium: {
      label: "Medium Risk",
      className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      icon: ShieldAlert,
    },
    high: {
      label: "High Risk",
      className: "bg-red-500/15 text-red-600 dark:text-red-400",
      icon: ShieldX,
    },
  }
  const { label, className, icon: Icon } = config[level]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
    active: {
      label: "Active",
      className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      icon: CheckCircle2,
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-red-500/15 text-red-600 dark:text-red-400",
      icon: XCircle,
    },
    paused: {
      label: "Paused",
      className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      icon: Pause,
    },
  }
  const { label, className, icon: Icon } = config[status] ?? config.active
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

function FrequencyLabel({ frequency }: { frequency: string | null }) {
  const labels: Record<string, string> = {
    monthly: "/ month",
    yearly: "/ year",
    weekly: "/ week",
    quarterly: "/ quarter",
  }
  return (
    <span className="text-xs text-muted-foreground">
      {labels[frequency ?? ""] ?? (frequency ? `/ ${frequency}` : "")}
    </span>
  )
}

function MerchantLogo({ name, logo }: { name: string | null; logo: string | null }) {
  const initials = (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  if (logo) {
    return (
      <img
        src={logo}
        alt={name ?? "Merchant"}
        className="h-10 w-10 rounded-lg object-cover"
        onError={(e) => {
          ;(e.target as HTMLImageElement).style.display = "none"
          ;(e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden")
        }}
      />
    )
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
      {initials}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-muted p-4">
        <CreditCard className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-lg font-semibold">No subscriptions found</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        Connect your bank account to automatically detect recurring charges and subscriptions.
      </p>
    </div>
  )
}

export default function Subscriptions() {
  const { user } = useAuthStore()

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Filters & sort
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortField, setSortField] = useState<SortField>("risk_score")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  const fetchSubscriptions = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from("subscriptions")
      .select("*")
      .order("detected_at", { ascending: false })

    if (err) {
      setError(err.message)
    } else {
      setSubscriptions((data as Subscription[]) ?? [])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchSubscriptions()
  }, [fetchSubscriptions])

  const handleAction = async (id: string, action: "cancel" | "pause" | "keep") => {
    setUpdatingId(id)
    const statusMap: Record<string, string> = {
      cancel: "cancelled",
      pause: "paused",
      keep: "active",
    }
    const { error: err } = await supabase
      .from("subscriptions")
      .update({ status: statusMap[action], user_action: action })
      .eq("id", id)

    if (!err) {
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: statusMap[action], user_action: action } : s
        )
      )
    }
    setUpdatingId(null)
  }

  // Derived data
  const categories = useMemo(() => {
    const cats = new Set(subscriptions.map((s) => s.category).filter(Boolean))
    return Array.from(cats).sort() as string[]
  }, [subscriptions])

  const filtered = useMemo(() => {
    let list = [...subscriptions]

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((s) => s.status === statusFilter)
    }

    // Category filter
    if (categoryFilter !== "all") {
      list = list.filter((s) => s.category === categoryFilter)
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (s) =>
          s.merchant_name?.toLowerCase().includes(q) ||
          s.category?.toLowerCase().includes(q)
      )
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case "amount":
          cmp = a.amount - b.amount
          break
        case "risk_score":
          cmp = a.risk_score - b.risk_score
          break
        case "next_charge_date":
          cmp =
            new Date(a.next_charge_date ?? "9999").getTime() -
            new Date(b.next_charge_date ?? "9999").getTime()
          break
        case "merchant_name":
          cmp = (a.merchant_name ?? "").localeCompare(b.merchant_name ?? "")
          break
      }
      return sortDirection === "asc" ? cmp : -cmp
    })

    return list
  }, [subscriptions, statusFilter, categoryFilter, searchQuery, sortField, sortDirection])

  // Summary stats
  const stats = useMemo(() => {
    const active = subscriptions.filter((s) => s.status === "active")
    const totalMonthly = active.reduce((sum, s) => {
      if (s.frequency === "yearly") return sum + s.amount / 12
      if (s.frequency === "weekly") return sum + s.amount * 4.33
      if (s.frequency === "quarterly") return sum + s.amount / 3
      return sum + s.amount
    }, 0)
    const highRiskTotal = active
      .filter((s) => s.risk_score >= 70)
      .reduce((sum, s) => {
        if (s.frequency === "yearly") return sum + s.amount / 12
        if (s.frequency === "weekly") return sum + s.amount * 4.33
        if (s.frequency === "quarterly") return sum + s.amount / 3
        return sum + s.amount
      }, 0)
    return {
      totalMonthly,
      activeCount: active.length,
      potentialSavings: highRiskTotal,
    }
  }, [subscriptions])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <div>
          <h3 className="font-semibold">Failed to load subscriptions</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <Button variant="outline" onClick={fetchSubscriptions}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
        <p className="text-muted-foreground">
          Track, manage, and cancel recurring charges. Detect ghost charges automatically.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monthly Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalMonthly)}</div>
            <p className="text-xs text-muted-foreground">
              Across {stats.activeCount} active subscription{stats.activeCount !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeCount}</div>
            <p className="text-xs text-muted-foreground">
              {subscriptions.length} total detected
            </p>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Potential Savings</CardTitle>
            <TrendingDown className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(stats.potentialSavings)}
            </div>
            <p className="text-xs text-muted-foreground">
              From high-risk subscriptions per month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and sort */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search subscriptions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category filter */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
            <select
              value={sortField}
              onChange={(e) => {
                setSortField(e.target.value as SortField)
                setSortDirection("desc")
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="risk_score">Risk Score</option>
              <option value="amount">Amount</option>
              <option value="next_charge_date">Next Charge</option>
              <option value="merchant_name">Name</option>
            </select>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => toggleSort(sortField)}
              title={sortDirection === "asc" ? "Ascending" : "Descending"}
            >
              <ArrowDownUp
                className={`h-4 w-4 transition-transform ${
                  sortDirection === "asc" ? "rotate-180" : ""
                }`}
              />
            </Button>
          </div>
        </div>
      </div>

      {/* Status tabs + subscription list */}
      <Tabs
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v as StatusFilter)}
      >
        <TabsList>
          <TabsTrigger value="all">
            All ({subscriptions.length})
          </TabsTrigger>
          <TabsTrigger value="active">
            Active ({subscriptions.filter((s) => s.status === "active").length})
          </TabsTrigger>
          <TabsTrigger value="paused">
            Paused ({subscriptions.filter((s) => s.status === "paused").length})
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelled ({subscriptions.filter((s) => s.status === "cancelled").length})
          </TabsTrigger>
        </TabsList>

        {/* Same content for all tabs since filtering is done via state */}
        {(["all", "active", "paused", "cancelled"] as const).map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            {filtered.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid gap-3">
                {filtered.map((sub) => (
                  <Card
                    key={sub.id}
                    className={`transition-colors ${
                      sub.status === "cancelled"
                        ? "opacity-60"
                        : sub.risk_score >= 70
                          ? "border-red-500/30"
                          : ""
                    }`}
                  >
                    <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                      {/* Left: merchant info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <MerchantLogo name={sub.merchant_name} logo={sub.merchant_logo} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold truncate">
                              {sub.merchant_name ?? "Unknown"}
                            </h3>
                            <StatusBadge status={sub.status} />
                            <RiskBadge score={sub.risk_score} />
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                            {sub.category && (
                              <span className="rounded bg-muted px-1.5 py-0.5">
                                {sub.category}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Next: {formatDate(sub.next_charge_date)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: amount + actions */}
                      <div className="flex items-center gap-4 sm:flex-shrink-0">
                        <div className="text-right">
                          <div className="text-lg font-bold">
                            {formatCurrency(sub.amount, sub.currency)}
                          </div>
                          <FrequencyLabel frequency={sub.frequency} />
                        </div>

                        {sub.status !== "cancelled" && (
                          <div className="flex items-center gap-1">
                            {sub.status === "paused" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={updatingId === sub.id}
                                onClick={() => handleAction(sub.id, "keep")}
                                title="Resume"
                              >
                                {updatingId === sub.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                                <span className="hidden sm:inline">Resume</span>
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={updatingId === sub.id}
                                  onClick={() => handleAction(sub.id, "keep")}
                                  title="Keep"
                                  className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                                >
                                  {updatingId === sub.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  )}
                                  <span className="hidden sm:inline">Keep</span>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={updatingId === sub.id}
                                  onClick={() => handleAction(sub.id, "pause")}
                                  title="Pause"
                                  className="text-amber-600 hover:text-amber-700 dark:text-amber-400"
                                >
                                  {updatingId === sub.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Pause className="h-3.5 w-3.5" />
                                  )}
                                  <span className="hidden sm:inline">Pause</span>
                                </Button>
                              </>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={updatingId === sub.id}
                              onClick={() => handleAction(sub.id, "cancel")}
                              title="Cancel"
                              className="text-red-600 hover:text-red-700 dark:text-red-400"
                            >
                              {updatingId === sub.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              <span className="hidden sm:inline">Cancel</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
