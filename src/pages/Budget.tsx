import { useEffect, useState, useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import type { Category, Transaction } from "@/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  PiggyBank,
  ShoppingCart,
  Home,
  Car,
  Utensils,
  Zap,
  Gamepad2,
  Heart,
  GraduationCap,
  Plane,
  Shirt,
  Gift,
  Smartphone,
  TrendingUp,
  MoreHorizontal,
  Wallet,
} from "lucide-react"

// ── Icon registry ──────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  PiggyBank,
  ShoppingCart,
  Home,
  Car,
  Utensils,
  Zap,
  Gamepad2,
  Heart,
  GraduationCap,
  Plane,
  Shirt,
  Gift,
  Smartphone,
  TrendingUp,
  MoreHorizontal,
  Wallet,
}

const ICON_OPTIONS = Object.keys(ICON_MAP)

const COLOR_OPTIONS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f43f5e",
]

// ── Helpers ────────────────────────────────────────────────────────────────
function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function getIcon(name: string | null) {
  if (!name) return Wallet
  return ICON_MAP[name] ?? Wallet
}

function currentMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

// ── Types ──────────────────────────────────────────────────────────────────
interface CategoryWithSpent extends Category {
  spent: number
}

interface FormState {
  name: string
  color: string
  icon: string
  budget_limit: string
}

const emptyForm: FormState = { name: "", color: COLOR_OPTIONS[0], icon: "Wallet", budget_limit: "" }

// ── Component ──────────────────────────────────────────────────────────────
export default function Budget() {
  const { user, tenantId } = useAuthStore()
  const [categories, setCategories] = useState<CategoryWithSpent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  // ── Fetch data ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user || !tenantId) return
    setLoading(true)

    const { start, end } = currentMonthRange()

    const [catRes, txRes] = await Promise.all([
      supabase
        .from("categories")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .order("name"),
      supabase
        .from("transactions")
        .select("category, amount")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .gte("date", start)
        .lte("date", end),
    ])

    const cats: Category[] = catRes.data ?? []
    const txs: Pick<Transaction, "category" | "amount">[] = txRes.data ?? []

    // Sum spending per category name
    const spentMap = new Map<string, number>()
    for (const tx of txs) {
      const key = (tx.category ?? "").toLowerCase()
      // Only count negative amounts (expenses) — stored as negative values
      const abs = Math.abs(tx.amount)
      if (tx.amount < 0) {
        spentMap.set(key, (spentMap.get(key) ?? 0) + abs)
      }
    }

    const merged: CategoryWithSpent[] = cats.map((c) => ({
      ...c,
      spent: spentMap.get((c.name ?? "").toLowerCase()) ?? 0,
    }))

    setCategories(merged)
    setLoading(false)
  }, [user, tenantId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Totals ─────────────────────────────────────────────────────────────
  const { totalBudget, totalSpent } = useMemo(() => {
    let totalBudget = 0
    let totalSpent = 0
    for (const c of categories) {
      totalBudget += c.budget_limit ?? 0
      totalSpent += c.spent
    }
    return { totalBudget, totalSpent }
  }, [categories])

  const overallPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0

  // ── Form handlers ──────────────────────────────────────────────────────
  function openAdd() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(cat: CategoryWithSpent) {
    setEditingId(cat.id)
    setForm({
      name: cat.name ?? "",
      color: cat.color ?? COLOR_OPTIONS[0],
      icon: cat.icon ?? "Wallet",
      budget_limit: cat.budget_limit?.toString() ?? "",
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleSave() {
    if (!user || !tenantId || !form.name.trim()) return
    setSaving(true)

    const payload = {
      tenant_id: tenantId,
      user_id: user.id,
      name: form.name.trim(),
      color: form.color,
      icon: form.icon,
      budget_limit: form.budget_limit ? parseFloat(form.budget_limit) : null,
      is_custom: true,
    }

    if (editingId) {
      await supabase.from("categories").update(payload).eq("id", editingId)
    } else {
      await supabase.from("categories").insert(payload)
    }

    setSaving(false)
    closeForm()
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta categoria?")) return
    await supabase.from("categories").delete().eq("id", id)
    fetchData()
  }

  // ── Max spent for chart scaling ────────────────────────────────────────
  const maxSpent = useMemo(() => {
    let m = 0
    for (const c of categories) {
      if (c.spent > m) m = c.spent
    }
    return m || 1
  }, [categories])

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Orcamento</h1>
          <p className="text-muted-foreground">Categorias e limites de gastos mensais.</p>
        </div>
        <Button onClick={openAdd} className="gap-2 self-start">
          <Plus className="h-4 w-4" /> Nova Categoria
        </Button>
      </div>

      {/* ── Monthly Overview ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Visao Geral do Mes</CardTitle>
          <CardDescription>
            {formatCurrency(totalSpent)} gasto de {formatCurrency(totalBudget)} orcado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Progress
              value={totalSpent}
              max={totalBudget || 1}
              className={`h-4 ${overallPct > 100 ? "[&>div]:bg-red-500" : overallPct > 80 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}`}
            />
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{overallPct}% utilizado</span>
            <span>Restante: {formatCurrency(Math.max(totalBudget - totalSpent, 0))}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Add / Edit Form ───────────────────────────────────────────── */}
      {showForm && (
        <Card className="border-primary/40">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {editingId ? "Editar Categoria" : "Nova Categoria"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Name + Limit */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cat-name">Nome</Label>
                <Input
                  id="cat-name"
                  placeholder="Ex: Alimentacao"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-limit">Limite Mensal (R$)</Label>
                <Input
                  id="cat-limit"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={form.budget_limit}
                  onChange={(e) => setForm((f) => ({ ...f, budget_limit: e.target.value }))}
                />
              </div>
            </div>

            {/* Color picker */}
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`h-8 w-8 rounded-full border-2 transition-transform ${form.color === c ? "scale-125 border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>

            {/* Icon picker */}
            <div className="space-y-2">
              <Label>Icone</Label>
              <div className="flex flex-wrap gap-2">
                {ICON_OPTIONS.map((name) => {
                  const Icon = ICON_MAP[name]
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, icon: name }))}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${form.icon === name ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/40 text-muted-foreground hover:border-primary/50"}`}
                      aria-label={name}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {editingId ? "Salvar" : "Adicionar"}
              </Button>
              <Button variant="outline" onClick={closeForm} className="gap-2">
                <X className="h-4 w-4" /> Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Category Cards ────────────────────────────────────────────── */}
      {categories.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <PiggyBank className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-lg font-medium">Nenhuma categoria</p>
            <p className="text-sm text-muted-foreground">
              Crie sua primeira categoria de orcamento para comecar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => {
            const Icon = getIcon(cat.icon)
            const limit = cat.budget_limit ?? 0
            const pct = limit > 0 ? Math.round((cat.spent / limit) * 100) : 0
            const over = pct > 100
            const warn = pct > 80 && !over

            return (
              <Card key={cat.id} className="group relative overflow-hidden">
                {/* Colored top accent */}
                <div
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ backgroundColor: cat.color ?? "#6b7280" }}
                />

                <CardHeader className="flex flex-row items-start justify-between pb-2 pt-5">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${cat.color ?? "#6b7280"}20` }}
                    >
                      <Icon className="h-5 w-5" style={{ color: cat.color ?? "#6b7280" }} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{cat.name ?? "Sem nome"}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Limite: {limit > 0 ? formatCurrency(limit) : "---"}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEdit(cat)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {cat.is_custom && (
                      <button
                        onClick={() => handleDelete(cat.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-semibold">{formatCurrency(cat.spent)}</span>
                    <span
                      className={`text-sm font-medium ${over ? "text-red-500" : warn ? "text-amber-500" : "text-emerald-500"}`}
                    >
                      {limit > 0 ? `${pct}%` : "--"}
                    </span>
                  </div>

                  {limit > 0 && (
                    <Progress
                      value={cat.spent}
                      max={limit}
                      className={`h-2 ${over ? "[&>div]:bg-red-500" : warn ? "[&>div]:bg-amber-500" : ""}`}
                      style={
                        !over && !warn
                          ? ({ "--tw-bg-opacity": 1, "& > div": { backgroundColor: cat.color } } as React.CSSProperties)
                          : undefined
                      }
                    />
                  )}

                  {limit > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {over
                        ? `Acima em ${formatCurrency(cat.spent - limit)}`
                        : `Restam ${formatCurrency(limit - cat.spent)}`}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Spending by Category Chart ────────────────────────────────── */}
      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Gastos por Categoria</CardTitle>
            <CardDescription>Distribuicao de gastos deste mes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {categories
              .slice()
              .sort((a, b) => b.spent - a.spent)
              .map((cat) => {
                const Icon = getIcon(cat.icon)
                const barWidth = maxSpent > 0 ? Math.max((cat.spent / maxSpent) * 100, 2) : 2
                const limit = cat.budget_limit ?? 0

                return (
                  <div key={cat.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Icon
                          className="h-4 w-4 shrink-0"
                          style={{ color: cat.color ?? "#6b7280" }}
                        />
                        <span className="font-medium">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span>{formatCurrency(cat.spent)}</span>
                        {limit > 0 && (
                          <span className="text-xs">/ {formatCurrency(limit)}</span>
                        )}
                      </div>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: cat.color ?? "#6b7280",
                        }}
                      />
                    </div>
                  </div>
                )
              })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
