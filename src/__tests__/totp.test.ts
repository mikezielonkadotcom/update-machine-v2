import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    private period: number;
    private digits: number;
    private secret: Secret;

    constructor(opts: { period: number; digits: number; secret: Secret }) {
      this.period = opts.period;
      this.digits = opts.digits;
      this.secret = opts.secret;
    }

    private tokenFor(ts: number): string {
      const step = Math.floor(ts / (this.period * 1000));
      const hex = crypto.createHash('sha1').update(`${this.secret.base32}:${step}`).digest('hex');
      const n = parseInt(hex.slice(0, 8), 16) % (10 ** this.digits);
      return String(n).padStart(this.digits, '0');
    }

    generate(): string {
      return this.tokenFor(Date.now());
    }

    validate({ token, window = 0 }: { token: string; window?: number }): number | null {
      for (let delta = -window; delta <= window; delta++) {
        const ts = Date.now() + delta * this.period * 1000;
        if (this.tokenFor(ts) === token) return delta;
      }
      return null;
    }

    toString(): string {
      return 'otpauth://totp/mock';
    }
  }

  return { Secret, TOTP };
}, { virtual: true });
import {
  createTOTP,
  decryptTOTPSecret,
  encryptTOTPSecret,
  generateRecoveryCodes,
  generateTOTPSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  normalizeTOTPCode,
  verifyTOTPCode,
} from '../lib/totp';

describe('totp utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifyTOTPCode accepts a valid code', () => {
    const secret = generateTOTPSecret();
    const code = createTOTP(secret, 'owner@example.com').generate();

    expect(verifyTOTPCode(secret, 'owner@example.com', code)).toBe(true);
  });

  it('verifyTOTPCode rejects an invalid code', () => {
    const secret = generateTOTPSecret();

    expect(verifyTOTPCode(secret, 'owner@example.com', '123456')).toBe(false);
  });

  it('verifyTOTPCode rejects a code outside the allowed window', () => {
    const secret = generateTOTPSecret();
    const email = 'owner@example.com';
    const code = createTOTP(secret, email).generate();

    vi.setSystemTime(new Date('2026-01-01T00:01:01.000Z'));
    expect(verifyTOTPCode(secret, email, code)).toBe(false);
  });

  it('verifyTOTPCode allows +-30 second drift', () => {
    const secret = generateTOTPSecret();
    const email = 'owner@example.com';
    const code = createTOTP(secret, email).generate();

    vi.setSystemTime(new Date('2026-01-01T00:00:30.000Z'));
    expect(verifyTOTPCode(secret, email, code)).toBe(true);

    vi.setSystemTime(new Date('2025-12-31T23:59:30.000Z'));
    expect(verifyTOTPCode(secret, email, code)).toBe(true);
  });

  it('normalizeTOTPCode strips spaces and dashes', () => {
    expect(normalizeTOTPCode('12 3-4 5-6')).toBe('123456');
  });

  it('normalizeRecoveryCode strips separators and uppercases', () => {
    expect(normalizeRecoveryCode('ab cd-12ef')).toBe('ABCD12EF');
  });

  it('generateRecoveryCodes produces default count and XXXX-XXXX format', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
  });

  it('hashRecoveryCode is deterministic and returns 64-char hex', async () => {
    const a = await hashRecoveryCode('abcd-1234');
    const b = await hashRecoveryCode('ABCD 1234');

    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('encryptTOTPSecret and decryptTOTPSecret roundtrip', () => {
    process.env.TOTP_ENCRYPTION_KEY = 'test-totp-key-for-vitest';
    try {
      const secret = generateTOTPSecret();
      const encrypted = encryptTOTPSecret(secret);

      expect(encrypted.startsWith('enc:v1:')).toBe(true);
      expect(decryptTOTPSecret(encrypted)).toBe(secret);
    } finally {
      delete process.env.TOTP_ENCRYPTION_KEY;
    }
  });

  it('decryptTOTPSecret returns plaintext value for backward compatibility', () => {
    process.env.TOTP_ENCRYPTION_KEY = 'test-totp-key-for-vitest';
    try {
      expect(decryptTOTPSecret('JBSWY3DPEHPK3PXP')).toBe('JBSWY3DPEHPK3PXP');
    } finally {
      delete process.env.TOTP_ENCRYPTION_KEY;
    }
  });

  it('decryptTOTPSecret throws on corrupted encrypted data', () => {
    process.env.TOTP_ENCRYPTION_KEY = 'test-totp-key-for-vitest';
    try {
      expect(() => decryptTOTPSecret('enc:v1:not-base64:also-bad:broken')).toThrow();
    } finally {
      delete process.env.TOTP_ENCRYPTION_KEY;
    }
  });

  it('deriveTotpKey throws when no env vars are set', () => {
    const origTotp = process.env.TOTP_ENCRYPTION_KEY;
    const origAdmin = process.env.ADMIN_TOKEN;
    delete process.env.TOTP_ENCRYPTION_KEY;
    delete process.env.ADMIN_TOKEN;
    try {
      expect(() => encryptTOTPSecret('JBSWY3DPEHPK3PXP')).toThrow('Missing TOTP encryption key');
    } finally {
      if (origTotp) process.env.TOTP_ENCRYPTION_KEY = origTotp;
      if (origAdmin) process.env.ADMIN_TOKEN = origAdmin;
    }
  });

  it('generateTOTPSecret returns valid base32', () => {
    const secret = generateTOTPSecret();

    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });
});
