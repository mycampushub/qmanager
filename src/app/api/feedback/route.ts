import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import type { JwtPayload } from '@/lib/auth';

// ─── POST: Submit feedback (public for ticket holders, auth optional) ─

export async function POST(req: NextRequest) {
  try {
    const d1 = getD1FromEnv();
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
      // verifyToken is async — must await
      const user = await verifyToken(token);
      if (user && user.role !== 'PLATFORM_ADMIN' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only submit feedback for your tenant' },
          { status: 403 }
        );
      }
    }

    // Fetch ticket and verify
    const ticket = await d1
      .prepare('SELECT id, status FROM tickets WHERE id = ?')
      .bind(ticketId)
      .first<{ id: string; status: string }>();

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    if (ticket.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Feedback can only be submitted for completed tickets' },
        { status: 400 }
      );
    }

    // No duplicate feedback
    const existingFeedback = await d1
      .prepare('SELECT id FROM feedback WHERE ticket_id = ?')
      .bind(ticketId)
      .first<{ id: string }>();

    if (existingFeedback) {
      return NextResponse.json(
        { error: 'Feedback already submitted for this ticket' },
        { status: 409 }
      );
    }

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    await d1.prepare(
      `INSERT INTO feedback (id, tenant_id, ticket_id, rating, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(newId, tenantId, ticketId, Math.round(rating), comment || null, now).run();

    return NextResponse.json(
      {
        feedback: {
          id: newId,
          tenantId,
          ticketId,
          rating: Math.round(rating),
          comment: comment || null,
          createdAt: now,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Submit feedback error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── GET: List feedback ─────────────────────────────────────────

export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = getD1FromEnv();
      const tenantId = req.nextUrl.searchParams.get('tenantId') || user.tenantId;
      const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10);
      const limit = Math.min(
        parseInt(req.nextUrl.searchParams.get('limit') || '20', 10),
        100
      );
      const dateFrom = req.nextUrl.searchParams.get('from');
      const dateTo = req.nextUrl.searchParams.get('to');

      if (!tenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
      }

      if (user.role === 'MANAGER' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only view your own tenant data' },
          { status: 403 }
        );
      }

      // Build date filter clause
      let dateClause = '';
      const dateBinds: unknown[] = [];
      if (dateFrom) {
        dateClause += ' AND f.created_at >= ?';
        dateBinds.push(dateFrom);
      }
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        dateClause += ' AND f.created_at <= ?';
        dateBinds.push(d.toISOString());
      }

      const baseBinds = [tenantId, ...dateBinds];

      // Run all queries in parallel via batch
      const [countResult, feedbackResult, avgResult, ratingCountResult] = await d1.batch([
        d1.prepare(`SELECT count(*) as cnt FROM feedback f WHERE tenant_id = ?${dateClause}`).bind(...baseBinds),
        d1.prepare(
          `SELECT f.id, f.ticket_id, f.rating, f.comment, f.created_at,
                  t.customer_name, t.serial_number, q.prefix
           FROM feedback f
           JOIN tickets t ON f.ticket_id = t.id
           JOIN queues q ON t.queue_id = q.id
           WHERE f.tenant_id = ?${dateClause}
           ORDER BY f.created_at DESC LIMIT ? OFFSET ?`
        ).bind(...baseBinds, limit, (page - 1) * limit),
        d1.prepare(`SELECT AVG(rating) as avg_rating FROM feedback WHERE tenant_id = ?${dateClause}`).bind(...baseBinds),
        d1.prepare(
          `SELECT rating, count(*) as cnt FROM feedback WHERE tenant_id = ?${dateClause} GROUP BY rating`
        ).bind(...baseBinds),
      ]);

      const total = ((countResult.results as { cnt: number }[])[0]?.cnt) ?? 0;
      const avgRating = (avgResult.results as { avg_rating: number | null }[])[0]?.avg_rating ?? 0;

      // Calculate NPS
      const ratingRows = (ratingCountResult.results as { rating: number; cnt: number }[]) ?? [];
      const totalRated = ratingRows.reduce((sum, rc) => sum + rc.cnt, 0);
      let promoters = 0;
      let detractors = 0;
      for (const rc of ratingRows) {
        if (rc.rating >= 5) promoters += rc.cnt;
        if (rc.rating <= 2) detractors += rc.cnt;
      }
      const npsScore = totalRated > 0 ? Math.round(((promoters - detractors) / totalRated) * 100) : 0;

      const feedbackRows = (feedbackResult.results as {
        id: string; ticket_id: string; rating: number; comment: string | null; created_at: string;
        customer_name: string; serial_number: number; prefix: string;
      }[]) ?? [];

      const enrichedFeedbacks = feedbackRows.map((f) => ({
        id: f.id,
        ticketId: f.ticket_id,
        rating: f.rating,
        comment: f.comment,
        createdAt: f.created_at,
        ticket: {
          customerName: f.customer_name,
          _formattedSerial: `${f.prefix}${String(f.serial_number).padStart(3, '0')}`,
        },
      }));

      return NextResponse.json({
        feedbacks: enrichedFeedbacks,
        total,
        page,
        limit,
        avgRating: avgRating ? Math.round(avgRating * 100) / 100 : 0,
        npsScore,
        ratingDistribution: ratingRows.map((rc) => ({
          rating: rc.rating,
          count: rc.cnt,
        })),
      });
    } catch (error) {
      console.error('List feedback error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER', 'PLATFORM_ADMIN'] }
);