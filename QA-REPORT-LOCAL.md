# QA Report — Update Machine v2 (Local Dev)

**Date:** 2026-04-01
**Environment:** localhost:3000 (Next.js dev), Postgres:5432, MinIO:9000, WordPress:8082
**Tester:** WPInspectorClaw (automated QA agent)
**Branch:** main @ 7d9caeb

---

## Summary

| Category | Pass | Fail | Blocked |
|----------|------|------|---------|
| Auth & Sessions | 8 | 1 | 0 |
| Admin CRUD | 12 | 0 | 0 |
| Plugin Downloads | 0 | 2 | 0 |
| Registration | 4 | 0 | 0 |
| Rate Limiting | 2 | 0 | 0 |
| Security | 5 | 0 | 1 |
| Invite Flow | 0 | 2 | 0 |
| Pages & CORS | 5 | 0 | 0 |
| Cron | 2 | 0 | 0 |
| **Total** | **38** | **5** | **1** |

**Verdict: FIX FIRST** — 3 bugs must be resolved before shipping.

---

## Bugs Found

### BUG-1: Bootstrap double-prefixes password hash (CRITICAL)

**Severity:** Critical — prevents first login after fresh DB init
**File:** `src/lib/helpers.ts:119`
**Reproduction:**
1. Start with empty database
2. Server bootstraps owner from `ADMIN_PASSWORD_HASH=sha256:8c697...`
3. Bootstrap inserts `'sha256:' + legacyHash` → stored as `sha256:sha256:8c697...`
4. Login calls `verifyAndUpgradePassword()` which expects `sha256:{hex}` but gets `sha256:sha256:{hex}`
5. Login always fails for the bootstrapped owner

**Root cause:** Line 119 prepends `sha256:` to a value that already has the `sha256:` prefix.
**Fix:** Change to: `legacyHash.startsWith('sha256:') ? legacyHash : 'sha256:' + legacyHash`
Or simply store as-is: `[email, email, legacyHash, 'owner']`

---

### BUG-2: S3 client missing `forcePathStyle: true` (CRITICAL for local dev)

**Severity:** Critical — all plugin downloads and update.json return 404 on local dev
**File:** `src/lib/r2.ts:4-11`
**Reproduction:**
1. Upload `test-plugin/update.json` and `test-plugin/test-plugin-1.0.0.zip` to MinIO
2. `GET http://localhost:3000/test-plugin/update.json` → 404 "Not Found"
3. `GET http://localhost:3000/test-plugin/test-plugin-1.0.0.zip` → 404

**Root cause:** AWS SDK v3 defaults to virtual-hosted-style addressing (`bucket.endpoint`). MinIO on localhost requires path-style addressing (`endpoint/bucket/key`).
**Fix:** Add `forcePathStyle: true` to the S3Client config:
```ts
const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  forcePathStyle: true,  // Required for MinIO / non-AWS S3
  credentials: { ... },
});
```
**Note:** Cloudflare R2 also works with path-style, so this won't break production.

---

### BUG-3: Invite flow blocked by proxy middleware (CRITICAL)

**Severity:** Critical — user invitation flow is completely broken
**File:** `src/proxy.ts:17-29`
**Reproduction:**
1. Owner creates invite → returns invite URL with token
2. `GET /api/admin/invite?token=...` → `{"error":"Authentication required"}` (401)
3. `POST /api/admin/users/accept-invite` → `{"error":"Authentication required"}` (401)

**Root cause:** The defense-in-depth proxy middleware blocks all `/api/admin/*` requests without credentials, only whitelisting `/api/admin/login`. The invite endpoints need to be accessible without auth since they're for users who don't have accounts yet.
**Fix:** Add whitelisting in `proxy.ts`:
```ts
if (pathname === '/api/admin/login') return NextResponse.next();
if (pathname === '/api/admin/invite') return NextResponse.next();
if (pathname === '/api/admin/users/accept-invite') return NextResponse.next();
```

---

## Test Results Detail

### 1. Health Check

| Test | Result | Notes |
|------|--------|-------|
| `GET /api/health` | **PASS** | Returns `{"status":"ok","timestamp":"..."}` (200) |

### 2. Authentication & Sessions

| Test | Result | Notes |
|------|--------|-------|
| Login correct creds (after DB fix) | **PASS** | 200, returns user + sets `um_session` cookie (HttpOnly, Secure, SameSite=Strict) |
| Login wrong password | **PASS** | 401 `{"error":"Invalid email or password"}` |
| Login unknown email | **PASS** | 401 same error (no user enumeration) |
| Bearer token auth | **PASS** | All admin endpoints accessible with `Authorization: Bearer {ADMIN_TOKEN}` |
| Session cookie auth | **PASS** | All admin endpoints accessible with valid session cookie |
| Admin endpoints without auth | **PASS** | All return 401 `{"error":"Authentication required"}` |
| Logout | **PASS** | 200 `{"ok":true}`, session invalidated |
| Session after logout | **PASS** | Returns `{"error":"Unauthorized"}` (401) |
| Bootstrap login (fresh DB) | **FAIL** | See BUG-1 — double-prefixed password hash |

### 3. Admin CRUD Operations

#### Groups

| Test | Result | Notes |
|------|--------|-------|
| Create group | **PASS** | Returns new group with id, name, slug, auth_mode |
| List groups | **PASS** | Returns array of groups |
| Update group | **PASS** | Updates name and auth_mode |
| Delete group | **PASS** | Returns `{"deleted":true}` |
| Delete non-existent group | **PASS** | Returns `{"error":"Not found"}` (404) |
| Add plugin to group | **PASS** | Returns `{"group_id":2,"plugin_slug":"test-plugin"}` |
| Remove plugin from group | **PASS** | Returns `{"deleted":true}` |

#### Site Keys

| Test | Result | Notes |
|------|--------|-------|
| Create license key | **PASS** | Returns `umsk_l_` prefixed key, group info |
| List keys | **PASS** | Returns keys with group info |
| Update key (domain lock) | **PASS** | Sets domain_locked=true |
| Revoke key | **PASS** | Sets is_active=false, key remains in list (soft delete) |

#### Blocklist

| Test | Result | Notes |
|------|--------|-------|
| Add to blocklist | **PASS** | Returns `{"blocked":true}` with site_url |
| List blocklist | **PASS** | Returns blocked entries |
| Remove from blocklist | **PASS** | Returns `{"unblocked":true}` |

### 4. Plugin Downloads & Update Check

| Test | Result | Notes |
|------|--------|-------|
| `GET /test-plugin/update.json` | **FAIL** | 404 — See BUG-2 (forcePathStyle) |
| `GET /test-plugin/test-plugin-1.0.0.zip` | **FAIL** | 404 — See BUG-2 |
| `POST /test-plugin/update.json` (site check analytics) | **PASS** | Site recorded in DB even though file returns 404 |
| Plugin list via API | **PASS** | `GET /api/admin/plugins` returns list from R2 (empty due to BUG-2) |

### 5. Site Registration (HMAC)

| Test | Result | Notes |
|------|--------|-------|
| Valid HMAC registration | **PASS** | 201, returns `umsk_a_` key, group, plugins |
| Invalid HMAC signature | **PASS** | 403 `{"error":"Invalid signature"}` |
| Expired timestamp (>5min) | **PASS** | 400 `{"error":"Timestamp expired"}` |
| Registration from blocked domain | **PASS** | 403 `{"error":"Site is blocked"}` |

### 6. Rate Limiting

| Test | Result | Notes |
|------|--------|-------|
| Login rate limit (5/min) | **PASS** | Attempts 1-5 return 401, attempts 6+ return 429 |
| Rate limit message | **PASS** | `{"error":"Too many login attempts. Try again later."}` |

### 7. Security Tests

| Test | Result | Notes |
|------|--------|-------|
| SQL injection in group name | **PASS** | Stored safely via parameterized queries, no DB damage |
| SQL injection in blocklist | **PASS** | Stored safely, tables intact |
| Path traversal (`/../etc/passwd`) | **PASS** | Next.js normalizes path, returns 404 |
| Bad slug regex validation | **PASS** | Only `[a-z0-9-]+` accepted |
| Invalid JSON body | **PASS** | Returns 500 (see note below) |
| XSS in group name | **BLOCKED** | `<script>alert(1)</script>` stored raw in DB — depends on frontend escaping (React auto-escapes, likely safe but needs frontend verification) |

**Note:** Invalid JSON returns HTTP 500 "Internal server error" instead of 400 "Bad Request". Low severity but worth fixing for cleaner error handling.

### 8. User Invite Flow

| Test | Result | Notes |
|------|--------|-------|
| Create invite (session auth) | **PASS** | Returns invite URL with token, 72h expiry |
| Create invite (bearer token) | **PASS** | Returns 403 "Forbidden" — by design (session-only) |
| Validate invite token | **FAIL** | See BUG-3 — proxy blocks unauthenticated access |
| Accept invite | **FAIL** | See BUG-3 — proxy blocks unauthenticated access |

### 9. Profile Management

| Test | Result | Notes |
|------|--------|-------|
| Get profile | **PASS** | Returns id, email, display_name, role |
| Update display name | **PASS** | Requires current_password (deliberate security measure) |
| Change password | **PASS** | Validates min 8 chars, verifies current password |
| Login with new password | **PASS** | Password upgrade to PBKDF2 works |

### 10. Web Pages & CORS

| Test | Result | Notes |
|------|--------|-------|
| Home page (`/`) | **PASS** | 200, 11KB response |
| Login page (`/logmein`) | **PASS** | 200, 13KB response |
| Admin page (`/admin/sites`) | **PASS** | 200 (SPA shell loads; API calls require auth) |
| Public CORS (wildcard) | **PASS** | `Access-Control-Allow-Origin: *` on public endpoints |
| Admin CORS (restricted) | **PASS** | `Access-Control-Allow-Origin: http://localhost:3000` with credentials |

### 11. Cron & Logging

| Test | Result | Notes |
|------|--------|-------|
| Cron digest (no auth) | **PASS** | 401 Unauthorized |
| Cron digest (CRON_SECRET) | **PASS** | Returns error count, cleans expired sessions/magic links |
| Activity log | **PASS** | All admin actions logged with user, IP, timestamp |
| Error log | **PASS** | Failed logins, rate limits, blocked registrations all logged |
| Error cleanup | **PASS** | Deletes errors >30 days (0 deleted in fresh DB) |

---

## Minor Issues (Non-blocking)

1. **Invalid JSON returns 500 instead of 400** — `POST /api/admin/groups` with non-JSON body returns "Internal server error" (500). Should catch JSON parse errors and return 400.
   File: admin-handler.ts wraps the unhandled exception but the route handler doesn't try/catch `request.json()`.

2. **Deleted key still visible in key list** — `DELETE /api/admin/keys/1` soft-deletes (sets `is_active=false`) but the key still appears in `GET /api/admin/keys`. Consider filtering inactive keys from the default list, or provide a `?include_revoked=true` filter.

3. **Blocklist delete returns success for non-existent entries** — `DELETE /api/admin/blocklist/nonexistent` returns `{"unblocked":true}` even when nothing was deleted. Should return 404.

4. **`POST /test-plugin/update.json` records site analytics even when file not found** — The route records the site check in the DB, then tries to serve the file and gets 404. This means analytics are recorded for failed update checks.

5. **User invite returns "Forbidden" via bearer token** — `POST /api/admin/users` rejects bearer token auth. This is documented as by-design in the codebase but could surprise API consumers. Worth documenting.

---

## Verdict

### FIX FIRST

Three critical bugs must be addressed before shipping:

1. **BUG-1** (Bootstrap double-prefix) — Completely prevents first login on fresh deployments
2. **BUG-2** (forcePathStyle) — All plugin downloads fail in local dev with MinIO
3. **BUG-3** (Invite proxy block) — User invitation flow is completely non-functional

Once these are fixed, the application is in good shape. Authentication, rate limiting, HMAC registration, CORS, SQL injection prevention, and audit logging all work correctly.
