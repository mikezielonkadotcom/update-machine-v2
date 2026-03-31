import { NextRequest, NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { query } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const POST = adminHandler(async (request, user, { headers, ip }) => {
  if (user.session_id) {
    await query('DELETE FROM sessions WHERE id = $1', [user.session_id]);
  }
  await logActivity(user, 'user.logout', 'User logged out', undefined, undefined, ip);

  const response = NextResponse.json({ ok: true }, { headers });
  response.headers.set('Set-Cookie', 'um_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  return response;
});
