import { describe, expect, it, vi } from 'vitest';
import { hashPassword, sha256Hex, verifyAndUpgradePassword } from '../lib/crypto';

describe('password verification and upgrade', () => {
  it('verifies a PBKDF2 hash correctly', async () => {
    const pbkdf2Hash = await hashPassword('correct-password');

    const updated = vi.fn();
    const valid = await verifyAndUpgradePassword('correct-password', pbkdf2Hash, 1, updated);

    expect(valid).toBe(true);
    expect(updated).not.toHaveBeenCalled();
  });

  it('verifies a legacy sha256 hash and upgrades it', async () => {
    const sha = await sha256Hex('legacy-password');

    const updated = vi.fn(async () => {});
    const valid = await verifyAndUpgradePassword('legacy-password', `sha256:${sha}`, 42, updated);

    expect(valid).toBe(true);
    expect(updated).toHaveBeenCalledTimes(1);
    expect(updated).toHaveBeenCalledWith(42, expect.stringMatching(/^pbkdf2:sha256:/));
  });

  it('returns false for wrong password with PBKDF2 hash', async () => {
    const pbkdf2Hash = await hashPassword('correct-password');

    const valid = await verifyAndUpgradePassword('wrong-password', pbkdf2Hash, 1, vi.fn());

    expect(valid).toBe(false);
  });

  it('returns false for wrong password with legacy sha256 hash', async () => {
    const sha = await sha256Hex('correct-password');
    const updated = vi.fn(async () => {});

    const valid = await verifyAndUpgradePassword('wrong-password', `sha256:${sha}`, 7, updated);

    expect(valid).toBe(false);
    expect(updated).not.toHaveBeenCalled();
  });
});
