import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPBKDF2,
  sha256Hex,
  hmacSign,
  hmacVerify,
  hashKey,
  randomHex,
} from '../lib/crypto';

describe('crypto', () => {
  describe('hashPassword + verifyPBKDF2', () => {
    it('hashes and verifies a password', async () => {
      const hash = await hashPassword('mypassword');
      expect(hash).toMatch(/^pbkdf2:sha256:100000:[0-9a-f]{32}:[0-9a-f]{64}$/);

      const valid = await verifyPBKDF2('mypassword', hash);
      expect(valid).toBe(true);
    });

    it('rejects wrong password', async () => {
      const hash = await hashPassword('correct');
      const valid = await verifyPBKDF2('wrong', hash);
      expect(valid).toBe(false);
    });

    it('produces different salts each time', async () => {
      const h1 = await hashPassword('same');
      const h2 = await hashPassword('same');
      expect(h1).not.toBe(h2);
    });
  });

  describe('sha256Hex', () => {
    it('produces consistent SHA-256 hex', async () => {
      const hash = await sha256Hex('hello');
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('produces 64-char hex string', async () => {
      const hash = await sha256Hex('anything');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('hmacSign + hmacVerify', () => {
    it('signs and verifies', async () => {
      const sig = await hmacSign('session123', 'secret');
      expect(sig).toMatch(/^[0-9a-f]{64}$/);

      const valid = await hmacVerify('session123', sig, 'secret');
      expect(valid).toBe(true);
    });

    it('rejects tampered value', async () => {
      const sig = await hmacSign('session123', 'secret');
      const valid = await hmacVerify('session456', sig, 'secret');
      expect(valid).toBe(false);
    });

    it('rejects wrong secret', async () => {
      const sig = await hmacSign('session123', 'secret1');
      const valid = await hmacVerify('session123', sig, 'secret2');
      expect(valid).toBe(false);
    });

    it('rejects malformed signatures', async () => {
      const valid = await hmacVerify('value', 'not-hex', 'secret');
      expect(valid).toBe(false);
    });

    it('rejects short signatures', async () => {
      const valid = await hmacVerify('value', 'abcdef', 'secret');
      expect(valid).toBe(false);
    });
  });

  describe('hashKey', () => {
    it('produces consistent SHA-256 hash for site keys', async () => {
      const h1 = await hashKey('umsk_a_abc123');
      const h2 = await hashKey('umsk_a_abc123');
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces different hashes for different keys', async () => {
      const h1 = await hashKey('key1');
      const h2 = await hashKey('key2');
      expect(h1).not.toBe(h2);
    });
  });

  describe('randomHex', () => {
    it('produces correct length hex string', () => {
      expect(randomHex(16)).toHaveLength(32);
      expect(randomHex(32)).toHaveLength(64);
    });

    it('produces unique values', () => {
      const a = randomHex(16);
      const b = randomHex(16);
      expect(a).not.toBe(b);
    });

    it('produces valid hex', () => {
      expect(randomHex(16)).toMatch(/^[0-9a-f]+$/);
    });
  });
});
