import { NextRequest, NextResponse } from 'next/server';
import { sha256Hex, hmacSign, randomHex } from '@/lib/crypto';
import { query, queryOne } from '@/lib/db';
import { logActivity } from '@/lib/logging';
import { getClientIp, getSessionSecret } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get('token');

  if (!rawToken) {
    return NextResponse.redirect(`${url.origin}/logmein?error=invalid`);
  }

  const tokenHash = await sha256Hex(rawToken);
  const link = await queryOne<any>(
    `SELECT ml.*, u.id as uid, u.email, u.display_name, u.role, u.is_active
     FROM magic_links ml JOIN users u ON u.id = ml.user_id
     WHERE ml.token_hash = $1 AND ml.used_at IS NULL AND ml.expires_at > NOW() AND u.is_active = TRUE`,
    [tokenHash]
  );

  if (!link) {
    return NextResponse.redirect(`${url.origin}/logmein?error=expired`);
  }

  // Mark token as used
  await query("UPDATE magic_links SET used_at = NOW() WHERE id = $1", [link.id]);

  // Create session
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (!adminToken) {
    return NextResponse.redirect(`${url.origin}/logmein?error=server`);
  }

  const sessionId = randomHex(32);
  await query(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')",
    [sessionId, link.uid]
  );

  const signature = await hmacSign(sessionId, getSessionSecret());
  const cookieValue = `${sessionId}.${signature}`;
  const sessionMaxAge = 7 * 86400;

  const ip = getClientIp(request);
  await logActivity(
    { id: link.uid, email: link.email, display_name: link.display_name, role: link.role, via: 'session' },
    'user.magic_link_login', 'User logged in via magic link', undefined, undefined, ip
  );

  const response = NextResponse.redirect(`${url.origin}/admin/sites`);
  response.headers.set(
    'Set-Cookie',
    `um_session=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionMaxAge}`
  );
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}
