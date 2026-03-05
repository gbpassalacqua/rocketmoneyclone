import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import type { Alert } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Bell,
  BellOff,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  PiggyBank,
  Target,
  CalendarClock,
  CheckCheck,
  Loader2,
  Filter,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AlertType =
  | "price_increase"
  | "new_subscription"
  | "unusual_charge"
  | "budget_exceeded"
  | "goal_reached"
  | "bill_due"

const ALERT_TYPE_META: Record<
  AlertType,
  { label: string; icon: React.ElementType; color: string }
> = {
  price_increase: { label: "Price Increase", icon: TrendingUp, color: "text-orange-500" },
  new_subscription: { label: "New Subscription", icon: CreditCard, color: "text-blue-500" },
  unusual_charge: { label: "Unusual Charge", icon: AlertTriangle, color: "text-red-500" },
  budget_exceeded: { label: "Budget Exceeded", icon: PiggyBank, color: "text-rose-500" },
  goal_reached: { label: "Goal Reached", icon: Target, color: "text-green-500" },
  bill_due: { label: "Bill Due", icon: CalendarClock, color: "text-yellow-500" },
}

const ALL_TYPES = Object.keys(ALERT_TYPE_META) as AlertType[]

function getAlertMeta(type: string | null) {
  if (type && type in ALERT_TYPE_META) {
    return ALERT_TYPE_META[type as AlertType]
  }
  return { label: "Alert", icon: Bell, color: "text-muted-foreground" }
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  if (diffSec < 60) return "just now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return "yesterday"
  if (diffDay < 7) return `${diffDay} days ago`
  const diffWeek = Math.floor(diffDay / 7)
  if (diffWeek < 5) return `${diffWeek} week${diffWeek === 1 ? "" : "s"} ago`
  const diffMonth = Math.floor(diffDay / 30)
  if (diffMonth < 12) return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`
  return new Date(dateStr).toLocaleDateString()
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Alerts() {
  const { user, tenantId } = useAuthStore()

  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  // Filters
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all")
  const [typeFilter, setTypeFilter] = useState<AlertType | "all">("all")

  // --------------------------------------------------
  // Fetch alerts
  // --------------------------------------------------
  const fetchAlerts = useCallback(async () => {
    if (!user || !tenantId) return
    setLoading(true)
    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (!error && data) {
      setAlerts(data as Alert[])
    }
    setLoading(false)
  }, [user, tenantId])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  // --------------------------------------------------
  // Mark single alert as read
  // --------------------------------------------------
  const markAsRead = async (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, is_read: true } : a))
    )
    await supabase.from("alerts").update({ is_read: true }).eq("id", id)
  }

  // --------------------------------------------------
  // Mark all as read
  // --------------------------------------------------
  const markAllRead = async () => {
    if (!user || !tenantId) return
    setMarkingAll(true)
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })))
    await supabase
      .from("alerts")
      .update({ is_read: true })
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_read", false)
    setMarkingAll(false)
  }

  // --------------------------------------------------
  // Derived data
  // --------------------------------------------------
  const unreadCount = useMemo(() => alerts.filter((a) => !a.is_read).length, [alerts])

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (readFilter === "unread" && a.is_read) return false
      if (readFilter === "read" && !a.is_read) return false
      if (typeFilter !== "all" && a.type !== typeFilter) return false
      return true
    })
  }, [alerts, readFilter, typeFilter])

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Alerts</h1>
          {unreadCount > 0 && (
            <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 px-2 text-xs font-semibold text-white">
              {unreadCount}
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            disabled={markingAll}
            className="gap-2"
          >
            {markingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Mark all as read
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Read / Unread tabs */}
        <Tabs
          value={readFilter}
          onValueChange={(v) => setReadFilter(v as typeof readFilter)}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
            <TabsTrigger value="read">Read</TabsTrigger>
          </TabsList>
          {/* TabsContent not needed here since we render the list below */}
          <TabsContent value="all" />
          <TabsContent value="unread" />
          <TabsContent value="read" />
        </Tabs>

        {/* Type filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as AlertType | "all")}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="all">All types</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {ALERT_TYPE_META[t].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
            <BellOff className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-lg font-medium text-muted-foreground">
              No alerts — you're all caught up!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((alert) => {
            const meta = getAlertMeta(alert.type)
            const Icon = meta.icon

            return (
              <Card
                key={alert.id}
                role="button"
                tabIndex={0}
                onClick={() => !alert.is_read && markAsRead(alert.id)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && !alert.is_read) {
                    markAsRead(alert.id)
                  }
                }}
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                  !alert.is_read
                    ? "border-l-4 border-l-primary bg-primary/5 dark:bg-primary/10"
                    : "opacity-75"
                }`}
              >
                <CardContent className="flex items-start gap-4 p-4">
                  {/* Icon */}
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted ${meta.color}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-sm ${
                          !alert.is_read ? "font-semibold" : "font-normal text-muted-foreground"
                        }`}
                      >
                        {alert.message ?? "No message"}
                      </p>

                      {/* Unread dot */}
                      {!alert.is_read && (
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>

                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={meta.color}>{meta.label}</span>
                      <span>·</span>
                      <time dateTime={alert.created_at}>
                        {relativeTime(alert.created_at)}
                      </time>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
