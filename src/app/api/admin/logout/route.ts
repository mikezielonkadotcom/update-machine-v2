import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders } from '@/lib/helpers';
import { verifyAdmin, getClientIp } from '@/lib/auth';
import { query } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export async function OPTIONS(request: NextRequest) {
  const origin = new URL(request.url).origin;
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const headers = adminCorsHeaders(origin);
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });

  const ip = getClientIp(request);
  if (user.session_id) {
    await query('DELETE FROM sessions WHERE id = $1', [user.session_id]);
  }
  await logActivity(user, 'user.logout', 'User logged out', undefined, undefined, ip);

  const response = NextResponse.json({ ok: true }, { headers });
  response.headers.set('Set-Cookie', 'um_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  return response;
}
