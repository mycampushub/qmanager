import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv, type BoundStatement } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import type { JwtPayload } from '@/lib/auth';
import { dbNow } from '@/lib/datetime';
import { getClientIp } from '@/lib/utils';

// GET: List branches for the master tenant
export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();

      if (!user.masterTenantId) {
        return NextResponse.json({ error: 'Master tenant context required' }, { status: 400 });
      }

      const branches = await d1
        .prepare(
          `SELECT t.id, t.name, t.plan_tier, t.wallet_balance, t.is_active, t.created_at,
                  (SELECT count(*) FROM queues q WHERE q.tenant_id = t.id AND q.is_active = 1) as queue_count,
                  (SELECT count(*) FROM users u WHERE u.tenant_id = t.id AND u.is_active = 1) as staff_count
           FROM tenants t
           WHERE t.master_tenant_id = ?
           ORDER BY t.name ASC`
        )
        .bind(user.masterTenantId)
        .all<{
          id: string;
          name: string;
          plan_tier: string;
          wallet_balance: number;
          is_active: number;
          created_at: string;
          queue_count: number;
          staff_count: number;
        }>();

      const branchList = branches.results.map((b) => ({
        id: b.id,
        name: b.name,
        planTier: b.plan_tier,
        walletBalance: b.wallet_balance,
        isActive: b.is_active === 1,
        queueCount: b.queue_count,
        staffCount: b.staff_count,
        createdAt: b.created_at,
      }));

      return NextResponse.json({ branches: branchList });
    } catch (error) {
      console.error('List branches error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MASTER_TENANT_ADMIN'] }
);

// POST: Create a new branch (sub-tenant)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();

      if (!user.masterTenantId) {
        return NextResponse.json({ error: 'Master tenant context required' }, { status: 400 });
      }

      const body = await req.json();
      const {
        name,
        planTier,
        managerEmail,
        managerName,
        managerPassword,
      } = body as {
        name: string;
        planTier?: string;
        managerEmail?: string;
        managerName?: string;
        managerPassword?: string;
      };

      if (!name || !name.trim()) {
        return NextResponse.json({ error: 'Branch name is required' }, { status: 400 });
      }

      const VALID_TIERS = ['FREE', 'PRO', 'ENTERPRISE'];
      const tier = planTier || 'PRO';
      if (!VALID_TIERS.includes(tier)) {
        return NextResponse.json({ error: 'Invalid planTier' }, { status: 400 });
      }

      // Validate manager credentials if provided
      let managerId: string | null = null;
      let passwordHash: string | null = null;

      if (managerEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(managerEmail)) {
          return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
        }
        if (!managerName) {
          return NextResponse.json({ error: 'Manager name is required when email is provided' }, { status: 400 });
        }
        if (!managerPassword || managerPassword.length < 8) {
          return NextResponse.json({ error: 'Manager password must be at least 8 characters' }, { status: 400 });
        }
        if (!/[A-Z]/.test(managerPassword)) {
          return NextResponse.json({ error: 'Password must contain at least one uppercase letter' }, { status: 400 });
        }
        if (!/[0-9]/.test(managerPassword)) {
          return NextResponse.json({ error: 'Password must contain at least one digit' }, { status: 400 });
        }

        // Check email uniqueness
        const existing = await d1
          .prepare(
            `SELECT id FROM users WHERE email = ? UNION SELECT id FROM platform_admins WHERE email = ? UNION SELECT id FROM master_tenant_admins WHERE email = ?`
          )
          .bind(managerEmail, managerEmail, managerEmail)
          .first();
        if (existing) {
          return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
        }

        managerId = crypto.randomUUID();
        passwordHash = await hashPassword(managerPassword);
      }

      const tenantId = crypto.randomUUID();
      const queueId = crypto.randomUUID();
      const now = dbNow();

      const statements: BoundStatement[] = [
        d1.prepare(
          `INSERT INTO tenants (id, name, master_tenant_id, plan_tier, wallet_balance, is_active)
           VALUES (?, ?, ?, ?, ?, 1)`
        ).bind(tenantId, name.trim(), user.masterTenantId, tier, 50000),
        // Create default queue for the branch
        d1.prepare(
          `INSERT INTO queues (id, tenant_id, name, prefix, default_service_time_sec, current_serial, now_serving_serial, is_active)
           VALUES (?, ?, 'General Service', 'A', 300, 0, 0, 1)`
        ).bind(queueId, tenantId),
      ];

      if (managerId && passwordHash) {
        statements.push(
          d1.prepare(
            `INSERT INTO users (id, tenant_id, email, name, password_hash, role, is_active)
             VALUES (?, ?, ?, ?, ?, 'MANAGER', 1)`
          ).bind(managerId, tenantId, managerEmail!, managerName!, passwordHash)
        );
      }

      // Audit log
      statements.push(
        d1.prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address)
           VALUES (?, ?, 'master_tenant_admin', 'BRANCH_CREATE', ?, ?)`
        ).bind(
          crypto.randomUUID(),
          user.userId,
          JSON.stringify({ tenantId, name: name.trim(), planTier: tier, masterTenantId: user.masterTenantId }),
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

      return NextResponse.json(
        {
          branch: {
            id: tenantId,
            name: name.trim(),
            planTier: tier,
            masterTenantId: user.masterTenantId,
            isActive: true,
            createdAt: dbNow(),
          },
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Create branch error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MASTER_TENANT_ADMIN'] }
);

// PUT: Update a branch (name, active status)
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { branchId, name, isActive } = body as {
        branchId: string;
        name?: string;
        isActive?: boolean;
      };

      if (!branchId) {
        return NextResponse.json({ error: 'branchId is required' }, { status: 400 });
      }

      if (!user.masterTenantId) {
        return NextResponse.json({ error: 'Master tenant context required' }, { status: 400 });
      }

      // Verify branch belongs to this master tenant
      const branch = await d1
        .prepare(`SELECT id, name FROM tenants WHERE id = ? AND master_tenant_id = ?`)
        .bind(branchId, user.masterTenantId)
        .first<{ id: string; name: string }>();

      if (!branch) {
        return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
      }

      const setClauses: string[] = [];
      const values: unknown[] = [];

      if (name !== undefined) { setClauses.push('name = ?'); values.push(name); }
      if (isActive !== undefined) { setClauses.push('is_active = ?'); values.push(isActive ? 1 : 0); }

      if (setClauses.length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      }

      setClauses.push("updated_at = datetime('now')");

      await d1
        .prepare(`UPDATE tenants SET ${setClauses.join(', ')} WHERE id = ?`)
        .bind(...values, branchId)
        .run();

      // Audit log
      await d1.prepare(
        `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address) VALUES (?, ?, 'master_tenant_admin', 'BRANCH_UPDATE', ?, ?)`
      ).bind(
        crypto.randomUUID(),
        user.userId,
        JSON.stringify({ branchId, name, isActive }),
        getClientIp(req)
      ).run();

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Update branch error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MASTER_TENANT_ADMIN'] }
);