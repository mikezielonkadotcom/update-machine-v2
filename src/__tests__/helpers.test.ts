import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockNextRequest } from './helpers/mock-request';

vi.mock('../lib/crypto', () => ({
  hashKey: vi.fn(async (plain: string) => `hash:${plain}`),
}));

vi.mock('../lib/db', () => ({
  queryOne: vi.fn(async () => null),
  query: vi.fn(async () => ({ rows: [] })),
}));

import { adminCorsHeaders, extractSiteKey, validateSiteKey } from '../lib/helpers';
import { query, queryOne } from '../lib/db';

describe('extractSiteKey', () => {
  it('reads site key from X-Update-Key header first', () => {
    const request = makeMockNextRequest({
      url: 'http://localhost:3000/download?key=query-key',
      headers: { 'X-Update-Key': 'header-key' },
    });

    expect(extractSiteKey(request)).toBe('header-key');
  });

  it('falls back to query parameter when header is missing', () => {
    const request = makeMockNextRequest({
      url: 'http://localhost:3000/download?key=query-key',
    });

    expect(extractSiteKey(request)).toBe('query-key');
  });
});

describe('validateSiteKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns key row for valid key and updates last_used', async () => {
    vi.mocked(queryOne).mockResolvedValueOnce({ id: 11, group_id: 5, is_active: true });

    const result = await validateSiteKey('umsk_a_valid');

    expect(result).toEqual({ id: 11, group_id: 5, is_active: true });
    expect(query).toHaveBeenCalledWith('UPDATE site_keys SET last_used = NOW() WHERE id = $1', [11]);
  });

  it('returns null for invalid key', async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(null);

    const result = await validateSiteKey('umsk_a_invalid');

    expect(result).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('normalizeOrigin behavior via adminCorsHeaders', () => {
  it('normalizes URL inputs to origin only', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://app.example.com/a/path';

    const headers = adminCorsHeaders('https://app.example.com/b/path?x=1');

    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
  });

  it('treats malformed origins as non-matching', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';

    const headers = adminCorsHeaders('not-a-valid-url');

    expect(headers['Access-Control-Allow-Origin']).toBe('null');
  });
});
