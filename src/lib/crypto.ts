import crypto from 'crypto';

// ─── Password Hashing (PBKDF2-SHA256, 100K iterations) ───

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const saltHex = salt.toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const hashHex = hash.toString('hex');
  return `pbkdf2:sha256:100000:${saltHex}:${hashHex}`;
}

export async function verifyPBKDF2(password: string, stored: string): Promise<boolean> {
  const [, , iterStr, saltHex, expectedHash] = stored.split(':');
  const iterations = parseInt(iterStr);
  const salt = Buffer.from(saltHex, 'hex');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const hashHex = hash.toString('hex');
  // Constant-time comparison
  return crypto.timingSafeEqual(Buffer.from(hashHex), Buffer.from(expectedHash));
}

export async function sha256Hex(str: string): Promise<string> {
  return crypto.createHash('sha256').update(str).digest('hex');
}

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
    // Upgrade to PBKDF2
    const newHash = await hashPassword(password);
    await updateHash(userId, newHash);
    return true;
  }
  return false;
}

// ─── HMAC ───

export async function hmacSign(value: string, secret: string): Promise<string> {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export async function hmacVerify(value: string, signature: string, secret: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(value).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

// ─── Key Hashing ───

export async function hashKey(key: string): Promise<string> {
  return sha256Hex(key);
}

// ─── Random ───

export function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}
