import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { canWrite } from '@/lib/auth';
import { query, queryAll } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, user, { headers }) => {
  const blocked = await queryAll('SELECT * FROM blocklist ORDER BY created_at DESC');
  return NextResponse.json({ blocked, count: blocked.length }, { headers });
});

export const POST = adminHandler(async (request, user, { headers, ip }) => {
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const body = await request.json();
  const siteUrl = (body.site_url || '').trim().replace(/\/+$/, '');
  if (!siteUrl) return NextResponse.json({ error: 'site_url required' }, { status: 400, headers });

  try {
    await query('INSERT INTO blocklist (site_url, reason) VALUES ($1, $2)', [siteUrl, body.reason || '']);
  } catch {
    return NextResponse.json({ error: 'Already blocked' }, { status: 409, headers });
  }

  await query('UPDATE site_keys SET is_active = FALSE WHERE site_url = $1', [siteUrl]);
  await logActivity(user, 'blocklist.add', `Blocked domain '${siteUrl}'`, 'blocklist', siteUrl, ip);
  return NextResponse.json({ blocked: true, site_url: siteUrl }, { status: 201, headers });
});
