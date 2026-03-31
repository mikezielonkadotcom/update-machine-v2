import { NextRequest, NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { queryAll } from '@/lib/db';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, user, { headers }) => {
  const sessions = await queryAll(`
    SELECT s.id, s.user_id, s.created_at, s.expires_at, u.email, u.display_name
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.expires_at > NOW()
    ORDER BY s.created_at DESC
  `);
  return NextResponse.json({ sessions }, { headers });
});
