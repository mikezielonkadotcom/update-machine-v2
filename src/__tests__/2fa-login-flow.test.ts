import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockNextRequest } from './helpers/mock-request';

vi.mock('@/lib/helpers', () => ({
  adminCorsHeaders: vi.fn(() => ({ 'Access-Control-Allow-Origin': 'http://localhost:3000' })),
}));

vi.mock('@/lib/auth', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  getSessionSecret: vi.fn(() => 'session-secret'),
}));

vi.mock('@/lib/crypto', () => ({
  hmacSign: vi.fn(async () => 'sig123'),
  randomHex: vi.fn(() => 'sessionhex'),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => false),
}));

vi.mock('@/lib/totp', () => ({
  normalizeTOTPCode: vi.fn((code: string) => code.replace(/\s+/g, '').replace(/-/g, '')),
  decryptTOTPSecret: vi.fn((s: string) => s),
  verifyTOTPCode: vi.fn(() => false),
  consumeRecoveryCode: vi.fn(async () => ({ ok: false, remainingHashes: [] })),
}));

vi.mock('@/lib/db', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  withTransaction: vi.fn(),
}));

vi.mock('@/lib/logging', () => ({
  logActivity: vi.fn(async () => {}),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { POST } from '../app/api/admin/login/2fa/route';
import { rateLimit } from '@/lib/rate-limit';
import { consumeRecoveryCode, verifyTOTPCode } from '@/lib/totp';
import { withTransaction } from '@/lib/db';

type MockChallenge = {
  id: string;
  user_id: number;
  attempts: number;
  email: string;
  display_name: string;
  role: string;
  totp_enabled: boolean;
  totp_secret: string | null;
  totp_recovery_codes: string | null;
};

function setupTransaction(challenge: MockChallenge | null) {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM pending_2fa p')) {
        return { rows: challenge ? [challenge] : [] };
      }
      if (sql.includes('UPDATE pending_2fa SET attempts = attempts + 1')) {
        if (challenge) challenge.attempts += 1;
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO sessions')) {
        return { rows: [] };
      }
      if (sql.includes('DELETE FROM pending_2fa WHERE id = $1')) {
        return { rows: [] };
      }
      if (sql.includes('UPDATE users SET totp_recovery_codes')) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };

  vi.mocked(withTransaction).mockImplementation(async (fn: any) => fn(client as any));
  return client;
}

describe('POST /api/admin/login/2fa', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'admin-token';
    vi.clearAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.mocked(rateLimit).mockResolvedValue(false);
  });

  it('creates a session for valid temp_token with valid TOTP code', async () => {
    const challenge: MockChallenge = {
      id: '7d_token',
      user_id: 7,
      attempts: 0,
      email: 'owner@example.com',
      display_name: 'Owner',
      role: 'owner',
      totp_enabled: true,
      totp_secret: 'enc-secret',
      totp_recovery_codes: null,
    };
    const client = setupTransaction(challenge);
    vi.mocked(verifyTOTPCode).mockReturnValue(true);

    const response = await POST(makeMockNextRequest({
      body: { temp_token: '7d_token', code: '123456' },
      headers: { Origin: 'http://localhost:3000' },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('um_session=sessionhex.sig123');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sessions'), ['sessionhex', 7, 7]);
  });

  it('returns 401 and increments attempts for invalid code', async () => {
    const challenge: MockChallenge = {
      id: '7d_token',
      user_id: 7,
      attempts: 1,
      email: 'owner@example.com',
      display_name: 'Owner',
      role: 'owner',
      totp_enabled: true,
      totp_secret: 'enc-secret',
      totp_recovery_codes: null,
    };
    const client = setupTransaction(challenge);
    vi.mocked(verifyTOTPCode).mockReturnValue(false);
    vi.mocked(consumeRecoveryCode).mockResolvedValueOnce({ ok: false, remainingHashes: [] });

    const response = await POST(makeMockNextRequest({
      body: { temp_token: '7d_token', code: '000000' },
      headers: { Origin: 'http://localhost:3000' },
    }));

    expect(response.status).toBe(401);
    expect(client.query).toHaveBeenCalledWith(
      'UPDATE pending_2fa SET attempts = attempts + 1 WHERE id = $1',
      ['7d_token'],
    );
  });

  it('returns 401 for expired temp_token', async () => {
    setupTransaction(null);

    const response = await POST(makeMockNextRequest({
      body: { temp_token: 'expired', code: '123456' },
      headers: { Origin: 'http://localhost:3000' },
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid or expired 2FA token' });
  });

  it('deletes temp_token and returns 401 when third failed attempt is reached', async () => {
    const challenge: MockChallenge = {
      id: '7d_token',
      user_id: 7,
      attempts: 2,
      email: 'owner@example.com',
      display_name: 'Owner',
      role: 'owner',
      totp_enabled: true,
      totp_secret: 'enc-secret',
      totp_recovery_codes: null,
    };
    const client = setupTransaction(challenge);

    const response = await POST(makeMockNextRequest({
      body: { temp_token: '7d_token', code: 'bad-code' },
      headers: { Origin: 'http://localhost:3000' },
    }));

    expect(response.status).toBe(401);
    expect(client.query).toHaveBeenCalledWith('DELETE FROM pending_2fa WHERE id = $1', ['7d_token']);
  });

  it('creates a session with valid recovery code and consumes the code', async () => {
    const challenge: MockChallenge = {
      id: '30d_token',
      user_id: 8,
      attempts: 0,
      email: 'admin@example.com',
      display_name: 'Admin',
      role: 'admin',
      totp_enabled: true,
      totp_secret: 'enc-secret',
      totp_recovery_codes: '["hash1","hash2"]',
    };
    const client = setupTransaction(challenge);
    vi.mocked(verifyTOTPCode).mockReturnValue(false);
    vi.mocked(consumeRecoveryCode).mockResolvedValueOnce({ ok: true, remainingHashes: ['hash2'] });

    const response = await POST(makeMockNextRequest({
      body: { temp_token: '30d_token', code: 'ABCD-1234' },
      headers: { Origin: 'http://localhost:3000' },
    }));

    expect(response.status).toBe(200);
    expect(client.query).toHaveBeenCalledWith(
      'UPDATE users SET totp_recovery_codes = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(['hash2']), 8],
    );
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sessions'), ['sessionhex', 8, 30]);
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce(true);

    const response = await POST(makeMockNextRequest({
      body: { temp_token: '7d_token', code: '123456' },
      headers: { Origin: 'http://localhost:3000' },
    }));

    expect(response.status).toBe(429);
  });

  it('returns 400 when temp_token or code is missing', async () => {
    const response = await POST(makeMockNextRequest({
      body: { temp_token: '', code: '' },
      headers: { Origin: 'http://localhost:3000' },
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'temp_token and code required' });
  });
});
