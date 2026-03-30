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
}
