import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/helpers';
import { getClientIp } from '@/lib/auth';
import { hmacSign, randomHex } from '@/lib/crypto';
import { query, queryOne } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { consumeRecoveryCode, normalizeTOTPCode, verifyTOTPCode } from '@/lib/totp';
import { logActivity, logWarn, logError } from '@/lib/logging';

function sessionDaysFromTempToken(tempToken: string): number {
  if (tempToken.startsWith('30d_')) return 30;
  return 7;
}

export async function OPTIONS(request: NextRequest) {
  const origin = new URL(request.url).origin;
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const headers = adminCorsHeaders(origin);
  const ip = getClientIp(request);

  if (await rateLimit('login-2fa', ip, 5, 60_000)) {
    logWarn({ source: 'auth', message: `2FA login rate limit exceeded for IP ${ip}`, request_ip: ip });
    return NextResponse.json({ error: 'Too many login attempts. Try again later.' }, { status: 429, headers });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers });
  }

  const tempToken = String(body?.temp_token || '');
  const code = normalizeTOTPCode(String(body?.code || ''));
  if (!tempToken || !code) {
    return NextResponse.json({ error: 'temp_token and code required' }, { status: 400, headers });
  }

  const adminToken = process.env.ADMIN_TOKEN || '';
  if (!adminToken) {
    logError({ source: 'auth', message: 'ADMIN_TOKEN not configured' });
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500, headers });
  }

  const challenge = await queryOne<{
    id: string;
    user_id: number;
    attempts: number;
    email: string;
    display_name: string;
    role: string;
    totp_enabled: boolean;
    totp_secret: string | null;
    totp_recovery_codes: string | null;
  }>(
    `SELECT p.id, p.user_id, p.attempts,
            u.email, u.display_name, u.role, u.totp_enabled, u.totp_secret, u.totp_recovery_codes
     FROM pending_2fa p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = $1 AND p.expires_at > NOW() AND u.is_active = TRUE`,
    [tempToken],
  );

  if (!challenge) {
    return NextResponse.json({ error: 'Invalid or expired 2FA token' }, { status: 401, headers });
  }

  if (challenge.attempts >= 3) {
    await query('DELETE FROM pending_2fa WHERE id = $1', [tempToken]);
    return NextResponse.json({ error: '2FA token locked due to too many attempts' }, { status: 401, headers });
  }

  let verified = false;
  let remainingRecoveryHashes: string[] | null = null;

  if (challenge.totp_enabled && challenge.totp_secret) {
    verified = verifyTOTPCode(challenge.totp_secret, challenge.email, code);
  }

  if (!verified) {
    const recoveryAttempt = await consumeRecoveryCode(code, challenge.totp_recovery_codes);
    if (recoveryAttempt.ok) {
      verified = true;
      remainingRecoveryHashes = recoveryAttempt.remainingHashes;
    }
  }

  if (!verified) {
    const nextAttempts = challenge.attempts + 1;
    await query('UPDATE pending_2fa SET attempts = attempts + 1 WHERE id = $1', [tempToken]);
    if (nextAttempts >= 3) {
      await query('DELETE FROM pending_2fa WHERE id = $1', [tempToken]);
    }
    return NextResponse.json({ error: 'Invalid 2FA or recovery code' }, { status: 401, headers });
  }

  if (remainingRecoveryHashes) {
    await query(
      'UPDATE users SET totp_recovery_codes = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(remainingRecoveryHashes), challenge.user_id],
    );
  }

  const sessionDays = sessionDaysFromTempToken(tempToken);
  const sessionMaxAge = sessionDays * 86400;
  const sessionId = randomHex(32);

  await query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 day' * $3)`,
    [sessionId, challenge.user_id, sessionDays],
  );

  await query('DELETE FROM pending_2fa WHERE id = $1', [tempToken]);

  if (Math.random() < 0.01) {
    query('DELETE FROM pending_2fa WHERE expires_at < NOW()').catch(() => {});
    query('DELETE FROM sessions WHERE expires_at < NOW()').catch(() => {});
  }

  const signature = await hmacSign(sessionId, adminToken);
  const cookieValue = `${sessionId}.${signature}`;

  await logActivity(
    {
      id: challenge.user_id,
      email: challenge.email,
      display_name: challenge.display_name,
      role: challenge.role,
      via: 'session',
    },
    'user.login',
    'User logged in with TOTP 2FA',
    undefined, undefined, ip,
  );

  const response = NextResponse.json(
    {
      ok: true,
      user: {
        id: challenge.user_id,
        email: challenge.email,
        display_name: challenge.display_name,
        role: challenge.role,
      },
    },
    { status: 200, headers },
  );

  response.headers.set(
    'Set-Cookie',
    `um_session=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionMaxAge}`,
  );

  return response;
}
