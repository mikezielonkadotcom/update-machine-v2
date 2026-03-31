import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { queryOne, queryAll } from '@/lib/db';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, user, { headers }) => {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '50')));
  const actionFilter = url.searchParams.get('action') || '';
  const userIdFilter = url.searchParams.get('user_id') || '';

  const where: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;
  if (actionFilter) { where.push(`action = $${paramIdx++}`); params.push(actionFilter); }
  if (userIdFilter) { where.push(`user_id = $${paramIdx++}`); params.push(parseInt(userIdFilter)); }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const total = await queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM activity_log ${whereClause}`, params);
  const offset = (page - 1) * perPage;
  const entries = await queryAll(
    `SELECT * FROM activity_log ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    [...params, perPage, offset]
  );

  return NextResponse.json({ entries, total: Number(total?.c || 0), page, per_page: perPage }, { headers });
});
