import { Navigate } from "react-router-dom"
import { useAuthStore } from "@/stores/authStore"

interface PremiumGuardProps {
  children: React.ReactNode
}

export function PremiumGuard({ children }: PremiumGuardProps) {
  const plan = useAuthStore((s) => s.plan)

  if (plan !== "premium") {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
