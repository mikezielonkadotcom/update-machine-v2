import { describe, it, expect } from 'vitest';
import { canWrite, requireRole } from '../lib/auth';
import type { AuthUser } from '../lib/auth';

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    email: 'test@example.com',
    display_name: 'Test',
    role: 'admin',
    via: 'session',
    ...overrides,
  };
}

describe('canWrite', () => {
  it('allows owner', () => {
    expect(canWrite(makeUser({ role: 'owner' }))).toBe(true);
  });

  it('allows admin', () => {
    expect(canWrite(makeUser({ role: 'admin' }))).toBe(true);
  });

  it('denies viewer', () => {
    expect(canWrite(makeUser({ role: 'viewer' }))).toBe(false);
  });

  it('allows API token regardless of role', () => {
    expect(canWrite(makeUser({ role: 'viewer', via: 'token' }))).toBe(true);
  });
});

describe('requireRole', () => {
  it('matches single role', () => {
    expect(requireRole(makeUser({ role: 'owner' }), 'owner')).toBe(true);
  });

  it('matches one of multiple roles', () => {
    expect(requireRole(makeUser({ role: 'admin' }), 'owner', 'admin')).toBe(true);
  });

  it('rejects non-matching role', () => {
    expect(requireRole(makeUser({ role: 'viewer' }), 'owner', 'admin')).toBe(false);
  });
});
