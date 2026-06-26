import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { registerTenantDatabase, getTenantDb } from '@/lib/tenant-db';
import { hashPassword, signToken, rateLimit, generateCsrfToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessName, email, name, password, planTier } = body as {
      businessName: string;
      email: string;
      name: string;
      password: string;
      planTier?: string;
    };

    if (!businessName || !email || !name || !password) {
      return NextResponse.json(
        { error: 'businessName, email, name, and password are required' },
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

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // C9: Password complexity
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

    // H-01: Always force FREE tier on self-registration. Plan upgrades are admin-only.
    const tier = 'FREE';

    // Rate limit: 3 per hour per IP — A13 fallback
    const ipForwarded = req.headers.get('x-forwarded-for');
    const ip = ipForwarded || req.headers.get('x-real-ip') ||
      // @ts-expect-error NextRequest extends Request, connection may not be typed
      (req.connection?.remoteAddress as string) || 'unknown';

    const { allowed, retryAfterMs } = rateLimit('register:' + ip, 3, 3_600_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
        }
      );
    }

    // H-02: Create tenant + manager in a single transaction to prevent email race condition
    // Email uniqueness is enforced by DB @unique constraints inside the transaction.
    const passwordHash = await hashPassword(password);

    let result: { tenant: { id: string; name: string; planTier: string }; staff: { id: string; email: string; name: string; tenantId: string } };
    try {
      result = await db.$transaction(async (tx) => {
        // Double-check email uniqueness inside transaction (DB constraint is the real guard)
        const existingEmail = await tx.staffUser.findUnique({ where: { email } })
          || await tx.platformAdmin.findUnique({ where: { email } });
        if (existingEmail) {
          throw new Error('CONFLICT:email');
        }

        const tenant = await tx.tenant.create({
          data: {
            name: businessName,
            planTier: tier,
            walletBalance: 50000, // Default 500 TK
          },
        });

        const staff = await tx.staffUser.create({
          data: {
            tenantId: tenant.id,
            email,
            name,
            passwordHash,
            role: 'MANAGER',
          },
        });

        // Create default queue so the tenant can immediately start accepting tickets
        await tx.queue.create({
          data: {
            tenantId: tenant.id,
            name: 'General Service',
            prefix: 'A',
            defaultServiceTimeSec: 300,
          },
        });

        return { tenant, staff };
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'CONFLICT:email') {
        return NextResponse.json(
          { error: 'Email already registered' },
          { status: 409 }
        );
      }
      // Prisma unique constraint violation (P2002) — race condition caught at DB level
      if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
        return NextResponse.json(
          { error: 'Email already registered' },
          { status: 409 }
        );
      }
      throw error;
    }

    // Create isolated tenant database with a Tenant record for FK integrity
    await registerTenantDatabase(result.tenant.id, {
      name: result.tenant.name,
      planTier: result.tenant.planTier,
      walletBalance: result.tenant.walletBalance,
    });

    // Sync StaffUser to tenant DB for FK integrity (ServiceLog.agentId)
    const tenantDb = getTenantDb(result.tenant.id);
    await tenantDb.staffUser.create({
      data: {
        id: result.staff.id,
        tenantId: result.tenant.id,
        email: result.staff.email,
        name: result.staff.name,
        passwordHash,
        role: 'MANAGER',
      },
    }).catch(() => {});

    // Sign token for auto-login
    const token = signToken({
      userId: result.staff.id,
      tenantId: result.tenant.id,
      role: 'MANAGER',
      type: 'staff',
    });

    const csrfToken = generateCsrfToken();

    // Audit log
    await db.auditLog.create({
      data: {
        userId: result.staff.id,
        userType: 'staff',
        action: 'REGISTRATION',
        details: JSON.stringify({
          email,
          tenantId: result.tenant.id,
          businessName,
          planTier: tier,
        }),
        ipAddress: ip,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully!',
        user: {
          id: result.staff.id,
          email: result.staff.email,
          name: result.staff.name,
          role: 'MANAGER',
          type: 'staff',
          tenantId: result.tenant.id,
          tenant: {
            id: result.tenant.id,
            name: result.tenant.name,
            planTier: result.tenant.planTier,
          },
        },
        token,
        csrfToken,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}