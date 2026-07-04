// =============================================================================
// QueueFlow — Cloudflare Workers Auth System
// Replaces: src/lib/auth.ts (jsonwebtoken + Node.js crypto)
//
// Changes:
//   - jsonwebtoken → jose (Web Crypto based, CF Workers compatible)
//   - crypto.randomBytes → crypto.getRandomValues
//   - setInterval rate limiter → KV-backed rate limiter
//   - Top-level async IIFE removed
//   - bcryptjs kept (pure JS, works in CF Workers)
// =============================================================================

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';


// ─── JWT Secret ────────────────────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  throw new Error(
    '[QueueFlow] JWT_SECRET environment variable is required.\n' +
    'Set a strong, random secret in your .env or wrangler.toml [vars] block.\n' +
    'Example: JWT_SECRET=your-256-bit-random-secret-here'
  );
}
const JWT_SECRET = process.env.JWT_SECRET;

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(JWT_SECRET);
}

// ─── Password Hashing (bcryptjs — pure JS, works on CF Workers) ────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── JWT Tokens (jose — Web Crypto based) ──────────────────────────────────
export interface JwtPayload {
  userId: string;
  tenantId?: string;
  masterTenantId?: string;
  role: 'PLATFORM_ADMIN' | 'MASTER_TENANT_ADMIN' | 'MANAGER' | 'AGENT';
  type: 'staff' | 'platform_admin' | 'master_tenant_admin';
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

// ─── CSRF Token (Web Crypto) ───────────────────────────────────────────────
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Rate Limiter (KV-backed, CF Workers compatible) ───────────────────────
// Falls back to in-memory Map when KV is not available (local dev)
const inMemoryStore = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(
  key: string,
  maxRequests: number = 60,
  windowMs: number = 60_000,
  kv?: KVNamespace
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const now = Date.now();

  if (kv) {
    // KV-backed rate limiting (production)
    try {
      const stored = await kv.get<{ count: number; resetAt: number }>(key, 'json');
      if (!stored || now > stored.resetAt) {
        await kv.put(key, JSON.stringify({ count: 1, resetAt: now + windowMs }), {
          expirationTtl: Math.ceil(windowMs / 1000) + 1,
        });
        return { allowed: true, retryAfterMs: 0 };
      }
      if (stored.count >= maxRequests) {
        return { allowed: false, retryAfterMs: stored.resetAt - now };
      }
      await kv.put(key, JSON.stringify({ count: stored.count + 1, resetAt: stored.resetAt }), {
        expirationTtl: Math.ceil((stored.resetAt - now) / 1000) + 1,
      });
      return { allowed: true, retryAfterMs: 0 };
    } catch (err) {
      console.error('[RateLimit] KV error, falling back to in-memory:', err);
    }
  }

  // In-memory fallback (local dev only — loses state between requests)
  const entry = inMemoryStore.get(key);
  if (!entry || now > entry.resetAt) {
    inMemoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (entry.count >= maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

// ─── Auth Helper ───────────────────────────────────────────────────────────
export async function authenticateRequest(request: Request): Promise<
  { user: JwtPayload; error?: never } |
  { error: { status: number; message: string }; user?: never }
> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: { status: 401, message: 'Missing or invalid Authorization header' } };
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);
  if (!payload) {
    return { error: { status: 401, message: 'Invalid or expired token' } };
  }

  return { user: payload };
}

// ─── Auto-seed demo data on first login (CF Workers compatible) ─────────────
let _demoSeeded = false;

export async function ensureDemoData(d1: D1Database): Promise<void> {
  if (_demoSeeded) return;

  try {
    const admin = await d1.prepare('SELECT id FROM platform_admins LIMIT 1').first();
    if (admin) {
      _demoSeeded = true;
      return;
    }
  } catch {
    return;
  }

  const adminHash = await hashPassword('admin123');
  const managerHash = await hashPassword('manager123');
  const agentHash = await hashPassword('agent123');

  await d1.batch([
    d1.prepare(`INSERT OR IGNORE INTO platform_admins (id, email, name, password_hash) VALUES ('admin-001', 'admin@yourqueueapp.com', 'System Admin', ?)`).bind(adminHash),
    d1.prepare(`INSERT OR IGNORE INTO master_tenants (id, corporate_name, billing_status) VALUES ('master-001', 'CityHealth Medical Group', 'ACTIVE')`),
    d1.prepare(`INSERT OR IGNORE INTO master_tenant_admins (id, master_tenant_id, email, name, password_hash) VALUES ('mt-admin-001', 'master-001', 'hq@cityhealthgroup.com', 'CityHealth HQ Admin', ?)`).bind(managerHash),
    d1.prepare(`INSERT OR IGNORE INTO tenants (id, name, master_tenant_id, plan_tier, wallet_balance, branding_config, welcome_message) VALUES ('tenant-quickbite', 'QuickBite Restaurant', NULL, 'PRO', 100000, '{"primaryColor":"#059669","secondaryColor":"#34d399","logoText":"QB"}', 'Welcome to QuickBite!')`),
    d1.prepare(`INSERT OR IGNORE INTO tenants (id, name, master_tenant_id, plan_tier, wallet_balance, branding_config, welcome_message) VALUES ('tenant-greenbank', 'GreenBank Branch', NULL, 'PRO', 200000, '{"primaryColor":"#0d9488","secondaryColor":"#5eead4","logoText":"GB"}', 'Welcome to GreenBank Branch.')`),
    d1.prepare(`INSERT OR IGNORE INTO tenants (id, name, master_tenant_id, plan_tier, wallet_balance, branding_config, welcome_message) VALUES ('tenant-ch-dt', 'CityHealth - Downtown Clinic', 'master-001', 'ENTERPRISE', 500000, '{"primaryColor":"#7c3aed","secondaryColor":"#a78bfa","logoText":"CH"}', 'CityHealth Downtown.')`),
    d1.prepare(`INSERT OR IGNORE INTO tenants (id, name, master_tenant_id, plan_tier, wallet_balance, branding_config, welcome_message) VALUES ('tenant-ch-ut', 'CityHealth - Uptown Clinic', 'master-001', 'ENTERPRISE', 500000, '{"primaryColor":"#7c3aed","secondaryColor":"#a78bfa","logoText":"CH"}', 'CityHealth Uptown.')`),
    d1.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, email, name, password_hash, role) VALUES ('staff-qb-mgr', 'tenant-quickbite', 'manager@quickbiterestaurant.com', 'QuickBite Manager', ?, 'MANAGER')`).bind(managerHash),
    d1.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, email, name, password_hash, role) VALUES ('staff-qb-a1', 'tenant-quickbite', 'agent1@quickbiterestaurant.com', 'Agent One', ?, 'AGENT')`).bind(agentHash),
    d1.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, email, name, password_hash, role) VALUES ('staff-qb-a2', 'tenant-quickbite', 'agent2@quickbiterestaurant.com', 'Agent Two', ?, 'AGENT')`).bind(agentHash),
    d1.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, email, name, password_hash, role) VALUES ('staff-gb-mgr', 'tenant-greenbank', 'manager@greenbankbranch.com', 'GreenBank Manager', ?, 'MANAGER')`).bind(managerHash),
    d1.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, email, name, password_hash, role) VALUES ('staff-gb-a1', 'tenant-greenbank', 'agent1@greenbankbranch.com', 'Agent One', ?, 'AGENT')`).bind(agentHash),
    d1.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, email, name, password_hash, role) VALUES ('staff-gb-a2', 'tenant-greenbank', 'agent2@greenbankbranch.com', 'Agent Two', ?, 'AGENT')`).bind(agentHash),
    d1.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, email, name, password_hash, role) VALUES ('staff-chdt-mgr', 'tenant-ch-dt', 'manager@cityhealthdowntownclinic.com', 'CityHealth DT Manager', ?, 'MANAGER')`).bind(managerHash),
    d1.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, email, name, password_hash, role) VALUES ('staff-chdt-a1', 'tenant-ch-dt', 'agent1@cityhealthdowntownclinic.com', 'Agent One', ?, 'AGENT')`).bind(agentHash),
    d1.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, email, name, password_hash, role) VALUES ('staff-chdt-a2', 'tenant-ch-dt', 'agent2@cityhealthdowntownclinic.com', 'Agent Two', ?, 'AGENT')`).bind(agentHash),
    d1.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, email, name, password_hash, role) VALUES ('staff-chut-mgr', 'tenant-ch-ut', 'manager@cityhealthuptownclinic.com', 'CityHealth UT Manager', ?, 'MANAGER')`).bind(managerHash),
    d1.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, email, name, password_hash, role) VALUES ('staff-chut-a1', 'tenant-ch-ut', 'agent1@cityhealthuptownclinic.com', 'Agent One', ?, 'AGENT')`).bind(agentHash),
    d1.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, email, name, password_hash, role) VALUES ('staff-chut-a2', 'tenant-ch-ut', 'agent2@cityhealthuptownclinic.com', 'Agent Two', ?, 'AGENT')`).bind(agentHash),
    d1.prepare(`INSERT OR IGNORE INTO queues (id, tenant_id, name, prefix, default_service_time_sec, current_serial, now_serving_serial) VALUES ('q-qb-gen', 'tenant-quickbite', 'General Queue', 'A', 300, 5, 3)`),
    d1.prepare(`INSERT OR IGNORE INTO queues (id, tenant_id, name, prefix, default_service_time_sec, current_serial, now_serving_serial) VALUES ('q-qb-vip', 'tenant-quickbite', 'VIP Queue', 'V', 240, 3, 2)`),
    d1.prepare(`INSERT OR IGNORE INTO queues (id, tenant_id, name, prefix, default_service_time_sec, current_serial, now_serving_serial) VALUES ('q-gb-dep', 'tenant-greenbank', 'Deposits', 'D', 300, 4, 2)`),
    d1.prepare(`INSERT OR IGNORE INTO queues (id, tenant_id, name, prefix, default_service_time_sec, current_serial, now_serving_serial) VALUES ('q-gb-wth', 'tenant-greenbank', 'Withdrawals', 'W', 180, 3, 1)`),
    d1.prepare(`INSERT OR IGNORE INTO queues (id, tenant_id, name, prefix, default_service_time_sec, current_serial, now_serving_serial) VALUES ('q-gb-cs', 'tenant-greenbank', 'Customer Service', 'C', 600, 2, 1)`),
    d1.prepare(`INSERT OR IGNORE INTO queues (id, tenant_id, name, prefix, default_service_time_sec, current_serial, now_serving_serial) VALUES ('q-chdt-gen', 'tenant-ch-dt', 'General Consultation', 'G', 900, 4, 2)`),
    d1.prepare(`INSERT OR IGNORE INTO queues (id, tenant_id, name, prefix, default_service_time_sec, current_serial, now_serving_serial) VALUES ('q-chdt-lab', 'tenant-ch-dt', 'Lab Tests', 'L', 300, 3, 1)`),
    d1.prepare(`INSERT OR IGNORE INTO queues (id, tenant_id, name, prefix, default_service_time_sec, current_serial, now_serving_serial) VALUES ('q-chut-gen', 'tenant-ch-ut', 'General Consultation', 'G', 900, 4, 2)`),
    d1.prepare(`INSERT OR IGNORE INTO queues (id, tenant_id, name, prefix, default_service_time_sec, current_serial, now_serving_serial) VALUES ('q-chut-lab', 'tenant-ch-ut', 'Lab Tests', 'L', 300, 3, 1)`),
    d1.prepare(`INSERT OR IGNORE INTO queues (id, tenant_id, name, prefix, default_service_time_sec, current_serial, now_serving_serial) VALUES ('q-chut-ph', 'tenant-ch-ut', 'Pharmacy', 'P', 180, 2, 1)`),
  ]);

  _demoSeeded = true;
  console.log('[Auth] Demo data seeded on first login');
}

