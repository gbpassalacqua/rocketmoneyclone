import { create } from "zustand"
import type { User } from "@supabase/supabase-js"

interface AuthState {
  user: User | null
  tenantId: string | null
  role: "owner" | "member" | "viewer" | null
  plan: "free" | "premium" | null
  theme: "dark" | "light" | "system"
  isLoading: boolean

  setUser: (user: User | null) => void
  setTenant: (tenantId: string, role: AuthState["role"], plan: AuthState["plan"]) => void
  setTheme: (theme: AuthState["theme"]) => void
  reset: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tenantId: null,
  role: null,
  plan: null,
  theme: "system",
  isLoading: true,

  setUser: (user) => set({ user, isLoading: false }),

  setTenant: (tenantId, role, plan) => set({ tenantId, role, plan }),

  setTheme: (theme) => set({ theme }),

  reset: () =>
    set({
      user: null,
      tenantId: null,
      role: null,
      plan: null,
      theme: "system",
      isLoading: false,
    }),
}))
