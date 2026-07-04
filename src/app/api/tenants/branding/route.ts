import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';
import { getClientIp } from '@/lib/utils';

// GET: Public — anyone can read branding for display purposes
export async function GET(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId query parameter is required' },
        { status: 400 }
      );
    }

    const d1 = await getD1FromEnv();

    const tenant = await d1
      .prepare(`SELECT id, name, branding_config, welcome_message FROM tenants WHERE id = ?`)
      .bind(tenantId)
      .first<{ id: string; name: string; branding_config: string | null; welcome_message: string | null }>();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // B8: Wrap JSON.parse in try/catch to handle malformed stored data
    const branding = (() => {
      if (!tenant.branding_config) {
        return {
          primaryColor: '#10b981',
          secondaryColor: '#059669',
          logoText: tenant.name,
          welcomeMessage: tenant.welcome_message || 'Welcome!',
        };
      }
      try {
        return JSON.parse(tenant.branding_config);
      } catch {
        return {
          primaryColor: '#10b981',
          secondaryColor: '#059669',
          logoText: tenant.name,
          welcomeMessage: tenant.welcome_message || 'Welcome!',
        };
      }
    })();

    return NextResponse.json({
      tenantId: tenant.id,
      tenantName: tenant.name,
      branding,
    });
  } catch (error) {
    console.error('Get branding error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: MANAGER | PLATFORM_ADMIN — update branding
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { tenantId, brandingConfig } = body as {
        tenantId: string;
        brandingConfig: Record<string, unknown>;
      };

      if (!tenantId || !brandingConfig) {
        return NextResponse.json(
          { error: 'tenantId and brandingConfig are required' },
          { status: 400 }
        );
      }

      // MANAGER can only update own tenant
      if (user.role === 'MANAGER' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only update your own tenant branding' },
          { status: 403 }
        );
      }

      const d1 = await getD1FromEnv();

      const tenant = await d1
        .prepare(`SELECT id, welcome_message FROM tenants WHERE id = ?`)
        .bind(tenantId)
        .first<{ id: string; welcome_message: string | null }>();

      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      // B9: Validate brandingConfig structure — only allow known string fields
      const ALLOWED_BRANDING_KEYS = ['primaryColor', 'secondaryColor', 'logoText', 'welcomeMessage'];
      const sanitizedConfig: Record<string, string> = {};
      for (const [key, value] of Object.entries(brandingConfig)) {
        if (ALLOWED_BRANDING_KEYS.includes(key) && typeof value === 'string' && value.length <= 500) {
          sanitizedConfig[key] = value;
        }
      }

      const ip = getClientIp(req);

      await d1.batch([
        d1
          .prepare(
            `UPDATE tenants SET branding_config = ?, welcome_message = ?, updated_at = datetime('now') WHERE id = ?`
          )
          .bind(
            JSON.stringify(sanitizedConfig),
            sanitizedConfig.welcomeMessage || tenant.welcome_message,
            tenantId
          ),
        d1
          .prepare(
            `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address) VALUES (?, ?, ?, 'BRANDING_UPDATE', ?, ?)`
          )
          .bind(
            crypto.randomUUID(),
            user.userId,
            user.type,
            JSON.stringify({ tenantId, brandingConfig }),
            ip
          ),
      ]);

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Update branding error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER', 'PLATFORM_ADMIN'] }
);