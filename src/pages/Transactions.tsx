import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import type { Transaction, Account } from "@/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Search,
  Filter,
  RefreshCw,
  ArrowUpCircle,
  ArrowDownCircle,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  Receipt,
  TrendingUp,
  TrendingDown,
  CalendarDays,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25

const CATEGORIES = [
  "Alimentacao",
  "Transporte",
  "Moradia",
  "Saude",
  "Educacao",
  "Lazer",
  "Compras",
  "Servicos",
  "Assinaturas",
  "Investimentos",
  "Salario",
  "Transferencia",
  "Outros",
] as const

const CATEGORY_COLORS: Record<string, string> = {
  Alimentacao: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  Transporte: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  Moradia: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  Saude: "bg-red-500/15 text-red-600 dark:text-red-400",
  Educacao: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  Lazer: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  Compras: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  Servicos: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  Assinaturas: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  Investimentos: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Salario: "bg-green-500/15 text-green-600 dark:text-green-400",
  Transferencia: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  Outros: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso))
}

function startOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

function endOfMonth(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// Filter state type
// ---------------------------------------------------------------------------

interface Filters {
  search: string
  category: string
  dateFrom: string
  dateTo: string
  accountId: string
  amountMin: string
  amountMax: string
}

const EMPTY_FILTERS: Filters = {
  search: "",
  category: "",
  dateFrom: "",
  dateTo: "",
  accountId: "",
  amountMin: "",
  amountMax: "",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Transactions() {
  const user = useAuthStore((s) => s.user)

  // Data
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)

  // UI
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")

  // Filters
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS)

  // --------------------------------------------------
  // Fetch accounts (for filter dropdown + display)
  // --------------------------------------------------

  useEffect(() => {
    if (!user) return
    supabase
      .from("accounts")
      .select("*")
      .then(({ data }) => {
        if (data) setAccounts(data as Account[])
      })
  }, [user])

  const accountMap = useMemo(() => {
    const map: Record<string, string> = {}
    accounts.forEach((a) => {
      map[a.id] = a.name ?? "Conta sem nome"
    })
    return map
  }, [accounts])

  // --------------------------------------------------
  // Build Supabase query from applied filters
  // --------------------------------------------------

  const buildQuery = useCallback(
    (from: number, to: number, countOnly: boolean) => {
      let q = supabase
        .from("transactions")
        .select(countOnly ? "*" : "*", { count: "exact", head: countOnly })

      // Search
      if (appliedFilters.search) {
        const term = `%${appliedFilters.search}%`
        q = q.or(`description.ilike.${term},merchant_name.ilike.${term}`)
      }

      // Category
      if (appliedFilters.category) {
        q = q.eq("category", appliedFilters.category)
      }

      // Date range
      if (appliedFilters.dateFrom) {
        q = q.gte("date", appliedFilters.dateFrom)
      }
      if (appliedFilters.dateTo) {
        q = q.lte("date", appliedFilters.dateTo)
      }

      // Account
      if (appliedFilters.accountId) {
        q = q.eq("account_id", appliedFilters.accountId)
      }

      // Amount range
      if (appliedFilters.amountMin) {
        q = q.gte("amount", parseFloat(appliedFilters.amountMin))
      }
      if (appliedFilters.amountMax) {
        q = q.lte("amount", parseFloat(appliedFilters.amountMax))
      }

      if (!countOnly) {
        q = q.order("date", { ascending: sortDir === "asc" }).range(from, to)
      }

      return q
    },
    [appliedFilters, sortDir],
  )

  // --------------------------------------------------
  // Fetch transactions
  // --------------------------------------------------

  const fetchTransactions = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!user) return
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError(null)

      try {
        const from = pageNum * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        const { data, count, error: err } = await buildQuery(from, to, false)

        if (err) throw err

        const rows = (data ?? []) as Transaction[]
        setTransactions((prev) => (append ? [...prev, ...rows] : rows))
        if (count !== null) setTotalCount(count)
        setPage(pageNum)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro ao carregar transacoes"
        setError(msg)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [user, buildQuery],
  )

  // Initial + filter/sort change
  useEffect(() => {
    fetchTransactions(0, false)
  }, [fetchTransactions])

  // --------------------------------------------------
  // Monthly summary
  // --------------------------------------------------

  const monthlySummary = useMemo(() => {
    const now = new Date()
    const mStart = startOfMonth(now)
    const mEnd = endOfMonth(now)

    let income = 0
    let expenses = 0

    for (const tx of transactions) {
      if (tx.date >= mStart && tx.date <= mEnd) {
        if (tx.amount > 0) income += tx.amount
        else expenses += Math.abs(tx.amount)
      }
    }

    return { income, expenses, net: income - expenses }
  }, [transactions])

  // --------------------------------------------------
  // Filter helpers
  // --------------------------------------------------

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (appliedFilters.search) count++
    if (appliedFilters.category) count++
    if (appliedFilters.dateFrom || appliedFilters.dateTo) count++
    if (appliedFilters.accountId) count++
    if (appliedFilters.amountMin || appliedFilters.amountMax) count++
    return count
  }, [appliedFilters])

  function applyFilters() {
    setAppliedFilters({ ...filters })
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    setAppliedFilters(EMPTY_FILTERS)
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAppliedFilters((prev) => ({ ...prev, search: filters.search }))
  }

  // --------------------------------------------------
  // Render helpers
  // --------------------------------------------------

  const hasMore = transactions.length < totalCount

  const isEmpty = !loading && transactions.length === 0 && !error

  // --------------------------------------------------
  // JSX
  // --------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transacoes</h1>
          <p className="text-sm text-muted-foreground">
            Historico completo de transacoes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchTransactions(0, false)}
          disabled={loading}
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Atualizar
        </Button>
      </div>

      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receitas do mes</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(monthlySummary.income)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Despesas do mes</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(monthlySummary.expenses)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo do mes</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                monthlySummary.net >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {formatCurrency(monthlySummary.net)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Filter Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por descricao ou comerciante..."
            className="pl-9 pr-9"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
          {filters.search && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setFilters((f) => ({ ...f, search: "" }))
                setAppliedFilters((f) => ({ ...f, search: "" }))
              }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFiltersOpen((o) => !o)}
            className="relative"
          >
            <Filter className="h-4 w-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
            {filtersOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            title={sortDir === "desc" ? "Mais recentes primeiro" : "Mais antigos primeiro"}
          >
            {sortDir === "desc" ? (
              <ArrowDownCircle className="h-4 w-4" />
            ) : (
              <ArrowUpCircle className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {sortDir === "desc" ? "Recentes" : "Antigos"}
            </span>
          </Button>
        </div>
      </div>

      {/* Expandable Filter Panel */}
      {filtersOpen && (
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Categoria
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={filters.category}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, category: e.target.value }))
                }
              >
                <option value="">Todas</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Account */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Conta
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={filters.accountId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, accountId: e.target.value }))
                }
              >
                <option value="">Todas</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name ?? "Conta sem nome"}
                  </option>
                ))}
              </select>
            </div>

            {/* Date From */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Data inicial
              </label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, dateFrom: e.target.value }))
                }
              />
            </div>

            {/* Date To */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Data final
              </label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, dateTo: e.target.value }))
                }
              />
            </div>

            {/* Amount Min */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Valor minimo
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={filters.amountMin}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, amountMin: e.target.value }))
                }
              />
            </div>

            {/* Amount Max */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Valor maximo
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={filters.amountMax}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, amountMax: e.target.value }))
                }
              />
            </div>

            {/* Actions */}
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button size="sm" onClick={applyFilters}>
                Aplicar filtros
              </Button>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Limpar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result count */}
      {!loading && !isEmpty && (
        <p className="text-xs text-muted-foreground">
          Mostrando {transactions.length} de {totalCount} transacao(es)
        </p>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold">Nenhuma transacao encontrada</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {activeFilterCount > 0
                ? "Tente ajustar seus filtros para encontrar transacoes."
                : "Conecte uma conta bancaria para ver suas transacoes aqui."}
            </p>
            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                Limpar filtros
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Transactions list */}
      {!loading && transactions.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Comerciante</th>
                      <th className="px-4 py-3">Descricao</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-4 py-3">Conta</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="transition-colors hover:bg-muted/50"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatDate(tx.date)}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            {tx.merchant_name ?? "—"}
                            {tx.is_recurring && (
                              <span
                                className="inline-flex items-center rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400"
                                title="Recorrente"
                              >
                                <RefreshCw className="mr-0.5 h-2.5 w-2.5" />
                                Rec
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground">
                          {tx.description ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {tx.category ? (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                CATEGORY_COLORS[tx.category] ??
                                CATEGORY_COLORS["Outros"]
                              }`}
                            >
                              {tx.category}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {tx.account_id ? (accountMap[tx.account_id] ?? "—") : "—"}
                        </td>
                        <td
                          className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${
                            tx.amount >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {tx.amount >= 0 ? "+" : ""}
                          {formatCurrency(tx.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {transactions.map((tx) => (
              <Card key={tx.id}>
                <CardContent className="flex items-center gap-3 p-4">
                  {/* Amount indicator */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      tx.amount >= 0
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-red-500/15 text-red-600 dark:text-red-400"
                    }`}
                  >
                    {tx.amount >= 0 ? (
                      <ArrowDownCircle className="h-5 w-5" />
                    ) : (
                      <ArrowUpCircle className="h-5 w-5" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {tx.merchant_name ?? tx.description ?? "Transacao"}
                      </span>
                      {tx.is_recurring && (
                        <RefreshCw className="h-3 w-3 shrink-0 text-violet-500" />
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(tx.date)}</span>
                      {tx.category && (
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            CATEGORY_COLORS[tx.category] ??
                            CATEGORY_COLORS["Outros"]
                          }`}
                        >
                          {tx.category}
                        </span>
                      )}
                      {tx.account_id && accountMap[tx.account_id] && (
                        <span>{accountMap[tx.account_id]}</span>
                      )}
                    </div>
                    {tx.description && tx.merchant_name && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {tx.description}
                      </p>
                    )}
                  </div>

                  {/* Amount */}
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      tx.amount >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {tx.amount >= 0 ? "+" : ""}
                    {formatCurrency(tx.amount)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => fetchTransactions(page + 1, true)}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
