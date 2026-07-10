// =============================================================================
// QueueFlow — Local Storage API (file system instead of R2)
//
// GET    — Download a file from local storage
// POST   — Upload a file to local storage (multipart/form-data)
// DELETE — Delete a file from local storage
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const STORAGE_DIR = path.join(process.cwd(), 'db', 'storage');

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

// GET /api/storage/logos/tenant-123/logo.png
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const fileKey = key.join('/');
  const filePath = path.join(STORAGE_DIR, fileKey);

  try {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    }[ext] || 'application/octet-stream';

    const stat = fs.statSync(filePath);
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Length', String(stat.size));
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('Last-Modified', stat.mtime.toISOString());

    return new Response(buffer, { headers });
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
    const filePath = path.join(STORAGE_DIR, fullKey);

    ensureStorageDir();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

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
  const filePath = path.join(STORAGE_DIR, fileKey);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return NextResponse.json({ success: true, key: fileKey });
  } catch (err) {
    console.error('[Storage] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}