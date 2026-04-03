import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { queryAll, queryOne } from '@/lib/db';
import { logError } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, _user, { headers }) => {
  try {
    const url = new URL(request.url);
    const pluginSlug = (url.searchParams.get('plugin_slug') || '').trim();
    const siteUrl = (url.searchParams.get('site_url') || '').trim();
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const offset = (page - 1) * limit;

    const whereParts: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (pluginSlug) {
      whereParts.push(`plugin_slug = $${idx++}`);
      params.push(pluginSlug);
    }
    if (siteUrl) {
      whereParts.push(`site_url ILIKE $${idx++}`);
      params.push(`%${siteUrl}%`);
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const totalRow = await queryOne<{ c: string }>(
      `SELECT COUNT(*) as c FROM update_check_log ${whereClause}`,
      params
    );

    const records = await queryAll(
      `SELECT * FROM update_check_log ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return NextResponse.json(
      {
        total: Number(totalRow?.c || 0),
        page,
        limit,
        records,
      },
      { headers }
    );
  } catch (e: any) {
    logError({ source: 'admin', message: e.message });
    return NextResponse.json({ total: 0, page: 1, limit: 50, records: [] }, { headers });
  }
});
