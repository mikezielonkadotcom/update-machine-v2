# Documentation Review — Update Machine v2

**Reviewed by:** ScoutClaw 🔭
**Date:** 2026-04-01

---

## Summary

**Overall Grade: B+** — The documentation is well-structured, thorough, and clearly written. A new developer could get productive with this project relatively quickly. However, there are several concrete mismatches between docs and code that would cause confusion — including one potential **critical registration bug** where the WordPress client POSTs to the wrong URL path. The env var documentation has gaps, and the dashboard tab descriptions don't fully match the actual UI.

### Key Findings
1. 🔴 **Critical:** `um-updater.php` POSTs registration to `/register`, but the server route is at `/api/register` — registration silently fails
2. 🟡 **High:** `.env.local.template` sets `NEXT_PUBLIC_BASE_URL=http://localhost:3000` but LOCAL-DEV-SETUP uses port 3100
3. 🟡 **High:** `ALLOWED_ORIGINS` env var exists in code but is undocumented in README
4. 🟡 **Medium:** Dashboard has 11 tabs (including Security + Profile) but README only documents 9
5. 🟡 **Medium:** Several undocumented API endpoints (logout, invite acceptance, error cleanup/digest, group plugin management, ownership transfer)
6. 🟢 **Low:** `.env.example` and `.env.local.template` differ in which vars they include

---

## README.md

### Accuracy

**Good overall**, with these exceptions:

- **Registration endpoint path mismatch**: README correctly lists `POST /api/register`, but the WordPress client (`um-updater.php`) calls `$this->server . '/register'` (line ~152). There is no `/register` route in Next.js — only `/api/register/route.ts`. No rewrite exists in `next.config.ts` or `vercel.json`. This means **auto-registration silently fails** because the 404 is swallowed by the PHP client's error handling. Either the client needs to be updated to use `/api/register`, or a rewrite/redirect needs to be added. This is the most critical doc finding because it reveals an actual bug.

- **Dashboard tab list is incomplete**: README lists 9 tabs (Sites, Plugins, Keys, Groups, Users, Downloads, Activity, Errors, Blocklist). The actual UI (`page.tsx`) has **11 tabs**: the 9 above plus **Security** (active sessions) and **Profile** (display name + password change). These should be documented.

- **Security section is accurate** — PBKDF2-SHA256, HMAC sessions, rate limits, and hashed keys all match the schema and code.

### Completeness

**Missing API endpoints** not listed in the README table:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/admin/logout` | Logout / session destroy |
| `POST /api/admin/invite` | Accept invite (separate from user POST) |
| `POST /api/admin/users/accept-invite` | Complete invite registration |
| `POST /api/admin/users/transfer-ownership` | Transfer owner role |
| `GET /api/admin/errors/digest` | Error count summary (24h) |
| `DELETE /api/admin/errors/cleanup` | Purge old error entries |
| `GET/POST /api/admin/groups/[id]/plugins` | Manage plugins within a group |
| `DELETE /api/admin/groups/[id]/plugins/[slug]` | Remove plugin from group |
| `PUT/DELETE /api/admin/groups/[id]` | Update/delete specific group |
| `PUT/DELETE /api/admin/keys/[id]` | Update/revoke specific key |
| `PUT/DELETE /api/admin/users/[id]` | Update role / remove user |
| `GET /api/cron/digest` | Cron cleanup + Slack digest |

**Missing env var**: `ALLOWED_ORIGINS` — used in `src/lib/helpers.ts` for CORS origin validation. Should be in the env var table (optional, comma-separated origins).

**`.env.example` vs `.env.local.template`**: Both exist but serve different purposes. README's Quick Start says `cp .env.example .env.local` while LOCAL-DEV-SETUP says `cp .env.local.template .env.local`. The template has working local defaults; the example has production-style placeholders. README should clarify which to use when.

### Clarity

- **Quick Start is clean and actionable.** Steps 1-4 work.
- **API table is well-organized** but would benefit from noting which admin endpoints are owner-only vs admin+owner.
- **Deployment section is minimal but sufficient** — could add a note about running the cron digest via Vercel Cron (already configured in `vercel.json`).

### Structure

Good. Logical flow from overview → setup → API → env vars → deployment → security. The doc links at the top to USER-GUIDE and LOCAL-DEV-SETUP are helpful.

---

## docs/USER-GUIDE.md

### Accuracy

**Very accurate** — this is the strongest doc. Almost everything matches the code.

- **Registration flow description is correct** in concept but references the wrong outcome given the `/register` vs `/api/register` bug noted above. If/when that's fixed, the docs are right.
- **Auth modes table is correct** — `auto`, `license-key`, `both` match the code and schema.
- **Rate limits are accurate** — 5/min login, 10/min register, 60/min download all match the code.
- **SHA-256 integrity check flow is accurate** — matches `verify_download()` in um-updater.php exactly.
- **Magic link description says "delivered via Slack"** — this is accurate for the current implementation but could confuse someone who expects email delivery. Should note this explicitly: "Magic links are delivered via Slack DM to the configured channel, not via email."

### Completeness

- **Missing: `UM_SITE_KEY_{slug}` constant override** — The manual key section shows `define('UM_SITE_KEY_your_plugin_slug', 'umsk_m_abc123...')` in wp-config.php, but the um-updater.php actually reads the key from `wp_options` via `get_option('um_site_key_{slug}')`. There's no code in um-updater.php that checks for a `UM_SITE_KEY_*` constant. This documented feature doesn't exist in the client code — either the client needs to support it, or the docs should only describe the wp_options approach.
- **Missing: Download URL validation** — um-updater.php has a `validate_download_url()` method that blocks downloads from hosts not matching the configured server. This is a security feature worth documenting.
- **Missing: GET fallback behavior** — The client falls back to GET if POST fails for update checks. This is worth noting since it affects analytics (GET doesn't send telemetry body).
- **Missing: Error caching** — Failed update checks are cached for 1 hour. Worth mentioning so users know why a fix might not be immediately visible.

### Clarity

Excellent. The Concepts table up front is a great onboarding tool. The step-by-step workflows for adding plugins, releasing updates, and setting up the client are clear and actionable. The `update.json` field reference table is thorough.

### Structure

Well-organized table of contents, logical progression from concepts → dashboard → plugins → client → licensing → groups → users → analytics → security. Easy to navigate.

---

## LOCAL-DEV-SETUP.md

### Accuracy

- **Port mismatch in `.env.local.template`**: The doc says to use port 3100 (`PORT=3100 npm run dev`) and `update-machine.local:3100`, but the `.env.local.template` file sets `NEXT_PUBLIC_BASE_URL=http://localhost:3000`. A developer following the template defaults would have magic links pointing to port 3000 instead of 3100. The template should be updated to `http://update-machine.local:3100`.
- **Container names assume default project directory name** — Commands like `docker exec update-machine-v2-wordpress-1` assume the directory is named `update-machine-v2`. If someone clones to a different directory, container names will differ. Consider adding a note or using `docker compose exec wordpress` instead.
- **WP install command is correct** and well-documented with the mu-plugin workaround.
- **E2E test walkthrough is excellent** — step-by-step, copy-paste-able, and covers the full lifecycle.

### Completeness

- **Missing: How to create the bootstrap admin user** — The LOCAL-DEV-SETUP shows the `.env.local.template` has `ADMIN_EMAIL=admin@localhost` and a SHA-256 password hash, but doesn't explain how to actually create the user in the database. The app presumably auto-creates it on first request, but this should be documented.
- **Missing: Database migration step** — The doc mentions "Schema auto-migration — SQL files mounted into Postgres `docker-entrypoint-initdb.d/`" in Design Decisions. But if someone runs `docker compose down -v` and then `up`, the schema auto-runs. If they don't use volumes, they'd need to manually run the SQL. The relationship between the Docker auto-migration and the README's manual `psql < db/001-schema.sql` approach should be clarified.
- **Missing: MinIO browser access** — The Service URLs table lists the MinIO Console at `:9001` but doesn't mention you can browse/upload files there as an alternative to the `mc` CLI.

### Clarity

One of the best local dev setup docs I've seen. The step-by-step format with verification commands after each step is exactly right. The mu-plugin explanation with the "why" note is helpful. Design Decisions section is a nice touch.

### Structure

Clean environments table up top, prerequisites, numbered steps, E2E walkthrough, service URLs, design decisions, reset instructions. Logical and scannable.

---

## Cross-Reference Issues

### 1. 🔴 Registration URL Mismatch (Client ↔ Server)
- **um-updater.php** line ~152: `$this->server . '/register'` → calls `/register`
- **Server route**: `src/app/api/register/route.ts` → lives at `/api/register`
- **No rewrite** exists in `next.config.ts` or `vercel.json`
- **Impact**: Auto-registration silently fails. Sites work without keys (for non-key-required groups) but never actually register.
- **Fix**: Either add `/api` prefix in the client (`$this->server . '/api/register'`), or add a Next.js rewrite from `/register` → `/api/register`.

### 2. 🟡 `.env.local.template` Port Mismatch
- **Template**: `NEXT_PUBLIC_BASE_URL=http://localhost:3000`
- **LOCAL-DEV-SETUP**: Uses port 3100 and `update-machine.local:3100`
- **Impact**: Magic links generated during local dev would point to wrong URL.
- **Fix**: Update template to `NEXT_PUBLIC_BASE_URL=http://update-machine.local:3100`

### 3. 🟡 Undocumented `ALLOWED_ORIGINS` Env Var
- **Code**: `src/lib/helpers.ts` reads `ALLOWED_ORIGINS` (comma-separated)
- **README**: Not listed in env var table
- **`.env.example`**: Not listed
- **`.env.local.template`**: Listed as commented-out
- **Fix**: Add to README env var table as optional

### 4. 🟡 `UM_SITE_KEY_*` Constant Not Implemented in Client
- **USER-GUIDE** says users can set `define('UM_SITE_KEY_your_plugin_slug', ...)` in wp-config.php
- **um-updater.php** only reads from `get_option('um_site_key_{slug}')` — no constant check
- **Fix**: Either implement the constant check in the client, or remove from docs

### 5. 🟡 Dashboard Tabs: Docs vs Code
- **README lists 9 tabs**: Sites, Plugins, Keys, Groups, Users, Downloads, Activity, Errors, Blocklist
- **Actual UI has 11 tabs**: + Security (sessions), Profile (name/password change)
- **Tab order also differs**: Code order is sites → plugins → groups → keys → blocklist → users → downloads → activity → errors → security → profile
- **Fix**: Update README to list all 11 tabs in correct order

### 6. 🟢 `.env.example` vs `.env.local.template` Confusion
- **README Quick Start**: `cp .env.example .env.local`
- **LOCAL-DEV-SETUP**: `cp .env.local.template .env.local`
- Both exist, different contents. `.env.example` is for production reference, `.env.local.template` is for local dev.
- **Fix**: README should mention both and clarify when to use each. Or consolidate into one file with comments.

### 7. 🟢 Cron Endpoint Undocumented
- `vercel.json` configures a daily cron at `/api/cron/digest`
- This endpoint cleans expired magic links/sessions and sends Slack error digests
- Not mentioned in README's API table or deployment guide
- **Fix**: Add to API table and mention in deployment section

### 8. 🟢 Schema: `download_log.site_key_id` Column
- Added in `002-rate-limits-and-download-key.sql`
- USER-GUIDE's Downloads section mentions "Associated site key (if any)" — this is correct
- No doc issue, just confirming alignment ✅

---

## Recommendations

### Priority 1 — Fix Before Next Deploy
1. **Resolve `/register` vs `/api/register` mismatch** — This is either a code bug or a doc bug, but either way it means auto-registration doesn't work. Verify in production whether sites are actually registering, then fix the client or add a rewrite.
2. **Fix `.env.local.template` port** — Change `NEXT_PUBLIC_BASE_URL` from `http://localhost:3000` to `http://update-machine.local:3100` so magic links work in local dev.
3. **Resolve `UM_SITE_KEY_*` constant docs** — Either implement it in um-updater.php or remove from USER-GUIDE. Documenting a feature that doesn't exist is worse than not documenting one that does.

### Priority 2 — Next Doc Update
4. **Add missing API endpoints to README** — At least logout, invite acceptance, cron digest, group plugin management, and per-resource PUT/DELETE routes.
5. **Add `ALLOWED_ORIGINS` to env var table** — Simple one-liner fix.
6. **Update dashboard tab list** — Add Security and Profile tabs, fix order to match actual UI.
7. **Clarify `.env.example` vs `.env.local.template`** — One sentence in README explaining which to use when.

### Priority 3 — Nice to Have
8. **Document download URL validation** in USER-GUIDE security section — it's a real security feature.
9. **Document GET fallback behavior** for update checks — affects analytics completeness.
10. **Add note about magic link delivery via Slack** (not email) — prevents confusion.
11. **Document the cron endpoint** and what it does (cleanup + Slack digest).
12. **Consider using `docker compose exec`** instead of container names in LOCAL-DEV-SETUP for portability.
