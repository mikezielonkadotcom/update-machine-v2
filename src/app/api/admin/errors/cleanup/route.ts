import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { requireRole } from '@/lib/auth';
import { query } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const DELETE = adminHandler(async (request, user, { headers, ip }) => {
  if (!requireRole(user, 'owner')) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const result = await query("DELETE FROM error_log WHERE created_at < NOW() - INTERVAL '30 days'");
  await logActivity(user, 'errors.cleanup', `Cleared ${result.rowCount} old error log entries`, undefined, undefined, ip);
  return NextResponse.json({ deleted: result.rowCount }, { headers });
});
