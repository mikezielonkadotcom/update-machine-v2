import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/helpers';
import { sha256Hex, randomHex } from '@/lib/crypto';
import { query, queryOne } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { logActivity, logWarn } from '@/lib/logging';
import { getClientIp } from '@/lib/auth';

export async function OPTIONS(request: NextRequest) {
  const origin = new URL(request.url).origin;
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const headers = adminCorsHeaders(origin);
  const ip = getClientIp(request);

  if (await rateLimit('login', ip, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers });
  }

  const { email } = body;
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400, headers });
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400, headers });
  }

  // Rate limit per email
  const emailKey = `magic:${normalizedEmail}`;
  if (await rateLimit('magic-link', emailKey, 3, 15 * 60_000)) {
    return NextResponse.json({ ok: true, message: 'If that email is registered, a login link has been sent.' }, { headers });
  }

  const user = await queryOne<any>(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE',
    [normalizedEmail]
  );

  if (!user) {
    return NextResponse.json({ ok: true, message: 'If that email is registered, a login link has been sent.' }, { headers });
  }

  const rawToken = randomHex(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

  // Invalidate unused magic links
  await query("UPDATE magic_links SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [user.id]);

  await query(
    'INSERT INTO magic_links (user_id, token_hash, expires_at, ip_address) VALUES ($1, $2, $3, $4)',
    [user.id, tokenHash, expiresAt, ip]
  );

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;
  const magicUrl = `${baseUrl}/logmein?token=${rawToken}`;

  // Send via Slack
  const botToken = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL || 'C0ANNJ51A87';
  if (botToken) {
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: 'Update Machine Login', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: 'Click below to log in to your Update Machine dashboard.' } },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Log In Now', emoji: true }, url: magicUrl, style: 'primary' }] },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `_This link expires in 15 minutes. Requested by ${normalizedEmail}._` }] },
    ];

    try {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${botToken}` },
        body: JSON.stringify({ channel, blocks }),
      });
    } catch (e: any) {
      logWarn({ source: 'magic-link', message: `Failed to send Slack magic link: ${e.message}` });
    }
  }

  const response: any = { ok: true, message: 'If that email is registered, a login link has been sent.' };
  const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
  if (isLocalhost) {
    response.magic_link = magicUrl;
  }

  await logActivity(
    { id: user.id, email: user.email, display_name: user.display_name, role: user.role, via: 'session' },
    'user.magic_link_request', 'Magic link requested', undefined, undefined, ip
  );

  return NextResponse.json(response, { headers });
}
