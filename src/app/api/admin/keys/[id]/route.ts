import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { canWrite } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const PUT = adminHandler(async (request, user, { headers, ip }) => {
  const keyId = parseInt(new URL(request.url).pathname.split('/').pop()!);
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const body = await request.json();
  const sets: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (body.is_active !== undefined) { sets.push(`is_active = $${paramIdx++}`); values.push(!!body.is_active); }
  if (body.group_id !== undefined) { sets.push(`group_id = $${paramIdx++}`); values.push(body.group_id); }
  if (body.domain_locked !== undefined) { sets.push(`domain_locked = $${paramIdx++}`); values.push(!!body.domain_locked); }
  if (sets.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400, headers });

  values.push(keyId);
  await query(`UPDATE site_keys SET ${sets.join(', ')} WHERE id = $${paramIdx}`, values);
  const updated = await queryOne('SELECT * FROM site_keys WHERE id = $1', [keyId]);
  await logActivity(user, 'key.update', `Updated key ${keyId}`, 'site_key', String(keyId), ip);
  return NextResponse.json(updated, { headers });
});

export const DELETE = adminHandler(async (request, user, { headers, ip }) => {
  const keyId = parseInt(new URL(request.url).pathname.split('/').pop()!);
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  await query('UPDATE site_keys SET is_active = FALSE WHERE id = $1', [keyId]);
  await logActivity(user, 'key.revoke', `Revoked key ${keyId}`, 'site_key', String(keyId), ip);
  return NextResponse.json({ revoked: true }, { headers });
});
