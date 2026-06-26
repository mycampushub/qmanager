import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db, withTenantCtx } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import type { JwtPayload } from '@/lib/auth';

// ─── POST: Submit feedback (public for ticket holders, auth optional) ─

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticketId, tenantId, rating, comment } = body as {
      ticketId: string;
      tenantId: string;
      rating: number;
      comment?: string;
    };

    if (!ticketId || !tenantId || !rating) {
      return NextResponse.json(
        { error: 'ticketId, tenantId, and rating are required' },
        { status: 400 }
      );
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'rating must be an integer 1-5' },
        { status: 400 }
      );
    }

    // If auth header present, validate tenant ownership
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const user = verifyToken(token) as JwtPayload | null;
      if (user && user.role !== 'PLATFORM_ADMIN' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only submit feedback for your tenant' },
          { status: 403 }
        );
      }
    }

    const feedback = await withTenantCtx(tenantId, async () => {
      // Fetch ticket and verify
      const ticket = await db.ticket.findUnique({
        where: { id: ticketId },
      });

      if (!ticket) {
        throw new Error('NOT_FOUND:Ticket not found');
      }

      // Ticket must be COMPLETED
      if (ticket.status !== 'COMPLETED') {
        throw new Error('VALIDATION:Feedback can only be submitted for completed tickets');
      }

      // No duplicate feedback
      const existingFeedback = await db.feedback.findUnique({ where: { ticketId } });
      if (existingFeedback) {
        throw new Error('CONFLICT:Feedback already submitted for this ticket');
      }

      return db.feedback.create({
        data: {
          tenantId,
          ticketId,
          rating: Math.round(rating),
          comment: comment || null,
        },
      });
    });

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message.startsWith('NOT_FOUND:')) {
        return NextResponse.json({ error: error.message.slice(10) }, { status: 404 });
      }
      if (error.message.startsWith('VALIDATION:')) {
        return NextResponse.json({ error: error.message.slice(11) }, { status: 400 });
      }
      if (error.message.startsWith('CONFLICT:')) {
        return NextResponse.json({ error: error.message.slice(9) }, { status: 409 });
      }
    }
    console.error('Submit feedback error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── GET: List feedback ─────────────────────────────────────────

export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const tenantId = req.nextUrl.searchParams.get('tenantId') || user.tenantId;
      const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10);
      const limit = Math.min(
        parseInt(req.nextUrl.searchParams.get('limit') || '20', 10),
        100
      );
      const dateFrom = req.nextUrl.searchParams.get('from');
      const dateTo = req.nextUrl.searchParams.get('to');

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

      // Date filter
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) {
        dateFilter.gte = new Date(dateFrom);
      }
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        dateFilter.lte = d;
      }

      const where: Record<string, unknown> = { tenantId };
      if (Object.keys(dateFilter).length > 0) {
        where.createdAt = dateFilter;
      }

      const [total, feedbacks, avgResult, ratingCounts] = await Promise.all([
        db.feedback.count({ where }),
        db.feedback.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            ticket: {
              select: {
                id: true,
                customerName: true,
                serialNumber: true,
                queue: { select: { prefix: true } },
              },
            },
          },
        }),
        db.feedback.aggregate({
          where, // M-13: apply date filter to average calculation
          _avg: { rating: true },
        }),
        // D6: Fetch rating distribution for NPS calculation
        db.feedback.groupBy({
          by: ['rating'],
          where, // M-13: apply date filter to NPS calculation
          _count: { rating: true },
        }),
      ]);

      // D6: Calculate NPS (adapted for 1-5 scale: Promoters=5, Passives=3-4, Detractors=1-2)
      const totalRated = ratingCounts.reduce((sum, rc) => sum + rc._count.rating, 0);
      let promoters = 0;
      let detractors = 0;
      for (const rc of ratingCounts) {
        if (rc.rating >= 5) promoters += rc._count.rating;
        if (rc.rating <= 2) detractors += rc._count.rating;
      }
      const npsScore = totalRated > 0 ? Math.round(((promoters - detractors) / totalRated) * 100) : 0;

      const enrichedFeedbacks = feedbacks.map((f) => ({
        id: f.id,
        ticketId: f.ticketId,
        rating: f.rating,
        comment: f.comment,
        createdAt: f.createdAt.toISOString(),
        ticket: {
          customerName: f.ticket.customerName,
          _formattedSerial: `${f.ticket.queue.prefix}${String(f.ticket.serialNumber).padStart(3, '0')}`,
        },
      }));

      return NextResponse.json({
        feedbacks: enrichedFeedbacks,
        total,
        page,
        limit,
        avgRating: avgResult._avg.rating
          ? Math.round(avgResult._avg.rating * 100) / 100
          : 0,
        npsScore,
        ratingDistribution: ratingCounts.map((rc) => ({
          rating: rc.rating,
          count: rc._count.rating,
        })),
      });
    } catch (error) {
      console.error('List feedback error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER', 'PLATFORM_ADMIN'] }
);