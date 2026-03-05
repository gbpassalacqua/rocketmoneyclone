import { useEffect, useRef, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { useAuthStore } from "@/stores/authStore"
import { logAudit } from "@/services/audit"

const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const PUBLIC_ROUTES = ["/login", "/signup", "/privacy"]

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { setUser, setTenant, reset } = useAuthStore()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tenantIdRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(null)

  const clearSessionTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const handleSessionTimeout = useCallback(async () => {
    // Log audit before signing out
    if (tenantIdRef.current && userIdRef.current) {
      await logAudit(supabase, tenantIdRef.current, userIdRef.current, "logout", undefined, undefined, {
        reason: "session_timeout",
      })
    }

    await supabase.auth.signOut()
    reset()
    navigate("/login")
  }, [reset, navigate])

  const resetSessionTimeout = useCallback(() => {
    clearSessionTimeout()
    timeoutRef.current = setTimeout(handleSessionTimeout, SESSION_TIMEOUT_MS)
  }, [clearSessionTimeout, handleSessionTimeout])

  // Track user activity for session timeout
  useEffect(() => {
    const user = useAuthStore.getState().user
    if (!user) return

    const events = ["mousedown", "keydown", "touchstart", "scroll"]
    const handler = () => resetSessionTimeout()

    events.forEach((event) => window.addEventListener(event, handler, { passive: true }))
    resetSessionTimeout()

    return () => {
      events.forEach((event) => window.removeEventListener(event, handler))
      clearSessionTimeout()
    }
  }, [resetSessionTimeout, clearSessionTimeout])

  // Initialize auth state and listen for changes
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setUser(null)
      if (!PUBLIC_ROUTES.includes(location.pathname)) {
        navigate("/login")
      }
      return
    }

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        setUser(session.user)
        userIdRef.current = session.user.id

        // Fetch profile
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("tenant_id, role")
          .eq("id", session.user.id)
          .single()

        if (profile) {
          tenantIdRef.current = profile.tenant_id

          // Fetch tenant plan
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
      } else {
        setUser(null)
        if (!PUBLIC_ROUTES.includes(location.pathname)) {
          navigate("/login")
        }
      }
    }

    initAuth()

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          setUser(session.user)
          userIdRef.current = session.user.id

          const { data: profile } = await supabase
            .from("user_profiles")
            .select("tenant_id, role")
            .eq("id", session.user.id)
            .single()

          if (profile) {
            tenantIdRef.current = profile.tenant_id

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
        } else if (event === "SIGNED_OUT") {
          reset()
          clearSessionTimeout()
          navigate("/login")
        } else if (event === "TOKEN_REFRESHED") {
          // Refresh token rotation handled by Supabase automatically
          if (session?.user) {
            setUser(session.user)
          }
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>
}
