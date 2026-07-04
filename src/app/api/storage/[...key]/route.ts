// =============================================================================
// QueueFlow — Storage API (Cloudflare R2)
//
// GET    — Download a file from R2
// POST   — Upload a file to R2 (multipart/form-data)
// DELETE — Delete a file from R2
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { withAuth } from '@/lib/api-auth';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// GET /api/storage/logos/tenant-123/logo.png
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const fileKey = key.join('/');

  try {
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
  } catch (err) {
    console.error('[Storage] GET error:', err);
    return NextResponse.json({ error: 'Failed to retrieve file' }, { status: 500 });
  }
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
      try {
        const { env } = await getCloudflareContext({ async: true });
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

        await env.STORAGE.put(fullKey, file.stream(), {
          httpMetadata: { contentType: file.type },
        });

        return NextResponse.json({
          key: fullKey,
          url: `/api/storage/${fullKey}`,
          size: file.size,
          type: file.type,
        });
      } catch (err) {
        console.error('[Storage] POST error:', err);
        return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
      }
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
      try {
        const { env } = await getCloudflareContext({ async: true });
        await env.STORAGE.delete(fileKey);
        return NextResponse.json({ success: true, key: fileKey });
      } catch (err) {
        console.error('[Storage] DELETE error:', err);
        return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
      }
    },
    { csrf: true }
  )(request);
}