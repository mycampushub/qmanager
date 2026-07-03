import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import type { JwtPayload } from '@/lib/auth';

// GET: List all master tenants with their sub-tenants
export const GET = withAuth(
  async (_req: NextRequest, _ctx: { user: JwtPayload }) => {
    try {
      const d1 = await getD1FromEnv();

      const masterTenantsResult = await d1
        .prepare(
          `SELECT mt.id, mt.corporate_name, mt.billing_status, mt.created_at, mt.updated_at
           FROM master_tenants mt
           ORDER BY mt.corporate_name ASC`
        )
        .all<{
          id: string; corporate_name: string; billing_status: string; created_at: string; updated_at: string;
        }>();

      const masterTenantList = masterTenantsResult.results.map((mt) => ({
        id: mt.id,
        corporateName: mt.corporate_name,
        billingStatus: mt.billing_status,
        createdAt: mt.created_at,
        updatedAt: mt.updated_at,
      }));

      // Fetch sub-tenants for all master tenants
      const subTenantsResult = await d1
        .prepare(
          `SELECT t.id, t.name, t.plan_tier, t.wallet_balance, t.is_active, t.created_at,
                  t.master_tenant_id
           FROM tenants t
           WHERE t.master_tenant_id IS NOT NULL
           ORDER BY t.name ASC`
        )
        .all<{
          id: string; name: string; plan_tier: string; wallet_balance: number;
          is_active: number; created_at: string; master_tenant_id: string;
        }>();

      // Group sub-tenants by master_tenant_id
      const tenantMap = new Map<string, unknown[]>();
      for (const t of subTenantsResult.results) {
        const list = tenantMap.get(t.master_tenant_id) ?? [];
        list.push({
          id: t.id,
          name: t.name,
          planTier: t.plan_tier,
          walletBalance: t.wallet_balance,
          isActive: t.is_active === 1,
          createdAt: t.created_at,
        });
        tenantMap.set(t.master_tenant_id, list);
      }

      const masterTenants = masterTenantList.map((mt) => ({
        ...mt,
        tenants: tenantMap.get(mt.id) ?? [],
      }));

      return NextResponse.json({ masterTenants });
    } catch (error) {
      console.error('List master tenants error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);

// POST: Create master tenant (optionally with admin credentials)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { corporateName, adminEmail, adminName, adminPassword } = body as {
        corporateName: string;
        adminEmail?: string;
        adminName?: string;
        adminPassword?: string;
      };

      if (!corporateName) {
        return NextResponse.json(
          { error: 'corporateName is required' },
          { status: 400 }
        );
      }

      // B14: Max length 200
      if (corporateName.length > 200) {
        return NextResponse.json(
          { error: 'corporateName must be at most 200 characters' },
          { status: 400 }
        );
      }

      // B13: Uniqueness check
      const existing = await d1
        .prepare('SELECT id FROM master_tenants WHERE corporate_name = ?')
        .bind(corporateName)
        .first<{ id: string }>();

      if (existing) {
        return NextResponse.json(
          { error: 'A master tenant with this name already exists' },
          { status: 409 }
        );
      }

      // Validate admin credentials if provided
      let adminId: string | null = null;
      let passwordHash: string | null = null;
      if (adminEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(adminEmail)) {
          return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
        }
        if (!adminName) {
          return NextResponse.json({ error: 'Admin name is required when email is provided' }, { status: 400 });
        }
        if (!adminPassword || adminPassword.length < 8) {
          return NextResponse.json({ error: 'Admin password must be at least 8 characters' }, { status: 400 });
        }
        if (!/[A-Z]/.test(adminPassword)) {
          return NextResponse.json({ error: 'Password must contain at least one uppercase letter' }, { status: 400 });
        }
        if (!/[0-9]/.test(adminPassword)) {
          return NextResponse.json({ error: 'Password must contain at least one digit' }, { status: 400 });
        }

        // Check email uniqueness across all user tables
        const existingEmail = await d1
          .prepare(
            `SELECT id FROM users WHERE email = ? UNION SELECT id FROM platform_admins WHERE email = ? UNION SELECT id FROM master_tenant_admins WHERE email = ?`
          )
          .bind(adminEmail, adminEmail, adminEmail)
          .first();
        if (existingEmail) {
          return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
        }

        adminId = crypto.randomUUID();
        passwordHash = await hashPassword(adminPassword);
      }

      const newId = crypto.randomUUID();
      const now = new Date().toISOString();

      const statements: D1PreparedStatement[] = [
        d1.prepare(
          `INSERT INTO master_tenants (id, corporate_name, billing_status, created_at, updated_at)
           VALUES (?, ?, 'ACTIVE', ?, ?)`
        ).bind(newId, corporateName, now, now),
      ];

      if (adminId && passwordHash) {
        statements.push(
          d1.prepare(
            `INSERT INTO master_tenant_admins (id, master_tenant_id, email, name, password_hash, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
          ).bind(adminId, newId, adminEmail!, adminName!, passwordHash, now, now)
        );
      }

      // Audit log
      const ip =
        req.headers.get('cf-connecting-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        'unknown';

      statements.push(
        d1.prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at)
           VALUES (?, ?, ?, 'MASTER_TENANT_CREATE', ?, ?, ?)`
        ).bind(
          crypto.randomUUID(), user.userId, user.type,
          JSON.stringify({ masterTenantId: newId, corporateName, adminCreated: !!adminId }),
          ip, now
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

      return NextResponse.json(
        {
          masterTenant: {
            id: newId,
            corporateName,
            billingStatus: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
          },
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Create master tenant error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);

// PUT: Update master tenant (corporate name or billing status)
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;
    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { masterTenantId, corporateName, billingStatus } = body as {
        masterTenantId: string; corporateName?: string; billingStatus?: string;
      };
      if (!masterTenantId) return NextResponse.json({ error: 'masterTenantId is required' }, { status: 400 });

      const existing = await d1.prepare('SELECT id FROM master_tenants WHERE id = ?').bind(masterTenantId).first();
      if (!existing) return NextResponse.json({ error: 'Master tenant not found' }, { status: 404 });

      const setClauses: string[] = [];
      const values: unknown[] = [];
      if (corporateName) { setClauses.push('corporate_name = ?'); values.push(corporateName); }
      if (billingStatus) { setClauses.push('billing_status = ?'); values.push(billingStatus); }
      if (setClauses.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

      await d1.prepare(`UPDATE master_tenants SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...values, masterTenantId).run();

      const ip =
        req.headers.get('cf-connecting-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        'unknown';
      await d1.prepare(
        `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at) VALUES (?, ?, ?, 'MASTER_TENANT_UPDATE', ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), user.userId, user.type, JSON.stringify({ masterTenantId, corporateName, billingStatus }),
        ip, new Date().toISOString()
      ).run();

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Update master tenant error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);

// DELETE: Delete master tenant (only if no sub-tenants)
export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;
    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { masterTenantId } = body as { masterTenantId: string };
      if (!masterTenantId) return NextResponse.json({ error: 'masterTenantId is required' }, { status: 400 });

      const subCount = await d1.prepare('SELECT count(*) as cnt FROM tenants WHERE master_tenant_id = ?').bind(masterTenantId).first<{ cnt: number }>();
      if (subCount && subCount.cnt > 0) {
        return NextResponse.json({ error: 'Cannot delete master tenant with existing branches. Remove or unlink all branches first.' }, { status: 400 });
      }

      await d1.prepare('DELETE FROM master_tenants WHERE id = ?').bind(masterTenantId).run();

      const ip =
        req.headers.get('cf-connecting-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        'unknown';
      await d1.prepare(
        `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at) VALUES (?, ?, ?, 'MASTER_TENANT_DELETE', ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), user.userId, user.type, JSON.stringify({ masterTenantId }),
        ip, new Date().toISOString()
      ).run();

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Delete master tenant error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);