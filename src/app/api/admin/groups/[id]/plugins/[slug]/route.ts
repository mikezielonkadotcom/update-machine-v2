import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders, bootstrapOwner } from '@/lib/helpers';
import { verifyAdmin, canWrite, getClientIp } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(new URL(request.url).origin) });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id, slug } = await params;
  const groupId = parseInt(id);
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  await query('DELETE FROM group_plugins WHERE group_id = $1 AND plugin_slug = $2', [groupId, slug]);
  const group = await queryOne<any>('SELECT name FROM groups WHERE id = $1', [groupId]);
  const ip = getClientIp(request);
  await logActivity(user, 'group.remove_plugin', `Removed plugin '${slug}' from group '${group?.name}'`, 'group', String(groupId), ip);
  return NextResponse.json({ deleted: true }, { headers });
}
