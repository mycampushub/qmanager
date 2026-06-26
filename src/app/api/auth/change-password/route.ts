import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { verifyPassword, hashPassword } from '@/lib/auth';
import type { JwtPayload } from '@/lib/auth';

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
        const staff = await db.staffUser.findUnique({
          where: { id: user.userId },
        });

        if (!staff) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const valid = await verifyPassword(currentPassword, staff.passwordHash);
        if (!valid) {
          return NextResponse.json(
            { error: 'Current password is incorrect' },
            { status: 401 }
          );
        }

        const newHash = await hashPassword(newPassword);
        await db.staffUser.update({
          where: { id: user.userId },
          data: { passwordHash: newHash },
        });
      } else {
        // A16: Platform admin password change
        const admin = await db.platformAdmin.findUnique({
          where: { id: user.userId },
        });

        if (!admin) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const valid = await verifyPassword(currentPassword, admin.passwordHash);
        if (!valid) {
          return NextResponse.json(
            { error: 'Current password is incorrect' },
            { status: 401 }
          );
        }

        const newHash = await hashPassword(newPassword);
        await db.platformAdmin.update({
          where: { id: user.userId },
          data: { passwordHash: newHash },
        });
      }

      // Audit log
      const ip =
        req.headers.get('x-forwarded-for') ||
        req.headers.get('x-real-ip') ||
        'unknown';

      await db.auditLog.create({
        data: {
          userId: user.userId,
          userType: user.type,
          action: 'PASSWORD_CHANGE',
          details: JSON.stringify({ tenantId: user.tenantId }),
          ipAddress: ip,
        },
      });

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