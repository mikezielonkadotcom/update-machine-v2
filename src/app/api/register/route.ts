import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { corsHeaders } from '@/lib/helpers';
import { hashKey, randomHex } from '@/lib/crypto';
import { query, queryOne, queryAll } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { logWarn } from '@/lib/logging';
import { getClientIp } from '@/lib/auth';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await rateLimit('register', ip, 10, 60_000)) {
    logWarn({ source: 'register', message: `Rate limit exceeded for IP ${ip}`, request_ip: ip });
    return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: corsHeaders });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
  }

  const { site_url, site_name, admin_email, plugin_slug, plugin_version, timestamp, signature } = body;
  if (!site_url || !plugin_slug || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
  }

  // Reject requests with timestamps more than 5 minutes from server time
  // to prevent replay attacks while tolerating reasonable clock skew
  const serverTime = Math.floor(Date.now() / 1000);
  if (Math.abs(serverTime - timestamp) > 300) {
    return NextResponse.json({ error: 'Timestamp expired' }, { status: 400, headers: corsHeaders });
  }

  const normalizedUrl = site_url.trim().replace(/\/+$/, '');
  const blocked = await queryOne('SELECT 1 FROM blocklist WHERE site_url = $1', [normalizedUrl]);
  if (blocked) {
    logWarn({ source: 'register', message: `Blocked site attempted registration: ${normalizedUrl}`, request_ip: ip });
    return NextResponse.json({ error: 'Site is blocked' }, { status: 403, headers: corsHeaders });
  }

  // HMAC verification: the WordPress client (um-updater.php) signs
  // "{site_url}|{plugin_slug}|{timestamp}" with the shared REGISTRATION_SECRET.
  // This proves the request came from a site that knows the secret.
  const secret = process.env.REGISTRATION_SECRET || '';
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500, headers: corsHeaders });
  }

  const message = `${site_url}|${plugin_slug}|${timestamp}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(message).digest('hex');

  // Timing-safe comparison; try/catch handles malformed hex signatures
  let valid: boolean;
  try {
    valid = crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    valid = false;
  }

  if (!valid) {
    logWarn({ source: 'register', message: `Invalid signature from ${normalizedUrl}`, request_ip: ip });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403, headers: corsHeaders });
  }

  // Revoke any existing auto-generated key for this URL before issuing a new one.
  // This ensures each site has at most one active auto key at a time.
  const existing = await queryOne(
    "SELECT id FROM site_keys WHERE site_url = $1 AND key_type = 'auto' AND is_active = TRUE",
    [normalizedUrl]
  );
  if (existing) {
    await query('UPDATE site_keys SET is_active = FALSE WHERE id = $1', [existing.id]);
  }

  const plainKey = `umsk_a_${randomHex(16)}`;
  const hashedKey = await hashKey(plainKey);
  const defaultGroup = await queryOne<any>("SELECT id, slug FROM groups WHERE slug = 'default'");
  const groupId = defaultGroup?.id || 1;

  await query(
    "INSERT INTO site_keys (site_key, site_url, group_id, key_type, domain_locked, is_active) VALUES ($1, $2, $3, 'auto', TRUE, TRUE)",
    [hashedKey, normalizedUrl, groupId]
  );

  const trimmedEmail = (admin_email || '').trim();
  const trimmedName = (site_name || '').trim();
  const trimmedVersion = (plugin_version || '').trim();

  await query(
    `INSERT INTO sites (site_url, site_name, admin_email, plugin_slug, plugin_version, first_seen, last_seen, check_count, site_key_id, group_id)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 1, NULL, $6)
     ON CONFLICT(site_url, plugin_slug) DO UPDATE SET
       site_name = $2, admin_email = $3, plugin_version = $5,
       last_seen = NOW(), check_count = sites.check_count + 1, group_id = $6`,
    [normalizedUrl, trimmedName, trimmedEmail, plugin_slug, trimmedVersion, groupId]
  );

  const groupPlugins = await queryAll<{ plugin_slug: string }>(
    'SELECT plugin_slug FROM group_plugins WHERE group_id = $1',
    [groupId]
  );
  const plugins = groupPlugins.map(r => r.plugin_slug);

  if (!plugins.includes(plugin_slug)) {
    await query(
      'INSERT INTO group_plugins (group_id, plugin_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [groupId, plugin_slug]
    );
    plugins.push(plugin_slug);
  }

  return NextResponse.json(
    { site_key: plainKey, group: defaultGroup?.slug || 'default', plugins },
    { status: 201, headers: corsHeaders }
  );
}
