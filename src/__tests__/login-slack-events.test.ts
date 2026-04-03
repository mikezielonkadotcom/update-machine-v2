import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockNextRequest } from './helpers/mock-request';

vi.mock('@/lib/helpers', () => ({
  adminCorsHeaders: vi.fn(() => ({ 'Access-Control-Allow-Origin': 'http://localhost:3000' })),
  bootstrapOwner: vi.fn(async () => {}),
}));

vi.mock('@/lib/crypto', () => ({
  verifyAndUpgradePassword: vi.fn(async () => false),
  hmacSign: vi.fn(async () => 'sig123'),
  randomHex: vi.fn(() => 'sessionhex'),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  queryOne: vi.fn(async () => null),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => false),
}));

vi.mock('@/lib/logging', () => ({
  logActivity: vi.fn(async () => {}),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  getSessionSecret: vi.fn(() => 'session-secret'),
}));

vi.mock('@/lib/slack', () => ({
  sendSlackMessage: vi.fn(async () => undefined),
}));

import { POST } from '@/app/api/admin/login/route';
import { queryOne } from '@/lib/db';
import { sendSlackMessage } from '@/lib/slack';

describe('login Slack notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_TOKEN = 'admin-token';
  });

  it('sends Slack notification for unknown email auth failure', async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(null);

    const request = makeMockNextRequest({
      body: { email: 'missing@example.com', password: 'whatever' },
      headers: { Origin: 'http://localhost:3000' },
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(vi.mocked(sendSlackMessage)).toHaveBeenCalledWith(
      'Failed login attempt: unknown email missing@example.com (ip 127.0.0.1)'
    );
  });
});
