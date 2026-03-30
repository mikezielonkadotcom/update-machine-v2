import { NextRequest, NextResponse } from 'next/server';
import { hashKey } from './crypto';
import { query, queryOne } from './db';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Update-Key',
  'X-Robots-Tag': 'noindex, nofollow',
};

export function adminCorsHeaders(origin: string): Record<string, string> {
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

export async function bootstrapOwner(): Promise<void> {
  const count = await queryOne<{ c: number }>('SELECT COUNT(*) as c FROM users');
  if (!count || Number(count.c) > 0) return;

  const email = process.env.ADMIN_EMAIL || '';
  const legacyHash = process.env.ADMIN_PASSWORD_HASH || '';
  if (!email || !legacyHash) return;

  await query(
    'INSERT INTO users (email, display_name, password_hash, role) VALUES ($1, $2, $3, $4)',
    [email, email, 'sha256:' + legacyHash, 'owner']
  );

  await query(
    'INSERT INTO activity_log (user_id, user_email, action, description) VALUES ($1, $2, $3, $4)',
    [null, 'system', 'system.bootstrap', 'Owner account created from environment variables']
  );
}
