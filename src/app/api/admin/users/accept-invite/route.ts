import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/helpers';
import { sha256Hex, hashPassword } from '@/lib/crypto';
import { query, queryOne } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { logActivity } from '@/lib/logging';
import { getClientIp } from '@/lib/auth';

export async function OPTIONS(request: NextRequest) {
  const requestOrigin = request.headers.get('Origin') || '';
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(requestOrigin) });
}

export async function POST(request: NextRequest) {
  const requestOrigin = request.headers.get('Origin') || '';
  const headers = adminCorsHeaders(requestOrigin);
  const ip = getClientIp(request);

  if (await rateLimit('invite', ip, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers });
  }

  const { token, display_name, password } = body;
  if (!token || !display_name || !password) {
    return NextResponse.json({ error: 'token, display_name, and password required' }, { status: 400, headers });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400, headers });
  }

  const tokenHash = await sha256Hex(token);
  const invite = await queryOne<any>(
    "SELECT * FROM invites WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > NOW()",
    [tokenHash]
  );

  if (!invite) {
    return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 400, headers });
  }

  const passwordHash = await hashPassword(password);

  await query(
    'INSERT INTO users (email, display_name, password_hash, role) VALUES ($1, $2, $3, $4)',
    [invite.email, display_name.trim(), passwordHash, invite.role]
  );
  await query("UPDATE invites SET accepted_at = NOW() WHERE id = $1", [invite.id]);

  await logActivity(null, 'user.accept_invite', `${invite.email} accepted invite as ${invite.role}`, 'user', invite.email, ip);

  return NextResponse.json({ ok: true }, { headers });
}
