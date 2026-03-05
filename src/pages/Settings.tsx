import { useNavigate } from "react-router-dom"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { TotpSetup } from "@/components/auth/TotpSetup"
import { useAuthStore } from "@/stores/authStore"
import { supabase } from "@/lib/supabase"
import { logAudit } from "@/services/audit"
import { LogOut, User, Shield, CreditCard } from "lucide-react"

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, tenantId, role, plan } = useAuthStore()

  const handleLogout = async () => {
    if (tenantId && user) {
      await logAudit(supabase, tenantId, user.id, "logout")
    }
    await supabase.auth.signOut()
    navigate("/login")
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configuracoes</h1>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="mr-2 h-4 w-4" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="mr-2 h-4 w-4" />
            Seguranca
          </TabsTrigger>
          {role === "owner" && (
            <TabsTrigger value="billing">
              <CreditCard className="mr-2 h-4 w-4" />
              Plano
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Perfil</CardTitle>
              <CardDescription>Informacoes da sua conta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1">
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{user?.email ?? "—"}</p>
              </div>
              <div className="grid gap-1">
                <p className="text-sm font-medium">Funcao</p>
                <p className="text-sm text-muted-foreground capitalize">{role ?? "—"}</p>
              </div>
              <div className="grid gap-1">
                <p className="text-sm font-medium">Plano</p>
                <p className="text-sm text-muted-foreground capitalize">{plan ?? "free"}</p>
              </div>

              <Separator />

              <Button variant="destructive" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair da conta
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <div className="space-y-4">
            <TotpSetup />

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sessoes ativas</CardTitle>
                <CardDescription>
                  Sua sessao expira automaticamente apos 30 minutos de inatividade.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Sessao atual: {navigator.userAgent.substring(0, 60)}...
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {role === "owner" && (
          <TabsContent value="billing">
            <Card>
              <CardHeader>
                <CardTitle>Plano e pagamento</CardTitle>
                <CardDescription>
                  Gerencie seu plano {plan === "premium" ? "Premium" : "Free"}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {plan === "free" ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Faca upgrade para o Premium e desbloqueie todas as funcionalidades.
                    </p>
                    <Button>Fazer upgrade — R$19,90/mes</Button>
                  </div>
                ) : (
                  <p className="text-sm text-accent font-medium">
                    Voce esta no plano Premium. Obrigado pelo apoio!
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
