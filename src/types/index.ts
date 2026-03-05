import type { User } from "@supabase/supabase-js"

// Auth & Multi-tenancy
export interface Tenant {
  id: string
  name: string
  plan: "free" | "premium"
  plan_expires_at: string | null
  stripe_customer_id: string | null
  created_at: string
}

export interface UserProfile {
  id: string
  tenant_id: string
  role: "owner" | "member" | "viewer"
  full_name: string | null
  avatar_url: string | null
  onboarding_completed: boolean
  consent_at: string | null
  theme: "dark" | "light" | "system"
  income_range: string | null
  city: string | null
  age_range: string | null
  created_at: string
}

// Banking
export interface BankConnection {
  id: string
  tenant_id: string
  user_id: string
  pluggy_item_id: string
  institution_name: string | null
  institution_logo: string | null
  status: string
  last_sync: string | null
  created_at: string
}

export interface Account {
  id: string
  tenant_id: string
  user_id: string
  bank_connection_id: string | null
  pluggy_account_id: string | null
  name: string | null
  type: string | null
  balance: number
  currency: string
  created_at: string
}

export interface Transaction {
  id: string
  tenant_id: string
  user_id: string
  account_id: string | null
  pluggy_tx_id: string | null
  amount: number
  description: string | null
  merchant_name: string | null
  category: string | null
  date: string
  is_recurring: boolean
  subscription_id: string | null
  created_at: string
}

// Subscriptions
export interface Subscription {
  id: string
  tenant_id: string
  user_id: string
  merchant_name: string | null
  merchant_logo: string | null
  amount: number
  currency: string
  frequency: string | null
  next_charge_date: string | null
  status: string
  risk_score: number
  category: string | null
  detected_at: string
  user_action: string | null
  created_at: string
}

// Categories & Budget
export interface Category {
  id: string
  tenant_id: string
  user_id: string
  name: string | null
  color: string | null
  icon: string | null
  budget_limit: number | null
  is_custom: boolean
  created_at: string
}

// Financial Goals
export interface FinancialGoal {
  id: string
  tenant_id: string
  user_id: string
  name: string | null
  target_amount: number
  current_amount: number
  deadline: string | null
  auto_transfer: boolean
  frequency: string | null
  created_at: string
}

// Alerts
export interface Alert {
  id: string
  tenant_id: string
  user_id: string
  type: string | null
  message: string | null
  related_entity_id: string | null
  is_read: boolean
  created_at: string
}

// Bill Negotiations
export interface BillNegotiation {
  id: string
  tenant_id: string
  user_id: string
  service_name: string
  current_amount: number
  negotiated_amount: number | null
  annual_savings: number | null
  fee_percentage: number
  fee_amount: number | null
  status: "pending" | "in_progress" | "completed" | "failed"
  requested_at: string
  completed_at: string | null
  notes: string | null
  created_at: string
}

// Credit Score
export interface CreditScoreEntry {
  id: string
  tenant_id: string
  user_id: string
  score: number
  provider: string
  factors: Record<string, unknown> | null
  recorded_at: string
}

// Smart Savings
export interface SmartSavingsConfig {
  id: string
  tenant_id: string
  user_id: string
  goal_amount: number
  current_amount: number
  min_balance_protection: number
  frequency: string
  max_per_transfer: number
  is_active: boolean
  created_at: string
}

export interface SmartSavingsTransfer {
  id: string
  tenant_id: string
  user_id: string
  amount: number
  balance_before: number | null
  balance_after: number | null
  transferred_at: string
}

// Spending Benchmarks
export interface SpendingBenchmark {
  id: string
  income_range: string | null
  city: string | null
  age_range: string | null
  category: string | null
  avg_monthly_spend: number
  sample_size: number
  updated_at: string
}

// Audit
export interface AuditEntry {
  id: number
  tenant_id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

// Re-export User type for convenience
export type { User }
