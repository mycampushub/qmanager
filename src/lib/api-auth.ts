// =============================================================================
// QueueFlow — API Auth Wrapper (local SQLite version)
//
// Removed Cloudflare KV dependency — uses in-memory rate limiting only.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, rateLimit, type JwtPayload } from '@/lib/auth';
export type { JwtPayload };
import { getD1FromEnv, type D1Database } from '@/lib/db';
import { getClientIp } from '@/lib/utils';

type RequireRole = 'PLATFORM_ADMIN' | 'MASTER_TENANT_ADMIN' | 'MANAGER' | 'AGENT';

interface AuthenticatedRequest {
  user: JwtPayload;
  d1?: D1Database;
}

/**
 * Wraps an API handler with authentication + optional rate limiting + optional role check.
 */
export function withAuth<T extends AuthenticatedRequest>(
  handler: (req: NextRequest, ctx: T) => Promise<NextResponse> | NextResponse,
  options?: {
    roles?: RequireRole[];
    rateLimit?: { max?: number; windowMs?: number; keyPrefix?: string };
    requireTenantId?: boolean;
    public?: boolean;
    csrf?: boolean;
  }
) {
  return async (req: NextRequest) => {
    // Rate limiting (in-memory only for local dev)
    if (options?.rateLimit) {
      const rl = options.rateLimit;
      const ip = getClientIp(req);
      const key = `${rl.keyPrefix || 'api'}:${ip}`;
      const { allowed, retryAfterMs } = await rateLimit(key, rl.max ?? 60, rl.windowMs ?? 60_000);
      if (!allowed) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
        );
      }
    }

    // CSRF validation for state-changing requests
    if (options?.csrf && req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      const csrfToken = req.headers.get('X-CSRF-Token');
      if (!csrfToken || !/^[0-9a-f]{64}$/.test(csrfToken)) {
        return NextResponse.json(
          { error: 'Invalid or missing CSRF token. Please reload the page and try again.' },
          { status: 403 }
        );
      }
    }

    // Public endpoints — skip auth
    if (options?.public) {
      return handler(req, {} as T);
    }

    // Authentication
    const authResult = await authenticateRequest(req);
    if ('error' in authResult && authResult.error) {
      return NextResponse.json({ error: authResult.error.message }, { status: authResult.error.status });
    }

    const user = authResult.user;

    // Active account check
    try {
      const d1 = await getD1FromEnv();
      if (user.type === 'staff') {
        const row = await d1.prepare('SELECT is_active FROM users WHERE id = ?').bind(user.userId).first<{ is_active: number }>();
        if (!row || !row.is_active) {
          return NextResponse.json({ error: 'Account is deactivated. Contact your manager.' }, { status: 403 });
        }
      } else if (user.type === 'master_tenant_admin') {
        const row = await d1.prepare('SELECT is_active FROM master_tenant_admins WHERE id = ?').bind(user.userId).first<{ is_active: number }>();
        if (!row || !row.is_active) {
          return NextResponse.json({ error: 'Account is deactivated.' }, { status: 403 });
        }
      }
    } catch {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Role check
    if (options?.roles && options.roles.length > 0) {
      if (!options.roles.includes(user.role)) {
        return NextResponse.json(
          { error: 'Insufficient permissions for this action' },
          { status: 403 }
        );
      }
    }

    // Tenant ID check
    if (options?.requireTenantId && !user.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    return handler(req, { user } as T);
  };
}