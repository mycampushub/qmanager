import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  upgradePasswordHash,
  signToken,
  generateCsrfToken,
  rateLimit,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
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

    // Rate limit per email
    const { allowed, retryAfterMs } = rateLimit('login:' + email, 5, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
        }
      );
    }

    // A8 + A13: IP-based rate limit (20/min) with fallback to connection.remoteAddress
    const ipForwarded = req.headers.get('x-forwarded-for');
    const ip = ipForwarded || req.headers.get('x-real-ip') ||
      // @ts-expect-error NextRequest extends Request, connection may not be typed
      (req.connection?.remoteAddress as string) || 'unknown';

    const { allowed: ipAllowed, retryAfterMs: ipRetryAfterMs } = rateLimit('login-ip:' + ip, 20, 60_000);
    if (!ipAllowed) {
      return NextResponse.json(
        { error: 'Too many login attempts from your IP. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(ipRetryAfterMs / 1000)) },
        }
      );
    }

    // Try platform admin first
    const platformAdmin = await db.platformAdmin.findUnique({
      where: { email },
    });

    if (platformAdmin) {
      const valid = await upgradePasswordHash(
        email,
        password,
        platformAdmin.passwordHash,
        'platform_admin'
      );
      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        );
      }

      const token = signToken({
        userId: platformAdmin.id,
        role: 'PLATFORM_ADMIN',
        type: 'platform_admin',
      });

      const csrfToken = generateCsrfToken();

      // Audit log
      await db.auditLog.create({
        data: {
          userId: platformAdmin.id,
          userType: 'platform_admin',
          action: 'LOGIN',
          details: JSON.stringify({ email }),
          ipAddress: ip,
        },
      });

      return NextResponse.json({
        user: {
          id: platformAdmin.id,
          email: platformAdmin.email,
          name: platformAdmin.name,
          role: 'PLATFORM_ADMIN',
          type: 'platform_admin',
        },
        token,
        csrfToken,
      });
    }

    // Try staff user
    const staffUser = await db.staffUser.findUnique({
      where: { email },
      include: { tenant: true },
    });

    if (!staffUser) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (!staffUser.isActive) {
      return NextResponse.json(
        { error: 'Account is deactivated. Contact your manager.' },
        { status: 403 }
      );
    }

    const valid = await upgradePasswordHash(
      email,
      password,
      staffUser.passwordHash
    );
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const token = signToken({
      userId: staffUser.id,
      tenantId: staffUser.tenantId,
      role: staffUser.role as 'MANAGER' | 'AGENT',
      type: 'staff',
    });

    const csrfToken = generateCsrfToken();

    // Audit log
    await db.auditLog.create({
      data: {
        userId: staffUser.id,
        userType: 'staff',
        action: 'LOGIN',
        details: JSON.stringify({ email, tenantId: staffUser.tenantId }),
        ipAddress: ip,
      },
    });

    return NextResponse.json({
      user: {
        id: staffUser.id,
        email: staffUser.email,
        name: staffUser.name,
        role: staffUser.role,
        type: 'staff',
        tenantId: staffUser.tenantId,
        tenant: staffUser.tenant
          ? {
              id: staffUser.tenant.id,
              name: staffUser.tenant.name,
              planTier: staffUser.tenant.planTier,
            }
          : null,
      },
      token,
      csrfToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}