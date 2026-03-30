import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders, bootstrapOwner } from '@/lib/helpers';
import { verifyAdmin, canWrite, getClientIp } from '@/lib/auth';
import { query, queryAll } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(new URL(request.url).origin) });
}

export async function GET(request: NextRequest) {
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const groups = await queryAll('SELECT * FROM groups ORDER BY name');
  return NextResponse.json({ groups }, { headers });
}

export async function POST(request: NextRequest) {
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const body = await request.json();
  const { name, slug, auth_mode, require_key } = body;
  if (!name || !slug) return NextResponse.json({ error: 'name and slug required' }, { status: 400, headers });
  if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: 'slug must be lowercase alphanumeric with hyphens' }, { status: 400, headers });

  const validModes = ['auto', 'license-key', 'both'];
  const mode = validModes.includes(auth_mode) ? auth_mode : 'auto';
  const rk = !!require_key;
  const ip = getClientIp(request);

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
}
