// =============================================================================
// QueueFlow — R2 Storage API (file upload/download proxy)
// Route: /api/storage/[...key]
//
// GET    — Download a file from R2
// POST   — Upload a file to R2 (multipart/form-data)
// DELETE — Delete a file from R2
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

async function getStorageBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  const bucket = env.STORAGE as R2Bucket | undefined;
  if (!bucket) {
    throw new Error('R2 STORAGE binding not found. Ensure STORAGE is bound in wrangler.toml.');
  }
  return bucket;
}

// GET /api/storage/logos/tenant-123/logo.png
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const fileKey = key.join('/');

  try {
    const bucket = await getStorageBucket();
    const object = await bucket.get(fileKey);

    if (!object) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Content-Length', String(object.size));
    headers.set('ETag', object.etag);
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('Last-Modified', object.uploaded.toISOString());

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

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided. Use FormData with "file" field.' }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: `Invalid file type: ${file.type}` }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 5MB` }, { status: 400 });
    }

    const ext = file.type.split('/')[1]?.replace('svg+xml', 'svg') || 'bin';
    const fileId = crypto.randomUUID();
    const fullKey = `${prefix}/${fileId}.${ext}`;

    const bucket = await getStorageBucket();
    await bucket.put(fullKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { uploadedAt: new Date().toISOString(), originalName: file.name },
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
}

// DELETE /api/storage/logos/tenant-123/old-logo.png
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const fileKey = key.join('/');

  try {
    const bucket = await getStorageBucket();
    await bucket.delete(fileKey);
    return NextResponse.json({ success: true, key: fileKey });
  } catch (err) {
    console.error('[Storage] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}