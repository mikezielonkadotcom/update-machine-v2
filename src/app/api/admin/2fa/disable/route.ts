import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { verifyAndUpgradePassword } from '@/lib/crypto';
import { query, queryOne } from '@/lib/db';
import {
  consumeRecoveryCode,
  decryptTOTPSecret,
  normalizeTOTPCode,
  verifyTOTPCode,
} from '@/lib/totp';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const POST = adminHandler(async (request, user, { headers, ip }) => {
  if (user.via !== 'session') return NextResponse.json({ error: 'Session auth required' }, { status: 403, headers });

  const body = await request.json();
  const password = String(body?.password || '');
  const code = normalizeTOTPCode(String(body?.code || ''));

  if (!password) return NextResponse.json({ error: 'password required' }, { status: 400, headers });
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400, headers });

  const dbUser = await queryOne<{
    id: number;
    email: string;
    password_hash: string;
    totp_secret: string | null;
    totp_enabled: boolean;
    totp_recovery_codes: string | null;
  }>(
    `SELECT id, email, password_hash, totp_secret, totp_enabled, totp_recovery_codes
     FROM users
     WHERE id = $1`,
    [user.id],
  );

  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
  if (!dbUser.totp_enabled) return NextResponse.json({ error: '2FA is not enabled' }, { status: 400, headers });

  const passwordValid = await verifyAndUpgradePassword(
    password,
    dbUser.password_hash,
    dbUser.id,
    async (userId, newHash) => {
      await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
    },
  );

  if (!passwordValid) {
    return NextResponse.json({ error: 'Invalid current password' }, { status: 401, headers });
  }

  let validCode = false;
  if (dbUser.totp_secret) {
    try {
      validCode = verifyTOTPCode(decryptTOTPSecret(dbUser.totp_secret), dbUser.email, code);
    } catch {
      validCode = false;
    }
  }

  if (!validCode) {
    const recoveryAttempt = await consumeRecoveryCode(code, dbUser.totp_recovery_codes);
    validCode = recoveryAttempt.ok;
  }

  if (!validCode) {
    return NextResponse.json({ error: 'Invalid 2FA or recovery code' }, { status: 401, headers });
  }

  await query(
    `UPDATE users
     SET totp_enabled = FALSE,
         totp_secret = NULL,
         totp_recovery_codes = NULL,
         totp_verified_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [user.id],
  );

  await logActivity(user, 'user.2fa_disabled', 'Disabled TOTP 2FA', 'user', String(user.id), ip);

  return NextResponse.json({ ok: true }, { headers });
});
