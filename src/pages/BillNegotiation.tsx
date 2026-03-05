import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import type { BillNegotiation as BillNegotiationType } from "@/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DollarSign,
  TrendingDown,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  X,
  FileText,
  PhoneCall,
  BadgePercent,
  ThumbsUp,
  AlertCircle,
  ArrowRight,
  BarChart3,
} from "lucide-react"

const STATUS_CONFIG: Record<
  BillNegotiationType["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  completed: {
    label: "Completed",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
}

const SERVICE_OPTIONS = [
  "Internet",
  "Cable TV",
  "Cell Phone",
  "Insurance (Auto)",
  "Insurance (Home)",
  "Electricity",
  "Gas",
  "Water",
  "Satellite Radio",
  "Security System",
  "Streaming Bundle",
  "Gym Membership",
  "Other",
]

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function StatusBadge({ status }: { status: BillNegotiationType["status"] }) {
  const config = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  )
}

export default function BillNegotiation() {
  const { user, tenantId } = useAuthStore()
  const [negotiations, setNegotiations] = useState<BillNegotiationType[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [serviceName, setServiceName] = useState("")
  const [customService, setCustomService] = useState("")
  const [currentAmount, setCurrentAmount] = useState("")

  const fetchNegotiations = useCallback(async () => {
    if (!user || !tenantId) return
    setLoading(true)
    const { data, error } = await supabase
      .from("bill_negotiations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })

    if (!error && data) {
      setNegotiations(data as BillNegotiationType[])
    }
    setLoading(false)
  }, [user, tenantId])

  useEffect(() => {
    fetchNegotiations()
  }, [fetchNegotiations])

  const handleSubmit = async () => {
    const resolvedService = serviceName === "Other" ? customService.trim() : serviceName
    const amount = parseFloat(currentAmount)
    if (!resolvedService || isNaN(amount) || amount <= 0 || !user || !tenantId) return

    setSubmitting(true)
    const { error } = await supabase.from("bill_negotiations").insert({
      tenant_id: tenantId,
      user_id: user.id,
      service_name: resolvedService,
      current_amount: amount,
      fee_percentage: 40,
      status: "pending",
      requested_at: new Date().toISOString(),
    })

    if (!error) {
      setShowForm(false)
      setServiceName("")
      setCustomService("")
      setCurrentAmount("")
      await fetchNegotiations()
    }
    setSubmitting(false)
  }

  // Summary calculations
  const completed = negotiations.filter((n) => n.status === "completed")
  const active = negotiations.filter((n) => n.status === "pending" || n.status === "in_progress")
  const totalAnnualSavings = completed.reduce((sum, n) => sum + (n.annual_savings ?? 0), 0)
  const successRate =
    negotiations.length > 0
      ? Math.round((completed.length / negotiations.filter((n) => n.status !== "pending" && n.status !== "in_progress").length) * 100) || 0
      : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bill Negotiation</h1>
          <p className="text-muted-foreground">
            We negotiate your bills to save you money. You only pay if we succeed.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2" disabled={showForm}>
          <Plus className="h-4 w-4" />
          New Negotiation
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Annual Savings</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(totalAnnualSavings)}
            </div>
            <p className="text-xs text-muted-foreground">Total from completed negotiations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Negotiations</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{active.length}</div>
            <p className="text-xs text-muted-foreground">Currently being negotiated</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground">
              {completed.length} of {negotiations.filter((n) => n.status === "completed" || n.status === "failed").length} resolved
            </p>
          </CardContent>
        </Card>
      </div>

      {/* New Negotiation Form */}
      {showForm && (
        <Card className="border-primary/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Start a New Negotiation</CardTitle>
                <CardDescription>
                  Select the service and enter your current monthly bill amount.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowForm(false)
                  setServiceName("")
                  setCustomService("")
                  setCurrentAmount("")
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="service">Service</Label>
                <select
                  id="service"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select a service...</option>
                  {SERVICE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {serviceName === "Other" && (
                <div className="space-y-2">
                  <Label htmlFor="customService">Service Name</Label>
                  <Input
                    id="customService"
                    placeholder="Enter service name"
                    value={customService}
                    onChange={(e) => setCustomService(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="amount">Current Monthly Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                />
              </div>

              {currentAmount && parseFloat(currentAmount) > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Our fee is 40% of the first year&apos;s savings. You pay nothing if we can&apos;t
                  lower your bill.
                </div>
              )}
            </div>

            <div className="mt-6">
              <Button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  !serviceName ||
                  (serviceName === "Other" && !customService.trim()) ||
                  !currentAmount ||
                  isNaN(parseFloat(currentAmount)) ||
                  parseFloat(currentAmount) <= 0
                }
                className="gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PhoneCall className="h-4 w-4" />
                )}
                Submit Negotiation Request
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Negotiation List */}
      {negotiations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingDown className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="mt-4 text-lg font-semibold">No negotiations yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Start your first bill negotiation and we&apos;ll work to lower your monthly bills.
              You only pay if we save you money.
            </p>
            <Button className="mt-6 gap-2" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Start Your First Negotiation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Your Negotiations</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {negotiations.map((n) => (
              <Card key={n.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{n.service_name}</CardTitle>
                      <CardDescription>
                        Requested {formatDate(n.requested_at)}
                      </CardDescription>
                    </div>
                    <StatusBadge status={n.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Amounts */}
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex-1">
                      <p className="text-muted-foreground">Current</p>
                      <p className="text-lg font-semibold">
                        {formatCurrency(n.current_amount)}
                        <span className="text-xs font-normal text-muted-foreground">/mo</span>
                      </p>
                    </div>
                    {n.negotiated_amount !== null && (
                      <>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1">
                          <p className="text-muted-foreground">Negotiated</p>
                          <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                            {formatCurrency(n.negotiated_amount)}
                            <span className="text-xs font-normal text-muted-foreground">/mo</span>
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Savings & Fee */}
                  {n.status === "completed" && n.annual_savings !== null && (
                    <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-green-700 dark:text-green-400">Annual Savings</span>
                        <span className="font-semibold text-green-700 dark:text-green-400">
                          {formatCurrency(n.annual_savings)}
                        </span>
                      </div>
                      {n.fee_amount !== null && (
                        <div className="mt-1 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Fee ({n.fee_percentage}% of 1st yr savings)
                          </span>
                          <span className="font-medium text-muted-foreground">
                            {formatCurrency(n.fee_amount)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {n.status === "failed" && n.notes && (
                    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                      {n.notes}
                    </div>
                  )}

                  {/* Completed date */}
                  {n.completed_at && (
                    <p className="text-xs text-muted-foreground">
                      Completed {formatDate(n.completed_at)}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
          <CardDescription>
            Our bill negotiation process is simple and risk-free.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mt-3 font-semibold">1. Submit Your Bill</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Tell us which service you want us to negotiate and your current monthly amount.
              </p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <PhoneCall className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mt-3 font-semibold">2. We Negotiate</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Our expert team contacts your provider and negotiates a lower rate on your behalf.
              </p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <BadgePercent className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mt-3 font-semibold">3. You Save</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                If we succeed, you enjoy lower bills. Our fee is just 40% of your first year&apos;s
                savings.
              </p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ThumbsUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mt-3 font-semibold">4. No Risk</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                If we can&apos;t lower your bill, you pay absolutely nothing. It&apos;s completely
                risk-free.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
