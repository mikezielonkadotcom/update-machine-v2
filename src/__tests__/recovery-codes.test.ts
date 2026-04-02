import crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,mock') }), { virtual: true });
vi.mock('otpauth', () => {
  class Secret {
    base32: string;

    constructor(opts?: { size?: number }) {
      const length = Math.max(32, (opts?.size || 20) * 2);
      this.base32 = 'A'.repeat(length);
    }

    static fromBase32(base32: string): Secret {
      const s = new Secret({ size: 0 });
      s.base32 = base32;
      return s;
    }
  }

  class TOTP {
    constructor(_opts: unknown) {}
    generate(): string { return '000000'; }
    validate(): number | null { return null; }
  }

  return { Secret, TOTP };
}, { virtual: true });

import { consumeRecoveryCode, hashRecoveryCode, parseRecoveryCodeHashes } from '../lib/totp';

describe('recovery code consumption', () => {
  it('consumeRecoveryCode returns ok=true and removes used hash', async () => {
    const codeA = 'ABCD-1234';
    const codeB = 'WXYZ-5678';
    const hashA = await hashRecoveryCode(codeA);
    const hashB = await hashRecoveryCode(codeB);

    const result = await consumeRecoveryCode(codeA, JSON.stringify([hashA, hashB]));

    expect(result.ok).toBe(true);
    expect(result.remainingHashes).toEqual([hashB]);
  });

  it('consumeRecoveryCode returns ok=false and leaves list unchanged for invalid code', async () => {
    const hashA = await hashRecoveryCode('ABCD-1234');
    const hashB = await hashRecoveryCode('WXYZ-5678');

    const result = await consumeRecoveryCode('NOPE-0000', JSON.stringify([hashA, hashB]));

    expect(result.ok).toBe(false);
    expect(result.remainingHashes).toEqual([hashA, hashB]);
  });

  it('consumeRecoveryCode fails for already-consumed code', async () => {
    const hashA = await hashRecoveryCode('ABCD-1234');

    const first = await consumeRecoveryCode('ABCD-1234', JSON.stringify([hashA]));
    const second = await consumeRecoveryCode('ABCD-1234', JSON.stringify(first.remainingHashes));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.remainingHashes).toEqual([]);
  });

  it('consumeRecoveryCode handles empty or null hash lists', async () => {
    const empty = await consumeRecoveryCode('ABCD-1234', JSON.stringify([]));
    const missing = await consumeRecoveryCode('ABCD-1234', null);

    expect(empty).toEqual({ ok: false, remainingHashes: [] });
    expect(missing).toEqual({ ok: false, remainingHashes: [] });
  });

  it('consumeRecoveryCode uses timingSafeEqual for comparisons', async () => {
    const spy = vi.spyOn(crypto, 'timingSafeEqual');
    const hashA = await hashRecoveryCode('ABCD-1234');

    await consumeRecoveryCode('ABCD-1234', JSON.stringify([hashA]));

    expect(spy).toHaveBeenCalled();
  });
});

describe('parseRecoveryCodeHashes', () => {
  it('returns hashes for valid JSON array input', async () => {
    const hashA = await hashRecoveryCode('ABCD-1234');
    const hashB = await hashRecoveryCode('WXYZ-5678');

    expect(parseRecoveryCodeHashes(JSON.stringify([hashA, hashB]))).toEqual([hashA, hashB]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseRecoveryCodeHashes('{bad-json')).toEqual([]);
  });

  it('returns empty array for null input', () => {
    expect(parseRecoveryCodeHashes(null)).toEqual([]);
  });

  it('returns empty array for non-array JSON', () => {
    expect(parseRecoveryCodeHashes('{"foo":"bar"}')).toEqual([]);
  });
});
