import { NavLink } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard,
  CreditCard,
  ArrowLeftRight,
  PiggyBank,
  Target,
  TrendingUp,
  Bell,
  CalendarDays,
  Shield,
  Zap,
  BarChart3,
  Handshake,
  Settings,
  X,
  Ghost,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/authStore"

interface MobileSidebarProps {
  open: boolean
  onClose: () => void
}

const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Assinaturas", path: "/subscriptions", icon: CreditCard },
  { label: "Transacoes", path: "/transactions", icon: ArrowLeftRight },
  { label: "Orcamento", path: "/budget", icon: PiggyBank },
  { label: "Metas", path: "/goals", icon: Target },
  { label: "Patrimonio", path: "/net-worth", icon: TrendingUp },
  { label: "Calendario", path: "/calendar", icon: CalendarDays },
  { label: "Smart Savings", path: "/smart-savings", icon: Zap },
  { label: "Insights", path: "/insights", icon: BarChart3, premium: true },
  { label: "Credito", path: "/credit-score", icon: Shield, premium: true },
  { label: "Negociacao", path: "/bill-negotiation", icon: Handshake, premium: true },
  { label: "Alertas", path: "/alerts", icon: Bell },
  { label: "Configuracoes", path: "/settings", icon: Settings },
]

export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  const plan = useAuthStore((s) => s.plan)

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 lg:hidden"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="fixed left-0 top-0 z-50 h-screen w-[280px] bg-card border-r border-border lg:hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-16 border-b border-border">
              <div className="flex items-center gap-3">
                <Ghost className="h-7 w-7 text-primary" />
                <span className="text-lg font-bold">GhostCharge</span>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Nav */}
            <nav className="overflow-y-auto py-4 px-2 space-y-1 h-[calc(100%-4rem)]">
              {navItems.map((item) => {
                const isPremiumLocked = item.premium && plan !== "premium"
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.path}
                    to={isPremiumLocked ? "#" : item.path}
                    onClick={(e) => {
                      if (isPremiumLocked) {
                        e.preventDefault()
                      } else {
                        onClose()
                      }
                    }}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive && !isPremiumLocked
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        isPremiumLocked && "opacity-50 cursor-not-allowed"
                      )
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                    {isPremiumLocked && (
                      <span className="ml-auto text-[10px] font-semibold bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                        PRO
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </nav>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
