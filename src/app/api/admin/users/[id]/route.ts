import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders, bootstrapOwner } from '@/lib/helpers';
import { verifyAdmin, requireRole, getClientIp } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(new URL(request.url).origin) });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const targetId = parseInt(id);
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
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
  const ip = getClientIp(request);
  await logActivity(user, 'user.role_change', `Changed ${updated?.email} role to ${body.role}`, 'user', String(targetId), ip);
  return NextResponse.json({ ok: true, user: updated }, { headers });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const targetId = parseInt(id);
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (user.via === 'token') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  if (!requireRole(user, 'owner', 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  if (targetId === user.id) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400, headers });

  const target = await queryOne<any>('SELECT * FROM users WHERE id = $1', [targetId]);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
  if (target.role === 'owner') return NextResponse.json({ error: 'Cannot delete the owner' }, { status: 400, headers });
  if (user.role === 'admin' && target.role !== 'viewer') return NextResponse.json({ error: 'Admins can only delete viewers' }, { status: 403, headers });

  await query('DELETE FROM users WHERE id = $1', [targetId]);
  await query('DELETE FROM sessions WHERE user_id = $1', [targetId]);
  const ip = getClientIp(request);
  await logActivity(user, 'user.remove', `Removed user ${target.email}`, 'user', String(targetId), ip);
  return NextResponse.json({ ok: true }, { headers });
}
