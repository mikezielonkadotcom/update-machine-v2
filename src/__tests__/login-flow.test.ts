import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockNextRequest } from './helpers/mock-request';

vi.mock('@/lib/helpers', () => ({
  adminCorsHeaders: vi.fn(() => ({ 'Access-Control-Allow-Origin': 'http://localhost:3000' })),
  bootstrapOwner: vi.fn(async () => {}),
}));

vi.mock('@/lib/crypto', () => ({
  verifyAndUpgradePassword: vi.fn(),
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

import { POST } from '../app/api/admin/login/route';
import { verifyAndUpgradePassword } from '@/lib/crypto';
import { query, queryOne } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

describe('POST /api/admin/login', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = 'admin-token';
    vi.clearAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.mocked(rateLimit).mockResolvedValue(false);
    vi.mocked(verifyAndUpgradePassword).mockResolvedValue(true);
  });

  it('returns a session cookie for valid email and password without 2FA', async () => {
    vi.mocked(queryOne).mockResolvedValueOnce({
      id: 10,
      email: 'owner@example.com',
      display_name: 'Owner',
      role: 'owner',
      password_hash: 'pbkdf2:sha256:100000:salt:hash',
      totp_enabled: false,
      totp_secret: null,
    });

    const request = makeMockNextRequest({
      body: { email: 'owner@example.com', password: 'good-password', remember_me: false },
      headers: { Origin: 'http://localhost:3000' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(response.headers.get('Set-Cookie')).toContain('um_session=sessionhex.sig123');
    expect(vi.mocked(query)).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sessions'),
      ['sessionhex', 10, 7],
    );
  });

  it('returns 401 for wrong password', async () => {
    vi.mocked(queryOne).mockResolvedValueOnce({
      id: 10,
      email: 'owner@example.com',
      display_name: 'Owner',
      role: 'owner',
      password_hash: 'pbkdf2:sha256:100000:salt:hash',
      totp_enabled: false,
      totp_secret: null,
    });
    vi.mocked(verifyAndUpgradePassword).mockResolvedValueOnce(false);

    const request = makeMockNextRequest({
      body: { email: 'owner@example.com', password: 'bad-password' },
      headers: { Origin: 'http://localhost:3000' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Invalid email or password');
  });

  it('returns the same 401 error for unknown email to prevent enumeration', async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(null);

    const request = makeMockNextRequest({
      body: { email: 'missing@example.com', password: 'anything' },
      headers: { Origin: 'http://localhost:3000' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Invalid email or password');
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce(true);

    const request = makeMockNextRequest({
      body: { email: 'owner@example.com', password: 'password' },
      headers: { Origin: 'http://localhost:3000' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toContain('Too many login attempts');
  });

  it('returns 400 when email or password is missing', async () => {
    const request = makeMockNextRequest({
      body: { email: '' },
      headers: { Origin: 'http://localhost:3000' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Email and password required');
  });

  it('returns requires_2fa and temp_token when user has 2FA enabled', async () => {
    vi.mocked(queryOne).mockResolvedValueOnce({
      id: 10,
      email: 'owner@example.com',
      display_name: 'Owner',
      role: 'owner',
      password_hash: 'pbkdf2:sha256:100000:salt:hash',
      totp_enabled: true,
      totp_secret: 'enc:v1:abcd',
    });

    const request = makeMockNextRequest({
      body: { email: 'owner@example.com', password: 'good-password', remember_me: true },
      headers: { Origin: 'http://localhost:3000' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requires_2fa).toBe(true);
    expect(body.temp_token).toContain('30d_');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(vi.mocked(query)).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO pending_2fa'),
      [expect.stringContaining('30d_'), 10, '127.0.0.1'],
    );
  });
});
