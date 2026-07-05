// =============================================================================
// QueueFlow — Storage API (Dual-mode: Cloudflare R2 + Local Filesystem)
//
// GET    — Download a file
// POST   — Upload a file (multipart/form-data)
// DELETE — Delete a file
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Detect local dev vs Cloudflare
function isLocalDev(): boolean {
  try { require.resolve('better-sqlite3'); return true; } catch { return false; }
}

// GET /api/storage/logos/tenant-123/logo.png
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const fileKey = key.join('/');

  if (isLocalDev()) {
    const { serveLocalFile } = await import('../storage-local');
    return serveLocalFile(fileKey);
  }

  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const { env } = await getCloudflareContext({ async: true });
  const object = await env.STORAGE.get(fileKey);

  if (!object) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const headers = new Headers();
  if (object.httpMetadata?.contentType) {
    headers.set('Content-Type', object.httpMetadata.contentType);
  }
  headers.set('Content-Length', String(object.size));
  headers.set('ETag', object.etag);
  headers.set('Cache-Control', 'public, max-age=86400');
  if (object.uploaded) {
    headers.set('Last-Modified', new Date(object.uploaded).toISOString());
  }

  return new Response(object.body, { headers });
}

// POST /api/storage/logos/tenant-123
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const prefix = key.join('/');

  return withAuth(
    async (req) => {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json(
          { error: 'No file provided. Use FormData with "file" field.' },
          { status: 400 }
        );
      }
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: `Invalid file type: ${file.type}. Allowed: ${[...ALLOWED_IMAGE_TYPES].join(', ')}` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 5MB` },
          { status: 400 }
        );
      }

      const ext = file.type.split('/')[1]?.replace('svg+xml', 'svg') || 'bin';
      const fileId = crypto.randomUUID();
      const fullKey = `${prefix}/${fileId}.${ext}`;

      if (isLocalDev()) {
        const { saveLocalFile } = await import('../storage-local');
        return saveLocalFile(fullKey, file, ext);
      }

      const { getCloudflareContext } = await import('@opennextjs/cloudflare');
      const { env } = await getCloudflareContext({ async: true });
      await env.STORAGE.put(fullKey, file.stream(), {
        httpMetadata: { contentType: file.type },
      });

      return NextResponse.json({
        key: fullKey,
        url: `/api/storage/${fullKey}`,
        size: file.size,
        type: file.type,
      });
    },
    { csrf: true }
  )(request);
}

// DELETE /api/storage/logos/tenant-123/old-logo.png
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const fileKey = key.join('/');

  return withAuth(
    async (req) => {
      if (isLocalDev()) {
        const { deleteLocalFile } = await import('../storage-local');
        return deleteLocalFile(fileKey);
      }

      const { getCloudflareContext } = await import('@opennextjs/cloudflare');
      const { env } = await getCloudflareContext({ async: true });
      await env.STORAGE.delete(fileKey);
      return NextResponse.json({ success: true, key: fileKey });
    },
    { csrf: true }
  )(request);
}