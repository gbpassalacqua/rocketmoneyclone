import { useState } from "react"
import { Loader2, Shield, ShieldCheck, ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import { logAudit } from "@/services/audit"

export function TotpSetup() {
  const { user, tenantId } = useAuthStore()
  const [step, setStep] = useState<"idle" | "setup" | "verify">("idle")
  const [qrCode, setQrCode] = useState("")
  const [secret, setSecret] = useState("")
  const [factorId, setFactorId] = useState("")
  const [verifyCode, setVerifyCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [enabled, setEnabled] = useState(false)

  const startSetup = async () => {
    setError("")
    setLoading(true)

    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "GhostCharge Authenticator",
      })

      if (enrollError) {
        setError(enrollError.message)
        setLoading(false)
        return
      }

      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setFactorId(data.id)
      setStep("setup")
    } catch {
      setError("Erro ao configurar 2FA.")
    } finally {
      setLoading(false)
    }
  }

  const verifyAndEnable = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      })

      if (challengeError) {
        setError(challengeError.message)
        setLoading(false)
        return
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: verifyCode,
      })

      if (verifyError) {
        setError("Codigo invalido. Tente novamente.")
        setLoading(false)
        return
      }

      setEnabled(true)
      setStep("idle")

      if (tenantId && user) {
        await logAudit(supabase, tenantId, user.id, "2fa_enabled")
      }
    } catch {
      setError("Erro ao verificar codigo.")
    } finally {
      setLoading(false)
    }
  }

  const disable2FA = async () => {
    setError("")
    setLoading(true)

    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totpFactor = factors?.totp?.[0]

      if (totpFactor) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({
          factorId: totpFactor.id,
        })

        if (unenrollError) {
          setError(unenrollError.message)
          setLoading(false)
          return
        }
      }

      setEnabled(false)

      if (tenantId && user) {
        await logAudit(supabase, tenantId, user.id, "2fa_disabled")
      }
    } catch {
      setError("Erro ao desativar 2FA.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Autenticacao em dois fatores (2FA)</CardTitle>
        </div>
        <CardDescription>
          Adicione uma camada extra de seguranca com Google Authenticator ou similar.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {step === "idle" && !enabled && (
          <Button onClick={startSetup} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <ShieldCheck className="mr-2 h-4 w-4" />
            Ativar 2FA
          </Button>
        )}

        {step === "idle" && enabled && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-accent">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-sm font-medium">2FA ativado</span>
            </div>
            <Button variant="destructive" size="sm" onClick={disable2FA} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <ShieldOff className="mr-2 h-4 w-4" />
              Desativar
            </Button>
          </div>
        )}

        {step === "setup" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escaneie o QR code com seu app autenticador:
            </p>

            <div className="flex justify-center p-4 bg-white rounded-lg w-fit mx-auto">
              <img src={qrCode} alt="QR Code 2FA" className="w-48 h-48" />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Ou insira manualmente este codigo:
              </p>
              <code className="block p-2 bg-muted rounded text-xs font-mono break-all">
                {secret}
              </code>
            </div>

            <form onSubmit={verifyAndEnable} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="verify-code">Codigo de verificacao</Label>
                <Input
                  id="verify-code"
                  type="text"
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="text-center text-lg tracking-widest max-w-[200px]"
                  maxLength={6}
                  required
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={loading || verifyCode.length !== 6}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirmar
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep("idle")}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
