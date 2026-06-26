import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { registerTenantDatabase } from '@/lib/tenant-db';
import type { JwtPayload } from '@/lib/auth';

// POST: Create new tenant (PLATFORM_ADMIN only)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const {
        name,
        planTier,
        masterTenantId,
        walletBalance,
      } = body as {
        name: string;
        planTier?: string;
        masterTenantId?: string;
        walletBalance?: number;
      };

      if (!name) {
        return NextResponse.json(
          { error: 'name is required' },
          { status: 400 }
        );
      }

      // B5: Validate planTier
      const VALID_TIERS = ['FREE', 'PRO', 'ENTERPRISE'];
      const tier = planTier || 'FREE';
      if (!VALID_TIERS.includes(tier)) {
        return NextResponse.json(
          { error: 'Invalid planTier. Must be one of: FREE, PRO, ENTERPRISE' },
          { status: 400 }
        );
      }

      // B6: Validate walletBalance
      if (walletBalance !== undefined) {
        if (typeof walletBalance !== 'number' || !Number.isFinite(walletBalance) || walletBalance < 0 || walletBalance > 100000000) {
          return NextResponse.json(
            { error: 'walletBalance must be a non-negative number ≤ 100,000,000' },
            { status: 400 }
          );
        }
      }

      if (masterTenantId) {
        const master = await db.masterTenant.findUnique({
          where: { id: masterTenantId },
        });
        if (!master) {
          return NextResponse.json(
            { error: 'Master tenant not found' },
            { status: 404 }
          );
        }
      }

      const tenant = await db.tenant.create({
        data: {
          name,
          planTier: tier,
          masterTenantId: masterTenantId || null,
          walletBalance: walletBalance ?? 50000,
        },
      });

      // Create isolated tenant database with a Tenant record for FK integrity
      await registerTenantDatabase(tenant.id, {
        name: tenant.name,
        planTier: tenant.planTier,
        walletBalance: tenant.walletBalance,
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
          action: 'TENANT_CREATE',
          details: JSON.stringify({
            tenantId: tenant.id,
            name,
            planTier: tier,
            masterTenantId,
            walletBalance: walletBalance ?? 50000,
          }),
          ipAddress: ip,
        },
      });

      // H-03: Filter sensitive fields from response
      const safeTenant = {
        id: tenant.id,
        name: tenant.name,
        planTier: tenant.planTier,
        masterTenantId: tenant.masterTenantId,
        isActive: tenant.isActive,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      };

      return NextResponse.json({ tenant: safeTenant }, { status: 201 });
    } catch (error) {
      console.error('Create tenant error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);

// PUT: Update tenant (PLATFORM_ADMIN | MANAGER)
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { tenantId, name, planTier, isActive } = body as {
        tenantId: string;
        name?: string;
        planTier?: string;
        isActive?: boolean;
      };

      if (!tenantId) {
        return NextResponse.json(
          { error: 'tenantId is required' },
          { status: 400 }
        );
      }

      // MANAGER can only update own tenant name
      if (user.role === 'MANAGER') {
        if (user.tenantId !== tenantId) {
          return NextResponse.json(
            { error: 'You can only update your own tenant' },
            { status: 403 }
          );
        }

        if (planTier !== undefined || isActive !== undefined) {
          return NextResponse.json(
            { error: 'Managers can only update tenant name' },
            { status: 403 }
          );
        }

        if (!name) {
          return NextResponse.json(
            { error: 'name is required' },
            { status: 400 }
          );
        }

        const updated = await db.tenant.update({
          where: { id: tenantId },
          data: { name },
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
            action: 'TENANT_UPDATE',
            details: JSON.stringify({ tenantId, name }),
            ipAddress: ip,
          },
        });

        // H-04: Filter sensitive fields from response for MANAGER
        const safeTenant = {
          id: updated.id,
          name: updated.name,
          planTier: updated.planTier,
          isActive: updated.isActive,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };

        return NextResponse.json({ tenant: safeTenant });
      }

      // PLATFORM_ADMIN: full update
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        return NextResponse.json(
          { error: 'Tenant not found' },
          { status: 404 }
        );
      }

      // B5: Validate planTier on update
      if (planTier !== undefined) {
        const VALID_TIERS = ['FREE', 'PRO', 'ENTERPRISE'];
        if (!VALID_TIERS.includes(planTier)) {
          return NextResponse.json(
            { error: 'Invalid planTier. Must be one of: FREE, PRO, ENTERPRISE' },
            { status: 400 }
          );
        }
      }
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (planTier !== undefined) updateData.planTier = planTier;
      if (isActive !== undefined) updateData.isActive = isActive;

      const updated = await db.tenant.update({
        where: { id: tenantId },
        data: updateData,
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
          action: 'TENANT_UPDATE',
          details: JSON.stringify({ tenantId, updateData }),
          ipAddress: ip,
        },
      });

      // H-04: Filter sensitive fields from response for PLATFORM_ADMIN
      const safeTenant = {
        id: updated.id,
        name: updated.name,
        planTier: updated.planTier,
        masterTenantId: updated.masterTenantId,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };

      return NextResponse.json({ tenant: safeTenant });
    } catch (error) {
      console.error('Update tenant error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['PLATFORM_ADMIN', 'MANAGER'] }
);

// DELETE: Soft-delete tenant (PLATFORM_ADMIN only)
export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { tenantId } = body as { tenantId: string };

      if (!tenantId) {
        return NextResponse.json(
          { error: 'tenantId is required' },
          { status: 400 }
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

      await db.tenant.update({
        where: { id: tenantId },
        data: { isActive: false },
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
          action: 'TENANT_DELETE',
          details: JSON.stringify({ tenantId, name: tenant.name }),
          ipAddress: ip,
        },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Delete tenant error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);