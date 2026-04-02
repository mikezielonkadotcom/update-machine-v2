import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { queryAll, queryOne } from '@/lib/db';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, user, { headers }) => {
  const url = new URL(request.url);
  const pageRaw = parseInt(url.searchParams.get('page') || '1', 10);
  const perPageRaw = parseInt(url.searchParams.get('per_page') || '50', 10);
  const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
  const perPage = Number.isNaN(perPageRaw) ? 50 : Math.min(100, Math.max(1, perPageRaw));
  const offset = (page - 1) * perPage;

  const [countRow, sites] = await Promise.all([
    queryOne<{ c: string }>('SELECT COUNT(*) as c FROM sites'),
    queryAll('SELECT * FROM sites ORDER BY last_seen DESC LIMIT $1 OFFSET $2', [perPage, offset]),
  ]);
  const total = Number(countRow?.c || 0);

  return NextResponse.json(
    {
      sites,
      count: sites.length,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
    },
    { headers },
  );
});
