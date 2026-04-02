import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockNextRequest } from './helpers/mock-request';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
  })),
}));

vi.mock('../lib/crypto', () => ({
  hmacVerify: vi.fn(async () => false),
}));

vi.mock('../lib/db', () => ({
  queryOne: vi.fn(async () => null),
  query: vi.fn(async () => ({ rows: [] })),
}));

import { cookies } from 'next/headers';
import { hmacVerify } from '../lib/crypto';
import { query, queryOne } from '../lib/db';
import { getSessionSecret, verifyAdmin } from '../lib/auth';

describe('verifyAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_TOKEN = 'admin-token';
    process.env.SESSION_SECRET = 'session-secret';
  });

  it('returns owner auth user for valid Bearer token', async () => {
    const request = makeMockNextRequest({ headers: { Authorization: 'Bearer admin-token' } });

    const user = await verifyAdmin(request);

    expect(user?.via).toBe('token');
    expect(user?.role).toBe('owner');
  });

  it('returns null for invalid Bearer token', async () => {
    const request = makeMockNextRequest({ headers: { Authorization: 'Bearer wrong-token' } });

    const user = await verifyAdmin(request);

    expect(user).toBeNull();
  });

  it('returns user for valid signed session cookie', async () => {
    vi.mocked(cookies).mockResolvedValueOnce({
      get: vi.fn(() => ({ value: 'session-id.sig123' })),
    } as any);
    vi.mocked(hmacVerify).mockResolvedValueOnce(true);
    vi.mocked(queryOne).mockResolvedValueOnce({
      session_id: 'session-id',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      session_created_at: new Date(Date.now() - 600_000).toISOString(),
      id: 2,
      email: 'owner@example.com',
      display_name: 'Owner',
      role: 'owner',
      is_active: true,
    });

    const user = await verifyAdmin(makeMockNextRequest());

    expect(user?.via).toBe('session');
    expect(user?.email).toBe('owner@example.com');
  });

  it('returns null for expired session cookie', async () => {
    vi.mocked(cookies).mockResolvedValueOnce({
      get: vi.fn(() => ({ value: 'session-id.sig123' })),
    } as any);
    vi.mocked(hmacVerify).mockResolvedValueOnce(true);
    vi.mocked(queryOne).mockResolvedValueOnce(null);

    const user = await verifyAdmin(makeMockNextRequest());

    expect(user).toBeNull();
  });

  it('returns null for tampered session cookie signature', async () => {
    vi.mocked(cookies).mockResolvedValueOnce({
      get: vi.fn(() => ({ value: 'session-id.bad-signature' })),
    } as any);
    vi.mocked(hmacVerify).mockResolvedValueOnce(false);

    const user = await verifyAdmin(makeMockNextRequest());

    expect(user).toBeNull();
    expect(queryOne).not.toHaveBeenCalled();
  });

  it('refreshes session when more than 50% of lifetime elapsed', async () => {
    const now = Date.now();
    const createdAt = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString();

    vi.mocked(cookies).mockResolvedValueOnce({
      get: vi.fn(() => ({ value: 'session-id.sig123' })),
    } as any);
    vi.mocked(hmacVerify).mockResolvedValueOnce(true);
    vi.mocked(queryOne).mockResolvedValueOnce({
      session_id: 'session-id',
      expires_at: expiresAt,
      session_created_at: createdAt,
      id: 2,
      email: 'owner@example.com',
      display_name: 'Owner',
      role: 'owner',
      is_active: true,
    });

    await verifyAdmin(makeMockNextRequest());

    expect(query).toHaveBeenCalledWith(
      'UPDATE sessions SET expires_at = $1 WHERE id = $2',
      [expect.any(String), 'session-id'],
    );
  });

  it('deletes and rejects session past 90-day absolute max lifetime', async () => {
    const now = Date.now();
    const createdAt = new Date(now - 91 * 24 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(now + 1 * 24 * 60 * 60 * 1000).toISOString();

    vi.mocked(cookies).mockResolvedValueOnce({
      get: vi.fn(() => ({ value: 'session-id.sig123' })),
    } as any);
    vi.mocked(hmacVerify).mockResolvedValueOnce(true);
    vi.mocked(queryOne).mockResolvedValueOnce({
      session_id: 'session-id',
      expires_at: expiresAt,
      session_created_at: createdAt,
      id: 2,
      email: 'owner@example.com',
      display_name: 'Owner',
      role: 'owner',
      is_active: true,
    });

    const user = await verifyAdmin(makeMockNextRequest());

    expect(user).toBeNull();
    expect(query).toHaveBeenCalledWith('DELETE FROM sessions WHERE id = $1', ['session-id']);
  });

  it('returns null when ADMIN_TOKEN is missing', async () => {
    delete process.env.ADMIN_TOKEN;

    const user = await verifyAdmin(makeMockNextRequest());

    expect(user).toBeNull();
  });
});

describe('getSessionSecret', () => {
  it('returns SESSION_SECRET when set', () => {
    process.env.SESSION_SECRET = 'session-secret';
    process.env.ADMIN_TOKEN = 'admin-token';

    expect(getSessionSecret()).toBe('session-secret');
  });

  it('falls back to ADMIN_TOKEN when SESSION_SECRET is unset', () => {
    delete process.env.SESSION_SECRET;
    process.env.ADMIN_TOKEN = 'admin-token';

    expect(getSessionSecret()).toBe('admin-token');
  });
});
