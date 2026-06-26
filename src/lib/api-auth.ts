import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, rateLimit, type JwtPayload } from '@/lib/auth';
import { withTenantCtx } from '@/lib/db';

type RequireRole = 'PLATFORM_ADMIN' | 'MANAGER' | 'AGENT';

interface AuthenticatedRequest {
  user: JwtPayload;
}

/**
 * Wraps an API handler with authentication + optional rate limiting + optional role check.
 * Usage:
 *   export const GET = withAuth(handler);                          // any authenticated user
 *   export const POST = withAuth(handler, { rateLimit: { max: 10, windowMs: 60_000 } });
 *   export const PUT = withAuth(handler, { roles: ['MANAGER'] });  // manager only
 */
export function withAuth<T extends AuthenticatedRequest>(
  handler: (req: NextRequest, ctx: T) => Promise<NextResponse> | NextResponse,
  options?: {
    roles?: RequireRole[];
    rateLimit?: { max?: number; windowMs?: number; keyPrefix?: string };
    requireTenantId?: boolean;
  }
) {
  return async (req: NextRequest) => {
    // Rate limiting
    if (options?.rateLimit) {
      const rl = options.rateLimit;
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') ||
        // A13: Fallback to connection.remoteAddress
        // @ts-expect-error NextRequest extends Request, connection may not be typed
        (req.connection?.remoteAddress as string) || 'unknown';
      const key = `${rl.keyPrefix || 'api'}:${ip}`;
      const { allowed, retryAfterMs } = rateLimit(key, rl.max ?? 60, rl.windowMs ?? 60_000);
      if (!allowed) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
        );
      }
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

    return withTenantCtx(user.tenantId ?? null, () => handler(req, { user } as T));
  };
}