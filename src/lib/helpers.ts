import { NextRequest } from 'next/server';
import { hashKey } from './crypto';
import { query, queryOne } from './db';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Update-Key',
  'X-Robots-Tag': 'noindex, nofollow',
};

/**
 * Returns CORS headers for admin endpoints.
 * Validates the request origin against NEXT_PUBLIC_BASE_URL and ALLOWED_ORIGINS.
 * Falls back to reflecting the request origin in development when no origins are configured.
 */
export function adminCorsHeaders(requestOrigin: string): Record<string, string> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  const allowedCsv = process.env.ALLOWED_ORIGINS || '';

  const allowed = new Set<string>();
  if (baseUrl) allowed.add(baseUrl.replace(/\/+$/, ''));
  for (const o of allowedCsv.split(',')) {
    const trimmed = o.trim();
    if (trimmed) allowed.add(trimmed);
  }

  // If no origins configured (local dev), allow the request origin.
  // In production NEXT_PUBLIC_BASE_URL should always be set.
  const origin = allowed.size === 0 || allowed.has(requestOrigin)
    ? requestOrigin
    : (allowed.values().next().value ?? requestOrigin);

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Update-Key',
    'Access-Control-Allow-Credentials': 'true',
    'X-Robots-Tag': 'noindex, nofollow',
  };
}

export function extractSiteKey(request: NextRequest): string | null {
  return request.headers.get('X-Update-Key') ||
    new URL(request.url).searchParams.get('key') ||
    null;
}

export async function validateSiteKey(plainKey: string): Promise<any | null> {
  if (!plainKey) return null;
  const hashed = await hashKey(plainKey);
  const row = await queryOne(
    'SELECT * FROM site_keys WHERE site_key = $1 AND is_active = TRUE',
    [hashed]
  );
  if (row) {
    query('UPDATE site_keys SET last_used = NOW() WHERE id = $1', [row.id]).catch(() => {});
  }
  return row;
}

export async function checkDownloadAuth(
  slug: string,
  request: NextRequest
): Promise<{ status: number; message: string } | null> {
  const group = await queryOne<any>(
    `SELECT g.* FROM groups g
     JOIN group_plugins gp ON gp.group_id = g.id
     WHERE gp.plugin_slug = $1`,
    [slug]
  );

  if (!group || !group.require_key) return null;

  const plainKey = extractSiteKey(request);
  if (!plainKey) return { status: 403, message: 'Forbidden: site key required' };

  const keyRow = await validateSiteKey(plainKey);
  if (!keyRow) return { status: 403, message: 'Forbidden: invalid site key' };

  if (keyRow.domain_locked && keyRow.site_url) {
    const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
    const normalizedOrigin = origin.replace(/\/+$/, '');
    if (!normalizedOrigin.startsWith(keyRow.site_url)) {
      return { status: 403, message: 'Forbidden: key is domain-locked' };
    }
  }

  const access = await queryOne(
    'SELECT 1 FROM group_plugins WHERE group_id = $1 AND plugin_slug = $2',
    [keyRow.group_id, slug]
  );

  if (!access) return { status: 403, message: 'Forbidden: key does not have access to this plugin' };
  return null;
}

/**
 * Cached bootstrap: creates the owner account from env vars if no users exist.
 * Once it runs successfully (or finds existing users), it won't hit the DB again
 * for the lifetime of this serverless instance.
 */
let bootstrapDone = false;
export async function bootstrapOwner(): Promise<void> {
  if (bootstrapDone) return;

  const count = await queryOne<{ c: number }>('SELECT COUNT(*) as c FROM users');
  if (!count || Number(count.c) > 0) {
    bootstrapDone = true;
    return;
  }

  const email = process.env.ADMIN_EMAIL || '';
  const legacyHash = process.env.ADMIN_PASSWORD_HASH || '';
  if (!email || !legacyHash) return;

  await query(
    'INSERT INTO users (email, display_name, password_hash, role) VALUES ($1, $2, $3, $4)',
    [email, email, legacyHash.startsWith('sha256:') ? legacyHash : `sha256:${legacyHash}`, 'owner']
  );

  await query(
    'INSERT INTO activity_log (user_id, user_email, action, description) VALUES ($1, $2, $3, $4)',
    [null, 'system', 'system.bootstrap', 'Owner account created from environment variables']
  );

  bootstrapDone = true;
}
