import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

// GET: List queues for user's tenant
export const GET = withAuth(
  async (_req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const tenantId = user.tenantId;
      if (!tenantId) {
        return NextResponse.json(
          { error: 'Tenant context required' },
          { status: 400 }
        );
      }

      const queues = await db.queue.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      });

      const queuesWithCounts = await Promise.all(
        queues.map(async (queue) => {
          const [waiting, serving] = await Promise.all([
            db.ticket.count({
              where: { queueId: queue.id, status: 'WAITING' },
            }),
            db.ticket.count({
              where: { queueId: queue.id, status: 'SERVING' },
            }),
          ]);

          return {
            ...queue,
            waitingCount: waiting,
            servingCount: serving,
          };
        })
      );

      return NextResponse.json({ queues: queuesWithCounts });
    } catch (error) {
      console.error('List queues error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['AGENT', 'MANAGER'], requireTenantId: true }
);

// POST: Create new queue (MANAGER only)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const {
        tenantId,
        name,
        description,
        prefix,
        defaultServiceTimeSec,
      } = body as {
        tenantId: string;
        name: string;
        description?: string;
        prefix: string;
        defaultServiceTimeSec?: number;
      };

      if (!tenantId || !name || !prefix) {
        return NextResponse.json(
          { error: 'tenantId, name, and prefix are required' },
          { status: 400 }
        );
      }

      // B3: String length limits
      if (name.length > 100) {
        return NextResponse.json(
          { error: 'Queue name must be at most 100 characters' },
          { status: 400 }
        );
      }
      if (prefix.length > 5) {
        return NextResponse.json(
          { error: 'Queue prefix must be at most 5 characters' },
          { status: 400 }
        );
      }

      // B4: Validate defaultServiceTimeSec
      if (defaultServiceTimeSec !== undefined) {
        if (!Number.isInteger(defaultServiceTimeSec) || defaultServiceTimeSec < 10 || defaultServiceTimeSec > 3600) {
          return NextResponse.json(
            { error: 'defaultServiceTimeSec must be an integer between 10 and 3600' },
            { status: 400 }
          );
        }
      }

      if (user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only create queues for your own tenant' },
          { status: 403 }
        );
      }

      // A18: Wrap count+create in db.$transaction to prevent race condition
      const queue = await db.$transaction(async (tx) => {
        // Check plan limits (maxQueues)
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { planTier: true },
        });

        if (!tenant) {
          throw new Error('TENANT_NOT_FOUND');
        }

        const planLimit = await tx.planLimit.findUnique({
          where: { planTier: tenant.planTier },
        });

        if (planLimit) {
          const currentQueueCount = await tx.queue.count({
            where: { tenantId, isActive: true },
          });
          if (currentQueueCount >= planLimit.maxQueues) {
            throw new Error(`QUEUE_LIMIT_REACHED:${planLimit.maxQueues}:${tenant.planTier}`);
          }
        }

        return tx.queue.create({
          data: {
            tenantId,
            name,
            description: description || null,
            prefix: prefix.toUpperCase(),
            defaultServiceTimeSec: defaultServiceTimeSec || 300,
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
          action: 'QUEUE_CREATE',
          details: JSON.stringify({ queueId: queue.id, name, prefix, tenantId }),
          ipAddress: ip,
        },
      });

      return NextResponse.json({ queue }, { status: 201 });
    } catch (error) {
      console.error('Create queue error:', error);
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'TENANT_NOT_FOUND') {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }
      if (msg.startsWith('QUEUE_LIMIT_REACHED')) {
        const [, max, tier] = msg.split(':');
        return NextResponse.json(
          { error: `Queue limit reached (${max} for ${tier} plan). Please upgrade your plan.` },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// PUT: Update queue (MANAGER only)
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const {
        queueId,
        name,
        description,
        prefix,
        defaultServiceTimeSec,
        isActive,
      } = body as {
        queueId: string;
        name?: string;
        description?: string;
        prefix?: string;
        defaultServiceTimeSec?: number;
        isActive?: boolean;
      };

      if (!queueId) {
        return NextResponse.json(
          { error: 'queueId is required' },
          { status: 400 }
        );
      }

      // Verify queue belongs to user's tenant
      const existing = await db.queue.findUnique({
        where: { id: queueId },
      });

      if (!existing || existing.tenantId !== user.tenantId) {
        return NextResponse.json(
          { error: 'Queue not found' },
          { status: 404 }
        );
      }

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (prefix !== undefined) {
        if (prefix.length > 5) {
          return NextResponse.json(
            { error: 'Queue prefix must be at most 5 characters' },
            { status: 400 }
          );
        }
        updateData.prefix = prefix.toUpperCase();
      }
      if (defaultServiceTimeSec !== undefined) {
        if (!Number.isInteger(defaultServiceTimeSec) || defaultServiceTimeSec < 10 || defaultServiceTimeSec > 3600) {
          return NextResponse.json(
            { error: 'defaultServiceTimeSec must be an integer between 10 and 3600' },
            { status: 400 }
          );
        }
        updateData.defaultServiceTimeSec = defaultServiceTimeSec;
      }
      if (isActive !== undefined) updateData.isActive = isActive;

      const queue = await db.queue.update({
        where: { id: queueId },
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
          action: 'QUEUE_UPDATE',
          details: JSON.stringify({ queueId, updateData }),
          ipAddress: ip,
        },
      });

      return NextResponse.json({ queue });
    } catch (error) {
      console.error('Update queue error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// DELETE: Soft-delete queue (MANAGER only)
export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { queueId } = body as { queueId: string };

      if (!queueId) {
        return NextResponse.json(
          { error: 'queueId is required' },
          { status: 400 }
        );
      }

      // Verify queue belongs to user's tenant
      const queue = await db.queue.findUnique({
        where: { id: queueId },
      });

      if (!queue || queue.tenantId !== user.tenantId) {
        return NextResponse.json(
          { error: 'Queue not found' },
          { status: 404 }
        );
      }

      // Only if no WAITING tickets
      const waitingCount = await db.ticket.count({
        where: { queueId, status: 'WAITING' },
      });

      if (waitingCount > 0) {
        return NextResponse.json(
          {
            error: `Cannot deactivate queue with ${waitingCount} waiting ticket(s). Complete or cancel them first.`,
          },
          { status: 400 }
        );
      }

      await db.queue.update({
        where: { id: queueId },
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
          action: 'QUEUE_DELETE',
          details: JSON.stringify({ queueId, name: queue.name }),
          ipAddress: ip,
        },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Delete queue error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);