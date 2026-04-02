import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { queryOne } from '@/lib/db';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (_request, user, { headers }) => {
  if (user.via !== 'session') return NextResponse.json({ error: 'Session auth required' }, { status: 403, headers });

  const row = await queryOne<{ totp_enabled: boolean; totp_verified_at: string | null }>(
    'SELECT totp_enabled, totp_verified_at FROM users WHERE id = $1',
    [user.id],
  );

  if (!row) return NextResponse.json({ error: 'User not found' }, { status: 404, headers });

  return NextResponse.json(
    {
      enabled: row.totp_enabled,
      verified_at: row.totp_verified_at,
    },
    { headers },
  );
});
