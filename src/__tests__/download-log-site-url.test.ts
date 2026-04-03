import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockNextRequest } from './helpers/mock-request';

vi.mock('@/lib/helpers', () => ({
  corsHeaders: { 'Access-Control-Allow-Origin': '*' },
  extractSiteKey: vi.fn(() => null),
  validateSiteKey: vi.fn(async () => null),
  checkDownloadAuth: vi.fn(async () => null),
}));

vi.mock('@/lib/r2', () => ({
  getObject: vi.fn(async () => ({
    body: Buffer.from('zip-bytes'),
    etag: 'etag123',
  })),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn(async () => ({ rows: [] })),
}));

vi.mock('@/lib/logging', () => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '203.0.113.9'),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => false),
}));

import { GET, POST, parseSiteUrlFromUA } from '@/app/[slug]/[filename]/route';
import { query } from '@/lib/db';

describe('download log site_url parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses WordPress site URL from User-Agent', () => {
    const value = parseSiteUrlFromUA('WordPress/6.9.4; https://ohsnapmacros.com');
    expect(value).toBe('https://ohsnapmacros.com');
  });

  it('returns empty string for invalid User-Agent site URL', () => {
    const value = parseSiteUrlFromUA('WordPress/6.9.4; not-a-url');
    expect(value).toBe('');
  });

  it('uses parsed User-Agent site URL when explicit site_url is missing', async () => {
    const request = makeMockNextRequest({
      method: 'GET',
      url: 'http://localhost:3000/my-plugin/my-plugin-1.2.3.zip',
      headers: {
        'User-Agent': 'WordPress/6.9.4; https://ohsnapmacros.com',
      },
    });

    const response = await GET(request, {
      params: Promise.resolve({ slug: 'my-plugin', filename: 'my-plugin-1.2.3.zip' }),
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(query)).toHaveBeenCalledWith(
      'INSERT INTO download_log (plugin_slug, plugin_version, site_url, site_ip, user_agent, site_key_id) VALUES ($1, $2, $3, $4, $5, $6)',
      ['my-plugin', '1.2.3', 'https://ohsnapmacros.com', '203.0.113.9', 'WordPress/6.9.4; https://ohsnapmacros.com', null]
    );
  });

  it('writes update check log for update.json POST as fire-and-forget side effect', async () => {
    const request = makeMockNextRequest({
      method: 'POST',
      url: 'http://localhost:3000/my-plugin/update.json',
      headers: {
        'User-Agent': 'WordPress/6.9.4; https://ohsnapmacros.com',
      },
      body: {
        site_url: 'https://ohsnapmacros.com/',
        site_name: 'Oh Snap Macros',
        plugin_version: '2.0.0',
      },
    });

    const response = await POST(request, {
      params: Promise.resolve({ slug: 'my-plugin', filename: 'update.json' }),
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(query)).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO update_check_log'),
      ['my-plugin', 'https://ohsnapmacros.com', 'Oh Snap Macros', '2.0.0', '203.0.113.9', 'WordPress/6.9.4; https://ohsnapmacros.com', null]
    );
  });
});
