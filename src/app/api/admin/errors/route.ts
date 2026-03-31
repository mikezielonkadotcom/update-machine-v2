import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { queryOne, queryAll } from '@/lib/db';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, user, { headers }) => {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '50')));
  const levelFilter = url.searchParams.get('level') || '';
  const sourceFilter = url.searchParams.get('source') || '';

  const where: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;
  if (levelFilter) { where.push(`level = $${paramIdx++}`); params.push(levelFilter); }
  if (sourceFilter) { where.push(`source = $${paramIdx++}`); params.push(sourceFilter); }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const total = await queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM error_log ${whereClause}`, params);
  const offset = (page - 1) * perPage;
  const entries = await queryAll(
    `SELECT * FROM error_log ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, perPage, offset]
  );

  return NextResponse.json({ entries, total: Number(total?.c || 0), page, per_page: perPage }, { headers });
});
