import { NavLink } from "react-router-dom"
import { motion } from "framer-motion"
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
  ChevronLeft,
  ChevronRight,
  Ghost,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuthStore } from "@/stores/authStore"

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

interface NavItem {
  label: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  premium?: boolean
}

const navItems: NavItem[] = [
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

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const plan = useAuthStore((s) => s.plan)

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="hidden lg:flex flex-col h-screen bg-card border-r border-border fixed left-0 top-0 z-40"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border">
        <Ghost className="h-8 w-8 text-primary shrink-0" />
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-lg font-bold text-foreground"
          >
            GhostCharge
          </motion.span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const isPremiumLocked = item.premium && plan !== "premium"
          const Icon = item.icon

          const link = (
            <NavLink
              key={item.path}
              to={isPremiumLocked ? "#" : item.path}
              onClick={(e) => isPremiumLocked && e.preventDefault()}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  isActive && !isPremiumLocked
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  isPremiumLocked && "opacity-50 cursor-not-allowed"
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
              {!collapsed && isPremiumLocked && (
                <span className="ml-auto text-[10px] font-semibold bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                  PRO
                </span>
              )}
            </NavLink>
          )

          if (collapsed) {
            return (
              <Tooltip key={item.path} delayDuration={0}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">
                  {item.label}
                  {isPremiumLocked && " (Premium)"}
                </TooltipContent>
              </Tooltip>
            )
          }

          return link
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="w-full flex items-center justify-center"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </motion.aside>
  )
}
