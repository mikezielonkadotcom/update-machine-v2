import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { canWrite } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const PUT = adminHandler(async (request, user, { headers, ip }) => {
  const segments = new URL(request.url).pathname.split('/');
  const groupId = parseInt(segments[segments.length - 1]);
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const body = await request.json();
  const sets: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (body.name !== undefined) { sets.push(`name = $${paramIdx++}`); values.push(body.name); }
  if (body.auth_mode !== undefined) {
    const validModes = ['auto', 'license-key', 'both'];
    if (validModes.includes(body.auth_mode)) { sets.push(`auth_mode = $${paramIdx++}`); values.push(body.auth_mode); }
  }
  if (body.require_key !== undefined) { sets.push(`require_key = $${paramIdx++}`); values.push(!!body.require_key); }
  if (sets.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400, headers });

  values.push(groupId);
  await query(`UPDATE groups SET ${sets.join(', ')} WHERE id = $${paramIdx}`, values);
  const updated = await queryOne('SELECT * FROM groups WHERE id = $1', [groupId]);
  await logActivity(user, 'group.update', `Updated group '${updated?.name}'`, 'group', String(groupId), ip);
  return NextResponse.json(updated, { headers });
});

export const DELETE = adminHandler(async (request, user, { headers, ip }) => {
  const segments = new URL(request.url).pathname.split('/');
  const groupId = parseInt(segments[segments.length - 1]);
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const group = await queryOne<any>('SELECT * FROM groups WHERE id = $1', [groupId]);
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404, headers });
  if (group.slug === 'default') return NextResponse.json({ error: 'Cannot delete default group' }, { status: 400, headers });

  const hasSites = await queryOne('SELECT 1 FROM site_keys WHERE group_id = $1 AND is_active = TRUE', [groupId]);
  if (hasSites) return NextResponse.json({ error: 'Group has active sites' }, { status: 400, headers });

  await query('DELETE FROM group_plugins WHERE group_id = $1', [groupId]);
  await query('DELETE FROM groups WHERE id = $1', [groupId]);
  await logActivity(user, 'group.delete', `Deleted group '${group.name}'`, 'group', String(groupId), ip);
  return NextResponse.json({ deleted: true }, { headers });
});
