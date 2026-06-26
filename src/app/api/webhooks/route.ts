import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';
import crypto from 'crypto';

const MAX_WEBHOOKS_PER_TENANT = 10;

// ─── Helpers ────────────────────────────────────────────────────

// H-09: SSRF protection — block private IPs, link-local, loopback, and metadata endpoints
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();

    // Block loopback
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;

    // Block link-local / private ranges
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return false;
    if (hostname.startsWith('172.') && /^\d+$/.test(hostname.split('.')[1])) {
      const second = parseInt(hostname.split('.')[1], 10);
      if (second >= 16 && second <= 31) return false;
    }
    if (hostname.startsWith('169.254.')) return false; // AWS/GCP metadata
    if (hostname === 'metadata.google.internal') return false;
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;

    // Block raw IPs that aren't public
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      // Allow only public IPs (simplified: block 0.x, 127.x, 10.x, 172.16-31.x, 192.168.x)
      const octets = hostname.split('.').map(Number);
      if (octets[0] === 0 || octets[0] === 127) return false;
      if (octets[0] === 10) return false;
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
      if (octets[0] === 192 && octets[1] === 168) return false;
    }

    return true;
  } catch {
    return false;
  }
}

function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Mask secret: show only last 4 characters */
function maskSecret(secret: string): string {
  if (secret.length <= 4) return '****';
  return '*'.repeat(secret.length - 4) + secret.slice(-4);
}

// ─── GET: List webhooks ─────────────────────────────────────────

export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const tenantId = req.nextUrl.searchParams.get('tenantId') || user.tenantId;
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

      const webhooks = await db.webhook.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });

      // Mask secrets before sending to client
      const masked = webhooks.map((w) => ({
        ...w,
        secret: maskSecret(w.secret),
        lastTriggeredAt: w.lastTriggeredAt?.toISOString() ?? null,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
      }));

      return NextResponse.json({ webhooks: masked });
    } catch (error) {
      console.error('List webhooks error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'] }
);

// ─── POST: Create webhook ───────────────────────────────────────

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { url, events, secret } = body as {
        url?: string;
        events?: string[];
        secret?: string;
      };

      const tenantId = user.tenantId;
      if (!tenantId) {
        return NextResponse.json(
          { error: 'Tenant context required' },
          { status: 400 }
        );
      }

      if (!url || !events || !Array.isArray(events) || events.length === 0) {
        return NextResponse.json(
          { error: 'url and non-empty events array are required' },
          { status: 400 }
        );
      }

      if (!isValidUrl(url)) {
        return NextResponse.json(
          { error: 'url must be a valid HTTP/HTTPS URL' },
          { status: 400 }
        );
      }

      // Validate event names are strings
      if (!events.every((e) => typeof e === 'string' && e.length > 0)) {
        return NextResponse.json(
          { error: 'All event names must be non-empty strings' },
          { status: 400 }
        );
      }

      // Check max webhooks per tenant
      const count = await db.webhook.count({ where: { tenantId } });
      if (count >= MAX_WEBHOOKS_PER_TENANT) {
        return NextResponse.json(
          { error: `Maximum ${MAX_WEBHOOKS_PER_TENANT} webhooks allowed per tenant` },
          { status: 400 }
        );
      }

      const webhookSecret = secret || generateSecret();

      const webhook = await db.webhook.create({
        data: {
          tenantId,
          url,
          events: JSON.stringify(events),
          secret: webhookSecret,
        },
      });

      // Return full secret only on creation (never again)
      return NextResponse.json(
        {
          webhook: {
            ...webhook,
            secret: webhookSecret, // show full secret once
            createdAt: webhook.createdAt.toISOString(),
            updatedAt: webhook.updatedAt.toISOString(),
          },
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Create webhook error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'] }
);

// ─── PUT: Update webhook ────────────────────────────────────────

export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { id, isActive, url, events } = body as {
        id: string;
        isActive?: boolean;
        url?: string;
        events?: string[];
      };

      if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
      }

      const existing = await db.webhook.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
      }

      if (user.tenantId !== existing.tenantId) {
        return NextResponse.json(
          { error: 'You can only manage your own webhooks' },
          { status: 403 }
        );
      }

      const updateData: Record<string, unknown> = {};

      if (isActive !== undefined) {
        updateData.isActive = Boolean(isActive);
      }

      if (url !== undefined) {
        if (!isValidUrl(url)) {
          return NextResponse.json(
            { error: 'url must be a valid HTTP/HTTPS URL' },
            { status: 400 }
          );
        }
        updateData.url = url;
      }

      if (events !== undefined) {
        if (!Array.isArray(events) || events.length === 0) {
          return NextResponse.json(
            { error: 'events must be a non-empty string array' },
            { status: 400 }
          );
        }
        if (!events.every((e) => typeof e === 'string' && e.length > 0)) {
          return NextResponse.json(
            { error: 'All event names must be non-empty strings' },
            { status: 400 }
          );
        }
        updateData.events = JSON.stringify(events);
      }

      const webhook = await db.webhook.update({
        where: { id },
        data: updateData,
      });

      return NextResponse.json({
        webhook: {
          ...webhook,
          secret: maskSecret(webhook.secret),
          lastTriggeredAt: webhook.lastTriggeredAt?.toISOString() ?? null,
          createdAt: webhook.createdAt.toISOString(),
          updatedAt: webhook.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('Update webhook error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'] }
);

// ─── DELETE: Delete webhook (requires confirm=true) ─────────────

export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const id = req.nextUrl.searchParams.get('id');
      const confirm = req.nextUrl.searchParams.get('confirm');

      if (!id) {
        return NextResponse.json(
          { error: 'id query param is required' },
          { status: 400 }
        );
      }

      if (confirm !== 'true') {
        return NextResponse.json(
          { error: 'Deletion requires confirmation. Add ?confirm=true to the URL.' },
          { status: 400 }
        );
      }

      const existing = await db.webhook.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
      }

      if (user.tenantId !== existing.tenantId) {
        return NextResponse.json(
          { error: 'You can only manage your own webhooks' },
          { status: 403 }
        );
      }

      // H-10: Soft delete — deactivate instead of hard deleting to preserve audit trail
      await db.webhook.update({
        where: { id },
        data: { isActive: false },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Delete webhook error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'] }
);