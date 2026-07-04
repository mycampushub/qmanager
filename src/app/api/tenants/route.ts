import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { hashPassword, signToken, rateLimit, generateCsrfToken } from '@/lib/auth';
import type { JwtPayload } from '@/lib/auth';
import { getClientIp } from '@/lib/utils';

// =============================================================================
// Row types for D1 raw SQL results (snake_case)
// =============================================================================

interface TenantRow {
  id: string;
  name: string;
  master_tenant_id: string | null;
  plan_tier: string;
  wallet_balance: number;
  branding_config: string | null;
  welcome_message: string | null;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  master_id?: string | null;
  corporate_name?: string | null;
  queue_count?: number;
}

// GET: List all active tenants (PUBLIC — needed for join page, TV display, kiosk)
export async function GET() {
  try {
    const d1 = await getD1FromEnv();

    const result = await d1.prepare(`
      SELECT
        t.id, t.name, t.master_tenant_id, t.plan_tier, t.welcome_message, t.logo_url,
        t.is_active, t.created_at,
        mt.id AS master_id, mt.corporate_name,
        COUNT(q.id) AS queue_count
      FROM tenants t
      LEFT JOIN master_tenants mt ON t.master_tenant_id = mt.id
      LEFT JOIN queues q ON q.tenant_id = t.id AND q.is_active = 1
      WHERE t.is_active = 1
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `).all<TenantRow>();

    // A2: Strip sensitive fields from public response (walletBalance, brandingConfig)
    const enriched = result.results.map((t) => ({
      id: t.id,
      name: t.name,
      masterTenantId: t.master_tenant_id,
      planTier: t.plan_tier,
      welcomeMessage: t.welcome_message,
      logoUrl: t.logo_url,
      isActive: t.is_active === 1,
      createdAt: t.created_at,
      masterTenant: t.master_id
        ? { id: t.master_id, corporateName: t.corporate_name }
        : null,
      _queueCount: t.queue_count ?? 0,
    }));

    return NextResponse.json({ tenants: enriched });
  } catch (error) {
    console.error('List tenants error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Register new tenant (PUBLIC — self-service registration)
// Creates tenant + manager + default queue in a single D1 batch transaction.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessName, email, name, password } = body as {
      businessName: string;
      email: string;
      name: string;
      password: string;
    };

    if (!businessName || !email || !name || !password) {
      return NextResponse.json(
        { error: 'businessName, email, name, and password are required' },
        { status: 400 }
      );
    }

    // B1: Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // C8: Minimum password length
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // C9: Password complexity
    if (!/[A-Z]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one uppercase letter' },
        { status: 400 }
      );
    }
    if (!/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must contain at least one digit' },
        { status: 400 }
      );
    }

    // H-01: Always force FREE tier on self-registration
    const tier = 'FREE';

    // Rate limit: 3 per hour per IP
    const ip = getClientIp(req);

    const { allowed, retryAfterMs } = await rateLimit('register:' + ip, 3, 3_600_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
        }
      );
    }

    const d1 = await getD1FromEnv();
    const passwordHash = await hashPassword(password);
    const tenantId = crypto.randomUUID();
    const staffId = crypto.randomUUID();
    const queueId = crypto.randomUUID();

    // H-02: Create tenant + manager + default queue in a single batch transaction
    // to prevent email race condition. DB unique constraint is the real guard.
    try {
      // Check email uniqueness first
      const existing = await d1.prepare(
        `SELECT id FROM users WHERE email = ? UNION SELECT id FROM platform_admins WHERE email = ?`
      ).bind(email, email).first();

      if (existing) {
        return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
      }

      await d1.batch([
        d1.prepare(
          `INSERT INTO tenants (id, name, plan_tier, wallet_balance) VALUES (?, ?, ?, ?)`
        ).bind(tenantId, businessName, tier, 50000),
        d1.prepare(
          `INSERT INTO users (id, tenant_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?, 'MANAGER')`
        ).bind(staffId, tenantId, email, name, passwordHash),
        d1.prepare(
          `INSERT INTO queues (id, tenant_id, name, prefix, default_service_time_sec) VALUES (?, ?, 'General Service', 'A', 300)`
        ).bind(queueId, tenantId),
        // Audit log
        d1.prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address) VALUES (?, ?, 'staff', 'REGISTRATION', ?, ?)`
        ).bind(
          crypto.randomUUID(),
          staffId,
          JSON.stringify({ email, tenantId, businessName, planTier: tier }),
          ip
        ),
      ]);
    } catch (error: unknown) {
      // SQLite UNIQUE constraint violation
      if (error && typeof error === 'object' && 'message' in error) {
        const msg = (error as { message: string }).message;
        if (msg.includes('UNIQUE constraint failed')) {
          return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
        }
      }
      throw error;
    }

    // Sign token for auto-login
    const token = await signToken({
      userId: staffId,
      tenantId,
      role: 'MANAGER',
      type: 'staff',
    });

    const csrfToken = generateCsrfToken();

    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully!',
        user: {
          id: staffId,
          email,
          name,
          role: 'MANAGER' as const,
          type: 'staff' as const,
          tenantId,
          tenant: {
            id: tenantId,
            name: businessName,
            planTier: tier,
          },
        },
        token,
        csrfToken,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: Get single tenant with queue stats (MANAGER | PLATFORM_ADMIN)
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { tenantId } = body as { tenantId: string };

      if (!tenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
      }

      // MANAGER can only access own tenant
      if (user.role === 'MANAGER' && user.tenantId !== tenantId) {
        return NextResponse.json({ error: 'You can only access your own tenant' }, { status: 403 });
      }

      const d1 = await getD1FromEnv();

      // Fetch tenant with master tenant
      const tenantRow = await d1.prepare(`
        SELECT
          t.id, t.name, t.plan_tier, t.master_tenant_id, t.welcome_message, t.logo_url,
          t.is_active, t.created_at, t.contact_email, t.contact_phone, t.address,
          mt.id AS master_id, mt.corporate_name
        FROM tenants t
        LEFT JOIN master_tenants mt ON t.master_tenant_id = mt.id
        WHERE t.id = ?
      `).bind(tenantId).first<TenantRow>();

      if (!tenantRow) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      // Fetch active queues for this tenant
      const queuesResult = await d1.prepare(`
        SELECT * FROM queues WHERE tenant_id = ? AND is_active = 1 ORDER BY name ASC
      `).bind(tenantId).all<{
        id: string;
        tenant_id: string;
        name: string;
        description: string | null;
        default_service_time_sec: number;
        prefix: string;
        current_serial: number;
        now_serving_serial: number;
        is_active: number;
        created_at: string;
        updated_at: string;
      }>();

      // Compute stats for each queue
      const queuesWithStats = await Promise.all(
        queuesResult.results.map(async (queue) => {
          const [waitingResult, servingResult, logsResult] = await Promise.all([
            d1.prepare(`SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = 'WAITING'`).bind(queue.id).first<{ cnt: number }>(),
            d1.prepare(`SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = 'SERVING'`).bind(queue.id).first<{ cnt: number }>(),
            d1.prepare(
              `SELECT duration_seconds FROM service_logs WHERE tenant_id = ? AND queue_id = ? AND duration_seconds IS NOT NULL ORDER BY created_at DESC LIMIT 20`
            ).bind(tenantId, queue.id).all<{ duration_seconds: number }>(),
          ]);

          const waiting = waitingResult?.cnt ?? 0;
          const serving = servingResult?.cnt ?? 0;
          const logs = logsResult.results;

          const avgServiceTime = logs.length > 0
            ? Math.round(logs.reduce((sum, s) => sum + s.duration_seconds, 0) / logs.length)
            : queue.default_service_time_sec;

          return {
            id: queue.id,
            tenantId: queue.tenant_id,
            name: queue.name,
            description: queue.description,
            defaultServiceTimeSec: queue.default_service_time_sec,
            prefix: queue.prefix,
            currentSerial: queue.current_serial,
            nowServingSerial: queue.now_serving_serial,
            isActive: queue.is_active === 1,
            _waitingCount: waiting,
            _servingCount: serving,
            _avgServiceTime: avgServiceTime,
            _ewt: waiting * avgServiceTime,
          };
        })
      );

      // H-03: Filter sensitive fields from tenant+queues response
      const safeTenant = {
        id: tenantRow.id,
        name: tenantRow.name,
        planTier: tenantRow.plan_tier,
        masterTenantId: tenantRow.master_tenant_id,
        welcomeMessage: tenantRow.welcome_message,
        logoUrl: tenantRow.logo_url,
        contactEmail: tenantRow.contact_email,
        contactPhone: tenantRow.contact_phone,
        address: tenantRow.address,
        isActive: tenantRow.is_active === 1,
        createdAt: tenantRow.created_at,
        masterTenant: tenantRow.master_id
          ? { id: tenantRow.master_id, corporateName: tenantRow.corporate_name }
          : null,
        queues: queuesWithStats,
      };

      return NextResponse.json({ tenant: safeTenant });
    } catch (error) {
      console.error('Get tenant error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN', 'MANAGER'], csrf: true }
);