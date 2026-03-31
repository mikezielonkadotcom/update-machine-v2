import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { canWrite } from '@/lib/auth';
import { query, queryAll } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, user, { headers }) => {
  const groups = await queryAll('SELECT * FROM groups ORDER BY name');
  return NextResponse.json({ groups }, { headers });
});

export const POST = adminHandler(async (request, user, { headers, ip }) => {
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const body = await request.json();
  const { name, slug, auth_mode, require_key } = body;
  if (!name || !slug) return NextResponse.json({ error: 'name and slug required' }, { status: 400, headers });
  if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: 'slug must be lowercase alphanumeric with hyphens' }, { status: 400, headers });

  const validModes = ['auto', 'license-key', 'both'];
  const mode = validModes.includes(auth_mode) ? auth_mode : 'auto';
  const rk = !!require_key;

  try {
    const result = await query(
      'INSERT INTO groups (name, slug, auth_mode, require_key) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, slug, mode, rk]
    );
    const id = result.rows[0].id;
    await logActivity(user, 'group.create', `Created group '${name}'`, 'group', String(id), ip);
    return NextResponse.json({ id, name, slug, auth_mode: mode, require_key: rk }, { status: 201, headers });
  } catch {
    return NextResponse.json({ error: 'Group slug already exists' }, { status: 409, headers });
  }
});
