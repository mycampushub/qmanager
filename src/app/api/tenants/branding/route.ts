import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db, withTenantCtx } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

// GET: Public - anyone can read branding for display purposes
export async function GET(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId query parameter is required' },
        { status: 400 }
      );
    }

    const tenantData = await withTenantCtx(tenantId, async () => {
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          brandingConfig: true,
          welcomeMessage: true,
        },
      });
      return tenant;
    });

    if (!tenantData) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // B8: Wrap JSON.parse in try/catch to handle malformed stored data
    const branding = (() => {
      if (!tenantData.brandingConfig) {
        return {
          primaryColor: '#10b981',
          secondaryColor: '#059669',
          logoText: tenantData.name,
          welcomeMessage: tenantData.welcomeMessage || 'Welcome!',
        };
      }
      try {
        return JSON.parse(tenantData.brandingConfig);
      } catch {
        return {
          primaryColor: '#10b981',
          secondaryColor: '#059669',
          logoText: tenantData.name,
          welcomeMessage: tenantData.welcomeMessage || 'Welcome!',
        };
      }
    })();

    return NextResponse.json({
      tenantId: tenantData.id,
      tenantName: tenantData.name,
      branding,
    });
  } catch (error) {
    console.error('Get branding error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT: MANAGER | PLATFORM_ADMIN - update branding
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

      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        return NextResponse.json(
          { error: 'Tenant not found' },
          { status: 404 }
        );
      }

      // B9: Validate brandingConfig structure — only allow known string fields
      const ALLOWED_BRANDING_KEYS = ['primaryColor', 'secondaryColor', 'logoText', 'welcomeMessage'];
      const sanitizedConfig: Record<string, string> = {};
      for (const [key, value] of Object.entries(brandingConfig)) {
        if (ALLOWED_BRANDING_KEYS.includes(key) && typeof value === 'string' && value.length <= 500) {
          sanitizedConfig[key] = value;
        }
      }

      await db.tenant.update({
        where: { id: tenantId },
        data: {
          brandingConfig: JSON.stringify(sanitizedConfig),
          welcomeMessage:
            sanitizedConfig.welcomeMessage || tenant.welcomeMessage,
        },
      });

      // Audit log
      const ip =
        req.headers.get('x-forwarded-for') ||
        req.headers.get('x-real-ip') ||
        'unknown';

      await db.auditLog.create({
        data: {
          userId: user.userId,
          userType: user.type,
          action: 'BRANDING_UPDATE',
          details: JSON.stringify({ tenantId, brandingConfig }),
          ipAddress: ip,
        },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Update branding error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER', 'PLATFORM_ADMIN'] }
);