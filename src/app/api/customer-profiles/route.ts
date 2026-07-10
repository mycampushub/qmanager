import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import type { JwtPayload as JwtPayloadFull } from '@/lib/auth';

// ─── Loyalty Tier Logic ─────────────────────────────────────────

interface LoyaltyTier {
  name: string;
  minVisits: number;
  color: string;
}

const LOYALTY_TIERS: LoyaltyTier[] = [
  { name: 'New', minVisits: 0, color: '#9ca3af' },
  { name: 'Bronze', minVisits: 3, color: '#cd7f32' },
  { name: 'Silver', minVisits: 10, color: '#c0c0c0' },
  { name: 'Gold', minVisits: 25, color: '#ffd700' },
  { name: 'Platinum', minVisits: 50, color: '#e5e4e2' },
  { name: 'Diamond', minVisits: 100, color: '#b9f2ff' },
];

function getLoyaltyTier(totalVisits: number): LoyaltyTier {
  let tier = LOYALTY_TIERS[0];
  for (const t of LOYALTY_TIERS) {
    if (totalVisits >= t.minVisits) {
      tier = t;
    }
  }
  return tier;
}

// ─── Types for D1 rows ──────────────────────────────────────────

interface CustomerProfileRow {
  id: string;
  tenant_id: string;
  phone: string;
  name: string | null;
  total_visits: number;
  total_tickets: number;
  completed_tickets: number;
  avg_service_time: number | null;
  last_visit_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TicketWithQueueRow {
  id: string;
  tenant_id: string;
  queue_id: string;
  serial_number: number;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  served_at: string | null;
  completed_at: string | null;
  queue_name: string | null;
  queue_prefix: string | null;
}

// ─── GET: Get customer profile (public when tenantId+phone provided) ─

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get('tenantId');
    const phone = req.nextUrl.searchParams.get('phone');

    if (!tenantId || !phone) {
      return NextResponse.json(
        { error: 'tenantId and phone query params are required' },
        { status: 400 }
      );
    }

    // If auth header present, validate tenant ownership
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const user = await verifyToken(token) as JwtPayloadFull | null;
      if (user && user.role !== 'PLATFORM_ADMIN' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only view your own tenant data' },
          { status: 403 }
        );
      }
    }

    const d1 = getD1FromEnv();

    const profile = await d1
      .prepare(
        'SELECT * FROM customer_profiles WHERE tenant_id = ? AND phone = ?'
      )
      .bind(tenantId, phone)
      .first<CustomerProfileRow>();

    if (!profile) {
      return NextResponse.json(
        { error: 'Customer profile not found' },
        { status: 404 }
      );
    }

    const ticketsResult = await d1
      .prepare(
        `SELECT t.*, q.name AS queue_name, q.prefix AS queue_prefix
         FROM tickets t
         LEFT JOIN queues q ON t.queue_id = q.id
         WHERE t.tenant_id = ? AND t.customer_phone = ?
         ORDER BY t.created_at DESC
         LIMIT 10`
      )
      .bind(tenantId, phone)
      .all<TicketWithQueueRow>();

    const tickets = ticketsResult.results;

    const visitHistory = tickets.map((t) => ({
      id: t.id,
      serialNumber: t.serial_number,
      formattedSerial: `${t.queue_prefix ?? ''}${String(t.serial_number).padStart(3, '0')}`,
      queueName: t.queue_name,
      status: t.status,
      createdAt: t.created_at,
      servedAt: t.served_at ?? null,
      completedAt: t.completed_at ?? null,
    }));

    const tier = getLoyaltyTier(profile.total_visits);

    // Calculate next tier info
    const currentTierIndex = LOYALTY_TIERS.findIndex(
      (t) => t.name === tier.name
    );
    const nextTier =
      currentTierIndex < LOYALTY_TIERS.length - 1
        ? LOYALTY_TIERS[currentTierIndex + 1]
        : null;
    const visitsToNextTier = nextTier
      ? nextTier.minVisits - profile.total_visits
      : 0;

    return NextResponse.json({
      profile: {
        name: profile.name,
        totalVisits: profile.total_visits,
        totalTickets: profile.total_tickets,
        completedTickets: profile.completed_tickets,
        avgServiceTime: profile.avg_service_time,
        lastVisitAt: profile.last_visit_at ?? null,
        loyaltyTier: tier.name,
      },
      loyalty: {
        tier: tier.name,
        color: tier.color,
        nextTier: nextTier?.name ?? null,
        visitsToNextTier: nextTier ? visitsToNextTier : null,
      },
      visitHistory,
    });
  } catch (error) {
    console.error('Get customer profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── POST: Upsert customer profile ──────────────────────────────

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { tenantId, phone, name } = body as {
        tenantId: string;
        phone: string;
        name?: string;
      };

      const effectiveTenantId = tenantId || user.tenantId;

      if (!effectiveTenantId || !phone) {
        return NextResponse.json(
          { error: 'tenantId and phone are required' },
          { status: 400 }
        );
      }

      if (user.role === 'MANAGER' && user.tenantId !== effectiveTenantId) {
        return NextResponse.json(
          { error: 'You can only manage your own tenant' },
          { status: 403 }
        );
      }

      const d1 = getD1FromEnv();

      // Check if profile already exists
      const existing = await d1
        .prepare(
          'SELECT * FROM customer_profiles WHERE tenant_id = ? AND phone = ?'
        )
        .bind(effectiveTenantId, phone)
        .first<CustomerProfileRow>();

      const now = new Date().toISOString();

      if (existing) {
        // Update: only update name if provided
        if (name !== undefined && name !== null) {
          await d1
            .prepare(
              'UPDATE customer_profiles SET name = ?, updated_at = ? WHERE id = ?'
            )
            .bind(name, now, existing.id)
            .run();
        }

        // Return the profile
        const tier = getLoyaltyTier(existing.total_visits);

        return NextResponse.json(
          {
            profile: {
              id: existing.id,
              phone: existing.phone,
              name: name !== undefined ? name : existing.name,
              totalVisits: existing.total_visits,
              totalTickets: existing.total_tickets,
              completedTickets: existing.completed_tickets,
              loyaltyTier: tier.name,
            },
          },
          { status: 201 }
        );
      }

      // Insert new profile
      const id = crypto.randomUUID();
      await d1
        .prepare(
          `INSERT INTO customer_profiles (id, tenant_id, phone, name, total_visits, total_tickets, completed_tickets, last_visit_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`
        )
        .bind(id, effectiveTenantId, phone, name ?? null, now, now, now)
        .run();

      const tier = getLoyaltyTier(0);

      return NextResponse.json(
        {
          profile: {
            id,
            phone,
            name: name ?? null,
            totalVisits: 0,
            totalTickets: 0,
            completedTickets: 0,
            loyaltyTier: tier.name,
          },
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Upsert customer profile error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER', 'AGENT'] }
);