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

  const sessions = await queryAll(`
    SELECT s.id, s.user_id, s.created_at, s.expires_at, u.email, u.display_name
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.expires_at > NOW()
    ORDER BY s.created_at DESC
  `);
  return NextResponse.json({ sessions }, { headers });
}
