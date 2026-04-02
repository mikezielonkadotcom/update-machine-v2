# Org-Scoping Spec Brief for WPArchitect

## What This Is
Update Machine v2 is a **WordPress plugin update server** — manages update manifests, zip downloads, site registrations, license keys, and admin dashboard for multiple WP plugins.

**Current state:** Single-tenant (one set of plugins, one set of users, one admin dashboard).
**Goal:** Multi-org (multiple organizations share one app instance, each with isolated data, users, and R2 storage paths).

## Decision Already Made (Option A)
- **One app, org-scoped everything, org switcher in the dashboard**
- NOT multi-instance (no separate deployments per org)
- Every org sees only their own data

## Current Stack
- **Runtime:** Next.js (App Router) on Vercel
- **Database:** Vercel Postgres (Neon) — Postgres 17
- **Storage:** Cloudflare R2 via S3-compatible API
- **Auth:** PBKDF2-SHA256 passwords, HMAC-signed session cookies
- **Total codebase:** ~3,000 lines TypeScript

## Current Database Schema (001-schema.sql)

```sql
-- Tables: groups, group_plugins, site_keys, sites, blocklist, users, invites, activity_log, sessions, error_log, download_log, magic_links

CREATE TABLE groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  auth_mode TEXT NOT NULL DEFAULT 'auto',
  require_key BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE group_plugins (
  group_id INTEGER NOT NULL REFERENCES groups(id),
  plugin_slug TEXT NOT NULL,
  PRIMARY KEY (group_id, plugin_slug)
);

CREATE TABLE site_keys (
  id SERIAL PRIMARY KEY,
  site_key TEXT NOT NULL UNIQUE,
  site_url TEXT NOT NULL,
  group_id INTEGER NOT NULL DEFAULT 1 REFERENCES groups(id),
  key_type TEXT NOT NULL DEFAULT 'auto',
  domain_locked BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used TIMESTAMPTZ
);

CREATE TABLE sites (
  id SERIAL PRIMARY KEY,
  site_url TEXT NOT NULL,
  site_name TEXT NOT NULL DEFAULT '',
  admin_email TEXT NOT NULL DEFAULT '',
  plugin_slug TEXT NOT NULL,
  plugin_version TEXT NOT NULL DEFAULT '',
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_count INTEGER NOT NULL DEFAULT 1,
  site_key_id INTEGER REFERENCES site_keys(id),
  group_id INTEGER REFERENCES groups(id),
  UNIQUE(site_url, plugin_slug)
);

CREATE TABLE blocklist (
  id SERIAL PRIMARY KEY,
  site_url TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'viewer')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invites (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by INTEGER NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE error_log (
  id SERIAL PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'error',
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  request_method TEXT,
  request_path TEXT,
  request_ip TEXT,
  user_agent TEXT,
  extra TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE download_log (
  id SERIAL PRIMARY KEY,
  plugin_slug TEXT NOT NULL,
  plugin_version TEXT NOT NULL DEFAULT '',
  site_url TEXT NOT NULL DEFAULT '',
  site_ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE magic_links (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT
);
```

## Current R2 Storage Layout
Files are stored flat by plugin slug:
```
macros-block/update.json
macros-block/macros-block-1.9.4.zip
macros-block/icon-128x128.png
link-leash/update.json
link-leash/link-leash-1.2.8.zip
```

## API Routes (current)
### Public (WordPress clients hit these)
- `GET/POST /{slug}/update.json` — Update manifest
- `GET /{slug}/{slug}-{ver}.zip` — Plugin zip download
- `GET /{slug}/icon-*.png` — Plugin icons
- `POST /register` — HMAC site auto-registration
- `GET /api/health` — Health check

### Admin (session cookie or Bearer token)
- POST `/api/admin/login`, GET/POST `/api/admin/groups`, GET/POST `/api/admin/keys`, GET/POST `/api/admin/sites`, GET/POST `/api/admin/blocklist`, GET/POST `/api/admin/users`, GET `/api/admin/downloads`, GET `/api/admin/activity`, GET `/api/admin/errors`, GET `/api/admin/sessions`

## WP Client (um-updater.php)
Each WP plugin includes `um-updater.php` which:
1. Sends POST to `{UM_BASE_URL}/{slug}/update.json` with site info
2. Gets back version/download_url/changelog
3. Downloads zip from `{UM_BASE_URL}/{slug}/{slug}-{ver}.zip`
4. Auto-registers via HMAC to `/register`

The um-updater currently hardcodes `UM_BASE_URL = 'https://updatemachine.com'`.

## What Needs To Change (high-level)
1. **New `organizations` table** — id, slug, name, created_at
2. **`org_id` FK added to:** groups, group_plugins, site_keys, sites, blocklist, download_log, activity_log (at minimum)
3. **User-org membership:** Users can belong to multiple orgs with per-org roles (owner/admin/viewer per org, not global)
4. **R2 storage:** Option A: prefix paths (`mzv/macros-block/update.json`), Option B: keep flat and track in DB. Spec should recommend.
5. **Admin dashboard:** Org switcher in header/sidebar, all queries scoped by current org
6. **Public API routes:** Need to know which org's plugins to serve — could use `?org=mzv` param or subdomain or path prefix
7. **um-updater.php:** Needs to pass org context with update checks
8. **Invite flow:** Becomes org-scoped (invite to specific org)
9. **Session/auth:** Session needs to know current org context
10. **Migration:** Existing data becomes org "mzv" (Mike Zielonka Ventures)

## Plugin Catalog (for context)
Currently all under one org (MZV):
- macros-block (v1.9.4)
- content-locker (v1.1.1)
- link-leash (v1.2.8)
- unfold (v1.0.2)
- bulk-plugin-theme-uploader (v1.0.0)

Future: Don't Press This (dontpressthis.com) may sell plugins from other orgs too.

## What the Spec Should Cover
1. Database schema changes (new tables, altered tables, indexes, constraints)
2. Migration SQL (002-org-scoping.sql) — adds org table, backfills existing data as "mzv"
3. R2 storage strategy recommendation
4. API changes (public + admin routes)
5. um-updater.php changes
6. Auth/session changes (org context in session)
7. Dashboard UX (org switcher, org management)
8. User role model changes (per-org roles vs global roles)
9. Edge cases (cross-org users, org creation flow, org deletion)
10. Test plan
