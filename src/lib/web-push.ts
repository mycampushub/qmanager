// =============================================================================
// QueueFlow — Web Push Notification Helper
// =============================================================================

/**
 * Send a Web Push notification to a subscription.
 * Uses the Web Push API (available in Node.js 18+ and Bun).
 */
export async function sendWebPush(
  endpoint: string,
  keysJson: string,
  payload: { title: string; body: string; icon?: string; data?: Record<string, unknown> }
): Promise<{ success: boolean; error?: string; expired?: boolean }> {
  try {
    const keys = JSON.parse(keysJson) as { p256dh: string; auth: string };

    if (!keys.p256dh || !keys.auth) {
      console.error('[WebPush] Missing p256dh or auth key in subscription');
      return { success: false, error: 'Invalid subscription keys' };
    }

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';

    // If no VAPID keys configured, skip (dev mode)
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.log('[WebPush] VAPID keys not configured, skipping push notification');
      return { success: false, error: 'VAPID keys not configured' };
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: payload.data || {},
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'TTL': '86400',
        'Authorization': `vapid t=${vapidPublicKey},k=${vapidPrivateKey}`,
      },
      body: notificationPayload,
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 410 || response.status === 404) {
      // Subscription expired or gone — caller should clean up
      return { success: false, error: 'Subscription expired', expired: true };
    }

    if (!response.ok) {
      return { success: false, error: `Push failed with status ${response.status}` };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[WebPush] Error:', message);
    return { success: false, error: message };
  }
}

/**
 * Generate VAPID keys (run once to generate keys, then set as env vars).
 * Call this function from a one-time setup script.
 */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  // Use Web Crypto API to generate ECDH key pair for VAPID
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  // Convert to base64url
  const base64url = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf);
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const publicKey = base64url(
    Uint8Array.from(
      atob(publicKeyJwk.x!.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0)
    ).buffer
  );
  const privateKey = base64url(
    Uint8Array.from(
      atob(privateKeyJwk.d!.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0)
    ).buffer
  );

  return { publicKey, privateKey };
}