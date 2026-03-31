import { NextRequest, NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { canWrite } from '@/lib/auth';
import { query } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const DELETE = adminHandler(async (request, user, { headers, ip }) => {
  const siteUrl = decodeURIComponent(new URL(request.url).pathname.split('/').pop()!);
  if (!canWrite(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  await query('DELETE FROM blocklist WHERE site_url = $1', [siteUrl]);
  await logActivity(user, 'blocklist.remove', `Unblocked domain '${siteUrl}'`, 'blocklist', siteUrl, ip);
  return NextResponse.json({ unblocked: true }, { headers });
});
