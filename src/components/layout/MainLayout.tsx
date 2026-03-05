import { useState } from "react"
import { Outlet } from "react-router-dom"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Sidebar } from "./Sidebar"
import { Header } from "./Header"
import { MobileNav } from "./MobileNav"
import { MobileSidebar } from "./MobileSidebar"

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Desktop sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((prev) => !prev)}
        />

        {/* Mobile sidebar overlay */}
        <MobileSidebar
          open={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
        />

        {/* Main content area */}
        <div
          className="transition-all duration-200"
          style={{ marginLeft: `var(--sidebar-width, 0px)` }}
        >
          <style>{`
            @media (min-width: 1024px) {
              :root { --sidebar-width: ${sidebarCollapsed ? "72px" : "256px"}; }
            }
          `}</style>

          <Header onMenuToggle={() => setMobileSidebarOpen(true)} />

          <main className="p-4 lg:p-6 pb-20 lg:pb-6">
            <Outlet />
          </main>
        </div>

        {/* Mobile bottom nav */}
        <MobileNav />
      </div>
    </TooltipProvider>
  )
}
