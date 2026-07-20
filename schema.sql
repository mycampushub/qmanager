-- =============================================================================
-- QueueFlow — Cloudflare D1 Schema
-- Migrated from Prisma schema.prisma (multi-file SQLite → single D1 database)
-- All tenant-scoped tables include tenantId for row-level isolation.
-- =============================================================================

-- ─── Platform Admin (global system management) ────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admins (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Master Tenants (Corporate / Franchise Owners) ───────────────────────────
CREATE TABLE IF NOT EXISTS master_tenants (
  id              TEXT PRIMARY KEY,
  corporate_name  TEXT NOT NULL,
  billing_status  TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Master Tenant Admins (HQ Users who manage franchises) ───────────────────
CREATE TABLE IF NOT EXISTS master_tenant_admins (
  id                TEXT PRIMARY KEY,
  master_tenant_id  TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  password_hash     TEXT NOT NULL,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (master_tenant_id) REFERENCES master_tenants(id) ON DELETE CASCADE
);

-- ─── All Serving Locations (Standard Tenants & Sub-Tenants) ───────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  master_tenant_id TEXT,
  plan_tier        TEXT NOT NULL DEFAULT 'FREE',
  wallet_balance   INTEGER NOT NULL DEFAULT 50000,
  branding_config  TEXT,
  welcome_message  TEXT,
  logo_url         TEXT,
  contact_email    TEXT,
  contact_phone    TEXT,
  address          TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (master_tenant_id) REFERENCES master_tenants(id) ON DELETE SET NULL
);

-- ─── Staff Users (Managers & Agents) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'AGENT',
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ─── Queues (Service Lines) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS queues (
  id                       TEXT PRIMARY KEY,
  tenant_id                TEXT NOT NULL,
  name                     TEXT NOT NULL,
  location_tag             TEXT,
  description              TEXT,
  default_service_time_sec INTEGER NOT NULL DEFAULT 300,
  prefix                   TEXT NOT NULL DEFAULT 'A',
  current_serial           INTEGER NOT NULL DEFAULT 0,
  now_serving_serial       INTEGER NOT NULL DEFAULT 0,
  is_active                INTEGER NOT NULL DEFAULT 1,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ─── Tickets ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  queue_id         TEXT NOT NULL,
  serial_number    INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'WAITING',
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT,
  device_id        TEXT,
  notes            TEXT,
  served_by_agent  TEXT,
  skip_count       INTEGER NOT NULL DEFAULT 0,
  source           TEXT NOT NULL DEFAULT 'WALK_IN',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  served_at        TEXT,
  completed_at     TEXT,
  cancelled_at     TEXT,
  skipped_at       TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE
);

-- ─── Billing Ledger (Pay-Per-Entry) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_ledgers (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  ticket_id   TEXT NOT NULL UNIQUE,
  cost_cents  INTEGER NOT NULL DEFAULT 100,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- ─── Service Logs (For EWT Calculation) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_logs (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  queue_id         TEXT NOT NULL,
  agent_id         TEXT,
  ticket_id        TEXT NOT NULL,
  duration_seconds INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ─── Wallet Transactions (Payment history) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  type          TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'COMPLETED',
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ─── Web Push Subscriptions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  ticket_id   TEXT,
  endpoint    TEXT NOT NULL UNIQUE,
  keys_json   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ─── Audit Log (Platform admin action tracking) ──────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  user_type  TEXT NOT NULL DEFAULT 'staff',
  action     TEXT NOT NULL,
  details    TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Plan Tier Limits ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_limits (
  id                  TEXT PRIMARY KEY,
  plan_tier           TEXT NOT NULL UNIQUE,
  max_queues          INTEGER NOT NULL DEFAULT 2,
  max_staff           INTEGER NOT NULL DEFAULT 3,
  max_tickets_per_day INTEGER NOT NULL DEFAULT 50,
  price_monthly_cents INTEGER NOT NULL DEFAULT 0
);

-- ─── Service Windows (configurable operating hours) ──────────────────────────
CREATE TABLE IF NOT EXISTS service_windows (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  queue_id    TEXT,
  day_of_week INTEGER NOT NULL,
  open_time   TEXT NOT NULL,
  close_time  TEXT NOT NULL,
  is_closed   INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE SET NULL
);

-- ─── Customer Feedback (post-service ratings) ────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  ticket_id   TEXT NOT NULL,
  rating      INTEGER NOT NULL,
  comment     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- ─── Appointments (scheduled time slots / online bookings) ────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  queue_id         TEXT NOT NULL,
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT,
  scheduled_date   TEXT NOT NULL,
  scheduled_time   TEXT DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'SCHEDULED',
  notes            TEXT,
  ticket_id        TEXT UNIQUE,
  source           TEXT NOT NULL DEFAULT 'STAFF',
  booking_order    INTEGER DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL
);

-- ─── Webhooks (external integrations) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhooks (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL,
  url                TEXT NOT NULL,
  events             TEXT NOT NULL,
  secret             TEXT NOT NULL,
  is_active          INTEGER NOT NULL DEFAULT 1,
  success_count      INTEGER NOT NULL DEFAULT 0,
  failure_count      INTEGER NOT NULL DEFAULT 0,
  last_triggered_at  TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ─── Queue Assignments (Agent → Queue mapping) ───────────────────────────
CREATE TABLE IF NOT EXISTS queue_assignments (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  queue_id    TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_id, queue_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Customer Profiles (repeat customer recognition) ─────────────────────────
CREATE TABLE IF NOT EXISTS customer_profiles (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  phone             TEXT NOT NULL,
  name              TEXT,
  total_visits      INTEGER NOT NULL DEFAULT 0,
  total_tickets     INTEGER NOT NULL DEFAULT 0,
  completed_tickets INTEGER NOT NULL DEFAULT 0,
  avg_service_time  INTEGER,
  last_visit_at     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, phone),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- =============================================================================
-- LOCATIONS (Phase 0: Replace location_tag text with proper entity)
-- =============================================================================

CREATE TABLE IF NOT EXISTS locations (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, name),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Add location_id FK to queues (NULL-safe for migration)
-- After migration, location_tag can be deprecated
ALTER TABLE queues ADD COLUMN location_id TEXT;
-- ALTER TABLE queues ADD COLUMN join_paused INTEGER NOT NULL DEFAULT 0; -- done below

-- =============================================================================
-- TENANT BLOCK (Phase 2: NONE / SOFT / HARD)
-- =============================================================================

ALTER TABLE tenants ADD COLUMN block_level TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE tenants ADD COLUMN block_reason TEXT;

-- =============================================================================
-- JOIN PAUSE (Phase 1: per-queue join pause/close)
-- =============================================================================

ALTER TABLE queues ADD COLUMN join_paused INTEGER NOT NULL DEFAULT 0;

-- =============================================================================
-- BREAK PERIODS (Phase 3: ROOM / LINE / COUNTER levels)
-- =============================================================================

CREATE TABLE IF NOT EXISTS break_periods (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  level           TEXT NOT NULL DEFAULT 'ROOM' CHECK(level IN ('ROOM','LINE','COUNTER')),
  queue_id        TEXT,
  counter_id      TEXT,
  reason          TEXT,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ends_at         TEXT,
  ended_at        TEXT,
  ended_by        TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE SET NULL,
  FOREIGN KEY (ended_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =============================================================================
-- SERVICE COUNTERS (Phase 4: Multi-counter serving lines)
-- =============================================================================

CREATE TABLE IF NOT EXISTS service_counters (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  queue_id        TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(queue_id, name),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE
);

-- Add counter_id to tickets for counter-scoped serving
ALTER TABLE tickets ADD COLUMN counter_id TEXT;

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_queues_tenant_active ON queues(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_queues_tenant_location ON queues(tenant_id, location_tag);
CREATE INDEX IF NOT EXISTS idx_queues_location_id ON queues(location_id);
CREATE INDEX IF NOT EXISTS idx_locations_tenant ON locations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_break_periods_tenant_active ON break_periods(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_break_periods_queue ON break_periods(queue_id);
CREATE INDEX IF NOT EXISTS idx_break_periods_counter ON break_periods(counter_id);
CREATE INDEX IF NOT EXISTS idx_service_counters_queue ON service_counters(queue_id);
CREATE INDEX IF NOT EXISTS idx_service_counters_tenant ON service_counters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_counter ON tickets(counter_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_status ON tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_queue_status_serial ON tickets(queue_id, status, serial_number);
CREATE INDEX IF NOT EXISTS idx_tickets_phone_tenant ON tickets(customer_phone, tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_ledgers_tenant_created ON usage_ledgers(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_service_logs_tenant_queue_created ON service_logs(tenant_id, queue_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_created ON transactions(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant_ticket ON push_subscriptions(tenant_id, ticket_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_service_windows_tenant_day ON service_windows(tenant_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_feedback_tenant_created ON feedback(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_date_status ON appointments(tenant_id, scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_appointments_phone_tenant ON appointments(customer_phone, tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_queue_date ON appointments(queue_id, scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_tickets_source ON tickets(source);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_tenant_visits ON customer_profiles(tenant_id, total_visits);
CREATE INDEX IF NOT EXISTS idx_queue_assignments_agent ON queue_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_queue_assignments_queue ON queue_assignments(queue_id);
CREATE INDEX IF NOT EXISTS idx_queue_assignments_tenant ON queue_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_master ON tenants(master_tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active);
CREATE INDEX IF NOT EXISTS idx_mt_admins_master ON master_tenant_admins(master_tenant_id);
CREATE INDEX IF NOT EXISTS idx_mt_admins_email ON master_tenant_admins(email);

-- =============================================================================
-- SEED DATA (Plan Limits)
-- =============================================================================
INSERT OR IGNORE INTO plan_limits (id, plan_tier, max_queues, max_staff, max_tickets_per_day, price_monthly_cents)
VALUES
  ('plan-free',       'FREE',       2,   3,    50,      0),
  ('plan-pro',        'PRO',       10,  15,   500,  50000),
  ('plan-enterprise', 'ENTERPRISE', 50, 100,  5000, 200000);

-- =============================================================================
-- TRIGGERS (auto-update updated_at)
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS trg_platform_admins_updated
  AFTER UPDATE ON platform_admins
  FOR EACH ROW
  BEGIN
    UPDATE platform_admins SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_master_tenants_updated
  AFTER UPDATE ON master_tenants
  FOR EACH ROW
  BEGIN
    UPDATE master_tenants SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_mt_admins_updated
  AFTER UPDATE ON master_tenant_admins
  FOR EACH ROW
  BEGIN
    UPDATE master_tenant_admins SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_tenants_updated
  AFTER UPDATE ON tenants
  FOR EACH ROW
  BEGIN
    UPDATE tenants SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_users_updated
  AFTER UPDATE ON users
  FOR EACH ROW
  BEGIN
    UPDATE users SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

-- Migration: add location_tag column if not exists
-- Run this if upgrading from an older schema
-- ALTER TABLE queues ADD COLUMN location_tag TEXT;

CREATE TRIGGER IF NOT EXISTS trg_queues_updated
  AFTER UPDATE ON queues
  FOR EACH ROW
  BEGIN
    UPDATE queues SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_service_windows_updated
  AFTER UPDATE ON service_windows
  FOR EACH ROW
  BEGIN
    UPDATE service_windows SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_webhooks_updated
  AFTER UPDATE ON webhooks
  FOR EACH ROW
  BEGIN
    UPDATE webhooks SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_appointments_updated
  AFTER UPDATE ON appointments
  FOR EACH ROW
  BEGIN
    UPDATE appointments SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_customer_profiles_updated
  AFTER UPDATE ON customer_profiles
  FOR EACH ROW
  BEGIN
    UPDATE customer_profiles SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_queue_assignments_updated
  AFTER UPDATE ON queue_assignments
  FOR EACH ROW
  BEGIN
    UPDATE queue_assignments SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_locations_updated
  AFTER UPDATE ON locations
  FOR EACH ROW
  BEGIN
    UPDATE locations SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_service_counters_updated
  AFTER UPDATE ON service_counters
  FOR EACH ROW
  BEGIN
    UPDATE service_counters SET updated_at = datetime('now') WHERE id = OLD.id;
  END;