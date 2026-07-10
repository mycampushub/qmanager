import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

export const GET = withAuth(
  async (req: NextRequest, _ctx: { user: JwtPayload }) => {
    try {
      const d1 = await getD1FromEnv();
      const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10);
      const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50', 10), 100);
      const safePage = isNaN(page) || page < 1 ? 1 : page;
      const safeLimit = isNaN(limit) || limit < 1 ? 50 : limit;
      const offset = (safePage - 1) * safeLimit;

      const [countResult, logResult] = await d1.batch([
        d1.prepare('SELECT count(*) as cnt FROM audit_logs').bind(),
        d1.prepare(
          `SELECT al.id, al.user_id, al.user_type, al.action, al.details, al.ip_address, al.created_at,
                  COALESCE(u.name, pa.name) as actor_name, COALESCE(u.email, pa.email) as actor_email
           FROM audit_logs al
           LEFT JOIN users u ON al.user_id = u.id
           LEFT JOIN platform_admins pa ON al.user_id = pa.id
           ORDER BY al.created_at DESC
           LIMIT ? OFFSET ?`
        ).bind(safeLimit, offset),
      ]);

      const total = ((countResult.results as { cnt: number }[])[0]?.cnt) ?? 0;
      const logs = logResult.results as Array<{
        id: string; user_id: string; user_type: string; action: string;
        details: string; ip_address: string; created_at: string;
        actor_name: string | null; actor_email: string | null;
      }>;

      return NextResponse.json({
        logs: logs.map(l => ({
          id: l.id,
          userId: l.user_id,
          userType: l.user_type,
          action: l.action,
          details: l.details,
          ipAddress: l.ip_address,
          actorName: l.actor_name,
          actorEmail: l.actor_email,
          createdAt: l.created_at,
        })),
        pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
      });
    } catch (error) {
      console.error('Audit log error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);