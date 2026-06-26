import crypto from 'crypto';
import { db, withTenantCtx } from './db';

/**
 * Dispatch webhooks for a given tenant + event in the background.
 * This function never throws — all errors are caught and logged.
 *
 * Signature: HMAC-SHA256 of the JSON payload using the webhook secret,
 * sent as `X-Webhook-Signature: sha256=<hex>`.
 */
export async function dispatchWebhooks(
  tenantId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Fire-and-forget: do NOT await this in the caller's critical path
  (async () => {
    try {
      await withTenantCtx(tenantId, async () => {
        const webhooks = await db.webhook.findMany({
          where: {
            tenantId,
            isActive: true,
          },
        });

        const body = JSON.stringify(payload);

        for (const webhook of webhooks) {
          try {
            // Parse the stored JSON array of subscribed events
            let subscribedEvents: string[] = [];
            try {
              subscribedEvents = JSON.parse(webhook.events);
            } catch {
              continue; // malformed events JSON — skip
            }

            if (!subscribedEvents.includes(event)) {
              continue;
            }

            // Compute HMAC-SHA256 signature
            const signature = crypto
              .createHmac('sha256', webhook.secret)
              .update(body)
              .digest('hex');

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
              signal: AbortSignal.timeout(10_000), // 10s timeout
            });

            const success = response.ok;

            await db.webhook.update({
              where: { id: webhook.id },
              data: {
                [success ? 'successCount' : 'failureCount']: {
                  increment: 1,
                },
                lastTriggeredAt: new Date(),
              },
            });
          } catch (err) {
            // Individual webhook failure — log but don't abort the loop
            console.error(
              `[Webhook] Failed to deliver to ${webhook.url}:`,
              err
            );
            try {
              await db.webhook.update({
                where: { id: webhook.id },
                data: {
                  failureCount: { increment: 1 },
                  lastTriggeredAt: new Date(),
                },
              });
            } catch {
              // DB update failure — swallow
            }
          }
        }
      });
    } catch (err) {
      // Top-level error (e.g. DB fetch failure)
      console.error('[Webhook] dispatchWebhooks top-level error:', err);
    }
  })();
}