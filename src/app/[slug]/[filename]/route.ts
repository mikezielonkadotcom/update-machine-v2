import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders, extractSiteKey, validateSiteKey, checkDownloadAuth } from '@/lib/helpers';
import { getObject } from '@/lib/r2';
import { query, queryOne } from '@/lib/db';
import { logWarn, logError as logErr } from '@/lib/logging';
import { getClientIp } from '@/lib/auth';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

async function recordSiteCheck(slug: string, body: any, plainKey: string | null) {
  const siteUrl = (body.site_url || '').trim().replace(/\/+$/, '');
  if (!siteUrl) return;

  const siteName = (body.site_name || '').trim();
  const adminEmail = (body.admin_email || '').trim();
  const pluginVersion = (body.plugin_version || '').trim();

  let siteKeyId: number | null = null;
  let groupId: number | null = null;
  if (plainKey) {
    const keyRow = await validateSiteKey(plainKey);
    if (keyRow) { siteKeyId = keyRow.id; groupId = keyRow.group_id; }
  }

  await query(
    `INSERT INTO sites (site_url, site_name, admin_email, plugin_slug, plugin_version, first_seen, last_seen, check_count, site_key_id, group_id)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 1, $6, $7)
     ON CONFLICT(site_url, plugin_slug) DO UPDATE SET
       site_name = $2, admin_email = $3, plugin_version = $5,
       last_seen = NOW(), check_count = sites.check_count + 1,
       site_key_id = COALESCE($6, sites.site_key_id), group_id = COALESCE($7, sites.group_id)`,
    [siteUrl, siteName, adminEmail, slug, pluginVersion, siteKeyId, groupId]
  );
}

async function serveR2File(key: string, contentType: string, cacheSeconds: number, extraHeaders: Record<string, string> = {}) {
  try {
    const obj = await getObject(key);
    if (!obj || !obj.body) {
      return new NextResponse('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain', ...corsHeaders } });
    }

    const responseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=${cacheSeconds}`,
      ...corsHeaders,
      ...extraHeaders,
    };
    if (obj.etag) responseHeaders['ETag'] = obj.etag;

    return new NextResponse(obj.body as any, { headers: responseHeaders });
  } catch (e: any) {
    logErr({ source: 'r2', message: `R2 fetch failed for key '${key}': ${e.message}`, stack: e.stack });
    return new NextResponse('Storage Error', { status: 502, headers: { 'Content-Type': 'text/plain', ...corsHeaders } });
  }
}

type RouteParams = { slug: string; filename: string };

export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { slug, filename } = await params;

  if (!/^[a-z0-9-]+$/i.test(slug) || !/^[a-z0-9._-]+$/i.test(filename)) {
    return new NextResponse('Bad Request', { status: 400, headers: corsHeaders });
  }

  const key = `${slug}/${filename}`;
  const isZip = filename.endsWith('.zip');
  const isJson = filename.endsWith('.json');
  const isImage = filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.svg');

  if (!isZip && !isJson && !isImage) {
    return new NextResponse('Not Found', { status: 404, headers: corsHeaders });
  }

  if (isImage) {
    const ext = filename.split('.').pop()!;
    const mimeTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml' };
    return serveR2File(key, mimeTypes[ext] || 'application/octet-stream', 86400);
  }

  if (isZip) {
    const authResult = await checkDownloadAuth(slug, request);
    if (authResult) {
      return new NextResponse(authResult.message, { status: authResult.status, headers: corsHeaders });
    }
  }

  const contentType = isZip ? 'application/zip' : 'application/json';
  const cacheSeconds = isZip ? 86400 : 300;
  const extraHeaders: Record<string, string> = {};
  if (isZip) extraHeaders['Content-Disposition'] = `attachment; filename="${filename}"`;

  const response = await serveR2File(key, contentType, cacheSeconds, extraHeaders);

  // Log zip downloads
  if (isZip && response.status === 200) {
    const baseName = filename.replace(/\.zip$/, '');
    const version = baseName.startsWith(slug + '-') ? baseName.slice(slug.length + 1) : baseName;
    const siteUrl = request.headers.get('Referer') || new URL(request.url).searchParams.get('site_url') || '';
    const siteIp = getClientIp(request);
    const userAgent = request.headers.get('User-Agent') || '';
    query(
      'INSERT INTO download_log (plugin_slug, plugin_version, site_url, site_ip, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [slug, version, siteUrl, siteIp, userAgent]
    ).catch(() => {});
  }

  return response;
}

export async function POST(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { slug, filename } = await params;

  if (!/^[a-z0-9-]+$/i.test(slug) || !/^[a-z0-9._-]+$/i.test(filename)) {
    return new NextResponse('Bad Request', { status: 400, headers: corsHeaders });
  }

  // POST only supported for update.json
  if (filename !== 'update.json') {
    return new NextResponse('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const siteKey = extractSiteKey(request);
    await recordSiteCheck(slug, body, siteKey);
  } catch (e: any) {
    logWarn({ source: 'analytics', message: `recordSiteCheck failed: ${e.message}`, stack: e.stack });
  }

  const key = `${slug}/${filename}`;
  return serveR2File(key, 'application/json', 300);
}

export async function HEAD(request: NextRequest, context: { params: Promise<RouteParams> }) {
  return GET(request, context);
}
