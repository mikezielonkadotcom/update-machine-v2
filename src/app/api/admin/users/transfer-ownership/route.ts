import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { requireRole } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const POST = adminHandler(async (request, user, { headers, ip }) => {
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

  await logActivity(user, 'user.transfer_ownership', `Transferred ownership to ${target.email}`, 'user', String(targetId), ip);
  return NextResponse.json({ ok: true }, { headers });
});
