import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockNextRequest } from './helpers/mock-request';

vi.mock('@/lib/db', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  queryOne: vi.fn(async () => ({ c: '0' })),
  queryAll: vi.fn(async () => []),
}));

vi.mock('@/lib/logging', () => ({
  logError: vi.fn(),
}));

import { GET } from '@/app/api/cron/digest/route';
import { query } from '@/lib/db';

describe('GET /api/cron/digest cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-secret';
  });

  it('runs update_check_log cleanup query', async () => {
    const request = makeMockNextRequest({
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(vi.mocked(query)).toHaveBeenCalledWith(
      "DELETE FROM update_check_log WHERE created_at < NOW() - INTERVAL '90 days'"
    );
  });
});
