import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import type { JwtPayload } from '@/lib/auth';
import { dbNow } from '@/lib/datetime';
import { getClientIp } from '@/lib/utils';

// GET: List staff users
export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();

      if (user.role === 'MANAGER') {
        const result = await d1
          .prepare(
            'SELECT id, tenant_id, email, name, role, is_active, created_at FROM users WHERE tenant_id = ? ORDER BY created_at DESC'
          )
          .bind(user.tenantId)
          .all<{
            id: string; tenant_id: string; email: string; name: string; role: string; is_active: number; created_at: string;
          }>();

        const staff = result.results.map((s) => ({
          id: s.id,
          tenantId: s.tenant_id,
          email: s.email,
          name: s.name,
          role: s.role,
          isActive: s.is_active === 1,
          createdAt: s.created_at,
        }));

        return NextResponse.json({ staff });
      }

      // PLATFORM_ADMIN: accept optional tenantId filter with pagination (C1)
      const tenantIdParam = req.nextUrl.searchParams.get('tenantId');
      const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10);
      const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20', 10);
      const safePage = isNaN(page) || page < 1 ? 1 : page;
      const safeLimit = isNaN(limit) || limit < 1 ? 20 : Math.min(limit, 100);

      let whereClause = '';
      const binds: unknown[] = [];

      if (tenantIdParam) {
        whereClause = ' WHERE u.tenant_id = ?';
        binds.push(tenantIdParam);
      }

      const [countResult, listResult] = await d1.batch([
        d1.prepare(`SELECT count(*) as cnt FROM users${whereClause}`).bind(...binds),
        d1.prepare(
          `SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.is_active, u.created_at,
                  t.id as _tid, t.name as _tname
           FROM users u
           LEFT JOIN tenants t ON u.tenant_id = t.id
           ${whereClause}
           ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
        ).bind(...binds, safeLimit, (safePage - 1) * safeLimit),
      ]);

      const total = ((countResult.results as { cnt: number }[])[0]?.cnt) ?? 0;

      const staff = (listResult.results as {
        id: string; tenant_id: string; email: string; name: string; role: string;
        is_active: number; created_at: string; _tid: string | null; _tname: string | null;
      }[]).map((s) => ({
        id: s.id,
        tenantId: s.tenant_id,
        email: s.email,
        name: s.name,
        role: s.role,
        isActive: s.is_active === 1,
        createdAt: s.created_at,
        ...(s._tid ? { tenant: { id: s._tid, name: s._tname } } : {}),
      }));

      return NextResponse.json({
        staff,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit),
        },
      });
    } catch (error) {
      console.error('List staff error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER', 'PLATFORM_ADMIN'] }
);

// POST: Create staff user (MANAGER only)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { tenantId, email, name, password, role } = body as {
        tenantId: string;
        email: string;
        name: string;
        password: string;
        role: string;
      };

      if (!tenantId || !email || !name || !password) {
        return NextResponse.json(
          { error: 'tenantId, email, name, and password are required' },
          { status: 400 }
        );
      }

      if (user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only create staff for your own tenant' },
          { status: 403 }
        );
      }

      if (!['MANAGER', 'AGENT'].includes(role)) {
        return NextResponse.json(
          { error: 'Role must be MANAGER or AGENT' },
          { status: 400 }
        );
      }

      // B1: Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        );
      }

      // C8 + C9: Password validation
      if (password.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 }
        );
      }
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

      const passwordHash = await hashPassword(password);
      const newId = crypto.randomUUID();

      // Check plan limits + email uniqueness + staff count
      const checks = await d1.batch([
        d1.prepare(
          `SELECT pl.max_staff as max_staff
           FROM tenants t JOIN plan_limits pl ON t.plan_tier = pl.plan_tier
           WHERE t.id = ?`
        ).bind(tenantId),
        d1.prepare('SELECT id FROM users WHERE email = ?').bind(email),
        d1.prepare('SELECT count(*) as cnt FROM users WHERE tenant_id = ? AND is_active = 1').bind(tenantId),
      ]);

      const tenantRow = (checks[0].results as { max_staff: number }[])[0];
      if (!tenantRow) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      const existingRow = (checks[1].results as { id: string }[])[0];
      if (existingRow) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }

      const currentCount = ((checks[2].results as { cnt: number }[])[0]?.cnt) ?? 0;
      if (currentCount >= tenantRow.max_staff) {
        return NextResponse.json(
          { error: 'Staff limit reached for your plan tier' },
          { status: 403 }
        );
      }

      // Create staff user
      try {
        await d1.prepare(
          `INSERT INTO users (id, tenant_id, email, name, password_hash, role, is_active)
           VALUES (?, ?, ?, ?, ?, ?, 1)`
        ).bind(newId, tenantId, email, name, passwordHash, role).run();
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('UNIQUE constraint failed')) {
          return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
        }
        throw err;
      }

      // Audit log
      const ip = getClientIp(req);

      await d1.prepare(
        `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address)
         VALUES (?, ?, ?, 'STAFF_CREATE', ?, ?)`
      ).bind(
        crypto.randomUUID(), user.userId, user.type,
        JSON.stringify({ newUserId: newId, email, role, tenantId }),
        ip
      ).run();

      return NextResponse.json(
        {
          staff: {
            id: newId,
            tenantId,
            email,
            name,
            role,
            isActive: true,
            createdAt: dbNow(),
          },
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Create staff error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// PUT: Update staff user (MANAGER only)
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { userId, name, role, isActive } = body as {
        userId: string;
        name?: string;
        role?: string;
        isActive?: boolean;
      };

      if (!userId) {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      // Verify target staff belongs to same tenant
      const target = await d1
        .prepare('SELECT id, tenant_id, role FROM users WHERE id = ?')
        .bind(userId)
        .first<{ id: string; tenant_id: string; role: string }>();

      if (!target || target.tenant_id !== user.tenantId) {
        return NextResponse.json({ error: 'Staff user not found' }, { status: 404 });
      }

      // Manager cannot deactivate other managers
      if (isActive === false && target.role === 'MANAGER') {
        return NextResponse.json(
          { error: 'Cannot deactivate a manager. Change their role to AGENT first.' },
          { status: 400 }
        );
      }

      const setClauses: string[] = [];
      const values: unknown[] = [];

      if (name !== undefined) {
        setClauses.push('name = ?');
        values.push(name);
      }
      if (role !== undefined) {
        if (!['MANAGER', 'AGENT'].includes(role)) {
          return NextResponse.json({ error: 'Role must be MANAGER or AGENT' }, { status: 400 });
        }
        setClauses.push('role = ?');
        values.push(role);
      }
      if (isActive !== undefined) {
        setClauses.push('is_active = ?');
        values.push(isActive ? 1 : 0);
      }

      if (setClauses.length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      }

      setClauses.push("updated_at = datetime('now')");
      values.push(userId); // WHERE id = ?

      await d1
        .prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run();

      // Fetch updated record
      const updated = await d1
        .prepare('SELECT id, tenant_id, email, name, role, is_active, created_at FROM users WHERE id = ?')
        .bind(userId)
        .first<{ id: string; tenant_id: string; email: string; name: string; role: string; is_active: number; created_at: string }>();

      // Audit log
      const ip = getClientIp(req);
      const now = dbNow();

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (role !== undefined) updateData.role = role;
      if (isActive !== undefined) updateData.isActive = isActive;

      await d1.prepare(
        `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address)
         VALUES (?, ?, ?, 'STAFF_UPDATE', ?, ?)`
      ).bind(
        crypto.randomUUID(), user.userId, user.type,
        JSON.stringify({ targetUserId: userId, updateData }),
        ip
      ).run();

      return NextResponse.json({
        staff: {
          id: updated!.id,
          tenantId: updated!.tenant_id,
          email: updated!.email,
          name: updated!.name,
          role: updated!.role,
          isActive: updated!.is_active === 1,
        },
      });
    } catch (error) {
      console.error('Update staff error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// DELETE: Soft-delete staff (MANAGER only, cannot deactivate self)
export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { userId } = body as { userId: string };

      if (!userId) {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      // Cannot deactivate self
      if (userId === user.userId) {
        return NextResponse.json(
          { error: 'Cannot deactivate your own account' },
          { status: 400 }
        );
      }

      // Verify target belongs to same tenant
      const target = await d1
        .prepare('SELECT id, tenant_id, email, role FROM users WHERE id = ?')
        .bind(userId)
        .first<{ id: string; tenant_id: string; email: string; role: string }>();

      if (!target || target.tenant_id !== user.tenantId) {
        return NextResponse.json({ error: 'Staff user not found' }, { status: 404 });
      }

      // Cannot deactivate managers
      if (target.role === 'MANAGER') {
        return NextResponse.json(
          { error: 'Cannot deactivate a manager. Change their role to AGENT first.' },
          { status: 400 }
        );
      }

      await d1
        .prepare("UPDATE users SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
        .bind(userId)
        .run();

      // Audit log
      const ip = getClientIp(req);

      await d1.prepare(
        `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address)
         VALUES (?, ?, ?, 'STAFF_DEACTIVATE', ?, ?)`
      ).bind(
        crypto.randomUUID(), user.userId, user.type,
        JSON.stringify({ targetUserId: userId, targetEmail: target.email }),
        ip
      ).run();

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Deactivate staff error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);