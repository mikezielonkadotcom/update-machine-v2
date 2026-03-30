import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders, bootstrapOwner } from '@/lib/helpers';
import { verifyAdmin, canWrite, getClientIp } from '@/lib/auth';
import { query, queryAll } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(new URL(request.url).origin) });
}

export async function GET(request: NextRequest) {
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const blocked = await queryAll('SELECT * FROM blocklist ORDER BY created_at DESC');
  return NextResponse.json({ blocked, count: blocked.length }, { headers });
}

export async function POST(request: NextRequest) {
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const body = await request.json();
  const siteUrl = (body.site_url || '').trim().replace(/\/+$/, '');
  if (!siteUrl) return NextResponse.json({ error: 'site_url required' }, { status: 400, headers });

  try {
    await query('INSERT INTO blocklist (site_url, reason) VALUES ($1, $2)', [siteUrl, body.reason || '']);
  } catch {
    return NextResponse.json({ error: 'Already blocked' }, { status: 409, headers });
  }

  await query('UPDATE site_keys SET is_active = FALSE WHERE site_url = $1', [siteUrl]);
  const ip = getClientIp(request);
  await logActivity(user, 'blocklist.add', `Blocked domain '${siteUrl}'`, 'blocklist', siteUrl, ip);
  return NextResponse.json({ blocked: true, site_url: siteUrl }, { status: 201, headers });
}
