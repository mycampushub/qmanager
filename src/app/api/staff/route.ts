import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db, withTenantCtx } from '@/lib/db';
import { getTenantDb } from '@/lib/tenant-db';
import { hashPassword } from '@/lib/auth';
import type { JwtPayload } from '@/lib/auth';

// GET: List staff users
export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      if (user.role === 'MANAGER') {
        // Return staff for own tenant only
        const staff = await db.staffUser.findMany({
          where: { tenantId: user.tenantId },
          select: {
            id: true,
            tenantId: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ staff });
      }

      // PLATFORM_ADMIN: accept optional tenantId filter with pagination (C1)
      const tenantIdParam = req.nextUrl.searchParams.get('tenantId');
      const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10);
      const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20', 10);
      const safePage = isNaN(page) || page < 1 ? 1 : page;
      const safeLimit = isNaN(limit) || limit < 1 ? 20 : Math.min(limit, 100);
      const where: Record<string, unknown> = {};
      if (tenantIdParam) where.tenantId = tenantIdParam;

      const [staff, total] = await Promise.all([
        db.staffUser.findMany({
          where,
          select: {
            id: true,
            tenantId: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
            tenant: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (safePage - 1) * safeLimit,
          take: safeLimit,
        }),
        db.staffUser.count({ where }),
      ]);

      return NextResponse.json({
        staff,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit),
        },
      });
    } catch (error) {
      console.error('List staff error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER', 'PLATFORM_ADMIN'] }
);

// POST: Create staff user (MANAGER only)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    // Override the withAuth tenant context — StaffUser ops target the platform DB
    return withTenantCtx(null, async () => {
      try {
        const body = await req.json();
        const { tenantId, email, name, password, role } = body as {
          tenantId: string;
          email: string;
          name: string;
          password: string;
          role: string;
        };

        if (!tenantId || !email || !name || !password) {
          return NextResponse.json(
            { error: 'tenantId, email, name, and password are required' },
            { status: 400 }
          );
        }

        if (user.tenantId !== tenantId) {
          return NextResponse.json(
            { error: 'You can only create staff for your own tenant' },
            { status: 403 }
          );
        }

        if (!['MANAGER', 'AGENT'].includes(role)) {
          return NextResponse.json(
            { error: 'Role must be MANAGER or AGENT' },
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

        // C8 + C9: Password validation
        if (password.length < 8) {
          return NextResponse.json(
            { error: 'Password must be at least 8 characters' },
            { status: 400 }
          );
        }
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

        // A17: Wrap count+create in db.$transaction to prevent race condition
        const staffUser = await db.$transaction(async (tx) => {
          // Check plan limits (maxStaff) — platform DB
          const tenant = await tx.tenant.findUnique({
            where: { id: tenantId },
            select: { planTier: true },
          });

          if (!tenant) {
            throw new Error('Tenant not found');
          }

          const planLimit = await tx.planLimit.findUnique({
            where: { planTier: tenant.planTier },
          });

          if (planLimit) {
            const currentStaffCount = await tx.staffUser.count({
              where: { tenantId, isActive: true },
            });
            if (currentStaffCount >= planLimit.maxStaff) {
              throw new Error('Staff limit reached for your plan tier');
            }
          }

          // Check email uniqueness
          const existing = await tx.staffUser.findUnique({
            where: { email },
          });

          if (existing) {
            throw new Error('EMAIL_EXISTS');
          }

          const passwordHash = await hashPassword(password);

          return tx.staffUser.create({
            data: {
              tenantId,
              email,
              name,
              passwordHash,
              role,
            },
            select: {
              id: true,
              tenantId: true,
              email: true,
              name: true,
              role: true,
              isActive: true,
              createdAt: true,
            },
          });
        });

        // Sync StaffUser to tenant DB for FK integrity
        const tenantDb = getTenantDb(tenantId);
        await tenantDb.staffUser.upsert({
          where: { email },
          update: {
            name, role,
            passwordHash: await hashPassword(password),
            isActive: true,
          },
          create: {
            id: staffUser.id,
            tenantId,
            email,
            name,
            passwordHash: await hashPassword(password),
            role,
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
            action: 'STAFF_CREATE',
            details: JSON.stringify({
              newUserId: staffUser.id,
              email,
              role,
              tenantId,
            }),
            ipAddress: ip,
          },
        });

        return NextResponse.json({ staff: staffUser }, { status: 201 });
      } catch (error) {
        console.error('Create staff error:', error);
        const msg = error instanceof Error ? error.message : '';
        if (msg === 'Tenant not found') {
          return NextResponse.json({ error: msg }, { status: 404 });
        }
        if (msg === 'Staff limit reached for your plan tier') {
          return NextResponse.json({ error: msg }, { status: 403 });
        }
        if (msg === 'EMAIL_EXISTS') {
          return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
        }
        return NextResponse.json(
          { error: 'Internal server error' },
          { status: 500 }
        );
      }
    });
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// PUT: Update staff user (MANAGER only)
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    return withTenantCtx(null, async () => {
      try {
        const body = await req.json();
        const { userId, name, role, isActive } = body as {
          userId: string;
          name?: string;
          role?: string;
          isActive?: boolean;
        };

        if (!userId) {
          return NextResponse.json(
            { error: 'userId is required' },
            { status: 400 }
          );
        }

        // Verify target staff belongs to same tenant
        const target = await db.staffUser.findUnique({
          where: { id: userId },
        });

        if (!target || target.tenantId !== user.tenantId) {
          return NextResponse.json(
            { error: 'Staff user not found' },
            { status: 404 }
          );
        }

        // Manager cannot deactivate other managers
        if (isActive === false && target.role === 'MANAGER') {
          return NextResponse.json(
            { error: 'Cannot deactivate a manager. Change their role to AGENT first.' },
            { status: 400 }
          );
        }

        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (role !== undefined) {
          if (!['MANAGER', 'AGENT'].includes(role)) {
            return NextResponse.json(
              { error: 'Role must be MANAGER or AGENT' },
              { status: 400 }
            );
          }
          updateData.role = role;
        }
        if (isActive !== undefined) updateData.isActive = isActive;

        const updated = await db.staffUser.update({
          where: { id: userId },
          data: updateData,
          select: {
            id: true,
            tenantId: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
          },
        });

        // Sync update to tenant DB
        const tenantDb = getTenantDb(target.tenantId);
        await tenantDb.staffUser.update({
          where: { id: userId },
          data: updateData,
        }).catch(() => {
          // Staff record may not exist in tenant DB yet — upsert instead
          tenantDb.staffUser.upsert({
            where: { id: userId },
            update: updateData,
            create: {
              id: target.id,
              tenantId: target.tenantId,
              email: target.email,
              passwordHash: target.passwordHash,
              name: (name as string) || target.name,
              role: (role as string) || target.role,
              isActive: isActive !== undefined ? (isActive as boolean) : target.isActive,
            },
          });
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
            action: 'STAFF_UPDATE',
            details: JSON.stringify({ targetUserId: userId, updateData }),
            ipAddress: ip,
          },
        });

        return NextResponse.json({ staff: updated });
      } catch (error) {
        console.error('Update staff error:', error);
        return NextResponse.json(
          { error: 'Internal server error' },
          { status: 500 }
        );
      }
    });
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// DELETE: Soft-delete staff (MANAGER only, cannot deactivate self)
export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    return withTenantCtx(null, async () => {
      try {
        const body = await req.json();
        const { userId } = body as { userId: string };

        // C5: Accept userId in request body instead of query param
        if (!userId) {
          return NextResponse.json(
            { error: 'userId is required' },
            { status: 400 }
          );
        }

        // Cannot deactivate self
        if (userId === user.userId) {
          return NextResponse.json(
            { error: 'Cannot deactivate your own account' },
            { status: 400 }
          );
        }

        // Verify target belongs to same tenant
        const target = await db.staffUser.findUnique({
          where: { id: userId },
        });

        if (!target || target.tenantId !== user.tenantId) {
          return NextResponse.json(
            { error: 'Staff user not found' },
            { status: 404 }
          );
        }

        // Cannot deactivate managers
        if (target.role === 'MANAGER') {
          return NextResponse.json(
            { error: 'Cannot deactivate a manager. Change their role to AGENT first.' },
            { status: 400 }
          );
        }

        await db.staffUser.update({
          where: { id: userId },
          data: { isActive: false },
        });

        // Sync deactivation to tenant DB
        const tenantDb = getTenantDb(target.tenantId);
        await tenantDb.staffUser.update({
          where: { id: userId },
          data: { isActive: false },
        }).catch(() => {});

        // Audit log
        const ip =
          req.headers.get('x-forwarded-for') ||
          req.headers.get('x-real-ip') ||
          'unknown';

        await db.auditLog.create({
          data: {
            userId: user.userId,
            userType: user.type,
            action: 'STAFF_DEACTIVATE',
            details: JSON.stringify({ targetUserId: userId, targetEmail: target.email }),
            ipAddress: ip,
          },
        });

        return NextResponse.json({ success: true });
      } catch (error) {
        console.error('Deactivate staff error:', error);
        return NextResponse.json(
          { error: 'Internal server error' },
          { status: 500 }
        );
      }
    });
  },
  { roles: ['MANAGER'], requireTenantId: true }
);