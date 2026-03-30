import { NextRequest, NextResponse } from 'next/server';
import { adminCorsHeaders, bootstrapOwner } from '@/lib/helpers';
import { verifyAdmin, requireRole, getClientIp } from '@/lib/auth';
import { query } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCorsHeaders(new URL(request.url).origin) });
}

export async function DELETE(request: NextRequest) {
  const headers = adminCorsHeaders(new URL(request.url).origin);
  try { await bootstrapOwner(); } catch {}
  const user = await verifyAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!requireRole(user, 'owner')) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const result = await query("DELETE FROM error_log WHERE created_at < NOW() - INTERVAL '30 days'");
  const ip = getClientIp(request);
  await logActivity(user, 'errors.cleanup', `Cleared ${result.rowCount} old error log entries`, undefined, undefined, ip);
  return NextResponse.json({ deleted: result.rowCount }, { headers });
}
