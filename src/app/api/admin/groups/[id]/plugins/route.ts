import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders, bootstrapOwner } from '@/lib/helpers';
import { verifyAdmin, canWrite, getClientIp } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(new URL(request.url).origin) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = parseInt(id);
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const body = await request.json();
  if (!body.plugin_slug) return NextResponse.json({ error: 'plugin_slug required' }, { status: 400, headers });

  await query(
    'INSERT INTO group_plugins (group_id, plugin_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [groupId, body.plugin_slug]
  );
  const group = await queryOne<any>('SELECT name FROM groups WHERE id = $1', [groupId]);
  const ip = getClientIp(request);
  await logActivity(user, 'group.add_plugin', `Added plugin '${body.plugin_slug}' to group '${group?.name}'`, 'group', String(groupId), ip);
  return NextResponse.json({ group_id: groupId, plugin_slug: body.plugin_slug }, { status: 201, headers });
}
