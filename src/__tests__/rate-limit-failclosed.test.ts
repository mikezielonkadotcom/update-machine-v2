import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  queryOne: vi.fn(async () => {
    throw new Error('db down');
  }),
}));

import { rateLimit } from '../lib/rate-limit';

describe('rateLimit failClosed behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true (blocked) when failClosed=true and DB errors', async () => {
    const blocked = await rateLimit('login', '127.0.0.1', 5, 60_000, true);

    expect(blocked).toBe(true);
  });

  it('returns false (allowed) when failClosed=false and DB errors', async () => {
    const blocked = await rateLimit('login', '127.0.0.1', 5, 60_000, false);

    expect(blocked).toBe(false);
  });
});
