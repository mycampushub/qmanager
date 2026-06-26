import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

export const GET = withAuth(async (_req: NextRequest, ctx: { user: JwtPayload }) => {
  const { user } = ctx;

  try {
    if (user.type === 'platform_admin') {
      const admin = await db.platformAdmin.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
        },
      });

      if (!admin) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json({
        user: {
          ...admin,
          role: 'PLATFORM_ADMIN',
          type: 'platform_admin',
        },
      });
    }

    // Staff user
    const staff = await db.staffUser.findUnique({
      where: { id: user.userId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            planTier: true,
            isActive: true,
          },
        },
      },
    });

    if (!staff || !staff.isActive) {
      return NextResponse.json({ error: 'User not found or deactivated' }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
        type: 'staff' as const,
        tenantId: staff.tenantId,
        tenant: staff.tenant,
        isActive: staff.isActive,
      },
    });
  } catch (error) {
    console.error('Me error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});