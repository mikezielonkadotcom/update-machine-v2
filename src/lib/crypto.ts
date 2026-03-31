import crypto from 'crypto';

// ─── Password Hashing (PBKDF2-SHA256, 100K iterations) ───

/**
 * Hash a password using PBKDF2-SHA256.
 * Format: "pbkdf2:sha256:{iterations}:{salt_hex}:{hash_hex}"
 * The salt is 16 random bytes, output is 32 bytes.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const saltHex = salt.toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const hashHex = hash.toString('hex');
  return `pbkdf2:sha256:100000:${saltHex}:${hashHex}`;
}

/**
 * Verify a password against a stored PBKDF2 hash.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function verifyPBKDF2(password: string, stored: string): Promise<boolean> {
  const [, , iterStr, saltHex, expectedHash] = stored.split(':');
  const iterations = parseInt(iterStr);
  const salt = Buffer.from(saltHex, 'hex');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const hashHex = hash.toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hashHex), Buffer.from(expectedHash));
}

export async function sha256Hex(str: string): Promise<string> {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Verify a password and transparently upgrade the hash algorithm if needed.
 *
 * Supports two formats:
 *   - "pbkdf2:sha256:100000:{salt}:{hash}" — current standard, verified directly
 *   - "sha256:{hex}" — legacy format from the Cloudflare Worker version;
 *     if the password matches, it's re-hashed with PBKDF2 and the DB is updated
 *
 * This allows seamless migration from the old SHA-256 hashes without forcing
 * users to reset their passwords.
 */
export async function verifyAndUpgradePassword(
  password: string,
  passwordHash: string,
  userId: number,
  updateHash: (userId: number, newHash: string) => Promise<void>
): Promise<boolean> {
  if (passwordHash.startsWith('pbkdf2:')) {
    return verifyPBKDF2(password, passwordHash);
  }
  if (passwordHash.startsWith('sha256:')) {
    const sha = await sha256Hex(password);
    if (sha !== passwordHash.slice(7)) return false;
    // Upgrade: rehash with PBKDF2 so future logins use the stronger algorithm
    const newHash = await hashPassword(password);
    await updateHash(userId, newHash);
    return true;
  }
  return false;
}

// ─── HMAC ───
// Used for session cookie signing (session_id.hmac_signature)
// and for site registration request verification.

/** Sign a value with HMAC-SHA256. Returns a 64-char hex string. */
export async function hmacSign(value: string, secret: string): Promise<string> {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

/**
 * Verify an HMAC-SHA256 signature using timing-safe comparison.
 * Rejects malformed signatures (must be exactly 64 hex chars) before
 * computing to avoid oracle attacks on signature length.
 */
export async function hmacVerify(value: string, signature: string, secret: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(value).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

// ─── Key Hashing ───

/** One-way hash a site key for storage. Keys are never stored in plaintext. */
export async function hashKey(key: string): Promise<string> {
  return sha256Hex(key);
}

// ─── Random ───

/** Generate cryptographically secure random hex string. */
export function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}
