import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import type { Account } from "@/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Loader2,
  TrendingUp,
  Landmark,
  PiggyBank,
  CreditCard,
  BarChart3,
  Plus,
  X,
  Wallet,
} from "lucide-react"

const ACCOUNT_TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof Landmark; color: string; sign: number }
> = {
  checking: { label: "Conta Corrente", icon: Landmark, color: "text-blue-500", sign: 1 },
  savings: { label: "Poupanca", icon: PiggyBank, color: "text-green-500", sign: 1 },
  credit: { label: "Cartao de Credito", icon: CreditCard, color: "text-red-500", sign: -1 },
  investment: { label: "Investimentos", icon: BarChart3, color: "text-purple-500", sign: 1 },
}

const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_CONFIG)

function formatCurrency(amount: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount)
}

export default function NetWorth() {
  const { user } = useAuthStore()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Add-account form state
  const [formName, setFormName] = useState("")
  const [formType, setFormType] = useState("checking")
  const [formBalance, setFormBalance] = useState("")
  const [formInstitution, setFormInstitution] = useState("")

  async function fetchAccounts() {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", user.id)
      .order("type", { ascending: true })
      .order("name", { ascending: true })

    if (!error && data) {
      setAccounts(data as Account[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Group accounts by type
  const grouped = useMemo(() => {
    const map = new Map<string, Account[]>()
    for (const type of ACCOUNT_TYPES) {
      map.set(type, [])
    }
    for (const acc of accounts) {
      const t = acc.type ?? "checking"
      if (!map.has(t)) map.set(t, [])
      map.get(t)!.push(acc)
    }
    return map
  }, [accounts])

  // Net worth = assets - liabilities (credit balances treated as negative)
  const netWorth = useMemo(() => {
    let total = 0
    for (const acc of accounts) {
      const cfg = ACCOUNT_TYPE_CONFIG[acc.type ?? "checking"]
      const sign = cfg?.sign ?? 1
      total += acc.balance * sign
    }
    return total
  }, [accounts])

  // Subtotals by type
  const subtotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const [type, accs] of grouped) {
      map.set(type, accs.reduce((sum, a) => sum + a.balance, 0))
    }
    return map
  }, [grouped])

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !formName.trim()) return

    setSaving(true)
    const { error } = await supabase.from("accounts").insert({
      user_id: user.id,
      tenant_id: user.user_metadata?.tenant_id ?? user.id,
      name: formName.trim(),
      type: formType,
      balance: parseFloat(formBalance) || 0,
      currency: "BRL",
      bank_connection_id: null,
    })

    if (!error) {
      setFormName("")
      setFormType("checking")
      setFormBalance("")
      setFormInstitution("")
      setShowAddForm(false)
      await fetchAccounts()
    }
    setSaving(false)
  }

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" />
            Patrimonio Liquido
          </h1>
          <p className="text-muted-foreground">Acompanhe a evolucao do seu patrimonio.</p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} variant={showAddForm ? "outline" : "default"}>
          {showAddForm ? (
            <>
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Conta
            </>
          )}
        </Button>
      </div>

      {/* Add account form */}
      {showAddForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Nova Conta</CardTitle>
            <CardDescription>Adicione uma conta manualmente.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddAccount} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="acc-name">Nome da conta</Label>
                <Input
                  id="acc-name"
                  placeholder="Ex: Nubank"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="acc-type">Tipo</Label>
                <select
                  id="acc-type"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACCOUNT_TYPE_CONFIG[t].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="acc-balance">Saldo (R$)</Label>
                <Input
                  id="acc-balance"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formBalance}
                  onChange={(e) => setFormBalance(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Net Worth Hero */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <div className="rounded-full bg-primary/10 p-3 mb-3">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">Patrimonio Liquido Atual</p>
          <p
            className={`text-4xl font-bold ${
              netWorth >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {formatCurrency(netWorth)}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {accounts.length} conta(s) vinculada(s)
          </p>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ACCOUNT_TYPES.map((type) => {
          const cfg = ACCOUNT_TYPE_CONFIG[type]
          const Icon = cfg.icon
          const total = subtotals.get(type) ?? 0
          const count = grouped.get(type)?.length ?? 0
          return (
            <Card key={type}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`rounded-full bg-muted p-2 ${cfg.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{cfg.label}</p>
                  <p className="text-lg font-semibold truncate">{formatCurrency(total)}</p>
                  <p className="text-xs text-muted-foreground">{count} conta(s)</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Accounts grouped by type */}
      {accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhuma conta encontrada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Adicione suas contas para acompanhar seu patrimonio.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {ACCOUNT_TYPES.map((type) => {
            const accs = grouped.get(type) ?? []
            if (accs.length === 0) return null
            const cfg = ACCOUNT_TYPE_CONFIG[type]
            const Icon = cfg.icon

            return (
              <Card key={type}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className={`h-5 w-5 ${cfg.color}`} />
                    {cfg.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {accs.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {acc.name ?? "Conta sem nome"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {acc.bank_connection_id ? "Conectada" : "Manual"} &middot;{" "}
                            {acc.currency}
                          </p>
                        </div>
                        <span
                          className={`text-sm font-semibold whitespace-nowrap ml-4 ${
                            type === "credit"
                              ? "text-red-600 dark:text-red-400"
                              : "text-foreground"
                          }`}
                        >
                          {type === "credit" && acc.balance > 0 ? "-" : ""}
                          {formatCurrency(acc.balance, acc.currency)}
                        </span>
                      </div>
                    ))}
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
