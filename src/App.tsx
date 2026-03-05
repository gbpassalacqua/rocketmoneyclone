import { Routes, Route, Navigate } from "react-router-dom"
import { MainLayout } from "@/components/layout/MainLayout"
import { RoleGuard } from "@/components/layout/RoleGuard"
import { PremiumGuard } from "@/components/layout/PremiumGuard"

// Pages
import Dashboard from "@/pages/Dashboard"
import Subscriptions from "@/pages/Subscriptions"
import Transactions from "@/pages/Transactions"
import Budget from "@/pages/Budget"
import Goals from "@/pages/Goals"
import NetWorth from "@/pages/NetWorth"
import Calendar from "@/pages/Calendar"
import SmartSavings from "@/pages/SmartSavings"
import Insights from "@/pages/Insights"
import CreditScore from "@/pages/CreditScore"
import BillNegotiation from "@/pages/BillNegotiation"
import Alerts from "@/pages/Alerts"
import SettingsPage from "@/pages/Settings"
import Onboarding from "@/pages/Onboarding"
import Login from "@/pages/Login"
import Privacy from "@/pages/Privacy"

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/onboarding" element={<Onboarding />} />

        {/* App routes with layout */}
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />

          <Route path="/subscriptions" element={
            <RoleGuard allowed={["owner", "member", "viewer"]}>
              <Subscriptions />
            </RoleGuard>
          } />

          <Route path="/transactions" element={
            <RoleGuard allowed={["owner", "member", "viewer"]}>
              <Transactions />
            </RoleGuard>
          } />

          <Route path="/budget" element={
            <RoleGuard allowed={["owner", "member", "viewer"]}>
              <Budget />
            </RoleGuard>
          } />

          <Route path="/goals" element={
            <RoleGuard allowed={["owner", "member", "viewer"]}>
              <Goals />
            </RoleGuard>
          } />

          <Route path="/net-worth" element={
            <RoleGuard allowed={["owner", "member", "viewer"]}>
              <NetWorth />
            </RoleGuard>
          } />

          <Route path="/calendar" element={
            <RoleGuard allowed={["owner", "member", "viewer"]}>
              <Calendar />
            </RoleGuard>
          } />

          <Route path="/smart-savings" element={
            <RoleGuard allowed={["owner", "member"]}>
              <SmartSavings />
            </RoleGuard>
          } />

          <Route path="/alerts" element={<Alerts />} />

          {/* Premium-only routes */}
          <Route path="/insights" element={
            <PremiumGuard>
              <Insights />
            </PremiumGuard>
          } />

          <Route path="/credit-score" element={
            <PremiumGuard>
              <CreditScore />
            </PremiumGuard>
          } />

          <Route path="/bill-negotiation" element={
            <PremiumGuard>
              <BillNegotiation />
            </PremiumGuard>
          } />

          {/* Settings (owner manages plan/account) */}
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  )
}

export default App
