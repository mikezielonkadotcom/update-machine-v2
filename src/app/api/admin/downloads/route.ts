import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders, bootstrapOwner } from '@/lib/helpers';
import { verifyAdmin } from '@/lib/auth';
import { queryOne, queryAll } from '@/lib/db';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(new URL(request.url).origin) });
}

export async function GET(request: NextRequest) {
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });

  try {
    const url = new URL(request.url);
    const pluginFilter = url.searchParams.get('plugin') || '';
    const daysFilter = parseInt(url.searchParams.get('days') || '0') || 0;

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

    const recent = await queryAll(
      `SELECT * FROM download_log ${whereClause} ORDER BY created_at DESC LIMIT 50`,
      params
    );

    return NextResponse.json({ total, per_plugin: perPlugin, per_version: perVersion, recent }, { headers });
  } catch {
    return NextResponse.json({ total: 0, per_plugin: [], per_version: [], recent: [] }, { headers });
  }
}
