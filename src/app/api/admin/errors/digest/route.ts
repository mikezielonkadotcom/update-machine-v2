import { NextRequest, NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { queryOne, queryAll } from '@/lib/db';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, user, { headers }) => {
  const totalResult = await queryOne<{ c: string }>(
    "SELECT COUNT(*) as c FROM error_log WHERE created_at > NOW() - INTERVAL '24 hours'"
  );
  const total_errors = Number(totalResult?.c || 0);

  const byLevelRows = await queryAll<{ level: string; c: string }>(
    "SELECT level, COUNT(*) as c FROM error_log WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY level"
  );
  const by_level: Record<string, number> = {};
  for (const r of byLevelRows) by_level[r.level] = Number(r.c);

  const bySourceRows = await queryAll<{ source: string; c: string }>(
    "SELECT source, COUNT(*) as c FROM error_log WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY source"
  );
  const by_source: Record<string, number> = {};
  for (const r of bySourceRows) by_source[r.source] = Number(r.c);

  const recent = await queryAll(
    "SELECT * FROM error_log WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC LIMIT 10"
  );

  return NextResponse.json({ total_errors, by_level, by_source, recent }, { headers });
});
