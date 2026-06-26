import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db, withTenantCtx } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import type { JwtPayload } from '@/lib/auth';

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
      const user = verifyToken(token) as JwtPayload | null;
      if (user && user.role !== 'PLATFORM_ADMIN' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only view your own tenant data' },
          { status: 403 }
        );
      }
    }

    const tenantData = await withTenantCtx(tenantId, async () => {
      const profile = await db.customerProfile.findUnique({
        where: {
          tenantId_phone: {
            tenantId,
            phone,
          },
        },
      });

      if (!profile) {
        return null;
      }

      const tickets = await db.ticket.findMany({
        where: {
          tenantId,
          customerPhone: phone,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          queue: { select: { id: true, name: true, prefix: true } },
        },
      });

      return { profile, tickets };
    });

    if (!tenantData) {
      return NextResponse.json(
        { error: 'Customer profile not found' },
        { status: 404 }
      );
    }

    const { profile, tickets } = tenantData;

    const visitHistory = tickets.map((t) => ({
      id: t.id,
      serialNumber: t.serialNumber,
      formattedSerial: `${t.queue.prefix}${String(t.serialNumber).padStart(3, '0')}`,
      queueName: t.queue.name,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      servedAt: t.servedAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
    }));

    const tier = getLoyaltyTier(profile.totalVisits);

    // Calculate next tier info
    const currentTierIndex = LOYALTY_TIERS.findIndex(
      (t) => t.name === tier.name
    );
    const nextTier =
      currentTierIndex < LOYALTY_TIERS.length - 1
        ? LOYALTY_TIERS[currentTierIndex + 1]
        : null;
    const visitsToNextTier = nextTier
      ? nextTier.minVisits - profile.totalVisits
      : 0;

    return NextResponse.json({
      profile: {
        name: profile.name,
        totalVisits: profile.totalVisits,
        totalTickets: profile.totalTickets,
        completedTickets: profile.completedTickets,
        avgServiceTime: profile.avgServiceTime,
        lastVisitAt: profile.lastVisitAt?.toISOString() ?? null,
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

      // Upsert: create or update name only — counters are managed by join/complete routes
      const profile = await db.customerProfile.upsert({
        where: {
          tenantId_phone: {
            tenantId: effectiveTenantId,
            phone,
          },
        },
        create: {
          tenantId: effectiveTenantId,
          phone,
          name: name || null,
          totalVisits: 0,
          totalTickets: 0,
          completedTickets: 0,
          lastVisitAt: new Date(),
        },
        update: {
          name: name || undefined, // only update name if provided
        },
      });

      const tier = getLoyaltyTier(profile.totalVisits);

      return NextResponse.json(
        {
          profile: {
            id: profile.id,
            phone: profile.phone,
            name: profile.name,
            totalVisits: profile.totalVisits,
            totalTickets: profile.totalTickets,
            completedTickets: profile.completedTickets,
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