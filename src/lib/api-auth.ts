// =============================================================================
// QueueFlow — Cloudflare Workers API Auth Wrapper
//
// Uses getCloudflareContext() for KV-backed rate limiting.
// CF Workers compatible: no AsyncLocalStorage, uses cf-connecting-ip.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { authenticateRequest, rateLimit, type JwtPayload } from '@/lib/auth';
import { getD1FromEnv } from '@/lib/db';

type RequireRole = 'PLATFORM_ADMIN' | 'MASTER_TENANT_ADMIN' | 'MANAGER' | 'AGENT';

interface AuthenticatedRequest {
  user: JwtPayload;
  d1?: D1Database;
  kv?: KVNamespace;
  ctx?: ExecutionContext;
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
  }
) {
  return async (req: NextRequest) => {
    // Rate limiting
    if (options?.rateLimit) {
      const rl = options.rateLimit;
      const ip = req.headers.get('cf-connecting-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        'unknown';

      // Get KV from Cloudflare context for distributed rate limiting
      let kv: KVNamespace | undefined;
      try {
        const { env } = await getCloudflareContext({ async: true });
        kv = env.RATE_LIMIT_KV as KVNamespace | undefined;
      } catch {
        // Fallback to in-memory if context unavailable (shouldn't happen in prod)
      }

      const key = `${rl.keyPrefix || 'api'}:${ip}`;
      const { allowed, retryAfterMs } = await rateLimit(key, rl.max ?? 60, rl.windowMs ?? 60_000, kv);
      if (!allowed) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
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

    // Active account check (platform_admins table has no is_active column)
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