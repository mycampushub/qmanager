import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ─── Validation helpers ─────────────────────────────────────────

function validateServiceWindowBody(body: Record<string, unknown>): string | null {
  const { dayOfWeek, openTime, closeTime } = body;

  if (dayOfWeek === undefined || typeof dayOfWeek !== 'number' || dayOfWeek < 0 || dayOfWeek > 6) {
    return 'dayOfWeek must be an integer 0-6 (Sunday=0)';
  }

  if (typeof openTime !== 'string' || !TIME_REGEX.test(openTime)) {
    return 'openTime must be in HH:mm format (00:00–23:59)';
  }

  if (typeof closeTime !== 'string' || !TIME_REGEX.test(closeTime)) {
    return 'closeTime must be in HH:mm format (00:00–23:59)';
  }

  // openTime must be before closeTime unless isClosed is true
  if (!body.isClosed && openTime >= closeTime) {
    return 'openTime must be before closeTime';
  }

  return null;
}

// ─── GET: List service windows ──────────────────────────────────

export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const tenantId = req.nextUrl.searchParams.get('tenantId') || user.tenantId;
      const queueId = req.nextUrl.searchParams.get('queueId');

      if (!tenantId) {
        return NextResponse.json(
          { error: 'tenantId is required' },
          { status: 400 }
        );
      }

      if (user.role === 'MANAGER' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only view your own tenant data' },
          { status: 403 }
        );
      }

      const where: Record<string, unknown> = {
        tenantId,
        isActive: true,
      };

      if (queueId) {
        where.queueId = queueId;
      }

      const windows = await db.serviceWindow.findMany({
        where,
        orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
        include: {
          queue: { select: { id: true, name: true, prefix: true } },
        },
      });

      return NextResponse.json({ serviceWindows: windows });
    } catch (error) {
      console.error('List service windows error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER', 'PLATFORM_ADMIN'] }
);

// ─── POST: Create service window ────────────────────────────────

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { tenantId, queueId, dayOfWeek, openTime, closeTime, isClosed } = body as {
        tenantId?: string;
        queueId?: string;
        dayOfWeek: number;
        openTime: string;
        closeTime: string;
        isClosed?: boolean;
      };

      const effectiveTenantId = tenantId || user.tenantId;
      if (!effectiveTenantId) {
        return NextResponse.json(
          { error: 'tenantId is required' },
          { status: 400 }
        );
      }

      if (user.role === 'MANAGER' && user.tenantId !== effectiveTenantId) {
        return NextResponse.json(
          { error: 'You can only manage your own tenant' },
          { status: 403 }
        );
      }

      const validationError = validateServiceWindowBody(body);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      // Check for duplicate day+queue combination
      const duplicateWhere: Record<string, unknown> = {
        tenantId: effectiveTenantId,
        dayOfWeek,
        isActive: true,
      };
      if (queueId) {
        duplicateWhere.queueId = queueId;
      } else {
        duplicateWhere.queueId = null;
      }

      const existing = await db.serviceWindow.findFirst({ where: duplicateWhere });
      if (existing) {
        return NextResponse.json(
          { error: 'A service window already exists for this day and queue' },
          { status: 409 }
        );
      }

      // If queueId provided, verify it belongs to the tenant
      if (queueId) {
        const queue = await db.queue.findUnique({ where: { id: queueId } });
        if (!queue || queue.tenantId !== effectiveTenantId) {
          return NextResponse.json(
            { error: 'Queue not found or does not belong to this tenant' },
            { status: 400 }
          );
        }
      }

      const window = await db.serviceWindow.create({
        data: {
          tenantId: effectiveTenantId,
          queueId: queueId || null,
          dayOfWeek,
          openTime,
          closeTime,
          isClosed: Boolean(isClosed),
        },
        include: {
          queue: { select: { id: true, name: true, prefix: true } },
        },
      });

      return NextResponse.json({ serviceWindow: window }, { status: 201 });
    } catch (error) {
      console.error('Create service window error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'] }
);

// ─── PUT: Update service window ─────────────────────────────────

export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { id, dayOfWeek, openTime, closeTime, isClosed, queueId } = body as {
        id: string;
        dayOfWeek?: number;
        openTime?: string;
        closeTime?: string;
        isClosed?: boolean;
        queueId?: string | null;
      };

      if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
      }

      const existing = await db.serviceWindow.findUnique({ where: { id } });
      if (!existing || !existing.isActive) {
        return NextResponse.json(
          { error: 'Service window not found' },
          { status: 404 }
        );
      }

      if (user.role === 'MANAGER' && user.tenantId !== existing.tenantId) {
        return NextResponse.json(
          { error: 'You can only manage your own tenant' },
          { status: 403 }
        );
      }

      // Build update payload, only validate fields that are present
      const updateData: Record<string, unknown> = {};

      if (dayOfWeek !== undefined) {
        if (typeof dayOfWeek !== 'number' || dayOfWeek < 0 || dayOfWeek > 6) {
          return NextResponse.json(
            { error: 'dayOfWeek must be an integer 0-6' },
            { status: 400 }
          );
        }
        updateData.dayOfWeek = dayOfWeek;
      }

      if (openTime !== undefined) {
        if (typeof openTime !== 'string' || !TIME_REGEX.test(openTime)) {
          return NextResponse.json(
            { error: 'openTime must be in HH:mm format' },
            { status: 400 }
          );
        }
        updateData.openTime = openTime;
      }

      if (closeTime !== undefined) {
        if (typeof closeTime !== 'string' || !TIME_REGEX.test(closeTime)) {
          return NextResponse.json(
            { error: 'closeTime must be in HH:mm format' },
            { status: 400 }
          );
        }
        updateData.closeTime = closeTime;
      }

      // Validate open < close if both provided or one updated
      const effectiveOpen = openTime ?? existing.openTime;
      const effectiveClose = closeTime ?? existing.closeTime;
      const effectiveIsClosed = isClosed ?? existing.isClosed;
      if (!effectiveIsClosed && effectiveOpen >= effectiveClose) {
        return NextResponse.json(
          { error: 'openTime must be before closeTime' },
          { status: 400 }
        );
      }

      if (isClosed !== undefined) {
        updateData.isClosed = Boolean(isClosed);
      }

      if (queueId !== undefined) {
        if (queueId) {
          const queue = await db.queue.findUnique({ where: { id: queueId } });
          if (!queue || queue.tenantId !== existing.tenantId) {
            return NextResponse.json(
              { error: 'Queue not found or does not belong to this tenant' },
              { status: 400 }
            );
          }
        }
        updateData.queueId = queueId;
      }

      // Check duplicate day+queue if day or queue changed
      if (dayOfWeek !== undefined || queueId !== undefined) {
        const checkDay = dayOfWeek ?? existing.dayOfWeek;
        const checkQueue = queueId !== undefined ? queueId : existing.queueId;
        const dupWhere: Record<string, unknown> = {
          tenantId: existing.tenantId,
          dayOfWeek: checkDay,
          isActive: true,
          id: { not: id },
        };
        if (checkQueue) {
          dupWhere.queueId = checkQueue;
        } else {
          dupWhere.queueId = null;
        }
        const duplicate = await db.serviceWindow.findFirst({ where: dupWhere });
        if (duplicate) {
          return NextResponse.json(
            { error: 'A service window already exists for this day and queue' },
            { status: 409 }
          );
        }
      }

      const window = await db.serviceWindow.update({
        where: { id },
        data: updateData,
        include: {
          queue: { select: { id: true, name: true, prefix: true } },
        },
      });

      return NextResponse.json({ serviceWindow: window });
    } catch (error) {
      console.error('Update service window error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'] }
);

// ─── DELETE: Soft-delete service window ─────────────────────────

export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const id = req.nextUrl.searchParams.get('id');
      if (!id) {
        return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
      }

      const existing = await db.serviceWindow.findUnique({ where: { id } });
      if (!existing || !existing.isActive) {
        return NextResponse.json(
          { error: 'Service window not found' },
          { status: 404 }
        );
      }

      if (user.role === 'MANAGER' && user.tenantId !== existing.tenantId) {
        return NextResponse.json(
          { error: 'You can only manage your own tenant' },
          { status: 403 }
        );
      }

      await db.serviceWindow.update({
        where: { id },
        data: { isActive: false },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Delete service window error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'] }
);