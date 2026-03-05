-- ============================================================
-- GhostChargeClone - Initial Schema Migration
-- Includes: all tables, tenant_id, RLS, pgcrypto, indexes
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. TENANTS (multi-tenant root)
-- ============================================================
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  plan_expires_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. USER PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'member', 'viewer')),
  full_name TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT false,
  consent_at TIMESTAMPTZ,
  theme TEXT DEFAULT 'system' CHECK (theme IN ('dark', 'light', 'system')),
  income_range TEXT,
  city TEXT,
  age_range TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RATE LIMITS
-- ============================================================
CREATE TABLE rate_limits (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rate_limits_lookup ON rate_limits(user_id, action, created_at DESC);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. AUDIT LOG
-- ============================================================
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant_date ON audit_log(tenant_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. BANK CONNECTIONS
-- ============================================================
CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_item_id TEXT NOT NULL,
  institution_name TEXT,
  institution_logo TEXT,
  status TEXT DEFAULT 'active',
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. ACCOUNTS
-- ============================================================
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_connection_id UUID REFERENCES bank_connections(id) ON DELETE SET NULL,
  pluggy_account_id TEXT,
  name TEXT,
  type TEXT,
  balance NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. SUBSCRIPTIONS (detected)
-- ============================================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_name TEXT,
  merchant_logo TEXT,
  amount NUMERIC(12,2),
  currency TEXT DEFAULT 'BRL',
  frequency TEXT,
  next_charge_date DATE,
  status TEXT DEFAULT 'active',
  risk_score INTEGER DEFAULT 0,
  category TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  user_action TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. TRANSACTIONS
-- ============================================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  pluggy_tx_id TEXT,
  amount NUMERIC(12,2),
  description TEXT,
  merchant_name TEXT,
  category TEXT,
  date DATE,
  is_recurring BOOLEAN DEFAULT false,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX idx_transactions_merchant ON transactions(merchant_name, date DESC);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. CATEGORIES
-- ============================================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  color TEXT,
  icon TEXT,
  budget_limit NUMERIC(12,2),
  is_custom BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 10. FINANCIAL GOALS
-- ============================================================
CREATE TABLE financial_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  target_amount NUMERIC(12,2),
  current_amount NUMERIC(12,2) DEFAULT 0,
  deadline DATE,
  auto_transfer BOOLEAN DEFAULT false,
  frequency TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE financial_goals ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 11. ALERTS
-- ============================================================
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT,
  message TEXT,
  related_entity_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_user_unread ON alerts(user_id, is_read, created_at DESC);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 12. BILL NEGOTIATIONS
-- ============================================================
CREATE TABLE bill_negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  current_amount NUMERIC(12,2) NOT NULL,
  negotiated_amount NUMERIC(12,2),
  annual_savings NUMERIC(12,2),
  fee_percentage INTEGER DEFAULT 40,
  fee_amount NUMERIC(12,2),
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bill_negotiations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 13. CREDIT SCORE HISTORY
-- ============================================================
CREATE TABLE credit_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  provider TEXT DEFAULT 'serasa',
  factors JSONB,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_score_user ON credit_score_history(user_id, recorded_at DESC);

ALTER TABLE credit_score_history ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 14. SMART SAVINGS CONFIG
-- ============================================================
CREATE TABLE smart_savings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_amount NUMERIC(12,2) DEFAULT 2000,
  current_amount NUMERIC(12,2) DEFAULT 0,
  min_balance_protection NUMERIC(12,2) DEFAULT 500,
  frequency TEXT DEFAULT 'weekly',
  max_per_transfer NUMERIC(12,2) DEFAULT 50,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE smart_savings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 15. SMART SAVINGS TRANSFERS
-- ============================================================
CREATE TABLE smart_savings_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  balance_before NUMERIC(12,2),
  balance_after NUMERIC(12,2),
  transferred_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE smart_savings_transfers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 16. SPENDING BENCHMARKS (anonymous - no user_id)
-- ============================================================
CREATE TABLE spending_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  income_range TEXT,
  city TEXT,
  age_range TEXT,
  category TEXT,
  avg_monthly_spend NUMERIC(12,2),
  sample_size INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_benchmarks_profile ON spending_benchmarks(income_range, city, age_range);

ALTER TABLE spending_benchmarks ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Helper: get current user's tenant_id
-- Used in all RLS policies below

-- ---- TENANTS ----
CREATE POLICY tenants_select ON tenants
  FOR SELECT USING (
    id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY tenants_update ON tenants
  FOR UPDATE USING (
    id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'owner'
  );

-- ---- USER PROFILES ----
CREATE POLICY user_profiles_select ON user_profiles
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles up WHERE up.id = auth.uid())
  );

CREATE POLICY user_profiles_update ON user_profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY user_profiles_insert ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ---- RATE LIMITS ----
-- Only service role inserts; users can read their own
CREATE POLICY rate_limits_select ON rate_limits
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY rate_limits_insert ON rate_limits
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

-- ---- AUDIT LOG ----
-- Read-only for owners; insert allowed for all authenticated
CREATE POLICY audit_log_select ON audit_log
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'owner'
  );

CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ---- BANK CONNECTIONS ----
CREATE POLICY bank_connections_select ON bank_connections
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY bank_connections_insert ON bank_connections
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

CREATE POLICY bank_connections_update ON bank_connections
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

CREATE POLICY bank_connections_delete ON bank_connections
  FOR DELETE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

-- ---- ACCOUNTS ----
CREATE POLICY accounts_select ON accounts
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY accounts_insert ON accounts
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

CREATE POLICY accounts_update ON accounts
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

CREATE POLICY accounts_delete ON accounts
  FOR DELETE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'owner'
  );

-- ---- SUBSCRIPTIONS ----
CREATE POLICY subscriptions_select ON subscriptions
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY subscriptions_insert ON subscriptions
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

CREATE POLICY subscriptions_update ON subscriptions
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

CREATE POLICY subscriptions_delete ON subscriptions
  FOR DELETE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'owner'
  );

-- ---- TRANSACTIONS ----
CREATE POLICY transactions_select ON transactions
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY transactions_insert ON transactions
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

CREATE POLICY transactions_update ON transactions
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

-- ---- CATEGORIES ----
CREATE POLICY categories_select ON categories
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY categories_insert ON categories
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

CREATE POLICY categories_update ON categories
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

CREATE POLICY categories_delete ON categories
  FOR DELETE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

-- ---- FINANCIAL GOALS ----
CREATE POLICY financial_goals_select ON financial_goals
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY financial_goals_insert ON financial_goals
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

CREATE POLICY financial_goals_update ON financial_goals
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

CREATE POLICY financial_goals_delete ON financial_goals
  FOR DELETE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'owner'
  );

-- ---- ALERTS ----
CREATE POLICY alerts_select ON alerts
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY alerts_insert ON alerts
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY alerts_update ON alerts
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

-- ---- BILL NEGOTIATIONS ----
CREATE POLICY bill_negotiations_select ON bill_negotiations
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY bill_negotiations_insert ON bill_negotiations
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

CREATE POLICY bill_negotiations_update ON bill_negotiations
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

-- ---- CREDIT SCORE HISTORY ----
CREATE POLICY credit_score_history_select ON credit_score_history
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY credit_score_history_insert ON credit_score_history
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ---- SMART SAVINGS ----
CREATE POLICY smart_savings_select ON smart_savings
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY smart_savings_insert ON smart_savings
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

CREATE POLICY smart_savings_update ON smart_savings
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('owner', 'member')
  );

-- ---- SMART SAVINGS TRANSFERS ----
CREATE POLICY smart_savings_transfers_select ON smart_savings_transfers
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY smart_savings_transfers_insert ON smart_savings_transfers
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ---- SPENDING BENCHMARKS (public read, no user data) ----
CREATE POLICY spending_benchmarks_select ON spending_benchmarks
  FOR SELECT USING (true);


-- ============================================================
-- RATE LIMITS CLEANUP FUNCTION
-- Schedule via pg_cron or Supabase scheduled function daily
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '48 hours';
$$;


-- ============================================================
-- AUTO-CREATE TENANT + PROFILE ON SIGNUP
-- Trigger function that runs after a new user signs up
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id UUID;
BEGIN
  -- Create a new tenant for each user
  INSERT INTO tenants (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  RETURNING id INTO new_tenant_id;

  -- Create user profile linked to the new tenant
  INSERT INTO user_profiles (id, tenant_id, role, full_name, avatar_url)
  VALUES (
    NEW.id,
    new_tenant_id,
    'owner',
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );

  RETURN NEW;
END;
$$;

-- Trigger on auth.users insert
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
