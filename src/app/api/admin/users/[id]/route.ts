import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { requireRole } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const PUT = adminHandler(async (request, user, { headers, ip }) => {
  const targetId = parseInt(new URL(request.url).pathname.split('/').pop() || '', 10);
  if (Number.isNaN(targetId)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400, headers });
  if (user.via === 'token') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  if (!requireRole(user, 'owner')) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  if (targetId === user.id) return NextResponse.json({ error: 'Cannot change own role' }, { status: 400, headers });

  const body = await request.json();
  if (!body.role || !['admin', 'viewer'].includes(body.role)) {
    return NextResponse.json({ error: 'role must be admin or viewer' }, { status: 400, headers });
  }

  await query("UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2", [body.role, targetId]);
  await query('DELETE FROM sessions WHERE user_id = $1', [targetId]);
  const updated = await queryOne('SELECT id, email, display_name, role FROM users WHERE id = $1', [targetId]);
  await logActivity(user, 'user.role_change', `Changed ${updated?.email} role to ${body.role}`, 'user', String(targetId), ip);
  return NextResponse.json({ ok: true, user: updated }, { headers });
});

export const DELETE = adminHandler(async (request, user, { headers, ip }) => {
  const targetId = parseInt(new URL(request.url).pathname.split('/').pop() || '', 10);
  if (Number.isNaN(targetId)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400, headers });
  if (user.via === 'token') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  if (!requireRole(user, 'owner', 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  if (targetId === user.id) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400, headers });

  const target = await queryOne<any>('SELECT * FROM users WHERE id = $1', [targetId]);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
  if (target.role === 'owner') return NextResponse.json({ error: 'Cannot delete the owner' }, { status: 400, headers });
  if (user.role === 'admin' && target.role !== 'viewer') return NextResponse.json({ error: 'Admins can only delete viewers' }, { status: 403, headers });

  await query('DELETE FROM users WHERE id = $1', [targetId]);
  await query('DELETE FROM sessions WHERE user_id = $1', [targetId]);
  await logActivity(user, 'user.remove', `Removed user ${target.email}`, 'user', String(targetId), ip);
  return NextResponse.json({ ok: true }, { headers });
});
