import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { canWrite } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const DELETE = adminHandler(async (request, user, { headers, ip }) => {
  const segments = new URL(request.url).pathname.split('/');
  // URL: /api/admin/groups/[id]/plugins/[slug] → slug is last, id is at -3
  const slug = decodeURIComponent(segments[segments.length - 1]);
  const groupId = parseInt(segments[segments.length - 3]);
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  await query('DELETE FROM group_plugins WHERE group_id = $1 AND plugin_slug = $2', [groupId, slug]);
  const group = await queryOne<any>('SELECT name FROM groups WHERE id = $1', [groupId]);
  await logActivity(user, 'group.remove_plugin', `Removed plugin '${slug}' from group '${group?.name}'`, 'group', String(groupId), ip);
  return NextResponse.json({ deleted: true }, { headers });
});
