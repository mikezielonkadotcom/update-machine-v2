import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing rate-limit
vi.mock('../lib/db', () => {
  let store = new Map<string, { attempt_count: number; window_start: Date }>();

  return {
    query: vi.fn(async () => {}),
    queryOne: vi.fn(async (sql: string, params: any[]) => {
      const [limiter, key, windowSeconds] = params;
      const compositeKey = `${limiter}:${key}`;
      const now = new Date();
      const windowMs = (windowSeconds as number) * 1000;

      const existing = store.get(compositeKey);

      if (existing && (now.getTime() - existing.window_start.getTime()) < windowMs) {
        existing.attempt_count++;
        return { attempt_count: existing.attempt_count };
      } else {
        store.set(compositeKey, { attempt_count: 1, window_start: now });
        return { attempt_count: 1 };
      }
    }),
    queryAll: vi.fn(async () => []),
    __resetStore: () => { store = new Map(); },
  };
});

import { rateLimit } from '../lib/rate-limit';

const db = await import('../lib/db') as any;

describe('rateLimit', () => {
  beforeEach(() => {
    db.__resetStore();
    vi.clearAllMocks();
  });

  it('allows requests under the limit', async () => {
    const result = await rateLimit('test', '127.0.0.1', 5, 60000);
    expect(result).toBe(false);
  });

  it('blocks after exceeding max attempts', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await rateLimit('test', '127.0.0.1', 5, 60000);
      expect(result).toBe(false);
    }

    // 6th attempt should be blocked
    const blocked = await rateLimit('test', '127.0.0.1', 5, 60000);
    expect(blocked).toBe(true);
  });

  it('tracks different keys independently', async () => {
    for (let i = 0; i < 5; i++) {
      await rateLimit('test', 'ip1', 5, 60000);
    }

    // ip1 at limit, ip2 should still be fine
    const ip1 = await rateLimit('test', 'ip1', 5, 60000);
    const ip2 = await rateLimit('test', 'ip2', 5, 60000);
    expect(ip1).toBe(true);
    expect(ip2).toBe(false);
  });

  it('tracks different limiters independently', async () => {
    for (let i = 0; i < 5; i++) {
      await rateLimit('login', '127.0.0.1', 5, 60000);
    }

    // login limiter full, register limiter should be fine
    const login = await rateLimit('login', '127.0.0.1', 5, 60000);
    const register = await rateLimit('register', '127.0.0.1', 5, 60000);
    expect(login).toBe(true);
    expect(register).toBe(false);
  });

  it('fails open when DB throws', async () => {
    db.queryOne.mockRejectedValueOnce(new Error('DB down'));
    const result = await rateLimit('test', '127.0.0.1', 5, 60000);
    expect(result).toBe(false);
  });
});
