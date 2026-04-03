import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockNextRequest } from './helpers/mock-request';

vi.mock('@/lib/admin-handler', async () => {
  const { NextResponse } = await import('next/server');
  return {
    adminHandler: (fn: any) => async (request: any) => fn(
      request,
      { id: 1, email: 'admin@example.com', display_name: 'Admin', role: 'owner', via: 'session' },
      { origin: 'http://localhost:3000', headers: { 'Access-Control-Allow-Origin': '*' }, ip: '127.0.0.1' }
    ),
    adminOptions: () => new NextResponse(null, { status: 204 }),
  };
});

vi.mock('@/lib/db', () => ({
  queryOne: vi.fn(async () => ({ c: '0' })),
  queryAll: vi.fn(async () => []),
}));

vi.mock('@/lib/logging', () => ({
  logError: vi.fn(),
}));

import { GET } from '@/app/api/admin/update-checks/route';
import { queryAll, queryOne } from '@/lib/db';

describe('GET /api/admin/update-checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated update check logs with filters', async () => {
    vi.mocked(queryOne).mockResolvedValueOnce({ c: '2' });
    vi.mocked(queryAll).mockResolvedValueOnce([
      { id: 2, plugin_slug: 'my-plugin', site_url: 'https://one.test' },
      { id: 1, plugin_slug: 'my-plugin', site_url: 'https://two.test' },
    ] as any);

    const request = makeMockNextRequest({
      method: 'GET',
      url: 'http://localhost:3000/api/admin/update-checks?plugin_slug=my-plugin&site_url=one&page=2&limit=10',
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.page).toBe(2);
    expect(body.limit).toBe(10);
    expect(body.records).toHaveLength(2);

    expect(vi.mocked(queryOne)).toHaveBeenCalledWith(
      expect.stringContaining('FROM update_check_log'),
      ['my-plugin', '%one%']
    );
    expect(vi.mocked(queryAll)).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY created_at DESC'),
      ['my-plugin', '%one%', 10, 10]
    );
  });
});
