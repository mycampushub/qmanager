import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './db';

// C-01: JWT_SECRET must be explicitly set. No fallback — fail fast in production.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV !== 'development') {
  throw new Error('[CRITICAL] JWT_SECRET environment variable is not set. Refusing to start without a secure secret.');
}
// Only allow known dev secret in development
const _JWT = JWT_SECRET || 'queueflow-dev-secret-do-not-use-in-prod';

// ─── Password Hashing (bcrypt with salt) ────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── JWT Tokens ─────────────────────────────────────────────
export interface JwtPayload {
  userId: string;
  tenantId?: string;
  role: 'PLATFORM_ADMIN' | 'MANAGER' | 'AGENT';
  type: 'staff' | 'platform_admin';
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, _JWT, { expiresIn: '24h' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, _JWT) as JwtPayload;
  } catch {
    return null;
  }
}

// C10: Minimal stub — no longer used for security, kept for backward compat with login/register
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// A12: TODO — In-memory rate limiter is ineffective in multi-instance / serverless deployments.
// Consider migrating to a shared rate-limit store (Redis, Upstash, or database-backed counter)
// for production multi-replica deployments.

// ─── Rate Limiter (in-memory) ───────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

let cleanupStarted = false;

function startRateLimitCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}

export function rateLimit(
  key: string,
  maxRequests: number = 60,
  windowMs: number = 60_000
): { allowed: boolean; retryAfterMs: number } {
  startRateLimitCleanup();

  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

// ─── Auth helper for API routes ─────────────────────────────
export async function authenticateRequest(request: Request): Promise<{
  user: JwtPayload;
  error?: never;
} | {
  error: { status: number; message: string };
  user?: never;
}> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: { status: 401, message: 'Missing or invalid Authorization header' } };
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return { error: { status: 401, message: 'Invalid or expired token' } };
  }

  return { user: payload };
}

// ─── RBAC helper ────────────────────────────────────────────
export function requireRole(...roles: JwtPayload['role'][]): (payload: JwtPayload) => boolean {
  return (payload) => roles.includes(payload.role);
}

// ─── Rehash old SHA-256 passwords on login ──────────────────
// A9: Warn on startup if any legacy (non-bcrypt) hashes exist
(async () => {
  try {
    const legacyUsers = await db.staffUser.findMany({
      select: { id: true, passwordHash: true },
      take: 1,
      where: { passwordHash: { not: { startsWith: '$2' } } },
    });
    if (legacyUsers.length > 0) {
      console.warn(
        '[SECURITY] Legacy SHA-256 password hashes detected in the database. ' +
        'They will be upgraded to bcrypt on next successful login. ' +
        'Consider running a migration to force-rehash all remaining legacy hashes.'
      );
    }
    // Also check platform admins
    const legacyAdmins = await db.platformAdmin.findMany({
      select: { id: true, passwordHash: true },
      take: 1,
      where: { passwordHash: { not: { startsWith: '$2' } } },
    });
    if (legacyAdmins.length > 0) {
      console.warn(
        '[SECURITY] Legacy SHA-256 password hashes detected for platform admins. ' +
        'They will be upgraded to bcrypt on next successful login.'
      );
    }
  } catch { /* DB not ready yet, ignore */ }
})();

export async function upgradePasswordHash(
  email: string,
  plainPassword: string,
  currentHash: string,
  userType: 'staff' | 'platform_admin' = 'staff'
): Promise<boolean> {
  // If hash starts with $2a$ or $2b$, it's already bcrypt
  if (currentHash.startsWith('$2')) {
    return bcrypt.compare(plainPassword, currentHash);
  }

  // Legacy SHA-256 fallback
  const { createHash } = await import('crypto');
  const legacyHash = createHash('sha256').update(plainPassword).digest('hex');
  const legacyMatch = legacyHash === currentHash;

  if (legacyMatch) {
    // H-07: Upgrade to bcrypt — target the correct table based on userType
    const newHash = await hashPassword(plainPassword);
    if (userType === 'platform_admin') {
      await db.platformAdmin.update({ where: { email }, data: { passwordHash: newHash } }).catch(() => {});
    } else {
      await db.staffUser.update({ where: { email }, data: { passwordHash: newHash } }).catch(() => {});
    }
  }

  return legacyMatch;
}