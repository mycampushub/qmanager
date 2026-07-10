// =============================================================================
// QueueFlow — Cloudflare Workers API Auth Wrapper
// Replaces: src/lib/api-auth.ts
//
// Changes:
//   - Removed AsyncLocalStorage / withTenantCtx (not available on CF Workers)
//   - Uses cf-connecting-ip instead of connection.remoteAddress
//   - Passes tenantId explicitly instead of via context
//   - KV-backed rate limiting
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, rateLimit, type JwtPayload } from '@/lib/auth';

type RequireRole = 'PLATFORM_ADMIN' | 'MANAGER' | 'AGENT';

interface AuthenticatedRequest {
  user: JwtPayload;
  d1?: D1Database;
  kv?: KVNamespace;
  ctx?: ExecutionContext;
}

/**
 * Wraps an API handler with authentication + optional rate limiting + optional role check.
 *
 * CF Workers compatible: no AsyncLocalStorage, uses cf-connecting-ip, KV rate limits.
 * Tenant context is passed via user.tenantId (explicit, not AsyncLocalStorage).
 */
export function withAuth<T extends AuthenticatedRequest>(
  handler: (req: NextRequest, ctx: T) => Promise<NextResponse> | NextResponse,
  options?: {
    roles?: RequireRole[];
    rateLimit?: { max?: number; windowMs?: number; keyPrefix?: string };
    requireTenantId?: boolean;
    public?: boolean; // Skip auth entirely
  }
) {
  return async (req: NextRequest) => {
    // Rate limiting (public endpoints also get rate limited)
    if (options?.rateLimit) {
      const rl = options.rateLimit;
      const ip = req.headers.get('cf-connecting-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        'unknown';

      const key = `${rl.keyPrefix || 'api'}:${ip}`;
      const { allowed, retryAfterMs } = await rateLimit(key, rl.max ?? 60, rl.windowMs ?? 60_000);
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

    // Role check
    if (options?.roles && options.roles.length > 0) {
      if (!options.roles.includes(user.role)) {
        return NextResponse.json(
          { error: 'Insufficient permissions for this action' },
          { status: 403 }
        );
      }
    }

    // Tenant ID check (for staff-scoped routes)
    if (options?.requireTenantId && !user.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Call handler with user context (no AsyncLocalStorage needed)
    return handler(req, { user } as T);
  };
}

