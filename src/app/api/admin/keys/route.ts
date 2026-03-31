import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { canWrite } from '@/lib/auth';
import { hashKey, randomHex } from '@/lib/crypto';
import { query, queryOne, queryAll } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, user, { headers }) => {
  const keys = await queryAll(`
    SELECT sk.id, sk.site_url, sk.group_id, sk.key_type, sk.domain_locked, sk.is_active, sk.created_at, sk.last_used,
           g.name as group_name, g.slug as group_slug
    FROM site_keys sk LEFT JOIN groups g ON g.id = sk.group_id ORDER BY sk.created_at DESC
  `);
  return NextResponse.json({ keys, count: keys.length }, { headers });
});

export const POST = adminHandler(async (request, user, { headers, ip }) => {
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const body = await request.json();
  const groupId = body.group_id || 1;
  const siteUrl = (body.site_url || '').trim().replace(/\/+$/, '');
  const domainLocked = body.domain_locked !== undefined ? !!body.domain_locked : !!siteUrl;

  const plainKey = `umsk_l_${randomHex(16)}`;
  const hashedKey = await hashKey(plainKey);

  await query(
    "INSERT INTO site_keys (site_key, site_url, group_id, key_type, domain_locked, is_active) VALUES ($1, $2, $3, 'license', $4, TRUE)",
    [hashedKey, siteUrl, groupId, domainLocked]
  );

  const group = await queryOne<any>('SELECT slug, name FROM groups WHERE id = $1', [groupId]);
  const gp = await queryAll<{ plugin_slug: string }>('SELECT plugin_slug FROM group_plugins WHERE group_id = $1', [groupId]);
  await logActivity(user, 'key.create', `Generated license key for group '${group?.name || 'default'}'`, 'site_key', plainKey.slice(0, 8), ip);

  return NextResponse.json(
    { site_key: plainKey, group: group?.slug || 'default', plugins: gp.map(r => r.plugin_slug) },
    { status: 201, headers }
  );
});
