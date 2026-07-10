// =============================================================================
// QueueFlow — Webhook Dispatch
//
// Dispatches webhooks for a given tenant + event using raw D1 SQL.
// Falls back to fire-and-forget IIFE if no execution context (local dev).
// =============================================================================

import { getD1FromEnv } from './db';

/**
 * Compute HMAC-SHA256 signature using Web Crypto API.
 */
async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

interface WebhookRow {
  id: string;
  url: string;
  events: string;
  secret: string;
}

/**
 * Dispatch webhooks for a given tenant + event.
 * Uses executionContext.waitUntil() for fire-and-forget on CF Workers.
 * Falls back to fire-and-forget IIFE if no execution context (local dev).
 */
export function dispatchWebhooks(
  tenantId: string,
  event: string,
  payload: Record<string, unknown>,
  waitUntil?: (promise: Promise<void>) => void
): void {
  const work = async () => {
    try {
      const d1 = getD1FromEnv() as {
        prepare(sql: string): { bind(...args: unknown[]): { all<T>(): { results: T[] }; run(): unknown } };
      };

      const { results: activeWebhooks } = await d1
        .prepare(`SELECT id, url, events, secret FROM webhooks WHERE tenant_id = ? AND is_active = 1`)
        .bind(tenantId)
        .all<WebhookRow>();

      const body = JSON.stringify(payload);

      for (const webhook of activeWebhooks) {
        try {
          let subscribedEvents: string[] = [];
          try {
            subscribedEvents = JSON.parse(webhook.events);
          } catch {
            continue; // malformed events JSON
          }

          if (!subscribedEvents.includes(event)) continue;

          // HMAC-SHA256 signature
          const signature = await hmacSha256(webhook.secret, body);

          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Signature': `sha256=${signature}`,
              'X-Webhook-Event': event,
              'X-Webhook-Delivery': crypto.randomUUID(),
              'User-Agent': 'QueueFlow-Webhooks/1.0',
            },
            body,
            signal: AbortSignal.timeout(10_000),
          });

          const success = response.ok;
          const now = new Date().toISOString();

          await (d1 as unknown as { prepare(sql: string): { bind(...args: unknown[]): { run(): unknown } } })
            .prepare(
              `UPDATE webhooks SET ${success ? 'success_count' : 'failure_count'} = ${success ? 'success_count' : 'failure_count'} + 1, last_triggered_at = ? WHERE id = ?`
            ).bind(now, webhook.id).run();

        } catch (err) {
          console.error(`[Webhook] Failed to deliver to ${webhook.url}:`, err);
          try {
            await (d1 as unknown as { prepare(sql: string): { bind(...args: unknown[]): { run(): unknown } } })
              .prepare(
                `UPDATE webhooks SET failure_count = failure_count + 1, last_triggered_at = ? WHERE id = ?`
              ).bind(new Date().toISOString(), webhook.id).run();
          } catch { /* swallow */ }
        }
      }
    } catch (err) {
      console.error('[Webhook] dispatchWebhooks error:', err);
    }
  };

  if (waitUntil) {
    // CF Workers: use waitUntil for background execution
    waitUntil(work());
  } else {
    // Local dev: fire-and-forget
    work();
  }
}