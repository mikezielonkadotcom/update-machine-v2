import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/helpers';
import { verifyAndUpgradePassword, hmacSign, randomHex } from '@/lib/crypto';
import { query, queryOne } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { logActivity, logWarn, logError } from '@/lib/logging';
import { getClientIp } from '@/lib/auth';
import { bootstrapOwner } from '@/lib/helpers';

export async function OPTIONS(request: NextRequest) {
  const origin = new URL(request.url).origin;
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const headers = adminCorsHeaders(origin);
  const ip = getClientIp(request);

  if (await rateLimit('login', ip, 5, 60_000)) {
    logWarn({ source: 'auth', message: `Login rate limit exceeded for IP ${ip}`, request_ip: ip });
    return NextResponse.json({ error: 'Too many login attempts. Try again later.' }, { status: 429, headers });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers });
  }

  const { email, password, remember_me } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400, headers });
  }

  const adminToken = process.env.ADMIN_TOKEN || '';
  if (!adminToken) {
    logError({ source: 'auth', message: 'ADMIN_TOKEN not configured' });
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500, headers });
  }

  // Bootstrap owner if needed (creates first owner from env vars)
  try { await bootstrapOwner(); } catch (e: any) {
    logError({ source: 'bootstrap', message: `bootstrapOwner failed: ${e.message}`, stack: e.stack });
  }

  const user = await queryOne<any>(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE',
    [email.trim()]
  );

  if (!user) {
    logWarn({ source: 'auth', message: `Failed login: unknown email ${email}`, request_ip: ip });
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401, headers });
  }

  const passwordValid = await verifyAndUpgradePassword(
    password,
    user.password_hash,
    user.id,
    async (userId, newHash) => {
      await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
    }
  );

  if (!passwordValid) {
    logWarn({ source: 'auth', message: `Failed login: wrong password for ${email}`, request_ip: ip });
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401, headers });
  }

  const sessionDays = remember_me ? 30 : 7;
  if (user.totp_enabled && user.totp_secret) {
    const tempToken = `${sessionDays === 30 ? '30d' : '7d'}_${randomHex(24)}`;
    await query(
      `INSERT INTO pending_2fa (id, user_id, ip_address, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
      [tempToken, user.id, ip],
    );

    if (Math.random() < 0.01) {
      query('DELETE FROM pending_2fa WHERE expires_at < NOW()').catch(() => {});
    }

    return NextResponse.json(
      { requires_2fa: true, temp_token: tempToken },
      { status: 200, headers },
    );
  }

  const sessionMaxAge = sessionDays * 86400;
  const sessionId = randomHex(32);

  await query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 day' * $3)`,
    [sessionId, user.id, sessionDays]
  );

  // Probabilistic session cleanup
  if (Math.random() < 0.01) {
    query("DELETE FROM sessions WHERE expires_at < NOW()").catch(() => {});
  }

  const signature = await hmacSign(sessionId, adminToken);
  const cookieValue = `${sessionId}.${signature}`;

  await logActivity(
    { id: user.id, email: user.email, display_name: user.display_name, role: user.role, via: 'session' },
    'user.login',
    `User logged in${remember_me ? ' (remember me)' : ''}`,
    undefined, undefined, ip
  );

  const response = NextResponse.json(
    { ok: true, user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role } },
    { status: 200, headers }
  );

  response.headers.set(
    'Set-Cookie',
    `um_session=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionMaxAge}`
  );

  return response;
}
