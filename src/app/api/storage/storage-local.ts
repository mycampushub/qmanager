// =============================================================================
// QueueFlow — Local Filesystem Storage
//
// Implements file storage for local development using the filesystem.
// =============================================================================

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'db', 'uploads');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

const EXT_CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export function serveLocalFile(fileKey: string) {
  const filePath = path.join(UPLOAD_DIR, fileKey);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = EXT_CONTENT_TYPES[ext] || 'application/octet-stream';

  return new Response(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

export async function saveLocalFile(fullKey: string, file: File, ext: string) {
  ensureUploadDir();
  const filePath = path.join(UPLOAD_DIR, fullKey);
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
}

export function deleteLocalFile(fileKey: string) {
  const filePath = path.join(UPLOAD_DIR, fileKey);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return NextResponse.json({ success: true, key: fileKey });
}