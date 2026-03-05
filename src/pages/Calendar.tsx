import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import type { Subscription } from "@/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  CreditCard,
  DollarSign,
  AlertCircle,
} from "lucide-react"

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function formatCurrency(amount: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  })
}

export default function Calendar() {
  const { user } = useAuthStore()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth()

  useEffect(() => {
    if (!user) return
    async function fetchSubscriptions() {
      setLoading(true)
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user!.id)
        .in("status", ["active", "trialing"])
        .order("next_charge_date", { ascending: true })

      if (!error && data) {
        setSubscriptions(data as Subscription[])
      }
      setLoading(false)
    }
    fetchSubscriptions()
  }, [user])

  // Map day-of-month -> subscriptions for the current month view
  const chargesByDay = useMemo(() => {
    const map = new Map<number, Subscription[]>()
    for (const sub of subscriptions) {
      if (!sub.next_charge_date) continue
      const d = new Date(sub.next_charge_date)
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        const day = d.getDate()
        if (!map.has(day)) map.set(day, [])
        map.get(day)!.push(sub)
      }
    }
    return map
  }, [subscriptions, currentYear, currentMonth])

  const monthTotal = useMemo(() => {
    let total = 0
    chargesByDay.forEach((subs) => {
      for (const s of subs) total += s.amount
    })
    return total
  }, [chargesByDay])

  const upcomingBills = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return subscriptions
      .filter((s) => s.next_charge_date && new Date(s.next_charge_date) >= today)
      .slice(0, 10)
  }, [subscriptions])

  const selectedDayCharges = selectedDay ? chargesByDay.get(selectedDay) ?? [] : []

  const daysInMonth = getDaysInMonth(currentYear, currentMonth)
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth)
  const today = new Date()
  const isCurrentMonth =
    today.getFullYear() === currentYear && today.getMonth() === currentMonth

  function prevMonth() {
    setSelectedDay(null)
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1))
  }

  function nextMonth() {
    setSelectedDay(null)
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1))
  }

  const monthLabel = currentDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          Calendario de Cobrancas
        </h1>
        <p className="text-muted-foreground">Visualize suas proximas cobrancas de assinaturas.</p>
      </div>

      {/* Month total */}
      <Card>
        <CardContent className="flex items-center justify-between p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total do mes</p>
              <p className="text-2xl font-bold">{formatCurrency(monthTotal)}</p>
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            {chargesByDay.size} dia(s) com cobrancas
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar Grid */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="capitalize text-lg">{monthLabel}</CardTitle>
              <Button variant="ghost" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS_OF_WEEK.map((d) => (
                <div
                  key={d}
                  className="text-center text-xs font-medium text-muted-foreground py-1"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells before first day */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const charges = chargesByDay.get(day)
                const hasCharges = !!charges && charges.length > 0
                const isToday = isCurrentMonth && today.getDate() === day
                const isSelected = selectedDay === day

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={`
                      aspect-square flex flex-col items-center justify-center rounded-lg
                      text-sm transition-colors relative
                      ${isSelected ? "bg-primary text-primary-foreground" : ""}
                      ${isToday && !isSelected ? "ring-2 ring-primary" : ""}
                      ${hasCharges && !isSelected ? "bg-destructive/10 dark:bg-destructive/20" : ""}
                      ${!isSelected ? "hover:bg-accent" : ""}
                    `}
                  >
                    <span className="font-medium">{day}</span>
                    {hasCharges && (
                      <span
                        className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${
                          isSelected ? "bg-primary-foreground" : "bg-destructive"
                        }`}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected day detail / upcoming */}
        <div className="space-y-6">
          {selectedDay !== null && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Cobrancas em {selectedDay}/{currentMonth + 1}
                </CardTitle>
                <CardDescription>
                  {selectedDayCharges.length === 0
                    ? "Nenhuma cobranca neste dia."
                    : `${selectedDayCharges.length} cobranca(s)`}
                </CardDescription>
              </CardHeader>
              {selectedDayCharges.length > 0 && (
                <CardContent className="space-y-3">
                  {selectedDayCharges.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        {sub.merchant_logo ? (
                          <img
                            src={sub.merchant_logo}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium">{sub.merchant_name ?? "Desconhecido"}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {sub.frequency ?? "mensal"}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-destructive">
                        {formatCurrency(sub.amount, sub.currency)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          )}

          {/* Upcoming bills */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Proximas cobrancas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingBills.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhuma cobranca futura encontrada.
                </p>
              ) : (
                <div className="space-y-3">
                  {upcomingBills.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        {sub.merchant_logo ? (
                          <img
                            src={sub.merchant_logo}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium">
                            {sub.merchant_name ?? "Desconhecido"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {sub.next_charge_date ? formatDate(sub.next_charge_date) : "--"}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold">
                        {formatCurrency(sub.amount, sub.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
