import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { hmacVerify, hmacSign } from './crypto';
import { queryOne, query } from './db';

export interface AuthUser {
  id: number | null;
  email: string;
  display_name: string;
  role: string;
  via: 'token' | 'session';
  session_id?: string;
  session_expires_at?: string;
}

export async function verifyAdmin(request: NextRequest): Promise<AuthUser | null> {
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (!adminToken) return null;

  // Bearer token
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token && token === adminToken) {
    return { id: null, email: 'bearer-token', display_name: 'API Token', role: 'owner', via: 'token' };
  }

  // Session cookie
  const cookieStore = await cookies();
  const session = cookieStore.get('um_session')?.value;
  if (!session) return null;

  const dotIdx = session.indexOf('.');
  if (dotIdx < 0) return null;

  const sessionId = session.substring(0, dotIdx);
  const sig = session.substring(dotIdx + 1);

  const valid = await hmacVerify(sessionId, sig, adminToken);
  if (!valid) return null;

  const row = await queryOne<any>(
    `SELECT s.id as session_id, s.expires_at, s.created_at as session_created_at,
            u.id, u.email, u.display_name, u.role, u.is_active
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.id = $1 AND s.expires_at > NOW() AND u.is_active = TRUE`,
    [sessionId]
  );

  if (!row) return null;

  // Session refresh: if >50% of lifetime has elapsed, extend
  const created = new Date(row.session_created_at).getTime();
  const expires = new Date(row.expires_at).getTime();
  const now = Date.now();
  const totalLifetime = expires - created;
  const elapsed = now - created;
  if (elapsed > totalLifetime * 0.5) {
    const newExpiry = new Date(now + totalLifetime).toISOString();
    query('UPDATE sessions SET expires_at = $1 WHERE id = $2', [newExpiry, sessionId]).catch(() => {});
  }

  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: row.role,
    via: 'session',
    session_id: row.session_id,
    session_expires_at: row.expires_at,
  };
}

export function canWrite(user: AuthUser): boolean {
  return user.role === 'owner' || user.role === 'admin' || user.via === 'token';
}

export function requireRole(user: AuthUser, ...roles: string[]): boolean {
  return roles.includes(user.role);
}

export function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
}
