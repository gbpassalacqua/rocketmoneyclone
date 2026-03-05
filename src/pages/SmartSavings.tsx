import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import type { SmartSavingsConfig, SmartSavingsTransfer } from "@/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  PiggyBank,
  Settings2,
  ArrowDownUp,
  TrendingUp,
  Loader2,
  Power,
  PowerOff,
  Save,
  Flame,
  DollarSign,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

export default function SmartSavings() {
  const { user, tenantId } = useAuthStore()

  const [config, setConfig] = useState<SmartSavingsConfig | null>(null)
  const [transfers, setTransfers] = useState<SmartSavingsTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [showAllTransfers, setShowAllTransfers] = useState(false)

  // Edit form state
  const [editGoal, setEditGoal] = useState("")
  const [editMinBalance, setEditMinBalance] = useState("")
  const [editFrequency, setEditFrequency] = useState("weekly")
  const [editMaxTransfer, setEditMaxTransfer] = useState("")

  const fetchData = useCallback(async () => {
    if (!user || !tenantId) return
    setLoading(true)
    try {
      const [configRes, transfersRes] = await Promise.all([
        supabase
          .from("smart_savings")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("smart_savings_transfers")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("user_id", user.id)
          .order("transferred_at", { ascending: false }),
      ])

      if (configRes.data) {
        setConfig(configRes.data)
        setEditGoal(String(configRes.data.goal_amount))
        setEditMinBalance(String(configRes.data.min_balance_protection))
        setEditFrequency(configRes.data.frequency)
        setEditMaxTransfer(String(configRes.data.max_per_transfer))
      }
      if (transfersRes.data) {
        setTransfers(transfersRes.data)
      }
    } finally {
      setLoading(false)
    }
  }, [user, tenantId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleToggleActive = async () => {
    if (!config) return
    setToggling(true)
    try {
      const { data } = await supabase
        .from("smart_savings")
        .update({ is_active: !config.is_active })
        .eq("id", config.id)
        .select()
        .single()
      if (data) setConfig(data)
    } finally {
      setToggling(false)
    }
  }

  const handleSaveConfig = async () => {
    if (!config) return
    setSaving(true)
    try {
      const { data } = await supabase
        .from("smart_savings")
        .update({
          goal_amount: parseFloat(editGoal) || 0,
          min_balance_protection: parseFloat(editMinBalance) || 0,
          frequency: editFrequency,
          max_per_transfer: parseFloat(editMaxTransfer) || 0,
        })
        .eq("id", config.id)
        .select()
        .single()
      if (data) setConfig(data)
    } finally {
      setSaving(false)
    }
  }

  // Stats
  const totalSaved = config?.current_amount ?? 0
  const goalAmount = config?.goal_amount ?? 0
  const progressPercent = goalAmount > 0 ? Math.min((totalSaved / goalAmount) * 100, 100) : 0
  const avgPerTransfer =
    transfers.length > 0
      ? transfers.reduce((sum, t) => sum + t.amount, 0) / transfers.length
      : 0

  // Streak: consecutive transfers (one per expected period)
  const streak = (() => {
    if (transfers.length === 0) return 0
    let count = 0
    for (const t of transfers) {
      if (t.amount > 0) count++
      else break
    }
    return count
  })()

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v)

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

  const visibleTransfers = showAllTransfers ? transfers : transfers.slice(0, 5)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Smart Savings</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <PiggyBank className="h-16 w-16 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              No smart savings configured yet
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-md">
              Smart Savings automatically transfers small amounts to help you reach your goals.
              Contact support or visit settings to get started.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Smart Savings</h1>
          <p className="text-muted-foreground text-sm">
            Automated savings to reach your goals faster
          </p>
        </div>
        <Button
          variant={config.is_active ? "destructive" : "default"}
          onClick={handleToggleActive}
          disabled={toggling}
          className="w-full sm:w-auto"
        >
          {toggling ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : config.is_active ? (
            <PowerOff className="mr-2 h-4 w-4" />
          ) : (
            <Power className="mr-2 h-4 w-4" />
          )}
          {config.is_active ? "Deactivate" : "Activate"}
        </Button>
      </div>

      {/* Savings Overview + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overview Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5 text-primary" />
              Savings Overview
            </CardTitle>
            <CardDescription>
              {config.is_active ? (
                <span className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                  Paused
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-8">
              <div>
                <p className="text-sm text-muted-foreground">Current Savings</p>
                <p className="text-3xl font-bold tracking-tight">{formatCurrency(totalSaved)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Goal</p>
                <p className="text-xl font-semibold text-muted-foreground">
                  {formatCurrency(goalAmount)}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{progressPercent.toFixed(1)}%</span>
              </div>
              <Progress value={progressPercent} className="h-3" />
            </div>

            {/* SVG Progress Ring */}
            <div className="flex justify-center pt-2">
              <div className="relative">
                <svg width="140" height="140" viewBox="0 0 140 140">
                  <circle
                    cx="70"
                    cy="70"
                    r="58"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="10"
                    className="text-muted/30"
                  />
                  <circle
                    cx="70"
                    cy="70"
                    r="58"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="10"
                    strokeLinecap="round"
                    className="text-primary"
                    strokeDasharray={`${2 * Math.PI * 58}`}
                    strokeDashoffset={`${2 * Math.PI * 58 * (1 - progressPercent / 100)}`}
                    transform="rotate(-90 70 70)"
                    style={{ transition: "stroke-dashoffset 0.6s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold">{Math.round(progressPercent)}%</span>
                  <span className="text-xs text-muted-foreground">of goal</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2.5">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Saved</p>
                  <p className="text-xl font-bold">{formatCurrency(totalSaved)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2.5">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg per Transfer</p>
                  <p className="text-xl font-bold">{formatCurrency(avgPerTransfer)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-orange-500/10 p-2.5">
                  <Flame className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Transfer Streak</p>
                  <p className="text-xl font-bold">
                    {streak} {streak === 1 ? "transfer" : "transfers"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Configuration
          </CardTitle>
          <CardDescription>Adjust your automatic savings settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="goal_amount">Goal Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  $
                </span>
                <Input
                  id="goal_amount"
                  type="number"
                  min="0"
                  step="100"
                  value={editGoal}
                  onChange={(e) => setEditGoal(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="min_balance">Min Balance Protection</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  $
                </span>
                <Input
                  id="min_balance"
                  type="number"
                  min="0"
                  step="50"
                  value={editMinBalance}
                  onChange={(e) => setEditMinBalance(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="frequency">Frequency</Label>
              <select
                id="frequency"
                value={editFrequency}
                onChange={(e) => setEditFrequency(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_transfer">Max per Transfer</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  $
                </span>
                <Input
                  id="max_transfer"
                  type="number"
                  min="0"
                  step="10"
                  value={editMaxTransfer}
                  onChange={(e) => setEditMaxTransfer(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={handleSaveConfig} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transfer History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ArrowDownUp className="h-5 w-5 text-primary" />
                Transfer History
              </CardTitle>
              <CardDescription>
                {transfers.length} total transfer{transfers.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground font-medium">
                {formatCurrency(transfers.reduce((s, t) => s + t.amount, 0))} total
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ArrowDownUp className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No transfers yet</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                Transfers will appear here once Smart Savings starts working
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-muted-foreground">Date</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Amount</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right hidden sm:table-cell">
                        Balance Before
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground text-right hidden sm:table-cell">
                        Balance After
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTransfers.map((t) => (
                      <tr
                        key={t.id}
                        className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-3 whitespace-nowrap">{formatDate(t.transferred_at)}</td>
                        <td className="py-3 text-right font-medium text-green-600 dark:text-green-400">
                          +{formatCurrency(t.amount)}
                        </td>
                        <td className="py-3 text-right text-muted-foreground hidden sm:table-cell">
                          {t.balance_before != null ? formatCurrency(t.balance_before) : "--"}
                        </td>
                        <td className="py-3 text-right text-muted-foreground hidden sm:table-cell">
                          {t.balance_after != null ? formatCurrency(t.balance_after) : "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {transfers.length > 5 && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllTransfers(!showAllTransfers)}
                  >
                    {showAllTransfers ? (
                      <>
                        <ChevronUp className="mr-1 h-4 w-4" />
                        Show Less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="mr-1 h-4 w-4" />
                        Show All ({transfers.length})
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
