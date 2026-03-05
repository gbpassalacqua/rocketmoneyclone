import { Navigate } from "react-router-dom"
import { useAuthStore } from "@/stores/authStore"

interface RoleGuardProps {
  allowed: Array<"owner" | "member" | "viewer">
  children: React.ReactNode
}

export function RoleGuard({ allowed, children }: RoleGuardProps) {
  const role = useAuthStore((s) => s.role)

  if (role && !allowed.includes(role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
