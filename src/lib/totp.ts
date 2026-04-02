import crypto from 'crypto';
import { Secret, TOTP } from 'otpauth';
import * as QRCode from 'qrcode';

const ISSUER = 'Update Machine';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
