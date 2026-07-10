import { NextRequest, NextResponse } from 'next/server';
import { getD1FromEnv } from '@/lib/db';
import {
  verifyPassword,
  signToken,
  generateCsrfToken,
  rateLimit,
  ensureDemoData,
} from '@/lib/auth';
import { getClientIp } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const d1 = await getD1FromEnv();

    // Auto-seed demo data on first login attempt
    await ensureDemoData(d1);

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

    // Rate limit per email (5/min)
    const { allowed, retryAfterMs } = await rateLimit('login:' + email, 5, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
        }
      );
    }

    // A8 + A13: IP-based rate limit (20/min) using cf-connecting-ip
    const ip = getClientIp(req);

    const { allowed: ipAllowed, retryAfterMs: ipRetryAfterMs } = await rateLimit('login-ip:' + ip, 20, 60_000);
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
    const adminRow = await d1
      .prepare('SELECT id, email, name, password_hash, created_at FROM platform_admins WHERE email = ?')
      .bind(email)
      .first<{ id: string; email: string; name: string; password_hash: string; created_at: string }>();

    if (adminRow) {
      const valid = await verifyPassword(password, adminRow.password_hash);
      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        );
      }

      const token = await signToken({
        userId: adminRow.id,
        role: 'PLATFORM_ADMIN',
        type: 'platform_admin',
      });

      const csrfToken = generateCsrfToken();

      // Audit log
      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at)
           VALUES (?, ?, 'platform_admin', 'LOGIN', ?, ?, datetime('now'))`
        )
        .bind(crypto.randomUUID(), adminRow.id, JSON.stringify({ email }), ip)
        .run();

      return NextResponse.json({
        user: {
          id: adminRow.id,
          email: adminRow.email,
          name: adminRow.name,
          role: 'PLATFORM_ADMIN',
          type: 'platform_admin',
        },
        token,
        csrfToken,
      });
    }

    // Try staff user
    const staffRow = await d1
      .prepare(
        `SELECT u.id, u.email, u.name, u.password_hash, u.role, u.is_active, u.tenant_id,
                t.id AS tenant_id_col, t.name AS tenant_name, t.plan_tier AS tenant_plan_tier
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         WHERE u.email = ?`
      )
      .bind(email)
      .first<{
        id: string;
        email: string;
        name: string;
        password_hash: string;
        role: string;
        is_active: number;
        tenant_id: string;
        tenant_id_col: string | null;
        tenant_name: string | null;
        tenant_plan_tier: string | null;
      }>();

    if (staffRow) {
      if (!staffRow.is_active) {
        return NextResponse.json(
          { error: 'Account is deactivated. Contact your manager.' },
          { status: 403 }
        );
      }

      const valid = await verifyPassword(password, staffRow.password_hash);
      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        );
      }

      const token = await signToken({
        userId: staffRow.id,
        tenantId: staffRow.tenant_id,
        role: staffRow.role as 'MANAGER' | 'AGENT',
        type: 'staff',
      });

      const csrfToken = generateCsrfToken();

      // Audit log
      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at)
           VALUES (?, ?, 'staff', 'LOGIN', ?, ?, datetime('now'))`
        )
        .bind(crypto.randomUUID(), staffRow.id, JSON.stringify({ email, tenantId: staffRow.tenant_id }), ip)
        .run();

      return NextResponse.json({
        user: {
          id: staffRow.id,
          email: staffRow.email,
          name: staffRow.name,
          role: staffRow.role,
          type: 'staff',
          tenantId: staffRow.tenant_id,
          tenant: staffRow.tenant_id_col
            ? {
                id: staffRow.tenant_id_col,
                name: staffRow.tenant_name!,
                planTier: staffRow.tenant_plan_tier!,
              }
            : null,
        },
        token,
        csrfToken,
      });
    }

    // Try master tenant admin
    const mtAdminRow = await d1
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

    if (mtAdminRow) {
      if (!mtAdminRow.is_active) {
        return NextResponse.json(
          { error: 'Account is deactivated. Contact your manager.' },
          { status: 403 }
        );
      }

      const valid = await verifyPassword(password, mtAdminRow.password_hash);
      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        );
      }

      const token = await signToken({
        userId: mtAdminRow.id,
        masterTenantId: mtAdminRow.master_tenant_id,
        role: 'MASTER_TENANT_ADMIN',
        type: 'master_tenant_admin',
      });

      const csrfToken = generateCsrfToken();

      // Audit log
      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at)
           VALUES (?, ?, 'master_tenant_admin', 'LOGIN', ?, ?, datetime('now'))`
        )
        .bind(crypto.randomUUID(), mtAdminRow.id, JSON.stringify({ email, masterTenantId: mtAdminRow.master_tenant_id }), ip)
        .run();

      return NextResponse.json({
        user: {
          id: mtAdminRow.id,
          email: mtAdminRow.email,
          name: mtAdminRow.name,
          role: 'MASTER_TENANT_ADMIN',
          type: 'master_tenant_admin',
          masterTenantId: mtAdminRow.master_tenant_id,
          masterTenant: {
            id: mtAdminRow.master_tenant_id,
            corporateName: mtAdminRow.corporate_name,
            billingStatus: mtAdminRow.billing_status,
          },
        },
        token,
        csrfToken,
      });
    }

    // Not found in any user table
    return NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}