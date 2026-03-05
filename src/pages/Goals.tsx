import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import type { FinancialGoal } from "@/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Target,
  Plus,
  X,
  Loader2,
  TrendingUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Calendar,
  RefreshCw,
  Trash2,
  PiggyBank,
} from "lucide-react"

type GoalFormData = {
  name: string
  target_amount: string
  deadline: string
  auto_transfer: boolean
  frequency: string
}

const defaultForm: GoalFormData = {
  name: "",
  target_amount: "",
  deadline: "",
  auto_transfer: false,
  frequency: "monthly",
}

const frequencyOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
]

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "No deadline"
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function getPercentage(current: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(Math.round((current / target) * 100), 100)
}

function isOnTrack(goal: FinancialGoal): boolean {
  if (!goal.deadline) return true
  const now = new Date()
  const deadline = new Date(goal.deadline)
  const created = new Date(goal.created_at)
  const totalDuration = deadline.getTime() - created.getTime()
  const elapsed = now.getTime() - created.getTime()
  if (totalDuration <= 0) return true
  const expectedProgress = elapsed / totalDuration
  const actualProgress = goal.target_amount > 0 ? goal.current_amount / goal.target_amount : 0
  return actualProgress >= expectedProgress * 0.8
}

function daysRemaining(deadline: string | null): number | null {
  if (!deadline) return null
  const diff = new Date(deadline).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export default function Goals() {
  const { user, tenantId } = useAuthStore()
  const [goals, setGoals] = useState<FinancialGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<GoalFormData>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchGoals = useCallback(async () => {
    if (!user || !tenantId) return
    setLoading(true)
    const { data, error } = await supabase
      .from("financial_goals")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (!error && data) {
      setGoals(data as FinancialGoal[])
    }
    setLoading(false)
  }, [user, tenantId])

  useEffect(() => {
    fetchGoals()
  }, [fetchGoals])

  const handleCreate = async () => {
    if (!user || !tenantId || !form.name.trim() || !form.target_amount) return
    setSaving(true)
    const { error } = await supabase.from("financial_goals").insert({
      tenant_id: tenantId,
      user_id: user.id,
      name: form.name.trim(),
      target_amount: parseFloat(form.target_amount),
      current_amount: 0,
      deadline: form.deadline || null,
      auto_transfer: form.auto_transfer,
      frequency: form.auto_transfer ? form.frequency : null,
    })
    if (!error) {
      setForm(defaultForm)
      setShowModal(false)
      await fetchGoals()
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const { error } = await supabase.from("financial_goals").delete().eq("id", id)
    if (!error) {
      setGoals((prev) => prev.filter((g) => g.id !== id))
      if (expandedId === id) setExpandedId(null)
    }
    setDeletingId(null)
  }

  // Summary calculations
  const totalGoals = goals.length
  const onTrackCount = goals.filter(isOnTrack).length
  const totalSaved = goals.reduce((sum, g) => sum + g.current_amount, 0)
  const totalTarget = goals.reduce((sum, g) => sum + g.target_amount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Goals</h1>
          <p className="text-muted-foreground">Track your savings goals and stay on target.</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Add Goal
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Goals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{totalGoals}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>On Track</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{onTrackCount}</span>
              <span className="text-sm text-muted-foreground">
                / {totalGoals}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Saved</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{formatCurrency(totalSaved)}</span>
              {totalTarget > 0 && (
                <span className="text-sm text-muted-foreground">
                  / {formatCurrency(totalTarget)}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && goals.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16">
          <Target className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold">No goals yet</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-4 text-center max-w-sm">
            Set a financial goal to start tracking your savings progress.
          </p>
          <Button onClick={() => setShowModal(true)} variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Create your first goal
          </Button>
        </Card>
      )}

      {/* Goals Grid */}
      {!loading && goals.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => {
            const pct = getPercentage(goal.current_amount, goal.target_amount)
            const onTrack = isOnTrack(goal)
            const days = daysRemaining(goal.deadline)
            const isExpanded = expandedId === goal.id
            const isComplete = pct >= 100

            return (
              <Card
                key={goal.id}
                className={`transition-shadow hover:shadow-md ${
                  isComplete ? "border-green-500/40" : ""
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">
                        {goal.name || "Untitled Goal"}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(goal.deadline)}
                      </CardDescription>
                    </div>
                    {isComplete ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    ) : onTrack ? (
                      <TrendingUp className="h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <TrendingUp className="h-5 w-5 text-amber-500 shrink-0" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Amount Row */}
                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-bold">
                      {formatCurrency(goal.current_amount)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      of {formatCurrency(goal.target_amount)}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <Progress value={pct} />

                  {/* Percentage + Days */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">{pct}% complete</span>
                    {days !== null && (
                      <span>
                        {days === 0
                          ? "Due today"
                          : `${days} day${days !== 1 ? "s" : ""} left`}
                      </span>
                    )}
                  </div>

                  {/* Expand/Collapse Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setExpandedId(isExpanded ? null : goal.id)}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="mr-1 h-4 w-4" />
                        Hide Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="mr-1 h-4 w-4" />
                        View Details
                      </>
                    )}
                  </Button>

                  {/* Expanded Detail Section */}
                  {isExpanded && (
                    <div className="space-y-3 pt-2 border-t">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Status</p>
                          <p className="font-medium">
                            {isComplete ? (
                              <span className="text-green-500">Completed</span>
                            ) : onTrack ? (
                              <span className="text-green-500">On Track</span>
                            ) : (
                              <span className="text-amber-500">Behind</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Remaining</p>
                          <p className="font-medium">
                            {formatCurrency(
                              Math.max(goal.target_amount - goal.current_amount, 0)
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Auto Transfer</p>
                          <p className="font-medium flex items-center gap-1">
                            {goal.auto_transfer ? (
                              <>
                                <RefreshCw className="h-3 w-3 text-primary" />
                                {goal.frequency || "Active"}
                              </>
                            ) : (
                              "Off"
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Created</p>
                          <p className="font-medium">{formatDate(goal.created_at)}</p>
                        </div>
                      </div>

                      {/* Monthly target estimate */}
                      {days !== null && days > 0 && !isComplete && (
                        <div className="rounded-lg bg-muted/50 p-3 text-sm">
                          <p className="text-muted-foreground">
                            To stay on target, save approx.{" "}
                            <span className="font-semibold text-foreground">
                              {formatCurrency(
                                Math.ceil(
                                  (goal.target_amount - goal.current_amount) /
                                    Math.max(Math.ceil(days / 30), 1)
                                )
                              )}
                              /month
                            </span>
                          </p>
                        </div>
                      )}

                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        disabled={deletingId === goal.id}
                        onClick={() => handleDelete(goal.id)}
                      >
                        {deletingId === goal.id ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-1 h-4 w-4" />
                        )}
                        Delete Goal
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add Goal Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModal(false)}
          />
          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md mx-4 rounded-xl border bg-card p-6 shadow-lg space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Create New Goal</h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setShowModal(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="goal-name">Goal Name</Label>
                <Input
                  id="goal-name"
                  placeholder="e.g., Emergency Fund"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              {/* Target Amount */}
              <div className="space-y-2">
                <Label htmlFor="goal-target">Target Amount ($)</Label>
                <Input
                  id="goal-target"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="10000"
                  value={form.target_amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, target_amount: e.target.value }))
                  }
                />
              </div>

              {/* Deadline */}
              <div className="space-y-2">
                <Label htmlFor="goal-deadline">Deadline (optional)</Label>
                <Input
                  id="goal-deadline"
                  type="date"
                  value={form.deadline}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, deadline: e.target.value }))
                  }
                />
              </div>

              {/* Auto Transfer Toggle */}
              <div className="flex items-center gap-3">
                <Checkbox
                  id="goal-auto"
                  checked={form.auto_transfer}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, auto_transfer: checked === true }))
                  }
                />
                <Label htmlFor="goal-auto" className="cursor-pointer">
                  Enable auto transfer
                </Label>
              </div>

              {/* Frequency (shown when auto_transfer is on) */}
              {form.auto_transfer && (
                <div className="space-y-2">
                  <Label htmlFor="goal-frequency">Transfer Frequency</Label>
                  <select
                    id="goal-frequency"
                    value={form.frequency}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, frequency: e.target.value }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {frequencyOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={saving || !form.name.trim() || !form.target_amount}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Goal
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
