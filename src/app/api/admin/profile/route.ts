import { NextResponse } from 'next/server';
import { adminHandler, adminOptions } from '@/lib/admin-handler';
import { verifyAndUpgradePassword, hashPassword } from '@/lib/crypto';
import { query, queryOne } from '@/lib/db';
import { logActivity } from '@/lib/logging';

export { adminOptions as OPTIONS };

export const GET = adminHandler(async (request, user, { headers }) => {
  return NextResponse.json({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
  }, { headers });
});

export const PUT = adminHandler(async (request, user, { headers, ip }) => {
  if (user.via === 'token') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });

  const body = await request.json();
  if (!body.current_password) return NextResponse.json({ error: 'current_password required' }, { status: 400, headers });

  const dbUser = await queryOne<any>('SELECT * FROM users WHERE id = $1', [user.id]);
  const valid = await verifyAndUpgradePassword(
    body.current_password,
    dbUser.password_hash,
    dbUser.id,
    async (userId, newHash) => {
      await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
    }
  );
  if (!valid) return NextResponse.json({ error: 'Invalid current password' }, { status: 401, headers });

  const updates: string[] = [];
  const vals: any[] = [];
  let paramIdx = 1;

  if (body.new_password) {
    if (body.new_password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400, headers });
    const newHash = await hashPassword(body.new_password);
    updates.push(`password_hash = $${paramIdx++}`);
    vals.push(newHash);
  }
  if (body.display_name) {
    updates.push(`display_name = $${paramIdx++}`);
    vals.push(body.display_name.trim());
  }

  if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400, headers });

  updates.push(`updated_at = NOW()`);
  vals.push(user.id);
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}`, vals);

  if (body.new_password && user.session_id) {
    await query('DELETE FROM sessions WHERE user_id = $1 AND id != $2', [user.id, user.session_id]);
  }

  await logActivity(user, 'user.profile_update', 'User updated their profile', 'user', String(user.id), ip);
  return NextResponse.json({ ok: true }, { headers });
});
