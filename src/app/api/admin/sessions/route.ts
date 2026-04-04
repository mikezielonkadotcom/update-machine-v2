import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { requireRole } from '@/lib/auth';
import { queryAll } from '@/lib/db';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, user, { headers }) => {
  if (!requireRole(user, 'owner')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
  }

  const sessions = await queryAll(`
    SELECT s.id, s.user_id, s.created_at, s.expires_at, u.email, u.display_name
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.expires_at > NOW()
    ORDER BY s.created_at DESC
  `);
  const maskedSessions = sessions.map((session: any) => ({
    ...session,
    id: typeof session.id === 'string' ? `${session.id.slice(0, 8)}...` : session.id,
  }));

  return NextResponse.json({ sessions: maskedSessions }, { headers });
});
