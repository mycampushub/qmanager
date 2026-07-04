import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';
import { dbNow } from '@/lib/datetime';

const MAX_WEBHOOKS_PER_TENANT = 10;

// ─── Helpers ────────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return false;
    if (hostname.startsWith('172.') && /^\d+$/.test(hostname.split('.')[1])) {
      const second = parseInt(hostname.split('.')[1], 10);
      if (second >= 16 && second <= 31) return false;
    }
    if (hostname.startsWith('169.254.')) return false;
    if (hostname === 'metadata.google.internal') return false;
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;

    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
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
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function maskSecret(secret: string): string {
  if (secret.length <= 4) return '****';
  return '*'.repeat(secret.length - 4) + secret.slice(-4);
}

interface WebhookRow {
  id: string;
  tenant_id: string;
  url: string;
  events: string;
  secret: string;
  is_active: number;
  success_count: number;
  failure_count: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapWebhook(r: WebhookRow, mask: boolean) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    url: r.url,
    events: JSON.parse(r.events),
    secret: mask ? maskSecret(r.secret) : r.secret,
    isActive: r.is_active === 1,
    successCount: r.success_count,
    failureCount: r.failure_count,
    lastTriggeredAt: r.last_triggered_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ─── GET: List webhooks ─────────────────────────────────────────

export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const tenantId = req.nextUrl.searchParams.get('tenantId') || user.tenantId;
      if (!tenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
      }

      if (user.role === 'MANAGER' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only view your own tenant data' },
          { status: 403 }
        );
      }

      const result = await d1
        .prepare('SELECT * FROM webhooks WHERE tenant_id = ? ORDER BY created_at DESC')
        .bind(tenantId)
        .all<WebhookRow>();

      return NextResponse.json({ webhooks: result.results.map((w) => mapWebhook(w, true)) });
    } catch (error) {
      console.error('List webhooks error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'] }
);

// ─── POST: Create webhook ───────────────────────────────────────

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { url, events, secret } = body as {
        url?: string;
        events?: string[];
        secret?: string;
      };

      const tenantId = user.tenantId;
      if (!tenantId) {
        return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
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

      if (!events.every((e) => typeof e === 'string' && e.length > 0)) {
        return NextResponse.json(
          { error: 'All event names must be non-empty strings' },
          { status: 400 }
        );
      }

      // Check max webhooks per tenant
      const countResult = await d1
        .prepare('SELECT count(*) as cnt FROM webhooks WHERE tenant_id = ?')
        .bind(tenantId)
        .first<{ cnt: number }>();

      if ((countResult?.cnt ?? 0) >= MAX_WEBHOOKS_PER_TENANT) {
        return NextResponse.json(
          { error: `Maximum ${MAX_WEBHOOKS_PER_TENANT} webhooks allowed per tenant` },
          { status: 400 }
        );
      }

      const webhookSecret = secret || generateSecret();
      const newId = crypto.randomUUID();

      await d1.prepare(
        `INSERT INTO webhooks (id, tenant_id, url, events, secret, is_active, success_count, failure_count)
         VALUES (?, ?, ?, ?, ?, 1, 0, 0)`
      ).bind(newId, tenantId, url, JSON.stringify(events), webhookSecret).run();

      // Return full secret only on creation
      return NextResponse.json(
        {
          webhook: {
            id: newId,
            tenantId,
            url,
            events,
            secret: webhookSecret,
            isActive: true,
            successCount: 0,
            failureCount: 0,
            lastTriggeredAt: null,
            createdAt: dbNow(),
            updatedAt: dbNow(),
          },
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Create webhook error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'], csrf: true }
);

// ─── PUT: Update webhook ────────────────────────────────────────

export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
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

      const existing = await d1
        .prepare('SELECT id, tenant_id FROM webhooks WHERE id = ?')
        .bind(id)
        .first<{ id: string; tenant_id: string }>();

      if (!existing) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
      }

      if (user.tenantId !== existing.tenant_id) {
        return NextResponse.json(
          { error: 'You can only manage your own webhooks' },
          { status: 403 }
        );
      }

      const setClauses: string[] = [];
      const values: unknown[] = [];

      if (isActive !== undefined) {
        setClauses.push('is_active = ?');
        values.push(isActive ? 1 : 0);
      }

      if (url !== undefined) {
        if (!isValidUrl(url)) {
          return NextResponse.json(
            { error: 'url must be a valid HTTP/HTTPS URL' },
            { status: 400 }
          );
        }
        setClauses.push('url = ?');
        values.push(url);
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
        setClauses.push('events = ?');
        values.push(JSON.stringify(events));
      }

      if (setClauses.length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      }

      setClauses.push("updated_at = datetime('now')");
      values.push(id);

      await d1
        .prepare(`UPDATE webhooks SET ${setClauses.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run();

      // Fetch updated
      const updated = await d1
        .prepare('SELECT * FROM webhooks WHERE id = ?')
        .bind(id)
        .first<WebhookRow>();

      return NextResponse.json({ webhook: mapWebhook(updated!, true) });
    } catch (error) {
      console.error('Update webhook error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'], csrf: true }
);

// ─── DELETE: Delete webhook (requires confirm=true) ─────────────

export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const id = req.nextUrl.searchParams.get('id');
      const confirm = req.nextUrl.searchParams.get('confirm');

      if (!id) {
        return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
      }

      if (confirm !== 'true') {
        return NextResponse.json(
          { error: 'Deletion requires confirmation. Add ?confirm=true to the URL.' },
          { status: 400 }
        );
      }

      const existing = await d1
        .prepare('SELECT id, tenant_id FROM webhooks WHERE id = ?')
        .bind(id)
        .first<{ id: string; tenant_id: string }>();

      if (!existing) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
      }

      if (user.tenantId !== existing.tenant_id) {
        return NextResponse.json(
          { error: 'You can only manage your own webhooks' },
          { status: 403 }
        );
      }

      // H-10: Soft delete — deactivate instead of hard deleting
      await d1
        .prepare("UPDATE webhooks SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
        .bind(id)
        .run();

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Delete webhook error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'], csrf: true }
);