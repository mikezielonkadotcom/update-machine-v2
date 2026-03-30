import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders, bootstrapOwner } from '@/lib/helpers';
import { verifyAdmin, requireRole, getClientIp } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(new URL(request.url).origin) });
}

export async function POST(request: NextRequest) {
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (user.via === 'token') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  if (!requireRole(user, 'owner')) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const body = await request.json();
  const targetId = body.user_id;
  if (!targetId) return NextResponse.json({ error: 'user_id required' }, { status: 400, headers });

  const target = await queryOne<any>('SELECT * FROM users WHERE id = $1 AND is_active = TRUE', [targetId]);
  if (!target || target.role !== 'admin') return NextResponse.json({ error: 'Target must be an active admin' }, { status: 400, headers });

  await query("UPDATE users SET role = 'admin', updated_at = NOW() WHERE role = 'owner'");
  await query("UPDATE users SET role = 'owner', updated_at = NOW() WHERE id = $1", [targetId]);
  await query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
  await query('DELETE FROM sessions WHERE user_id = $1', [targetId]);

  const ip = getClientIp(request);
  await logActivity(user, 'user.transfer_ownership', `Transferred ownership to ${target.email}`, 'user', String(targetId), ip);
  return NextResponse.json({ ok: true }, { headers });
}
