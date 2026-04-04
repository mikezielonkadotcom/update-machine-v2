import crypto from 'crypto';
import { Secret, TOTP } from 'otpauth';
import * as QRCode from 'qrcode';

const ISSUER = 'Update Machine';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ENCRYPTION_PREFIX = 'enc:v1';

function deriveTotpKey(): Buffer {
  const keyMaterial = process.env.TOTP_ENCRYPTION_KEY || process.env.ADMIN_TOKEN;
  if (!keyMaterial) {
    throw new Error('Missing TOTP encryption key: set TOTP_ENCRYPTION_KEY or ADMIN_TOKEN');
  }
  return crypto.createHash('sha256').update(keyMaterial).digest();
}

export function generateTOTPSecret(): string {
  const secret = new Secret({ size: 20 });
  return secret.base32;
}

export function createTOTP(secret: string, email: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

export function verifyTOTPCode(secret: string, email: string, code: string): boolean {
  const totp = createTOTP(secret, email);
  const token = normalizeTOTPCode(code);
  if (!/^\d{6}$/.test(token)) return false;

  // Allow 1 period of drift in each direction (±30s)
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

export async function generateQRCodeDataURL(secret: string, email: string): Promise<string> {
  const totp = createTOTP(secret, email);
  const uri = totp.toString();
  return QRCode.toDataURL(uri);
}

export function generateRecoveryCodes(count: number = 8): string[] {
  const codes: string[] = [];
  const bytes = crypto.randomBytes(count * 8);

  for (let i = 0; i < count; i++) {
    const offset = i * 8;
    let raw = '';
    for (let j = 0; j < 8; j++) {
      raw += RECOVERY_ALPHABET[bytes[offset + j] % RECOVERY_ALPHABET.length];
    }
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }

  return codes;
}

export function normalizeTOTPCode(code: string): string {
  return code.replace(/\s+/g, '').replace(/-/g, '');
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/\s+/g, '').replace(/-/g, '').toUpperCase();
}

export function encryptTOTPSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveTotpKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decryptTOTPSecret(encryptedOrPlainSecret: string): string {
  if (!encryptedOrPlainSecret) return '';
  if (!encryptedOrPlainSecret.startsWith(`${ENCRYPTION_PREFIX}:`)) {
    // Backward compatibility for pre-encryption plaintext rows.
    return encryptedOrPlainSecret;
  }

  const [prefix, version, ivB64, tagB64, encryptedB64] = encryptedOrPlainSecret.split(':');
  if (`${prefix}:${version}` !== ENCRYPTION_PREFIX || !ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Invalid encrypted TOTP secret format');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveTotpKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

export function parseRecoveryCodeHashes(jsonValue: string | null): string[] {
  if (!jsonValue) return [];
  try {
    const parsed = JSON.parse(jsonValue);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value));
  } catch {
    return [];
  }
}

export async function consumeRecoveryCode(
  code: string,
  hashedCodesJson: string | null,
): Promise<{ ok: boolean; remainingHashes: string[] }> {
  const hashes = parseRecoveryCodeHashes(hashedCodesJson);
  if (hashes.length === 0) return { ok: false, remainingHashes: [] };

  const codeHash = await hashRecoveryCode(code);
  const codeBuffer = Buffer.from(codeHash, 'hex');

  let matchedIndex = -1;
  for (let i = 0; i < hashes.length; i++) {
    const candidateHex = hashes[i];
    if (!/^[a-f0-9]{64}$/i.test(candidateHex)) continue;

    const candidateBuffer = Buffer.from(candidateHex, 'hex');
    if (candidateBuffer.length !== codeBuffer.length) continue;

    if (crypto.timingSafeEqual(candidateBuffer, codeBuffer)) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex < 0) return { ok: false, remainingHashes: hashes };

  const remainingHashes = hashes.filter((_, idx) => idx !== matchedIndex);
  return { ok: true, remainingHashes };
}
