import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { hmacVerify } from './crypto';
import { queryOne, query } from './db';

export interface AuthUser {
  id: number | null;
  email: string;
  display_name: string;
  role: string;        // 'owner' | 'admin' | 'viewer'
  via: 'token' | 'session';
  session_id?: string;
  session_expires_at?: string;
}

const MAX_SESSION_ABSOLUTE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;

export function getSessionSecret(): string {
  return process.env.SESSION_SECRET || process.env.ADMIN_TOKEN || '';
}

/**
 * Authenticate an admin request. Supports two methods:
 *
 * 1. Bearer token: `Authorization: Bearer {ADMIN_TOKEN}`
 *    Returns a synthetic "owner" user — used by CI/CD, cron, and the WP client.
 *
 * 2. Session cookie: `um_session={sessionId}.{hmacSignature}`
 *    The cookie value is "{session_id}.{hmac_sha256(session_id, SESSION_SECRET)}".
 *    We verify the HMAC first (fast, no DB hit), then look up the session in
 *    Postgres to check expiry and load the user's role.
 *
 * Sessions are auto-refreshed: if more than 50% of the session lifetime has
 * elapsed, the expiry is silently extended by the full lifetime. This gives
 * active users a seamless experience without explicit "remember me" renewals.
 */
export async function verifyAdmin(request: NextRequest): Promise<AuthUser | null> {
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (!adminToken) return null;
  const sessionSecret = getSessionSecret();
  if (!sessionSecret) return null;

  // Method 1: Bearer token (API/cron access)
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token && token === adminToken) {
    // By design, ADMIN_TOKEN maps to owner-equivalent access for machine-to-machine workflows.
    return { id: null, email: 'bearer-token', display_name: 'API Token', role: 'owner', via: 'token' };
  }

  // Method 2: HMAC-signed session cookie
  const cookieStore = await cookies();
  const session = cookieStore.get('um_session')?.value;
  if (!session) return null;

  // Split cookie into session ID and HMAC signature
  const dotIdx = session.indexOf('.');
  if (dotIdx < 0) return null;

  const sessionId = session.substring(0, dotIdx);
  const sig = session.substring(dotIdx + 1);

  // Verify the HMAC before hitting the DB (timing-safe)
  const valid = await hmacVerify(sessionId, sig, sessionSecret);
  if (!valid) return null;

  const row = await queryOne<any>(
    `SELECT s.id as session_id, s.expires_at, s.created_at as session_created_at,
            u.id, u.email, u.display_name, u.role, u.is_active
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.id = $1 AND s.expires_at > NOW() AND u.is_active = TRUE`,
    [sessionId]
  );

  if (!row) return null;

  // Sliding window refresh: extend session if >50% of lifetime elapsed,
  // but never past the max absolute session lifetime.
  const created = new Date(row.session_created_at).getTime();
  const expires = new Date(row.expires_at).getTime();
  const now = Date.now();
  if (now - created > MAX_SESSION_ABSOLUTE_LIFETIME_MS) {
    await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    return null;
  }

  const totalLifetime = expires - created;
  const elapsed = now - created;
  if (elapsed > totalLifetime * 0.5) {
    const newExpiry = new Date(now + totalLifetime).toISOString();
    query('UPDATE sessions SET expires_at = $1 WHERE id = $2', [newExpiry, sessionId])
      .catch((e: Error) => console.warn('Session refresh failed:', e.message));
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

/** Check if a user has write access (owner, admin, or API token). */
export function canWrite(user: AuthUser): boolean {
  return user.role === 'owner' || user.role === 'admin' || user.via === 'token';
}

/** Check if a user has one of the specified roles. */
export function requireRole(user: AuthUser, ...roles: string[]): boolean {
  return roles.includes(user.role);
}

/** Extract the client IP from proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
}
