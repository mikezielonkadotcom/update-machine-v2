import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { queryOne, queryAll } from '@/lib/db';
import { logError } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, user, { headers }) => {
  try {
    const url = new URL(request.url);
    const pluginFilter = url.searchParams.get('plugin') || '';
    const daysFilter = parseInt(url.searchParams.get('days') || '0', 10) || 0;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;
    if (pluginFilter) { conditions.push(`plugin_slug = $${paramIdx++}`); params.push(pluginFilter); }
    if (daysFilter > 0) { conditions.push(`created_at > NOW() - INTERVAL '1 day' * $${paramIdx++}`); params.push(daysFilter); }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const totalResult = await queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM download_log ${whereClause}`, params);
    const total = Number(totalResult?.c || 0);

    const perPlugin = await queryAll(
      `SELECT plugin_slug, COUNT(*) as downloads FROM download_log ${whereClause} GROUP BY plugin_slug ORDER BY downloads DESC`,
      params
    );

    const perVersion = await queryAll(
      `SELECT plugin_slug, plugin_version, COUNT(*) as downloads FROM download_log ${whereClause} GROUP BY plugin_slug, plugin_version ORDER BY downloads DESC`,
      params
    );

    const rawRecent = await queryAll<any>(
      `SELECT * FROM download_log ${whereClause} ORDER BY created_at DESC LIMIT 50`,
      params
    );
    const recent = rawRecent.map((row) => (
      user.role === 'owner'
        ? row
        : { ...row, site_ip: null }
    ));

    return NextResponse.json({ total, per_plugin: perPlugin, per_version: perVersion, recent }, { headers });
  } catch (e: any) {
    logError({ source: 'admin', message: e.message });
    return NextResponse.json({ total: 0, per_plugin: [], per_version: [], recent: [] }, { headers });
  }
});
