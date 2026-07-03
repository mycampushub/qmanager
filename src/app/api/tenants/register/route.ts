import { NextRequest, NextResponse } from 'next/server';
import { getD1FromEnv } from '@/lib/db';
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
    const ip = req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') || 'unknown';

    const { allowed, retryAfterMs } = await rateLimit('register:' + ip, 3, 3_600_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
        }
      );
    }

    const d1 = await getD1FromEnv();

    // H-02: Create tenant + manager in a single transaction to prevent email race condition
    const passwordHash = await hashPassword(password);

    // Double-check email uniqueness before attempting insert
    const existingUser = await d1
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first<{ id: string }>();
    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    const existingAdmin = await d1
      .prepare('SELECT id FROM platform_admins WHERE email = ?')
      .bind(email)
      .first<{ id: string }>();
    if (existingAdmin) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    const tenantId = crypto.randomUUID();
    const staffId = crypto.randomUUID();
    const queueId = crypto.randomUUID();
    const now = new Date().toISOString();

    let result: { tenantId: string; staffId: string; email: string; name: string };
    try {
      // Atomic batch: create tenant, staff user, and default queue in one transaction
      await d1.batch([
        d1.prepare(
          `INSERT INTO tenants (id, name, plan_tier, wallet_balance, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`
        ).bind(tenantId, businessName, tier, 50000, now, now),
        d1.prepare(
          `INSERT INTO users (id, tenant_id, email, name, password_hash, role, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'MANAGER', 1, ?, ?)`
        ).bind(staffId, tenantId, email, name, passwordHash, now, now),
        d1.prepare(
          `INSERT INTO queues (id, tenant_id, name, prefix, default_service_time_sec, current_serial, now_serving_serial, is_active, created_at, updated_at)
           VALUES (?, ?, ?, 'A', 300, 0, 0, 1, ?, ?)`
        ).bind(queueId, tenantId, 'General Service', now, now),
      ]);
      result = { tenantId, staffId, email, name };
    } catch (error: unknown) {
      // Handle SQLite UNIQUE constraint violation (race condition caught at DB level)
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return NextResponse.json(
          { error: 'Email already registered' },
          { status: 409 }
        );
      }
      throw error;
    }

    // Sign token for auto-login
    const token = await signToken({
      userId: result.staffId,
      tenantId: result.tenantId,
      role: 'MANAGER',
      type: 'staff',
    });

    const csrfToken = generateCsrfToken();

    // Audit log
    await d1.prepare(
      `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at)
       VALUES (?, ?, 'staff', 'REGISTRATION', ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      result.staffId,
      JSON.stringify({
        email: result.email,
        tenantId: result.tenantId,
        businessName,
        planTier: tier,
      }),
      ip,
      new Date().toISOString()
    ).run();

    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully!',
        user: {
          id: result.staffId,
          email: result.email,
          name: result.name,
          role: 'MANAGER',
          type: 'staff',
          tenantId: result.tenantId,
          tenant: {
            id: result.tenantId,
            name: businessName,
            planTier: tier,
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