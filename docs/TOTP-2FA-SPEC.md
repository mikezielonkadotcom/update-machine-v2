# TOTP Two-Factor Authentication — Engineering Spec

## Overview

Add TOTP (Time-based One-Time Password) two-factor authentication to Update Machine v2. Users can optionally enable 2FA via an authenticator app (Google Authenticator, 1Password, Authy, etc.). When enabled, login requires both password + 6-digit TOTP code.

## Dependencies

Add one package:
```
npm install otpauth qrcode
npm install -D @types/qrcode
```

- `otpauth` — TOTP/HOTP generation and verification (RFC 6238)
- `qrcode` — Generate QR code data URLs for authenticator app setup

## Database Migration

Create `db/003-totp.sql`:

```sql
-- Add TOTP columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_codes TEXT;
```

- `totp_secret`: Base32-encoded TOTP secret (null until user begins setup)
- `totp_enabled`: Whether 2FA is fully enabled (only true after verification)
- `totp_verified_at`: When 2FA was confirmed
- `totp_recovery_codes`: JSON array of hashed one-time recovery codes

## TOTP Library (`src/lib/totp.ts`)

```typescript
import { TOTP, Secret } from 'otpauth';
import * as QRCode from 'qrcode';

const ISSUER = 'Update Machine';

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
  // Allow 1 period of drift in each direction (±30s)
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export async function generateQRCodeDataURL(secret: string, email: string): Promise<string> {
  const totp = createTOTP(secret, email);
  const uri = totp.toString(); // otpauth:// URI
  return QRCode.toDataURL(uri);
}

export function generateRecoveryCodes(count: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 8-char alphanumeric codes, grouped as xxxx-xxxx for readability
    const raw = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(36).padStart(2, '0'))
      .join('')
      .substring(0, 8)
      .toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}
```

## API Endpoints

### 1. `POST /api/admin/2fa/setup` — Begin 2FA Setup

**Auth required:** Session only (not bearer token)

**Request:** Empty body (or `{}`)

**Response:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qr_code": "data:image/png;base64,...",
  "manual_entry_key": "JBSWY3DPEHPK3PXP"
}
```

**Logic:**
1. Generate a new TOTP secret
2. Store it in `users.totp_secret` (but do NOT set `totp_enabled = true` yet)
3. Generate QR code data URL
4. Return secret + QR code to frontend

If user already has `totp_enabled = true`, return error — they must disable first.

### 2. `POST /api/admin/2fa/verify` — Confirm 2FA Setup

**Auth required:** Session only

**Request:**
```json
{ "code": "123456" }
```

**Response:**
```json
{
  "ok": true,
  "recovery_codes": ["ABCD-EF12", "3456-GHIJ", ...]
}
```

**Logic:**
1. Read user's `totp_secret` from DB
2. Verify the submitted TOTP code against it
3. If valid:
   - Set `totp_enabled = true`, `totp_verified_at = NOW()`
   - Generate 8 recovery codes, hash them (SHA-256), store in `totp_recovery_codes`
   - Return the plaintext recovery codes (shown once only)
4. If invalid: return 400 error

### 3. `POST /api/admin/2fa/disable` — Disable 2FA

**Auth required:** Session only

**Request:**
```json
{ "code": "123456", "password": "current-password" }
```

**Logic:**
1. Verify current password
2. Verify TOTP code (or valid recovery code)
3. Set `totp_enabled = false`, clear `totp_secret`, `totp_recovery_codes`, `totp_verified_at`

### 4. `GET /api/admin/2fa/status` — Check 2FA Status

**Auth required:** Session only

**Response:**
```json
{ "enabled": true, "verified_at": "2026-04-01T..." }
```

## Login Flow Changes

### Modified `POST /api/admin/login`

The login flow becomes two-step when 2FA is enabled:

**Step 1 — Password check (existing flow):**
- Validate email + password as now
- Check if user has `totp_enabled = true`
- If NO 2FA: issue session cookie as now (unchanged)
- If YES 2FA: return `{ requires_2fa: true, temp_token: "..." }` with status 200
  - `temp_token` is a short-lived token (5 min) stored in a new `pending_2fa` table or in-memory
  - Do NOT issue the session cookie yet

**Step 2 — TOTP verification:**
New endpoint: `POST /api/admin/login/2fa`

```json
{ "temp_token": "...", "code": "123456" }
```

**Logic:**
1. Look up `temp_token` — verify it exists and hasn't expired (5 min TTL)
2. Load the user from the temp token
3. Verify the TOTP code against user's secret
4. If valid: issue session cookie (same as current login success)
5. If invalid: return 401, decrement attempts (max 3 per temp token)
6. Also accept a recovery code in place of TOTP code

**Database for pending 2FA:**

```sql
CREATE TABLE IF NOT EXISTS pending_2fa (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  ip_address TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_2fa_expires ON pending_2fa(expires_at);
```

Add this to the same migration file `db/003-totp.sql`.

## Frontend Changes

### Login Page (`src/app/logmein/page.tsx`)

After password submission, if response contains `requires_2fa: true`:
1. Show a new "Enter your 2FA code" input field (6-digit numeric input)
2. User enters code from authenticator app
3. Submit to `/api/admin/login/2fa` with the temp token + code
4. On success: redirect to `/admin/sites` as normal
5. Show a "Use recovery code" link that switches to a text input for recovery codes

### New Settings Page: 2FA Setup (`src/app/admin/security/page.tsx`)

Add a "Security" tab/page to the admin area:
- Shows current 2FA status (enabled/disabled)
- **Enable 2FA** button → calls `/api/admin/2fa/setup` → shows QR code + manual key → prompts for verification code → calls `/api/admin/2fa/verify` → shows recovery codes (copy/download)
- **Disable 2FA** button → prompts for password + current TOTP code → calls `/api/admin/2fa/disable`

### Admin Layout (`src/app/admin/layout.tsx`)

Add a "Security" link to the navigation (wherever Sites, Plugins, Keys, etc. are listed).

## Security Considerations

- TOTP secrets are stored in the database. In future, could encrypt at rest with a server-side key.
- Recovery codes are hashed (SHA-256) before storage — plaintext shown only once.
- Pending 2FA tokens expire after 5 minutes and allow max 3 attempts.
- Rate limiting on `/api/admin/login/2fa` — same as login (5 per minute per IP).
- TOTP validation allows ±1 period (30s) of clock drift.
- Bearer token auth (API/cron) bypasses 2FA entirely — it's machine-to-machine, not user login.

## Files to Create/Modify

**New files:**
- `db/003-totp.sql` — migration
- `src/lib/totp.ts` — TOTP helper functions
- `src/app/api/admin/2fa/setup/route.ts`
- `src/app/api/admin/2fa/verify/route.ts`
- `src/app/api/admin/2fa/disable/route.ts`
- `src/app/api/admin/2fa/status/route.ts`
- `src/app/api/admin/login/2fa/route.ts`
- `src/app/admin/security/page.tsx`

**Modified files:**
- `src/app/api/admin/login/route.ts` — add 2FA check after password validation
- `src/app/logmein/page.tsx` — add 2FA code input step
- `src/app/admin/layout.tsx` — add Security nav link
- `package.json` — add `otpauth` and `qrcode` dependencies

## Testing

- Login without 2FA → works as before (no regression)
- Enable 2FA → QR code displays → verify code works → recovery codes shown
- Login with 2FA → password step → code step → session created
- Login with 2FA + recovery code → works, code is consumed
- Disable 2FA → requires password + code → 2FA columns cleared
- Expired temp tokens → rejected
- Wrong TOTP code → rejected, max 3 attempts
- Bearer token auth → unaffected by 2FA
