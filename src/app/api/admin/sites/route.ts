import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders, bootstrapOwner } from '@/lib/helpers';
import { verifyAdmin } from '@/lib/auth';
import { queryAll } from '@/lib/db';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(new URL(request.url).origin) });
}

export async function GET(request: NextRequest) {
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });

  const sites = await queryAll('SELECT * FROM sites ORDER BY last_seen DESC');
  return NextResponse.json({ sites, count: sites.length }, { headers });
}
