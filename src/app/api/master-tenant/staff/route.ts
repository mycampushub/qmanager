import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

export const GET = withAuth(
  async (_req: NextRequest, ctx: { user: JwtPayload }) => {
    try {
      const masterTenantId = ctx.user.masterTenantId;
      if (!masterTenantId) {
        return NextResponse.json({ error: 'Not a master tenant admin' }, { status: 403 });
      }

      const d1 = await getD1FromEnv();
      const result = await d1
        .prepare(
          `SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.is_active, t.name as tenant_name
           FROM users u
           JOIN tenants t ON t.id = u.tenant_id
           WHERE t.master_tenant_id = ?
           ORDER BY t.name, u.role, u.name`
        )
        .bind(masterTenantId)
        .all<{
          id: string;
          tenant_id: string;
          email: string;
          name: string;
          role: string;
          is_active: number;
          tenant_name: string;
        }>();

      const staff = result.results.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        email: row.email,
        name: row.name,
        role: row.role,
        isActive: row.is_active === 1,
        branchName: row.tenant_name,
      }));

      return NextResponse.json({ staff });
    } catch (error) {
      console.error('Master tenant staff error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MASTER_TENANT_ADMIN'] }
);
