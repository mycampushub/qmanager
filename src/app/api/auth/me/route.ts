import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

export const GET = withAuth(async (_req: NextRequest, ctx: { user: JwtPayload }) => {
  const { user } = ctx;

  try {
    const d1 = await getD1FromEnv();

    if (user.type === 'platform_admin') {
      const admin = await d1
        .prepare('SELECT id, email, name, created_at FROM platform_admins WHERE id = ?')
        .bind(user.userId)
        .first<{ id: string; email: string; name: string; created_at: string }>();

      if (!admin) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json({
        user: {
          ...admin,
          role: 'PLATFORM_ADMIN',
          type: 'platform_admin',
        },
      });
    }

    // Staff user — query users table with tenant info
    const staff = await d1
      .prepare(
        `SELECT u.id, u.email, u.name, u.role, u.is_active, u.tenant_id,
                t.id AS tenant_id_col, t.name AS tenant_name, t.plan_tier AS tenant_plan_tier, t.is_active AS tenant_is_active
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         WHERE u.id = ?`
      )
      .bind(user.userId)
      .first<{
        id: string;
        email: string;
        name: string;
        role: string;
        is_active: number;
        tenant_id: string;
        tenant_id_col: string | null;
        tenant_name: string | null;
        tenant_plan_tier: string | null;
        tenant_is_active: number | null;
      }>();

    if (!staff || !staff.is_active) {
      return NextResponse.json({ error: 'User not found or deactivated' }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
        type: 'staff' as const,
        tenantId: staff.tenant_id,
        tenant: staff.tenant_id_col
          ? {
              id: staff.tenant_id_col,
              name: staff.tenant_name!,
              planTier: staff.tenant_plan_tier!,
              isActive: !!staff.tenant_is_active,
            }
          : null,
        isActive: !!staff.is_active,
      },
    });
  } catch (error) {
    console.error('Me error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});