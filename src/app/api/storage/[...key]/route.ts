// =============================================================================
// QueueFlow — Storage API (Local File System)
//
// GET    — Download a file
// POST   — Upload a file (multipart/form-data)
// DELETE — Delete a file
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import fs from 'fs';
import path from 'path';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const UPLOAD_DIR = path.join(process.cwd(), 'db', 'uploads');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

// GET /api/storage/logos/tenant-123/logo.png
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const fileKey = key.join('/');
  const filePath = path.join(UPLOAD_DIR, fileKey);

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

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=86400',
      },
    });
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
        ensureUploadDir();
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
        const filePath = path.join(UPLOAD_DIR, fullKey);

        // Ensure directory exists
        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

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
        const filePath = path.join(UPLOAD_DIR, fileKey);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        return NextResponse.json({ success: true, key: fileKey });
      } catch (err) {
        console.error('[Storage] DELETE error:', err);
        return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
      }
    },
    { csrf: true }
  )(request);
}