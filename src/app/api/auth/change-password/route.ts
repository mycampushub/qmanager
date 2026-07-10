import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { verifyPassword, hashPassword } from '@/lib/auth';
import type { JwtPayload } from '@/lib/auth';
import { getClientIp } from '@/lib/utils';

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    // C8 + C9: Unified password validation
    function validatePassword(pw: string): string | null {
      if (pw.length < 8) return 'New password must be at least 8 characters';
      if (!/[A-Z]/.test(pw)) return 'New password must contain at least one uppercase letter';
      if (!/[0-9]/.test(pw)) return 'New password must contain at least one digit';
      return null;
    }

    // A16: Support both staff and platform_admin
    if (user.type !== 'staff' && user.type !== 'platform_admin') {
      return NextResponse.json(
        { error: 'Only authenticated users can change their password' },
        { status: 400 }
      );
    }

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { currentPassword, newPassword } = body as {
        currentPassword: string;
        newPassword: string;
      };

      if (!currentPassword || !newPassword) {
        return NextResponse.json(
          { error: 'Current password and new password are required' },
          { status: 400 }
        );
      }

      // C8 + C9: Validate password strength
      const pwError = validatePassword(newPassword);
      if (pwError) {
        return NextResponse.json(
          { error: pwError },
          { status: 400 }
        );
      }

      if (user.type === 'staff') {
        const staff = await d1
          .prepare('SELECT id, password_hash FROM users WHERE id = ?')
          .bind(user.userId)
          .first<{ id: string; password_hash: string }>();

        if (!staff) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const valid = await verifyPassword(currentPassword, staff.password_hash);
        if (!valid) {
          return NextResponse.json(
            { error: 'Current password is incorrect' },
            { status: 401 }
          );
        }

        const newHash = await hashPassword(newPassword);
        await d1
          .prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?')
          .bind(newHash, user.userId)
          .run();
      } else {
        // A16: Platform admin password change
        const admin = await d1
          .prepare('SELECT id, password_hash FROM platform_admins WHERE id = ?')
          .bind(user.userId)
          .first<{ id: string; password_hash: string }>();

        if (!admin) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const valid = await verifyPassword(currentPassword, admin.password_hash);
        if (!valid) {
          return NextResponse.json(
            { error: 'Current password is incorrect' },
            { status: 401 }
          );
        }

        const newHash = await hashPassword(newPassword);
        await d1
          .prepare('UPDATE platform_admins SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?')
          .bind(newHash, user.userId)
          .run();
      }

      // Audit log
      const ip = getClientIp(req);

      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at)
           VALUES (?, ?, ?, 'PASSWORD_CHANGE', ?, ?, datetime('now'))`
        )
        .bind(crypto.randomUUID(), user.userId, user.type, JSON.stringify({ tenantId: user.tenantId }), ip)
        .run();

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Change password error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {} // No requireTenantId — platform_admin doesn't have one
);