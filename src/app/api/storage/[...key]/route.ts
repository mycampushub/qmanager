// =============================================================================
// QueueFlow — R2 Storage API (Cloudflare Workers)
//
// GET    — Download a file from R2
// POST   — Upload a file to R2 (multipart/form-data)
// DELETE — Delete a file from R2
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getR2FromEnv } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

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
    const r2 = await getR2FromEnv();
    const object = await r2.get(fileKey);

    if (!object) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const headers = new Headers();
    if (object.httpMetadata?.contentType) {
      headers.set('Content-Type', object.httpMetadata.contentType);
    } else {
      headers.set('Content-Type', 'application/octet-stream');
    }
    headers.set('Content-Length', String(object.size));
    headers.set('Cache-Control', 'public, max-age=86400');
    if (object.etag) {
      headers.set('ETag', object.etag);
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
  // H7: Authentication required for uploads
  const authResult = await authenticateRequest(request);
  if ('error' in authResult && authResult.error) {
    return NextResponse.json({ error: authResult.error.message }, { status: authResult.error.status });
  }
  if (!['MANAGER', 'PLATFORM_ADMIN'].includes(authResult.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

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

    const r2 = await getR2FromEnv();
    await r2.put(fullKey, await file.arrayBuffer(), {
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
}

// DELETE /api/storage/logos/tenant-123/old-logo.png
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  // H7: Authentication required for deletes
  const authResult = await authenticateRequest(request);
  if ('error' in authResult && authResult.error) {
    return NextResponse.json({ error: authResult.error.message }, { status: authResult.error.status });
  }
  if (!['MANAGER', 'PLATFORM_ADMIN'].includes(authResult.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { key } = await params;
  const fileKey = key.join('/');

  try {
    const r2 = await getR2FromEnv();
    await r2.delete(fileKey);
    return NextResponse.json({ success: true, key: fileKey });
  } catch (err) {
    console.error('[Storage] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}