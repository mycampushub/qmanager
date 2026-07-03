import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import type { JwtPayload } from '@/lib/auth';

// =============================================================================
// Row types for D1 raw SQL results (snake_case)
// =============================================================================

interface TenantManageRow {
  id: string;
  name: string;
  master_tenant_id: string | null;
  plan_tier: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  ticket_count?: number;
}

// Helper: extract client IP
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

// Helper: create audit log entry
async function createAuditLog(
  d1: D1Database,
  userId: string,
  userType: string,
  action: string,
  details: string,
  ipAddress: string
) {
  await d1.prepare(
    `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), userId, userType, action, details, ipAddress).run();
}

// GET: List all tenants with ticket counts (PLATFORM_ADMIN only)
export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const url = req.nextUrl;

      // Pagination
      let page = parseInt(url.searchParams.get('page') || '1', 10);
      let limit = parseInt(url.searchParams.get('limit') || '20', 10);
      if (isNaN(page) || page < 1) page = 1;
      if (isNaN(limit) || limit < 1) limit = 20;
      if (limit > 100) limit = 100;
      const offset = (page - 1) * limit;

      // Search
      const search = (url.searchParams.get('search') || '').trim().slice(0, 200);

      // Count total
      const countSql = search
        ? `SELECT count(*) as cnt FROM tenants WHERE name LIKE ?`
        : `SELECT count(*) as cnt FROM tenants`;
      const countResult = await d1
        .prepare(countSql)
        .bind(search ? `%${search}%` : undefined)
        .first<{ cnt: number }>();
      const total = countResult?.cnt ?? 0;

      // Fetch tenants with ticket counts
      const listSql = search
        ? `SELECT t.id, t.name, t.master_tenant_id, t.plan_tier, t.is_active, t.created_at, t.updated_at,
              COUNT(tk.id) AS ticket_count
           FROM tenants t
           LEFT JOIN tickets tk ON tk.tenant_id = t.id
           WHERE t.name LIKE ?
           GROUP BY t.id
           ORDER BY t.created_at DESC
           LIMIT ? OFFSET ?`
        : `SELECT t.id, t.name, t.master_tenant_id, t.plan_tier, t.is_active, t.created_at, t.updated_at,
              COUNT(tk.id) AS ticket_count
           FROM tenants t
           LEFT JOIN tickets tk ON tk.tenant_id = t.id
           GROUP BY t.id
           ORDER BY t.created_at DESC
           LIMIT ? OFFSET ?`;

      const result = await d1
        .prepare(listSql)
        .bind(
          ...(search ? [`%${search}%`] : []),
          limit,
          offset
        )
        .all<TenantManageRow>();

      const tenants = result.results.map((t) => ({
        id: t.id,
        name: t.name,
        masterTenantId: t.master_tenant_id,
        planTier: t.plan_tier,
        isActive: t.is_active === 1,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        _ticketCount: t.ticket_count ?? 0,
      }));

      return NextResponse.json({
        tenants,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error('List manage tenants error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);

// POST: Create new tenant with manager (PLATFORM_ADMIN only)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const {
        name,
        planTier,
        masterTenantId,
        walletBalance,
        managerEmail,
        managerName,
        managerPassword,
      } = body as {
        name: string;
        planTier?: string;
        masterTenantId?: string;
        walletBalance?: number;
        managerEmail?: string;
        managerName?: string;
        managerPassword?: string;
      };

      if (!name) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 });
      }

      // B5: Validate planTier
      const VALID_TIERS = ['FREE', 'PRO', 'ENTERPRISE'];
      const tier = planTier || 'FREE';
      if (!VALID_TIERS.includes(tier)) {
        return NextResponse.json(
          { error: 'Invalid planTier. Must be one of: FREE, PRO, ENTERPRISE' },
          { status: 400 }
        );
      }

      // B6: Validate walletBalance
      if (walletBalance !== undefined) {
        if (
          typeof walletBalance !== 'number' ||
          !Number.isFinite(walletBalance) ||
          walletBalance < 0 ||
          walletBalance > 100000000
        ) {
          return NextResponse.json(
            { error: 'walletBalance must be a non-negative number ≤ 100,000,000' },
            { status: 400 }
          );
        }
      }

      const d1 = await getD1FromEnv();
      const tenantId = crypto.randomUUID();

      // Validate master tenant if provided
      if (masterTenantId) {
        const master = await d1
          .prepare(`SELECT id FROM master_tenants WHERE id = ?`)
          .bind(masterTenantId)
          .first();
        if (!master) {
          return NextResponse.json({ error: 'Master tenant not found' }, { status: 404 });
        }
      }

      // If manager credentials are provided, validate them
      let managerId: string | null = null;
      let passwordHash: string | null = null;
      if (managerEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(managerEmail)) {
          return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
        }
        if (!managerName) {
          return NextResponse.json({ error: 'managerName is required when managerEmail is provided' }, { status: 400 });
        }
        if (!managerPassword || managerPassword.length < 8) {
          return NextResponse.json({ error: 'managerPassword must be at least 8 characters' }, { status: 400 });
        }
        if (!/[A-Z]/.test(managerPassword)) {
          return NextResponse.json({ error: 'managerPassword must contain at least one uppercase letter' }, { status: 400 });
        }
        if (!/[0-9]/.test(managerPassword)) {
          return NextResponse.json({ error: 'managerPassword must contain at least one digit' }, { status: 400 });
        }

        // Check email uniqueness
        const existing = await d1.prepare(
          `SELECT id FROM users WHERE email = ? UNION SELECT id FROM platform_admins WHERE email = ?`
        ).bind(managerEmail, managerEmail).first();
        if (existing) {
          return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
        }

        managerId = crypto.randomUUID();
        passwordHash = await hashPassword(managerPassword);
      }

      // Create tenant (+ manager if provided) in a batch
      const now = new Date().toISOString();
      const statements: D1PreparedStatement[] = [
        d1.prepare(
          `INSERT INTO tenants (id, name, plan_tier, master_tenant_id, wallet_balance, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
        ).bind(tenantId, name, tier, masterTenantId || null, walletBalance ?? 50000, now, now),
      ];

      if (managerId && passwordHash) {
        statements.push(
          d1.prepare(
            `INSERT INTO users (id, tenant_id, email, name, password_hash, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'MANAGER', 1, ?, ?)`
          ).bind(managerId, tenantId, managerEmail!, managerName!, passwordHash, now, now)
        );
      }

      // Audit log
      statements.push(
        d1.prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address) VALUES (?, ?, ?, 'TENANT_CREATE', ?, ?)`
        ).bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          JSON.stringify({ tenantId, name, planTier: tier, masterTenantId, walletBalance: walletBalance ?? 50000 }),
          getClientIp(req)
        )
      );

      try {
        await d1.batch(statements);
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'message' in error) {
          const msg = (error as { message: string }).message;
          if (msg.includes('UNIQUE constraint failed')) {
            return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
          }
        }
        throw error;
      }

      // H-03: Filter sensitive fields from response
      const safeTenant = {
        id: tenantId,
        name,
        planTier: tier,
        masterTenantId: masterTenantId || null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      return NextResponse.json({ tenant: safeTenant }, { status: 201 });
    } catch (error) {
      console.error('Create tenant error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);

// PUT: Update tenant (PLATFORM_ADMIN | MANAGER)
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const {
        tenantId,
        name,
        planTier,
        isActive,
        contactEmail,
        contactPhone,
        address,
        welcomeMessage,
      } = body as {
        tenantId: string;
        name?: string;
        planTier?: string;
        isActive?: boolean;
        contactEmail?: string;
        contactPhone?: string;
        address?: string;
        welcomeMessage?: string;
      };

      if (!tenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
      }

      const d1 = await getD1FromEnv();

      // MANAGER can only update own tenant
      if (user.role === 'MANAGER') {
        if (user.tenantId !== tenantId) {
          return NextResponse.json(
            { error: 'You can only update your own tenant' },
            { status: 403 }
          );
        }

        if (planTier !== undefined || isActive !== undefined) {
          return NextResponse.json(
            { error: 'Managers can only update tenant name and contact info' },
            { status: 403 }
          );
        }
      }

      // Verify tenant exists
      const tenant = await d1
        .prepare(`SELECT id, name, plan_tier, master_tenant_id, is_active, created_at, updated_at FROM tenants WHERE id = ?`)
        .bind(tenantId)
        .first<TenantManageRow>();

      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      // B5: Validate planTier on update (PLATFORM_ADMIN only)
      if (planTier !== undefined) {
        const VALID_TIERS = ['FREE', 'PRO', 'ENTERPRISE'];
        if (!VALID_TIERS.includes(planTier)) {
          return NextResponse.json(
            { error: 'Invalid planTier. Must be one of: FREE, PRO, ENTERPRISE' },
            { status: 400 }
          );
        }
      }

      // Build SET clauses dynamically
      const setClauses: string[] = [];
      const bindValues: unknown[] = [];

      if (name !== undefined) { setClauses.push('name = ?'); bindValues.push(name); }
      if (planTier !== undefined) { setClauses.push('plan_tier = ?'); bindValues.push(planTier); }
      if (isActive !== undefined) { setClauses.push('is_active = ?'); bindValues.push(isActive ? 1 : 0); }
      if (contactEmail !== undefined) { setClauses.push('contact_email = ?'); bindValues.push(contactEmail); }
      if (contactPhone !== undefined) { setClauses.push('contact_phone = ?'); bindValues.push(contactPhone); }
      if (address !== undefined) { setClauses.push('address = ?'); bindValues.push(address); }
      if (welcomeMessage !== undefined) { setClauses.push('welcome_message = ?'); bindValues.push(welcomeMessage); }

      if (setClauses.length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      }

      setClauses.push("updated_at = datetime('now')");

      await d1
        .prepare(`UPDATE tenants SET ${setClauses.join(', ')} WHERE id = ?`)
        .bind(...bindValues, tenantId)
        .run();

      // Audit log
      await createAuditLog(
        d1,
        user.userId,
        user.type,
        'TENANT_UPDATE',
        JSON.stringify({ tenantId, updateData: { name, planTier, isActive, contactEmail, contactPhone, address, welcomeMessage } }),
        getClientIp(req)
      );

      // Fetch updated tenant for response
      const updated = await d1
        .prepare(`SELECT id, name, plan_tier, master_tenant_id, is_active, created_at, updated_at FROM tenants WHERE id = ?`)
        .bind(tenantId)
        .first<TenantManageRow>();

      // H-04: Filter sensitive fields from response
      const safeTenant = {
        id: updated!.id,
        name: updated!.name,
        planTier: updated!.plan_tier,
        masterTenantId: updated!.master_tenant_id,
        isActive: updated!.is_active === 1,
        createdAt: updated!.created_at,
        updatedAt: updated!.updated_at,
      };

      return NextResponse.json({ tenant: safeTenant });
    } catch (error) {
      console.error('Update tenant error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN', 'MANAGER'] }
);

// DELETE: Soft-delete tenant (PLATFORM_ADMIN only)
export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { tenantId } = body as { tenantId: string };

      if (!tenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
      }

      const d1 = await getD1FromEnv();

      const tenant = await d1
        .prepare(`SELECT id, name FROM tenants WHERE id = ?`)
        .bind(tenantId)
        .first<{ id: string; name: string }>();

      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      await d1.batch([
        d1.prepare(`UPDATE tenants SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).bind(tenantId),
        d1.prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address) VALUES (?, ?, ?, 'TENANT_DELETE', ?, ?)`
        ).bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          JSON.stringify({ tenantId, name: tenant.name }),
          getClientIp(req)
        ),
      ]);

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Delete tenant error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);