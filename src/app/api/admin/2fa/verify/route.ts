import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { query, queryOne } from '@/lib/db';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeTOTPCode,
  verifyTOTPCode,
} from '@/lib/totp';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const POST = adminHandler(async (request, user, { headers, ip }) => {
  if (user.via !== 'session') return NextResponse.json({ error: 'Session auth required' }, { status: 403, headers });

  const body = await request.json();
  const code = normalizeTOTPCode(String(body?.code || ''));
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400, headers });

  const dbUser = await queryOne<{ totp_secret: string | null; totp_enabled: boolean }>(
    'SELECT totp_secret, totp_enabled FROM users WHERE id = $1',
    [user.id],
  );

  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
  if (dbUser.totp_enabled) return NextResponse.json({ error: '2FA is already enabled' }, { status: 400, headers });
  if (!dbUser.totp_secret) return NextResponse.json({ error: 'No 2FA setup in progress' }, { status: 400, headers });

  if (!verifyTOTPCode(dbUser.totp_secret, user.email, code)) {
    return NextResponse.json({ error: 'Invalid verification code' }, { status: 400, headers });
  }

  const recoveryCodes = generateRecoveryCodes(8);
  const recoveryCodeHashes = await Promise.all(recoveryCodes.map((recoveryCode) => hashRecoveryCode(recoveryCode)));

  await query(
    `UPDATE users
     SET totp_enabled = TRUE,
         totp_verified_at = NOW(),
         totp_recovery_codes = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(recoveryCodeHashes), user.id],
  );

  await logActivity(user, 'user.2fa_enabled', 'Enabled TOTP 2FA', 'user', String(user.id), ip);

  return NextResponse.json(
    {
      ok: true,
      recovery_codes: recoveryCodes,
    },
    { headers },
  );
});
