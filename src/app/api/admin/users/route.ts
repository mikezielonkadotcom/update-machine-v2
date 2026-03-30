import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders, bootstrapOwner } from '@/lib/helpers';
import { verifyAdmin, requireRole, getClientIp } from '@/lib/auth';
import { sha256Hex, randomHex } from '@/lib/crypto';
import { query, queryOne, queryAll } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(new URL(request.url).origin) });
}

export async function GET(request: NextRequest) {
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });

  const users = await queryAll(
    'SELECT id, email, display_name, role, is_active, created_at, updated_at FROM users ORDER BY created_at'
  );
  const invites = await queryAll(`
    SELECT i.id, i.email, i.role, u.email as invited_by_email, i.expires_at, i.accepted_at, i.created_at
    FROM invites i LEFT JOIN users u ON u.id = i.invited_by
    WHERE i.accepted_at IS NULL AND i.expires_at > NOW()
    ORDER BY i.created_at DESC
  `);
  return NextResponse.json({ users, invites }, { headers });
}

export async function POST(request: NextRequest) {
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (user.via === 'token') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  if (!requireRole(user, 'owner', 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const body = await request.json();
  const { email, role } = body;
  if (!email || !role) return NextResponse.json({ error: 'email and role required' }, { status: 400, headers });
  if (!['admin', 'viewer'].includes(role)) return NextResponse.json({ error: 'role must be admin or viewer' }, { status: 400, headers });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Invalid email format' }, { status: 400, headers });

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await queryOne('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE', [normalizedEmail]);
  if (existing) return NextResponse.json({ error: 'User already exists with this email' }, { status: 409, headers });

  const pendingInvite = await queryOne(
    "SELECT 1 FROM invites WHERE LOWER(email) = LOWER($1) AND accepted_at IS NULL AND expires_at > NOW()",
    [normalizedEmail]
  );
  if (pendingInvite) return NextResponse.json({ error: 'Pending invite already exists for this email' }, { status: 409, headers });

  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);

  await query(
    "INSERT INTO invites (email, role, token_hash, invited_by, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '72 hours')",
    [normalizedEmail, role, tokenHash, user.id]
  );

  const origin = new URL(request.url).origin;
  const inviteUrl = `${origin}/admin/invite?token=${token}`;
  const ip = getClientIp(request);
  await logActivity(user, 'user.invite', `Invited ${email} as ${role}`, 'invite', email, ip);

  return NextResponse.json({ ok: true, invite_url: inviteUrl, expires_at: '72 hours' }, { status: 201, headers });
}
