import { NextRequest, NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { canWrite } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const POST = adminHandler(async (request, user, { headers, ip }) => {
  const segments = new URL(request.url).pathname.split('/');
  // URL: /api/admin/groups/[id]/plugins → id is at index -2
  const groupId = parseInt(segments[segments.length - 2]);
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const body = await request.json();
  if (!body.plugin_slug) return NextResponse.json({ error: 'plugin_slug required' }, { status: 400, headers });

  await query(
    'INSERT INTO group_plugins (group_id, plugin_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [groupId, body.plugin_slug]
  );
  const group = await queryOne<any>('SELECT name FROM groups WHERE id = $1', [groupId]);
  await logActivity(user, 'group.add_plugin', `Added plugin '${body.plugin_slug}' to group '${group?.name}'`, 'group', String(groupId), ip);
  return NextResponse.json({ group_id: groupId, plugin_slug: body.plugin_slug }, { status: 201, headers });
});
