import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { query, queryOne } from '@/lib/db';
import { generateQRCodeDataURL, generateTOTPSecret } from '@/lib/totp';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const POST = adminHandler(async (_request, user, { headers, ip }) => {
  if (user.via !== 'session') return NextResponse.json({ error: 'Session auth required' }, { status: 403, headers });

  const dbUser = await queryOne<{ totp_enabled: boolean }>(
    'SELECT totp_enabled FROM users WHERE id = $1',
    [user.id],
  );

  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
  if (dbUser.totp_enabled) {
    return NextResponse.json({ error: '2FA is already enabled. Disable it first.' }, { status: 400, headers });
  }

  const secret = generateTOTPSecret();
  const qrCode = await generateQRCodeDataURL(secret, user.email);

  await query(
    `UPDATE users
     SET totp_secret = $1,
         totp_enabled = FALSE,
         totp_verified_at = NULL,
         totp_recovery_codes = NULL,
         updated_at = NOW()
     WHERE id = $2`,
    [secret, user.id],
  );

  await logActivity(user, 'user.2fa_setup_start', 'Started TOTP 2FA setup', 'user', String(user.id), ip);

  return NextResponse.json(
    {
      secret,
      qr_code: qrCode,
      manual_entry_key: secret,
    },
    { headers },
  );
});
