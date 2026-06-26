import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

// GET: List all master tenants with their sub-tenants
export const GET = withAuth(
  async (_req: NextRequest, _ctx: { user: JwtPayload }) => {
    try {
      const masterTenants = await db.masterTenant.findMany({
        include: {
          tenants: {
            select: {
              id: true,
              name: true,
              planTier: true,
              walletBalance: true,
              isActive: true,
              createdAt: true,
            },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { corporateName: 'asc' },
      });

      return NextResponse.json({ masterTenants });
    } catch (error) {
      console.error('List master tenants error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);

// POST: Create master tenant
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { corporateName } = body as { corporateName: string };

      if (!corporateName) {
        return NextResponse.json(
          { error: 'corporateName is required' },
          { status: 400 }
        );
      }

      // B14: Max length 200
      if (corporateName.length > 200) {
        return NextResponse.json(
          { error: 'corporateName must be at most 200 characters' },
          { status: 400 }
        );
      }

      // B13: Uniqueness check
      const existing = await db.masterTenant.findUnique({
        where: { corporateName },
      });
      if (existing) {
        return NextResponse.json(
          { error: 'A master tenant with this name already exists' },
          { status: 409 }
        );
      }

      const masterTenant = await db.masterTenant.create({
        data: { corporateName },
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
          action: 'MASTER_TENANT_CREATE',
          details: JSON.stringify({
            masterTenantId: masterTenant.id,
            corporateName,
          }),
          ipAddress: ip,
        },
      });

      return NextResponse.json({ masterTenant }, { status: 201 });
    } catch (error) {
      console.error('Create master tenant error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);