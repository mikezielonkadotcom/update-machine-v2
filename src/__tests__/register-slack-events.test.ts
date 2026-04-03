import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockNextRequest } from './helpers/mock-request';

vi.mock('@/lib/helpers', () => ({
  corsHeaders: { 'Access-Control-Allow-Origin': '*' },
}));

vi.mock('@/lib/crypto', () => ({
  hashKey: vi.fn(async (value: string) => `hash:${value}`),
  randomHex: vi.fn(() => 'abcdef1234567890abcdef1234567890'),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  queryOne: vi.fn(async () => null),
  queryAll: vi.fn(async () => []),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => false),
}));

vi.mock('@/lib/logging', () => ({
  logWarn: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/slack', () => ({
  sendSlackMessage: vi.fn(async () => undefined),
}));

import { POST } from '@/app/api/register/route';
import { queryAll, queryOne } from '@/lib/db';
import { sendSlackMessage } from '@/lib/slack';

describe('register Slack notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REGISTRATION_SECRET = 'test-registration-secret';
  });

  it('sends Slack notification on successful site registration', async () => {
    vi.mocked(queryOne)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 1, slug: 'default' } as any);
    vi.mocked(queryAll).mockResolvedValueOnce([] as any);

    const timestamp = Math.floor(Date.now() / 1000);
    const siteUrl = 'https://newsite.example.com';
    const pluginSlug = 'my-plugin';
    const signature = crypto
      .createHmac('sha256', process.env.REGISTRATION_SECRET || '')
      .update(`${siteUrl}|${pluginSlug}|${timestamp}`)
      .digest('hex');

    const request = makeMockNextRequest({
      body: {
        site_url: siteUrl,
        site_name: 'New Site',
        admin_email: 'owner@newsite.example.com',
        plugin_slug: pluginSlug,
        plugin_version: '1.0.0',
        timestamp,
        signature,
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(vi.mocked(sendSlackMessage)).toHaveBeenCalledWith('New site registered: https://newsite.example.com (my-plugin)');
  });
});
