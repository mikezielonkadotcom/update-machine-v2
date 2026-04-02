import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockNextRequest } from './helpers/mock-request';

vi.mock('../lib/crypto', () => ({
  hashKey: vi.fn(async (key: string) => `hash:${key}`),
}));

vi.mock('../lib/db', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  queryOne: vi.fn(async () => null),
}));

import { checkDownloadAuth } from '../lib/helpers';
import { queryOne } from '../lib/db';

describe('checkDownloadAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows when group does not require a key', async () => {
    vi.mocked(queryOne).mockResolvedValueOnce({ id: 1, require_key: false });

    const result = await checkDownloadAuth('my-plugin', makeMockNextRequest({
      url: 'http://localhost:3000/download',
      headers: { Origin: 'https://example.com' },
    }));

    expect(result).toBeNull();
  });

  it('returns 403 when key is required but missing', async () => {
    vi.mocked(queryOne).mockResolvedValueOnce({ id: 1, require_key: true });

    const result = await checkDownloadAuth('my-plugin', makeMockNextRequest({
      url: 'http://localhost:3000/download',
      headers: { Origin: 'https://example.com' },
    }));

    expect(result).toEqual({ status: 403, message: 'Forbidden: site key required' });
  });

  it('returns 403 for invalid key', async () => {
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ id: 1, require_key: true })
      .mockResolvedValueOnce(null);

    const result = await checkDownloadAuth('my-plugin', makeMockNextRequest({
      url: 'http://localhost:3000/download?key=umsk_x_invalid',
      headers: { Origin: 'https://example.com' },
    }));

    expect(result).toEqual({ status: 403, message: 'Forbidden: invalid site key' });
  });

  it('allows valid key when there is no domain lock', async () => {
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ id: 1, require_key: true })
      .mockResolvedValueOnce({ id: 99, group_id: 10, domain_locked: false, site_url: null })
      .mockResolvedValueOnce({ '?column?': 1 });

    const result = await checkDownloadAuth('my-plugin', makeMockNextRequest({
      url: 'http://localhost:3000/download?key=umsk_x_valid',
      headers: { Origin: 'https://example.com' },
    }));

    expect(result).toBeNull();
  });

  it('allows domain-locked key when request origin matches site origin', async () => {
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ id: 1, require_key: true })
      .mockResolvedValueOnce({
        id: 99,
        group_id: 10,
        domain_locked: true,
        site_url: 'https://example.com/path',
      })
      .mockResolvedValueOnce({ '?column?': 1 });

    const result = await checkDownloadAuth('my-plugin', makeMockNextRequest({
      url: 'http://localhost:3000/download?key=umsk_x_valid',
      headers: { Origin: 'https://example.com/anything' },
    }));

    expect(result).toBeNull();
  });

  it('returns 403 for domain-locked key when origin does not match', async () => {
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ id: 1, require_key: true })
      .mockResolvedValueOnce({
        id: 99,
        group_id: 10,
        domain_locked: true,
        site_url: 'https://example.com',
      });

    const result = await checkDownloadAuth('my-plugin', makeMockNextRequest({
      url: 'http://localhost:3000/download?key=umsk_x_valid',
      headers: { Origin: 'https://evil.com' },
    }));

    expect(result).toEqual({ status: 403, message: 'Forbidden: key is domain-locked' });
  });

  it('enforces strict origin equality for domain lock', async () => {
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ id: 1, require_key: true })
      .mockResolvedValueOnce({
        id: 99,
        group_id: 10,
        domain_locked: true,
        site_url: 'https://example.com',
      });

    const result = await checkDownloadAuth('my-plugin', makeMockNextRequest({
      url: 'http://localhost:3000/download?key=umsk_x_valid',
      headers: { Origin: 'https://example.com.evil.com' },
    }));

    expect(result).toEqual({ status: 403, message: 'Forbidden: key is domain-locked' });
  });
});
