import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Ghost,
  Landmark,
  CreditCard,
  Target,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle,
  Upload,
  Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import { logAudit } from "@/services/audit"

type BudgetPreference = "full" | "watchlist" | null

export default function Onboarding() {
  const navigate = useNavigate()
  const { user, tenantId, setTenant } = useAuthStore()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)

  // Step 1: LGPD consent
  const [lgpdConsent, setLgpdConsent] = useState(false)

  // Step 2: Bank connection (or skip)
  const [bankConnected, setBankConnected] = useState(false)

  // Step 3: Budget preference + goal
  const [budgetPreference, setBudgetPreference] = useState<BudgetPreference>(null)
  const [goalName, setGoalName] = useState("")
  const [goalAmount, setGoalAmount] = useState("")

  const steps = [
    { label: "Consentimento", icon: Eye },
    { label: "Conta bancaria", icon: Landmark },
    { label: "Preferencias", icon: Target },
  ]

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return lgpdConsent
      case 1:
        return true // can skip bank connection
      case 2:
        return budgetPreference !== null
      default:
        return false
    }
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  const handleConnectBank = async () => {
    // This will be implemented in Step 6 (Pluggy Edge Function)
    // For now, simulate the connection
    setLoading(true)
    try {
      // In production: call Edge Function pluggy-connect
      // const { data } = await supabase.functions.invoke('pluggy-connect', { body: {} })
      setBankConnected(true)
    } finally {
      setLoading(false)
    }
  }

  const handleFinish = async () => {
    if (!user) return
    setLoading(true)

    try {
      // If tenantId is not loaded yet, try to fetch it
      let currentTenantId = tenantId
      if (!currentTenantId) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("tenant_id, role")
          .eq("id", user.id)
          .single()

        if (profile) {
          currentTenantId = profile.tenant_id
          const { data: tenant } = await supabase
            .from("tenants")
            .select("plan")
            .eq("id", profile.tenant_id)
            .single()

          setTenant(
            profile.tenant_id,
            profile.role as "owner" | "member" | "viewer",
            (tenant?.plan ?? "free") as "free" | "premium"
          )
        }
      }

      // Save LGPD consent timestamp
      await supabase
        .from("user_profiles")
        .update({
          consent_at: new Date().toISOString(),
          onboarding_completed: true,
        })
        .eq("id", user.id)

      // Create initial goal if provided
      if (goalName && goalAmount && currentTenantId) {
        await supabase.from("financial_goals").insert({
          tenant_id: currentTenantId,
          user_id: user.id,
          name: goalName,
          target_amount: parseFloat(goalAmount),
        })
      }

      // Audit log
      if (currentTenantId) {
        await logAudit(supabase, currentTenantId, user.id, "onboarding_completed", undefined, undefined, {
          budget_preference: budgetPreference,
          bank_connected: bankConnected,
        })
      }

      navigate("/dashboard")
    } catch {
      // Navigate anyway to not block the user
      navigate("/dashboard")
    } finally {
      setLoading(false)
    }
  }

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({
      x: direction > 0 ? -300 : 300,
      opacity: 0,
    }),
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <Ghost className="h-10 w-10 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">Bem-vindo ao GhostCharge</h1>
          <p className="text-muted-foreground text-sm">
            Passo {currentStep + 1} de {steps.length}
          </p>
        </div>

        {/* Progress */}
        <div className="space-y-3">
          <Progress value={((currentStep + 1) / steps.length) * 100} />
          <div className="flex justify-between">
            {steps.map((step, i) => {
              const Icon = step.icon
              return (
                <div
                  key={step.label}
                  className={`flex items-center gap-1.5 text-xs font-medium ${
                    i <= currentStep ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {i < currentStep ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">{step.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Steps */}
        <AnimatePresence mode="wait" custom={1}>
          <motion.div
            key={currentStep}
            custom={1}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2 }}
          >
            {/* Step 1: LGPD Consent */}
            {currentStep === 0 && (
              <Card>
                <CardContent className="pt-6 space-y-6">
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold">Protecao de dados (LGPD)</h2>
                    <p className="text-sm text-muted-foreground">
                      Para utilizar o GhostCharge, precisamos do seu consentimento para
                      coletar e processar seus dados financeiros.
                    </p>
                  </div>

                  <div className="space-y-3 text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
                    <p><strong>Dados coletados:</strong> Transacoes bancarias via Open Finance (Pluggy)</p>
                    <p><strong>Finalidade:</strong> Analise de assinaturas, categorizacao por IA, deteccao de cobrancas fantasmas</p>
                    <p><strong>Compartilhamento:</strong> Pluggy (conexao bancaria), Google Gemini (analise anonimizada — sem CPF, nome ou numero de conta)</p>
                    <p><strong>Retencao:</strong> Seus dados sao mantidos enquanto sua conta estiver ativa</p>
                    <p><strong>Exclusao:</strong> Voce pode deletar sua conta e todos os dados a qualquer momento em Configuracoes</p>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="lgpd"
                      checked={lgpdConsent}
                      onCheckedChange={(checked) => setLgpdConsent(checked === true)}
                    />
                    <Label htmlFor="lgpd" className="text-sm leading-relaxed cursor-pointer">
                      Li e aceito os{" "}
                      <Link to="/privacy" target="_blank" className="text-primary hover:underline">
                        Termos de Uso e Politica de Privacidade
                      </Link>
                      . Autorizo o tratamento dos meus dados conforme descrito acima.
                    </Label>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Connect Bank */}
            {currentStep === 1 && (
              <Card>
                <CardContent className="pt-6 space-y-6">
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold">Conectar conta bancaria</h2>
                    <p className="text-sm text-muted-foreground">
                      Conecte sua conta para detectar automaticamente assinaturas e cobrancas fantasmas.
                    </p>
                  </div>

                  {bankConnected ? (
                    <div className="flex items-center gap-3 p-4 bg-accent/10 rounded-lg">
                      <CheckCircle className="h-6 w-6 text-accent" />
                      <div>
                        <p className="font-medium text-accent">Conta conectada!</p>
                        <p className="text-sm text-muted-foreground">
                          Suas transacoes serao sincronizadas automaticamente.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Button
                        className="w-full"
                        onClick={handleConnectBank}
                        disabled={loading}
                      >
                        {loading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Landmark className="mr-2 h-4 w-4" />
                        )}
                        Conectar via Open Finance
                      </Button>

                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">ou</span>
                        </div>
                      </div>

                      <Button variant="outline" className="w-full" disabled>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload de extrato (CSV/OFX) — em breve
                      </Button>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground text-center">
                    Voce pode pular e conectar depois em Configuracoes.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Preferences */}
            {currentStep === 2 && (
              <Card>
                <CardContent className="pt-6 space-y-6">
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold">Suas preferencias</h2>
                    <p className="text-sm text-muted-foreground">
                      Como voce prefere acompanhar seus gastos?
                    </p>
                  </div>

                  {/* Budget preference */}
                  <div className="grid gap-3">
                    <button
                      type="button"
                      onClick={() => setBudgetPreference("full")}
                      className={`flex items-start gap-3 p-4 rounded-lg border text-left transition-colors ${
                        budgetPreference === "full"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <CreditCard className={`h-5 w-5 mt-0.5 ${
                        budgetPreference === "full" ? "text-primary" : "text-muted-foreground"
                      }`} />
                      <div>
                        <p className="font-medium text-sm">Orcamento completo</p>
                        <p className="text-xs text-muted-foreground">
                          Defina limites para cada categoria de gasto e acompanhe tudo.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBudgetPreference("watchlist")}
                      className={`flex items-start gap-3 p-4 rounded-lg border text-left transition-colors ${
                        budgetPreference === "watchlist"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <Eye className={`h-5 w-5 mt-0.5 ${
                        budgetPreference === "watchlist" ? "text-primary" : "text-muted-foreground"
                      }`} />
                      <div>
                        <p className="font-medium text-sm">Watchlist (simplificado)</p>
                        <p className="text-xs text-muted-foreground">
                          Monitore apenas uma categoria por vez. Ideal para quem odeia planilhas.
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Optional first goal */}
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Definir uma meta (opcional)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="goal-name" className="text-xs">Nome da meta</Label>
                        <Input
                          id="goal-name"
                          placeholder="Ex: Reserva"
                          value={goalName}
                          onChange={(e) => setGoalName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="goal-amount" className="text-xs">Valor (R$)</Label>
                        <Input
                          id="goal-amount"
                          type="number"
                          placeholder="5000"
                          min="0"
                          step="100"
                          value={goalAmount}
                          onChange={(e) => setGoalAmount(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation buttons */}
        <div className="flex justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Voltar
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Proximo
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={!canProceed() || loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Comecar
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
