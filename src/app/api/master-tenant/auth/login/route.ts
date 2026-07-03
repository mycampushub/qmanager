import { NextRequest, NextResponse } from 'next/server';
import { getD1FromEnv } from '@/lib/db';
import { verifyPassword, signToken, rateLimit } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body as { email: string; password: string };

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Rate limit
    const ip =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    const { allowed, retryAfterMs } = await rateLimit('mt-login:' + ip, 10, 300_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const d1 = await getD1FromEnv();

    // Look up master tenant admin
    const admin = await d1
      .prepare(
        `SELECT mta.id, mta.master_tenant_id, mta.email, mta.name, mta.password_hash, mta.is_active,
                mt.corporate_name, mt.billing_status
         FROM master_tenant_admins mta
         JOIN master_tenants mt ON mt.id = mta.master_tenant_id
         WHERE mta.email = ?`
      )
      .bind(email)
      .first<{
        id: string;
        master_tenant_id: string;
        email: string;
        name: string;
        password_hash: string;
        is_active: number;
        corporate_name: string;
        billing_status: string;
      }>();

    if (!admin) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (admin.is_active !== 1) {
      return NextResponse.json({ error: 'Account is deactivated' }, { status: 403 });
    }

    const valid = await verifyPassword(password, admin.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Sign JWT
    const token = await signToken({
      userId: admin.id,
      masterTenantId: admin.master_tenant_id,
      role: 'MASTER_TENANT_ADMIN',
      type: 'master_tenant_admin',
    });

    return NextResponse.json({
      success: true,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: 'MASTER_TENANT_ADMIN',
        type: 'master_tenant_admin',
        masterTenantId: admin.master_tenant_id,
        masterTenant: {
          id: admin.master_tenant_id,
          corporateName: admin.corporate_name,
          billingStatus: admin.billing_status,
        },
      },
      token,
    });
  } catch (error) {
    console.error('Master tenant login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}