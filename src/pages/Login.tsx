import { Ghost } from "lucide-react"

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-6">
        <div className="flex flex-col items-center gap-2">
          <Ghost className="h-12 w-12 text-primary" />
          <h1 className="text-2xl font-bold">GhostCharge</h1>
          <p className="text-muted-foreground text-sm">
            Entre na sua conta para continuar
          </p>
        </div>
      </div>
    </div>
  )
}
