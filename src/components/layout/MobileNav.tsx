import { NavLink } from "react-router-dom"
import {
  LayoutDashboard,
  CreditCard,
  PiggyBank,
  Target,
  BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"

const mobileNavItems = [
  { label: "Home", path: "/dashboard", icon: LayoutDashboard },
  { label: "Assinaturas", path: "/subscriptions", icon: CreditCard },
  { label: "Orcamento", path: "/budget", icon: PiggyBank },
  { label: "Metas", path: "/goals", icon: Target },
  { label: "Insights", path: "/insights", icon: BarChart3 },
]

export function MobileNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border">
      <div className="flex items-center justify-around h-16">
        {mobileNavItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-2 text-[10px] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
