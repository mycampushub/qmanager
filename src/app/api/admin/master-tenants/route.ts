import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

// GET: List all master tenants with their sub-tenants
export const GET = withAuth(
  async (_req: NextRequest, _ctx: { user: JwtPayload }) => {
    try {
      const d1 = getD1FromEnv();

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

// POST: Create master tenant
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = getD1FromEnv();
      const body = await req.json();
      const { corporateName } = body as { corporateName: string };

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

      const newId = crypto.randomUUID();
      const now = new Date().toISOString();

      await d1.prepare(
        `INSERT INTO master_tenants (id, corporate_name, billing_status, created_at, updated_at)
         VALUES (?, ?, 'ACTIVE', ?, ?)`
      ).bind(newId, corporateName, now, now).run();

      // Audit log
      const ip =
        req.headers.get('cf-connecting-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        'unknown';

      await d1.prepare(
        `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at)
         VALUES (?, ?, ?, 'MASTER_TENANT_CREATE', ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), user.userId, user.type,
        JSON.stringify({ masterTenantId: newId, corporateName }),
        ip, now
      ).run();

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