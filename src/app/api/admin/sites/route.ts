import { NextRequest, NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { queryAll } from '@/lib/db';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, user, { headers }) => {
  const sites = await queryAll('SELECT * FROM sites ORDER BY last_seen DESC');
  return NextResponse.json({ sites, count: sites.length }, { headers });
});
