import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders, bootstrapOwner } from '@/lib/helpers';
import { verifyAdmin, canWrite, getClientIp } from '@/lib/auth';
import { query } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(new URL(request.url).origin) });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ url: string }> }) {
  const { url: encodedUrl } = await params;
  const siteUrl = decodeURIComponent(encodedUrl);
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  await query('DELETE FROM blocklist WHERE site_url = $1', [siteUrl]);
  const ip = getClientIp(request);
  await logActivity(user, 'blocklist.remove', `Unblocked domain '${siteUrl}'`, 'blocklist', siteUrl, ip);
  return NextResponse.json({ unblocked: true }, { headers });
}
