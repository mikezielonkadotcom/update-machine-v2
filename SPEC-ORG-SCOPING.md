# Engineering Specification: Multi-Organization Support for Update Machine v2

**Author:** WPArchitectClaw
**Date:** 2026-04-01
**Status:** Draft
**Codebase Version:** Update Machine v2 (Next.js App Router, Vercel Postgres, Cloudflare R2)

---

## 1. Executive Summary

Update Machine v2 is currently single-tenant — one set of plugins, one set of users, one admin dashboard. This spec adds **multi-organization support** so that multiple organizations can share a single app instance, each with fully isolated data, users, R2 storage, and dashboard views.

**Key decisions already made:**
- Single deployment, org-scoped everything (not multi-instance)
- Org switcher in dashboard for users belonging to multiple orgs
- Existing data migrates to org slug `mzv` (Mike Zielonka Ventures)

**Scope of changes:**
- 2 new database tables (`organizations`, `org_memberships`), 7 altered tables
- R2 storage re-prefixed by org slug
- Auth system extended with org context in session
- All admin API routes scoped by org
- Public API routes use query parameter for org routing
- um-updater.php gains `UM_ORG` constant
- Dashboard gains org switcher + org management UI

**Estimated complexity:** ~800–1200 lines of changes across ~30 files.

---

## 2. Database Changes

### 2.1 New Tables

#### `organizations`
```sql
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
```

#### `org_memberships`
Replaces the global `role` column on `users`. Users can belong to multiple orgs with per-org roles.

```sql
CREATE TABLE IF NOT EXISTS org_memberships (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id ON org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org_id ON org_memberships(org_id);
```

### 2.2 Altered Tables

#### `users` — remove global `role`
```sql
-- After migration, drop the role column (Phase 2, once all code reads from org_memberships)
-- For now, keep it but stop writing to it. The column becomes vestigial.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'viewer';
```

> **Migration strategy:** During Phase 1, keep `role` on `users` but treat `org_memberships.role` as authoritative. Drop the column in Phase 2 after all code is migrated.

#### `groups` — add `org_id`
```sql
ALTER TABLE groups ADD COLUMN org_id INTEGER REFERENCES organizations(id);
-- After backfill:
ALTER TABLE groups ALTER COLUMN org_id SET NOT NULL;
-- Slug uniqueness becomes per-org:
ALTER TABLE groups DROP CONSTRAINT groups_slug_key;
ALTER TABLE groups ADD CONSTRAINT groups_org_slug_unique UNIQUE(org_id, slug);
CREATE INDEX IF NOT EXISTS idx_groups_org_id ON groups(org_id);
```

#### `site_keys` — add `org_id`
```sql
ALTER TABLE site_keys ADD COLUMN org_id INTEGER REFERENCES organizations(id);
ALTER TABLE site_keys ALTER COLUMN org_id SET NOT NULL; -- after backfill
CREATE INDEX IF NOT EXISTS idx_site_keys_org_id ON site_keys(org_id);
```

#### `sites` — add `org_id`
```sql
ALTER TABLE sites ADD COLUMN org_id INTEGER REFERENCES organizations(id);
ALTER TABLE sites ALTER COLUMN org_id SET NOT NULL; -- after backfill
-- Uniqueness becomes per-org:
ALTER TABLE sites DROP CONSTRAINT sites_site_url_plugin_slug_key;
ALTER TABLE sites ADD CONSTRAINT sites_org_url_plugin_unique UNIQUE(org_id, site_url, plugin_slug);
CREATE INDEX IF NOT EXISTS idx_sites_org_id ON sites(org_id);
```

#### `blocklist` — add `org_id`
```sql
ALTER TABLE blocklist ADD COLUMN org_id INTEGER REFERENCES organizations(id);
ALTER TABLE blocklist ALTER COLUMN org_id SET NOT NULL; -- after backfill
-- Uniqueness becomes per-org:
ALTER TABLE blocklist DROP CONSTRAINT blocklist_site_url_key;
ALTER TABLE blocklist ADD CONSTRAINT blocklist_org_url_unique UNIQUE(org_id, site_url);
CREATE INDEX IF NOT EXISTS idx_blocklist_org_id ON blocklist(org_id);
```

#### `activity_log` — add `org_id`
```sql
ALTER TABLE activity_log ADD COLUMN org_id INTEGER REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_activity_log_org_id ON activity_log(org_id);
```

#### `download_log` — add `org_id`
```sql
ALTER TABLE download_log ADD COLUMN org_id INTEGER REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_download_log_org_id ON download_log(org_id);
```

#### `invites` — add `org_id`
```sql
ALTER TABLE invites ADD COLUMN org_id INTEGER REFERENCES organizations(id);
ALTER TABLE invites ALTER COLUMN org_id SET NOT NULL; -- after backfill
CREATE INDEX IF NOT EXISTS idx_invites_org_id ON invites(org_id);
```

#### `sessions` — add `org_id` (current org context)
```sql
ALTER TABLE sessions ADD COLUMN org_id INTEGER REFERENCES organizations(id);
```

This stores the user's currently-selected org. Updated when the user switches orgs via the org switcher.

### 2.3 Tables NOT altered
- **`error_log`** — System-wide, not org-scoped. Errors can reference any org via `extra` JSON.
- **`magic_links`** — User-level, not org-scoped.

### 2.4 Migration SQL: `db/002-org-scoping.sql`

```sql
-- 002-org-scoping.sql
-- Multi-organization support migration
-- Safe to run on a live database (all ADD COLUMN, no DROP until Phase 2)

BEGIN;

-- 1. Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- 2. Seed the default org
INSERT INTO organizations (name, slug)
VALUES ('Mike Zielonka Ventures', 'mzv')
ON CONFLICT (slug) DO NOTHING;

-- 3. Create org_memberships table
CREATE TABLE IF NOT EXISTS org_memberships (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id ON org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org_id ON org_memberships(org_id);

-- 4. Add org_id columns (nullable first for backfill)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id);
ALTER TABLE site_keys ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id);
ALTER TABLE blocklist ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id);
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id);
ALTER TABLE download_log ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id);
ALTER TABLE invites ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES organizations(id);

-- 5. Backfill all existing data to org 'mzv'
UPDATE groups SET org_id = (SELECT id FROM organizations WHERE slug = 'mzv') WHERE org_id IS NULL;
UPDATE site_keys SET org_id = (SELECT id FROM organizations WHERE slug = 'mzv') WHERE org_id IS NULL;
UPDATE sites SET org_id = (SELECT id FROM organizations WHERE slug = 'mzv') WHERE org_id IS NULL;
UPDATE blocklist SET org_id = (SELECT id FROM organizations WHERE slug = 'mzv') WHERE org_id IS NULL;
UPDATE activity_log SET org_id = (SELECT id FROM organizations WHERE slug = 'mzv') WHERE org_id IS NULL;
UPDATE download_log SET org_id = (SELECT id FROM organizations WHERE slug = 'mzv') WHERE org_id IS NULL;
UPDATE invites SET org_id = (SELECT id FROM organizations WHERE slug = 'mzv') WHERE org_id IS NULL;

-- 6. Set NOT NULL after backfill (skip for activity_log/download_log — historical rows may lack org)
ALTER TABLE groups ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE site_keys ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE sites ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE blocklist ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE invites ALTER COLUMN org_id SET NOT NULL;

-- 7. Migrate existing users into org_memberships for 'mzv'
INSERT INTO org_memberships (org_id, user_id, role)
SELECT (SELECT id FROM organizations WHERE slug = 'mzv'), id, role
FROM users
ON CONFLICT (org_id, user_id) DO NOTHING;

-- 8. Update unique constraints
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_slug_key;
ALTER TABLE groups ADD CONSTRAINT groups_org_slug_unique UNIQUE(org_id, slug);

ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_site_url_plugin_slug_key;
ALTER TABLE sites ADD CONSTRAINT sites_org_url_plugin_unique UNIQUE(org_id, site_url, plugin_slug);

ALTER TABLE blocklist DROP CONSTRAINT IF EXISTS blocklist_site_url_key;
ALTER TABLE blocklist ADD CONSTRAINT blocklist_org_url_unique UNIQUE(org_id, site_url);

-- 9. Indexes for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_groups_org_id ON groups(org_id);
CREATE INDEX IF NOT EXISTS idx_site_keys_org_id ON site_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_sites_org_id ON sites(org_id);
CREATE INDEX IF NOT EXISTS idx_blocklist_org_id ON blocklist(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_org_id ON activity_log(org_id);
CREATE INDEX IF NOT EXISTS idx_download_log_org_id ON download_log(org_id);
CREATE INDEX IF NOT EXISTS idx_invites_org_id ON invites(org_id);

-- 10. Backfill session org_id for existing sessions
UPDATE sessions SET org_id = (SELECT id FROM organizations WHERE slug = 'mzv') WHERE org_id IS NULL;

COMMIT;
```

---

## 3. R2 Storage Strategy

### Options Considered

| Approach | Pros | Cons |
|----------|------|------|
| **A: Prefix-based** (`{org_slug}/{plugin_slug}/file`) | Clean isolation, easy to enumerate per-org, simple R2 lifecycle policies per prefix, easy bucket migration later | Requires one-time file rename for existing data, R2 keys change |
| **B: Flat with DB tracking** (keep current layout, track org in DB) | Zero R2 changes, no file moves | Plugin slug collisions across orgs, no physical isolation, listing plugins requires DB join, harder to audit |

### **Recommendation: Option A — Prefix-based**

The prefix approach is the clear winner. R2 is an object store — prefixes are free, and they give us physical isolation by org.

#### New R2 layout:
```
mzv/macros-block/update.json
mzv/macros-block/macros-block-1.9.4.zip
mzv/macros-block/icon-128x128.png
mzv/link-leash/update.json
mzv/link-leash/link-leash-1.2.8.zip
other-org/their-plugin/update.json
other-org/their-plugin/their-plugin-2.0.0.zip
```

#### Migration of existing R2 files:
Write a one-time script that:
1. Lists all objects in the bucket (current flat layout)
2. For each object, copies it to `mzv/{original_key}`
3. Verifies the copy
4. Deletes the original

This can run live — the app code change to read from `{org_slug}/{key}` deploys at the same time.

#### Changes to `src/lib/r2.ts`

Add an `orgSlug` parameter to `getObject` and `listObjects`:

```typescript
// Before:
export async function getObject(key: string)
export async function listObjects(prefix?: string)

// After:
export async function getObject(orgSlug: string, key: string)
// internally: Key = `${orgSlug}/${key}`

export async function listObjects(orgSlug: string, prefix?: string)
// internally: Prefix = prefix ? `${orgSlug}/${prefix}` : `${orgSlug}/`
```

---

## 4. Auth/Session Changes

### 4.1 How Org Context Flows

The org context needs to be available at two levels:

1. **Admin requests (dashboard):** Session cookie carries current org. Stored in `sessions.org_id`.
2. **Public requests (WP clients):** Org determined from query parameter `?org=slug`.

### 4.2 Updated `AuthUser` Interface

**File:** `src/lib/auth.ts`

```typescript
export interface AuthUser {
  id: number | null;
  email: string;
  display_name: string;
  role: string;          // per-org role from org_memberships
  org_id: number;        // current org context
  org_slug: string;      // current org slug (for R2 paths)
  via: 'token' | 'session';
  session_id?: string;
  session_expires_at?: string;
}
```

### 4.3 Updated `verifyAdmin()` Flow

```
1. Extract session cookie (unchanged)
2. Validate HMAC signature (unchanged)
3. JOIN sessions → users → org_memberships → organizations
4. Read org_id from sessions.org_id
5. Read role from org_memberships WHERE org_id = sessions.org_id AND user_id = users.id
6. Return AuthUser with org_id, org_slug, role
```

Updated query in `verifyAdmin`:
```sql
SELECT
  s.id as session_id, s.expires_at, s.created_at as session_created_at, s.org_id,
  u.id, u.email, u.display_name, u.is_active,
  om.role,
  o.slug as org_slug, o.name as org_name
FROM sessions s
JOIN users u ON s.user_id = u.id
JOIN org_memberships om ON om.user_id = u.id AND om.org_id = s.org_id
JOIN organizations o ON o.id = s.org_id
WHERE s.id = $1 AND s.expires_at > NOW() AND u.is_active = TRUE AND o.is_active = TRUE
```

If `sessions.org_id` is NULL (legacy session), fall back to the user's first org:
```sql
-- Fallback: pick user's first org
SELECT om.org_id, om.role, o.slug as org_slug
FROM org_memberships om
JOIN organizations o ON o.id = om.org_id
WHERE om.user_id = $1 AND o.is_active = TRUE
ORDER BY om.created_at ASC LIMIT 1
```

### 4.4 Bearer Token Auth

The `ADMIN_TOKEN` bearer token needs an org context too. Options:
- **Header:** `X-Org: mzv` alongside `Authorization: Bearer <token>`
- **Query param:** `?org=mzv`

**Recommendation:** Use `X-Org` header. If missing, return 400 error for bearer token requests.

```typescript
// In verifyAdmin, for bearer token path:
if (token && token === adminToken) {
  const orgSlug = request.headers.get('X-Org');
  if (!orgSlug) return null; // or return a specific error
  const org = await queryOne('SELECT id, slug FROM organizations WHERE slug = $1 AND is_active = TRUE', [orgSlug]);
  if (!org) return null;
  return { id: null, email: 'bearer-token', display_name: 'API Token', role: 'owner', org_id: org.id, org_slug: org.slug, via: 'token' };
}
```

### 4.5 Login Flow Change

**File:** `src/app/api/admin/login/route.ts`

After password verification, the login response needs to pick a default org:

```typescript
// After successful password check:
const memberships = await queryAll(
  `SELECT om.org_id, om.role, o.slug, o.name
   FROM org_memberships om JOIN organizations o ON o.id = om.org_id
   WHERE om.user_id = $1 AND o.is_active = TRUE
   ORDER BY om.created_at ASC`,
  [user.id]
);

if (memberships.length === 0) {
  return NextResponse.json({ error: 'No organization access' }, { status: 403, headers });
}

const defaultOrg = memberships[0]; // First org they joined

// Create session with org_id
await query(
  `INSERT INTO sessions (id, user_id, org_id, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '1 day' * $4)`,
  [sessionId, user.id, defaultOrg.org_id, sessionDays]
);

// Response includes org list
return NextResponse.json({
  ok: true,
  user: { id: user.id, email: user.email, display_name: user.display_name, role: defaultOrg.role },
  org: { id: defaultOrg.org_id, slug: defaultOrg.slug, name: defaultOrg.name },
  orgs: memberships.map(m => ({ id: m.org_id, slug: m.slug, name: m.name, role: m.role })),
});
```

### 4.6 Org Switcher API

**New route:** `POST /api/admin/switch-org`

```typescript
// src/app/api/admin/switch-org/route.ts
// Request: { org_id: number }
// Validates: user has membership in target org
// Updates: sessions.org_id = target org_id
// Returns: { ok: true, org: { id, slug, name }, role: string }
```

Updated session query:
```sql
UPDATE sessions SET org_id = $1 WHERE id = $2
```

Validation:
```sql
SELECT om.role, o.slug, o.name
FROM org_memberships om JOIN organizations o ON o.id = om.org_id
WHERE om.user_id = $1 AND om.org_id = $2 AND o.is_active = TRUE
```

---

## 5. User Role Model

### 5.1 Per-Org Roles

Roles move from global (`users.role`) to per-org (`org_memberships.role`):

| Role | Permissions |
|------|-------------|
| `owner` | Full access. Can manage org settings, transfer ownership, delete org, manage users. One owner per org. |
| `admin` | Read/write access. Can manage groups, keys, sites, blocklist, invite users (admin/viewer only). Cannot delete org or transfer ownership. |
| `viewer` | Read-only access. Can view all data but cannot modify anything. |

### 5.2 Cross-Org Users

A user (identified by `users.email`) can belong to multiple orgs with different roles:
- User A: owner of `mzv`, viewer of `acme`
- User B: admin of `mzv`, admin of `acme`

The `users` table stores identity (email, password, display_name). The `org_memberships` table stores authorization.

### 5.3 Super-Admin Concept

No super-admin role in the DB. The `ADMIN_TOKEN` bearer token acts as super-admin — it can target any org via the `X-Org` header.

### 5.4 Org Owner Rules

- Exactly one owner per org (enforced in application code, not DB constraint).
- Owner can transfer ownership to an admin within the same org.
- Owner can delete the org (with confirmation).
- When creating a new org, the creating user becomes the owner.

### 5.5 Updated `canWrite()` and `requireRole()`

```typescript
export function canWrite(user: AuthUser): boolean {
  return user.role === 'owner' || user.role === 'admin' || user.via === 'token';
}

export function requireRole(user: AuthUser, ...roles: string[]): boolean {
  return roles.includes(user.role);
}
// No changes needed — these already work with the role on AuthUser.
// The role now comes from org_memberships instead of users table.
```

---

## 6. API Changes — Admin Routes

Every admin route that queries data must add `WHERE org_id = $N` scoping. The `org_id` comes from `user.org_id` (set in `verifyAdmin`).

### 6.1 Route-by-Route Changes

#### `GET /api/admin/groups` — `src/app/api/admin/groups/route.ts`
```diff
- const groups = await queryAll('SELECT * FROM groups ORDER BY name');
+ const groups = await queryAll('SELECT * FROM groups WHERE org_id = $1 ORDER BY name', [user.org_id]);
```

#### `POST /api/admin/groups`
```diff
  const result = await query(
-   'INSERT INTO groups (name, slug, auth_mode, require_key) VALUES ($1, $2, $3, $4) RETURNING id',
-   [name, slug, mode, rk]
+   'INSERT INTO groups (name, slug, auth_mode, require_key, org_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
+   [name, slug, mode, rk, user.org_id]
  );
```

#### `PUT /api/admin/groups/[id]`
Add ownership check: `WHERE id = $1 AND org_id = $2`.

#### `DELETE /api/admin/groups/[id]`
Add ownership check: `WHERE id = $1 AND org_id = $2`.

#### `GET /api/admin/keys` — `src/app/api/admin/keys/route.ts`
```diff
- FROM site_keys sk LEFT JOIN groups g ON g.id = sk.group_id ORDER BY sk.created_at DESC
+ FROM site_keys sk LEFT JOIN groups g ON g.id = sk.group_id WHERE sk.org_id = $1 ORDER BY sk.created_at DESC
```

#### `POST /api/admin/keys`
Add `org_id` to INSERT:
```diff
  await query(
-   "INSERT INTO site_keys (site_key, site_url, group_id, key_type, domain_locked, is_active) VALUES ($1, $2, $3, 'license', $4, TRUE)",
-   [hashedKey, siteUrl, groupId, domainLocked]
+   "INSERT INTO site_keys (site_key, site_url, group_id, key_type, domain_locked, is_active, org_id) VALUES ($1, $2, $3, 'license', $4, TRUE, $5)",
+   [hashedKey, siteUrl, groupId, domainLocked, user.org_id]
  );
```

#### `PUT/DELETE /api/admin/keys/[id]`
Add org check: `WHERE id = $1 AND org_id = $2`.

#### `GET /api/admin/sites` — `src/app/api/admin/sites/route.ts`
```diff
- const sites = await queryAll('SELECT * FROM sites ORDER BY last_seen DESC');
+ const sites = await queryAll('SELECT * FROM sites WHERE org_id = $1 ORDER BY last_seen DESC', [user.org_id]);
```

#### `GET /api/admin/blocklist` — `src/app/api/admin/blocklist/route.ts`
```diff
- const blocked = await queryAll('SELECT * FROM blocklist ORDER BY created_at DESC');
+ const blocked = await queryAll('SELECT * FROM blocklist WHERE org_id = $1 ORDER BY created_at DESC', [user.org_id]);
```

#### `POST /api/admin/blocklist`
Add `org_id` to INSERT. Also scope the key deactivation:
```diff
- await query('INSERT INTO blocklist (site_url, reason) VALUES ($1, $2)', [siteUrl, body.reason || '']);
- await query('UPDATE site_keys SET is_active = FALSE WHERE site_url = $1', [siteUrl]);
+ await query('INSERT INTO blocklist (site_url, reason, org_id) VALUES ($1, $2, $3)', [siteUrl, body.reason || '', user.org_id]);
+ await query('UPDATE site_keys SET is_active = FALSE WHERE site_url = $1 AND org_id = $2', [siteUrl, user.org_id]);
```

#### `DELETE /api/admin/blocklist/[url]`
Add org check.

#### `GET /api/admin/users` — `src/app/api/admin/users/route.ts`
Major change — users are now per-org via memberships:
```sql
SELECT u.id, u.email, u.display_name, om.role, u.is_active, u.created_at, u.updated_at
FROM users u
JOIN org_memberships om ON om.user_id = u.id
WHERE om.org_id = $1
ORDER BY u.created_at
```

Invites query also scoped:
```sql
SELECT i.id, i.email, i.role, u.email as invited_by_email, i.expires_at, i.accepted_at, i.created_at
FROM invites i LEFT JOIN users u ON u.id = i.invited_by
WHERE i.org_id = $1 AND i.accepted_at IS NULL AND i.expires_at > NOW()
ORDER BY i.created_at DESC
```

#### `POST /api/admin/users` (invite)
Add `org_id` to invite INSERT:
```diff
  await query(
-   "INSERT INTO invites (email, role, token_hash, invited_by, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '72 hours')",
-   [normalizedEmail, role, tokenHash, user.id]
+   "INSERT INTO invites (email, role, token_hash, invited_by, org_id, expires_at) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '72 hours')",
+   [normalizedEmail, role, tokenHash, user.id, user.org_id]
  );
```

#### `PUT /api/admin/users/[id]` (change role)
Must verify target user is in the same org:
```sql
SELECT om.id FROM org_memberships om WHERE om.user_id = $1 AND om.org_id = $2
```
Update `org_memberships.role` instead of `users.role`.

#### `DELETE /api/admin/users/[id]`
Remove from org (delete membership), don't delete the user row (they may belong to other orgs):
```sql
DELETE FROM org_memberships WHERE user_id = $1 AND org_id = $2
```
Only delete the `users` row if they have zero remaining memberships.

#### `POST /api/admin/users/transfer-ownership`
Scope to current org:
```sql
-- Demote current owner in this org
UPDATE org_memberships SET role = 'admin', updated_at = NOW() WHERE org_id = $1 AND role = 'owner';
-- Promote target
UPDATE org_memberships SET role = 'owner', updated_at = NOW() WHERE org_id = $1 AND user_id = $2;
```

#### `POST /api/admin/users/accept-invite`
When accepting an invite, create/update the user AND create an `org_memberships` row:
```typescript
// Look up the invite (includes org_id now)
const invite = await queryOne('SELECT * FROM invites WHERE token_hash = $1 AND ...', [tokenHash]);

// Check if user already exists
const existingUser = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [invite.email]);

let userId: number;
if (existingUser) {
  userId = existingUser.id;
} else {
  const result = await query(
    'INSERT INTO users (email, display_name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [invite.email, display_name.trim(), passwordHash, invite.role]
  );
  userId = result.rows[0].id;
}

// Create org membership
await query(
  'INSERT INTO org_memberships (org_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (org_id, user_id) DO NOTHING',
  [invite.org_id, userId, invite.role]
);
```

#### `GET /api/admin/downloads`
Add org scoping to all download_log queries:
```diff
- SELECT COUNT(*) as c FROM download_log ${whereClause}
+ SELECT COUNT(*) as c FROM download_log WHERE org_id = $1 ${extraConditions}
```

#### `GET /api/admin/activity`
Scope to org:
```diff
- SELECT * FROM activity_log ${whereClause}
+ SELECT * FROM activity_log WHERE org_id = $1 ${extraConditions}
```

#### `GET /api/admin/errors`
**No change.** Error logs remain global (system-level).

#### `GET /api/admin/sessions`
Scope to org's users:
```sql
SELECT s.*, u.email, u.display_name
FROM sessions s JOIN users u ON s.user_id = u.id
JOIN org_memberships om ON om.user_id = u.id AND om.org_id = $1
WHERE s.expires_at > NOW()
```

#### `GET /api/admin/plugins`
Scope R2 listing to org:
```diff
- const objects = await listObjects();
+ const objects = await listObjects(user.org_slug);
```

### 6.2 New Admin Routes

#### `POST /api/admin/switch-org`
**File:** `src/app/api/admin/switch-org/route.ts`

```typescript
// Request: { org_id: number }
// Response: { ok: true, org: { id, slug, name }, role: string }
```

#### `GET /api/admin/orgs`
**File:** `src/app/api/admin/orgs/route.ts`

Returns the current user's organizations:
```typescript
// Response: { orgs: [{ id, slug, name, role, created_at }], current_org_id: number }
```

Query:
```sql
SELECT o.id, o.slug, o.name, om.role, o.created_at
FROM organizations o
JOIN org_memberships om ON om.org_id = o.id
WHERE om.user_id = $1 AND o.is_active = TRUE
ORDER BY o.name
```

#### `POST /api/admin/orgs`
**File:** `src/app/api/admin/orgs/route.ts`

Create a new organization. Any authenticated user can create an org (they become owner).

```typescript
// Request: { name: string, slug: string }
// Response: { id, name, slug }
```

```sql
INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id;
INSERT INTO org_memberships (org_id, user_id, role) VALUES ($1, $2, 'owner');
```

#### `PUT /api/admin/orgs/[id]`
Update org name (owner only).

#### `DELETE /api/admin/orgs/[id]`
Delete org and all associated data (owner only, with confirmation token). See Section 12.2.

---

## 7. Public API Changes

### 7.1 Routing Strategy

**Options considered:**

| Approach | URL Pattern | Pros | Cons |
|----------|------------|------|------|
| Query param | `/{slug}/update.json?org=mzv` | No URL structure change, easy to add | Slightly ugly, cached URLs vary by param |
| Path prefix | `/o/mzv/{slug}/update.json` | Clean, cacheable, clear | Breaking change to URL structure |
| Subdomain | `mzv.updatemachine.com` | Best isolation | DNS config per org, SSL certs, complex |

### **Recommendation: Query parameter `?org=slug`**

Reasoning:
1. **Minimal disruption.** Existing WP sites keep working — if `?org` is missing, fall back to `mzv` (the legacy default).
2. **No DNS changes.** New orgs work immediately.
3. **Simple implementation.** Just read a query param.
4. **Cache-safe.** R2/CDN keys already vary by path; adding `?org` to cache key is trivial.

### 7.2 Org Resolution Logic

**File:** `src/app/[slug]/[filename]/route.ts`

Add org resolution at the top of GET/POST handlers:

```typescript
async function resolveOrg(request: NextRequest): Promise<{ id: number; slug: string } | null> {
  const url = new URL(request.url);
  const orgSlug = url.searchParams.get('org');

  if (!orgSlug) {
    // Legacy fallback: default to 'mzv'
    const defaultOrg = await queryOne<any>(
      "SELECT id, slug FROM organizations WHERE slug = 'mzv' AND is_active = TRUE"
    );
    return defaultOrg || null;
  }

  if (!/^[a-z0-9-]+$/i.test(orgSlug)) return null;

  const org = await queryOne<any>(
    'SELECT id, slug FROM organizations WHERE slug = $1 AND is_active = TRUE',
    [orgSlug]
  );
  return org || null;
}
```

### 7.3 Updated Public Routes

#### `GET/POST /{slug}/update.json`

```diff
  export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
    const { slug, filename } = await params;
+   const org = await resolveOrg(request);
+   if (!org) return new NextResponse('Unknown organization', { status: 404, headers: corsHeaders });

    // R2 key changes:
-   const key = `${slug}/${filename}`;
+   const key = `${org.slug}/${slug}/${filename}`;
```

#### `POST /{slug}/update.json` (recordSiteCheck)

```diff
  async function recordSiteCheck(slug: string, body: any, plainKey: string | null, orgId: number) {
    // ... existing logic ...
    await query(
-     `INSERT INTO sites (site_url, site_name, admin_email, plugin_slug, plugin_version, ..., group_id)
+     `INSERT INTO sites (site_url, site_name, admin_email, plugin_slug, plugin_version, ..., group_id, org_id)
-      VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 1, $6, $7)
-      ON CONFLICT(site_url, plugin_slug) DO UPDATE SET ...`,
+      VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 1, $6, $7, $8)
+      ON CONFLICT(org_id, site_url, plugin_slug) DO UPDATE SET ...`,
```

#### Download logging
```diff
  query(
-   'INSERT INTO download_log (plugin_slug, plugin_version, site_url, site_ip, user_agent) VALUES ($1, $2, $3, $4, $5)',
-   [slug, version, siteUrl, siteIp, userAgent]
+   'INSERT INTO download_log (plugin_slug, plugin_version, site_url, site_ip, user_agent, org_id) VALUES ($1, $2, $3, $4, $5, $6)',
+   [slug, version, siteUrl, siteIp, userAgent, org.id]
  );
```

#### `checkDownloadAuth` in helpers.ts
Must scope the group lookup to the org:
```diff
  const group = await queryOne<any>(
    `SELECT g.* FROM groups g
     JOIN group_plugins gp ON gp.group_id = g.id
-    WHERE gp.plugin_slug = $1`,
-   [slug]
+    WHERE gp.plugin_slug = $1 AND g.org_id = $2`,
+   [slug, orgId]
  );
```

Pass `orgId` into `checkDownloadAuth`:
```typescript
export async function checkDownloadAuth(slug: string, request: NextRequest, orgId: number)
```

#### `POST /api/register`

The registration endpoint needs org context. The HMAC message format changes:

```diff
- const message = `${site_url}|${plugin_slug}|${timestamp}`;
+ const message = `${site_url}|${plugin_slug}|${timestamp}|${org_slug}`;
```

But for backward compatibility, accept both formats:
```typescript
const orgSlug = body.org || 'mzv';
const org = await queryOne('SELECT id, slug FROM organizations WHERE slug = $1 AND is_active = TRUE', [orgSlug]);
if (!org) return NextResponse.json({ error: 'Unknown organization' }, { status: 400, headers: corsHeaders });

// Try new format first, then legacy
const messageNew = `${site_url}|${plugin_slug}|${timestamp}|${orgSlug}`;
const messageLegacy = `${site_url}|${plugin_slug}|${timestamp}`;
const expectedNew = crypto.createHmac('sha256', secret).update(messageNew).digest('hex');
const expectedLegacy = crypto.createHmac('sha256', secret).update(messageLegacy).digest('hex');

let valid = false;
try { valid = crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedNew, 'hex')); } catch {}
if (!valid) {
  try { valid = crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedLegacy, 'hex')); } catch {}
}
```

Add `org_id` to all INSERTs in the register route:
```diff
  await query(
-   "INSERT INTO site_keys (site_key, site_url, group_id, key_type, domain_locked, is_active) VALUES ($1, $2, $3, 'auto', TRUE, TRUE)",
-   [hashedKey, normalizedUrl, groupId]
+   "INSERT INTO site_keys (site_key, site_url, group_id, key_type, domain_locked, is_active, org_id) VALUES ($1, $2, $3, 'auto', TRUE, TRUE, $4)",
+   [hashedKey, normalizedUrl, groupId, org.id]
  );
```

Blocklist check also scoped:
```diff
- const blocked = await queryOne('SELECT 1 FROM blocklist WHERE site_url = $1', [normalizedUrl]);
+ const blocked = await queryOne('SELECT 1 FROM blocklist WHERE site_url = $1 AND org_id = $2', [normalizedUrl, org.id]);
```

---

## 8. um-updater.php Changes

The WordPress client library needs to send org context with every request.

### 8.1 New Constant

Each plugin's main file defines:
```php
// Before:
define('UM_BASE_URL', 'https://updatemachine.com');

// After:
define('UM_BASE_URL', 'https://updatemachine.com');
define('UM_ORG', 'mzv');  // Organization slug
```

### 8.2 Update Check Changes

In the function that POSTs to `update.json`:

```php
// Before:
$url = UM_BASE_URL . '/' . $this->plugin_slug . '/update.json';

// After:
$url = UM_BASE_URL . '/' . $this->plugin_slug . '/update.json?org=' . urlencode( defined('UM_ORG') ? UM_ORG : 'mzv' );
```

### 8.3 Download URL Changes

The `download_url` in `update.json` will already include the correct full URL (generated by the server). No change needed for zip downloads — the URL from the manifest is used directly.

However, `update.json` files in R2 need their `download_url` field updated to include `?org=`:
```json
{
  "download_url": "https://updatemachine.com/macros-block/macros-block-1.9.4.zip?org=mzv"
}
```

Alternatively, the server can rewrite the download URL dynamically when serving `update.json`:
```typescript
// In the GET handler for update.json, after reading from R2:
const manifest = JSON.parse(buffer.toString('utf-8'));
if (manifest.download_url) {
  const dlUrl = new URL(manifest.download_url);
  dlUrl.searchParams.set('org', org.slug);
  manifest.download_url = dlUrl.toString();
}
return NextResponse.json(manifest, { headers: ... });
```

**Recommendation:** Dynamic rewrite. This avoids having to update every `update.json` in R2 when the feature ships, and ensures the org param is always present regardless of how the JSON was uploaded.

### 8.4 Registration Changes

```php
// Before:
$message = $site_url . '|' . $plugin_slug . '|' . $timestamp;
$body = array(
  'site_url'       => $site_url,
  'plugin_slug'    => $plugin_slug,
  'timestamp'      => $timestamp,
  'signature'      => $signature,
  // ...
);

// After:
$org = defined('UM_ORG') ? UM_ORG : 'mzv';
$message = $site_url . '|' . $plugin_slug . '|' . $timestamp . '|' . $org;
$body = array(
  'site_url'       => $site_url,
  'plugin_slug'    => $plugin_slug,
  'timestamp'      => $timestamp,
  'signature'      => $signature,
  'org'            => $org,
  // ...
);
```

### 8.5 Backward Compatibility

For existing deployed plugins that don't have `UM_ORG`:
- The `defined('UM_ORG') ? UM_ORG : 'mzv'` pattern ensures they default to `mzv`
- The server accepts both old and new HMAC formats (see Section 7.3)
- The `?org` parameter defaults to `mzv` when missing

**No existing WP sites will break.** New um-updater.php versions are shipped with the next plugin update.

---

## 9. Dashboard UX

### 9.1 Org Switcher

**Location:** Top of the sidebar/header area in the admin dashboard.

**Component:** Dropdown showing current org name and slug. Clicking shows all orgs the user belongs to with their role.

```typescript
// State in dashboard:
const [currentOrg, setCurrentOrg] = useState<{ id: number; slug: string; name: string } | null>(null);
const [orgs, setOrgs] = useState<Array<{ id: number; slug: string; name: string; role: string }>>([]);

// On mount: GET /api/admin/orgs → populate orgs list
// On switch: POST /api/admin/switch-org → reload all data
```

**Behavior:**
1. Switching org calls `POST /api/admin/switch-org` with the new `org_id`
2. Dashboard refetches all tab data
3. User's role badge updates to reflect their role in the new org

### 9.2 Org Management Tab

New tab in the dashboard: **"Organization"** (visible to owners only).

**Features:**
- Edit org name
- View org slug (read-only after creation)
- View member list with roles
- Create new organization (opens modal)
- Danger zone: Delete organization (requires typing org slug to confirm)

### 9.3 New Admin Routes (Dashboard Pages)

No new Next.js page routes needed — the dashboard is a single SPA page (`src/app/admin/sites/page.tsx`). All org management is done via API calls from the existing dashboard.

Add a new tab to the tab list:
```typescript
const tabs = ['sites', 'plugins', 'groups', 'keys', 'blocklist', 'users', 'downloads', 'activity', 'errors', 'security', 'organization', 'profile'];
```

### 9.4 Summary Stats Update

The summary stats bar at the top already shows counts. These queries all get org_id scoping. No UI change needed — the data is just filtered.

---

## 10. Invite Flow Changes

### 10.1 Org-Scoped Invitations

Invites now include `org_id`. When a user is invited:
1. The invite is created with `org_id = user.org_id` (the inviter's current org)
2. The invite URL remains the same: `/admin/invite?token=<token>`
3. When accepted, the user gets an `org_memberships` row for that specific org

### 10.2 Cross-Org Invites

If an existing user (already in org A) is invited to org B:
- `accept-invite` checks if the user already exists by email
- If yes: skip creating a new user row, just add `org_memberships` for org B
- If no: create user row + membership
- The user can now switch between org A and org B

### 10.3 Invite Response

The invite URL now needs org context for the UI:
```typescript
// GET /api/admin/invite?token=<token>
// Response now includes org info:
{
  email: 'user@example.com',
  role: 'admin',
  org_name: 'Mike Zielonka Ventures',
  org_slug: 'mzv'
}
```

---

## 11. Migration Plan

### 11.1 Strategy: Additive-Only, Zero Downtime

All schema changes are `ADD COLUMN` or `CREATE TABLE` — no columns are dropped or renamed. This means:

1. **Deploy migration first** — Run `002-org-scoping.sql` while the old code is still running. Old code ignores `org_id` columns.
2. **Deploy new code** — The new code reads/writes `org_id`. Old sessions continue to work (fallback logic).
3. **Migrate R2 files** — Run the R2 prefix script.
4. **Clean up** — Remove legacy fallback code in a future release.

### 11.2 Step-by-Step

| Step | Action | Downtime? |
|------|--------|-----------|
| 1 | Run `002-org-scoping.sql` | No |
| 2 | Deploy code with org support + legacy fallbacks | No |
| 3 | Run R2 migration script (copy files to `mzv/` prefix) | No |
| 4 | Verify all public URLs work with `?org=mzv` and without | No |
| 5 | Ship updated um-updater.php with `UM_ORG` in next plugin releases | No |
| 6 | Remove legacy fallback code after all WP sites have updated | No |

### 11.3 R2 Migration Script

```typescript
// scripts/migrate-r2-to-org-prefix.ts
import { s3, BUCKET } from '../src/lib/r2';
import { CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const ORG_SLUG = 'mzv';

async function migrate() {
  let token: string | undefined;
  do {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET, ContinuationToken: token, MaxKeys: 500
    }));
    for (const obj of list.Contents || []) {
      if (!obj.Key || obj.Key.startsWith(`${ORG_SLUG}/`)) continue;
      const newKey = `${ORG_SLUG}/${obj.Key}`;
      console.log(`Copying ${obj.Key} → ${newKey}`);
      await s3.send(new CopyObjectCommand({
        Bucket: BUCKET,
        CopySource: `${BUCKET}/${obj.Key}`,
        Key: newKey,
      }));
      // Delete original after copy
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key }));
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
}

migrate().then(() => console.log('Done')).catch(console.error);
```

### 11.4 Rollback Plan

If issues arise:
1. Code can be reverted — old code works with the new schema (it ignores `org_id`)
2. R2 files: keep originals for 48 hours before deleting (modify script to skip delete, run delete pass later)
3. DB: `org_id` columns are nullable initially, so old code works fine

---

## 12. Edge Cases

### 12.1 Cross-Org Users

- A user belongs to multiple orgs via `org_memberships`
- Session tracks current org (`sessions.org_id`)
- Switching orgs updates the session, not the user
- Password is global (one password per user, not per org)
- Display name is global

### 12.2 Org Deletion

When an org owner deletes an org:

```sql
-- Transaction:
BEGIN;
-- 1. Delete org memberships (cascading from organizations FK)
-- 2. Delete invites for this org
DELETE FROM invites WHERE org_id = $1;
-- 3. Delete activity_log entries
DELETE FROM activity_log WHERE org_id = $1;
-- 4. Delete download_log entries
DELETE FROM download_log WHERE org_id = $1;
-- 5. Delete sites
DELETE FROM sites WHERE org_id = $1;
-- 6. Delete site_keys
DELETE FROM site_keys WHERE org_id = $1;
-- 7. Delete group_plugins for groups in this org
DELETE FROM group_plugins WHERE group_id IN (SELECT id FROM groups WHERE org_id = $1);
-- 8. Delete groups
DELETE FROM groups WHERE org_id = $1;
-- 9. Delete blocklist entries
DELETE FROM blocklist WHERE org_id = $1;
-- 10. Delete sessions pointing to this org
DELETE FROM sessions WHERE org_id = $1;
-- 11. Mark org inactive (soft delete) or hard delete
DELETE FROM organizations WHERE id = $1;
-- 12. Clean up users with no remaining memberships (optional: keep user rows, they can be re-invited)
COMMIT;
```

Also: delete R2 files under the org prefix:
```typescript
await deleteAllObjectsWithPrefix(`${orgSlug}/`);
```

**Safety:** Require the user to type the org slug to confirm deletion. Rate limit this endpoint.

### 12.3 Org Transfer

Not in scope for v1. If needed later: transfer all data to a new owner by changing `org_memberships.role` from owner → admin for old owner and admin → owner for new owner (same as `transfer-ownership` but scoped).

### 12.4 Plugin Slug Uniqueness

**Decision: Plugin slugs are unique per-org, NOT globally.**

Two different orgs can have a plugin called `my-plugin`. This works because:
- R2 paths are prefixed by org: `mzv/my-plugin/...` vs `acme/my-plugin/...`
- DB queries are scoped by `org_id`
- Public URLs differentiate by `?org=` param
- The `sites` uniqueness constraint is `(org_id, site_url, plugin_slug)`

### 12.5 Default Group Per Org

Each new org gets a `'default'` group created automatically:
```sql
INSERT INTO groups (name, slug, auth_mode, org_id) VALUES ('Default', 'default', 'auto', $1);
```

This happens in the `POST /api/admin/orgs` handler.

### 12.6 Org Slug Rules

- Lowercase alphanumeric + hyphens: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`
- Min 2 characters, max 32 characters
- Reserved slugs: `admin`, `api`, `app`, `www`, `static`, `assets`, `health`, `register`, `login`, `new`, `settings`, `org`, `orgs`
- Immutable after creation (changing would break R2 paths and client URLs)

### 12.7 Session Without Org

If a session has no `org_id` (legacy or corrupted):
1. Query `org_memberships` for the user
2. If they have exactly one org, use that
3. If multiple, use the first one (by `created_at`)
4. If none, return 403 with message "No organization access"
5. Update the session with the resolved `org_id`

---

## 13. Security Considerations

### 13.1 Org Isolation — The Cardinal Rule

**Every database query in every admin route MUST include `WHERE org_id = $N`.** A missing org filter is a data leakage vulnerability.

Checklist for every route:
- [ ] SELECT queries filter by `org_id`
- [ ] INSERT queries include `org_id`
- [ ] UPDATE/DELETE queries check both `id` AND `org_id` (no IDOR across orgs)

### 13.2 Authorization Matrix

| Action | Owner | Admin | Viewer | Bearer Token |
|--------|-------|-------|--------|-------------|
| View data | Yes | Yes | Yes | Yes (with X-Org) |
| Create/edit groups, keys | Yes | Yes | No | Yes |
| Block/unblock sites | Yes | Yes | No | Yes |
| Invite users | Yes | Yes | No | No |
| Change user roles | Yes | No | No | No |
| Transfer ownership | Yes | No | No | No |
| Delete org | Yes | No | No | No |
| Create new org | Yes | Yes | Yes | No |
| Switch org | Yes | Yes | Yes | N/A |

### 13.3 IDOR Prevention

Every mutable operation on a resource (group, key, site, blocklist entry) must verify that the resource belongs to the user's current org:

```typescript
// BAD — IDOR vulnerability:
const group = await queryOne('SELECT * FROM groups WHERE id = $1', [groupId]);

// GOOD — org-scoped:
const group = await queryOne('SELECT * FROM groups WHERE id = $1 AND org_id = $2', [groupId, user.org_id]);
```

### 13.4 Org Creation Rate Limiting

Prevent abuse by rate-limiting org creation:
- Max 3 orgs per user
- Rate limit: 1 org creation per hour per IP

### 13.5 Data Leakage in Logs

Error logs (`error_log`) are global and may contain data from any org. The error log viewer should remain accessible to all authenticated users but should not expose org-specific data in the error messages. Consider adding `org_id` to error_log entries for filtering in a future iteration.

### 13.6 Registration Secret Per Org

Currently `REGISTRATION_SECRET` is a single env var. For multi-org:

**Option A (recommended for v1):** Keep a single shared secret. Org identity comes from the `org` field in the registration payload, not from the secret.

**Option B (future):** Per-org registration secrets stored in the `organizations` table. This provides better isolation but adds complexity.

For v1, go with Option A. The HMAC signature includes the org slug, so a registration request can't be replayed against a different org.

---

## 14. Test Plan

### 14.1 Database Migration Tests

- [ ] `002-org-scoping.sql` runs cleanly on a fresh database
- [ ] `002-org-scoping.sql` runs cleanly on an existing database with data
- [ ] All existing data gets `org_id` = mzv org id
- [ ] All existing users get `org_memberships` rows
- [ ] Unique constraints work correctly (per-org uniqueness)
- [ ] Foreign keys cascade correctly

### 14.2 Auth/Session Tests

- [ ] Login returns org list and sets session with default org
- [ ] `verifyAdmin` returns correct per-org role
- [ ] `verifyAdmin` handles legacy sessions (no org_id) gracefully
- [ ] Org switch updates session and returns new role
- [ ] Bearer token with `X-Org` header works
- [ ] Bearer token without `X-Org` returns error
- [ ] User with no org memberships gets 403

### 14.3 Org Isolation Tests (CRITICAL)

For each admin route:
- [ ] User in org A cannot see org B's data
- [ ] User in org A cannot modify org B's resources
- [ ] Creating a resource in org A sets org_id correctly
- [ ] Deleting a resource checks org_id

Specific scenarios:
- [ ] User in both org A and org B sees correct data when switching
- [ ] Group slug `default` can exist in both org A and org B
- [ ] Plugin slug `my-plugin` can exist in both orgs
- [ ] Blocking a site in org A doesn't affect org B

### 14.4 Public API Tests

- [ ] `GET /slug/update.json?org=mzv` serves correct manifest from R2
- [ ] `GET /slug/update.json` (no org) defaults to mzv
- [ ] `GET /slug/update.json?org=nonexistent` returns 404
- [ ] `POST /slug/update.json?org=mzv` records site check with correct org_id
- [ ] Zip downloads with `?org=mzv` work correctly
- [ ] Download auth checks are org-scoped
- [ ] Registration with `org` field works
- [ ] Registration without `org` field defaults to mzv (backward compat)
- [ ] Registration HMAC validates with both old and new message formats

### 14.5 Invite Flow Tests

- [ ] Invite creates with correct org_id
- [ ] Accepting invite for new user creates user + membership
- [ ] Accepting invite for existing user (different org) creates membership only
- [ ] Invite email shows org name
- [ ] Cross-org user can switch between orgs after accepting second invite

### 14.6 Org Lifecycle Tests

- [ ] Create org → owner membership created, default group created
- [ ] Delete org → all associated data removed, R2 files cleaned
- [ ] Deactivated org → public API returns 404, admin access blocked
- [ ] Org slug validation (reserved words, format)

### 14.7 R2 Storage Tests

- [ ] Objects stored at `{org_slug}/{plugin_slug}/{filename}`
- [ ] Plugin list reads from correct org prefix
- [ ] R2 migration script correctly moves files

### 14.8 um-updater.php Tests

- [ ] Update check with `UM_ORG` sends `?org=` param
- [ ] Update check without `UM_ORG` defaults to `mzv`
- [ ] Registration includes `org` in HMAC message
- [ ] Registration backward compat (no `org` in message) still works

---

## 15. Implementation Order

### Phase 1: Foundation (Database + Auth)

**Goal:** Schema changes deployed, auth system org-aware, all existing functionality preserved.

1. **Write and test `002-org-scoping.sql`**
   - Create tables, add columns, backfill, update constraints
   - Test on a copy of production data

2. **Update `src/lib/auth.ts`**
   - New `AuthUser` interface with `org_id`, `org_slug`
   - Updated `verifyAdmin()` with org-aware session query
   - Legacy session fallback logic
   - Bearer token `X-Org` header support

3. **Add `POST /api/admin/switch-org` route**
4. **Add `GET /api/admin/orgs` route**
5. **Update `POST /api/admin/login` to set session org_id and return orgs**

**Deploy checkpoint:** Run migration, deploy code. All existing functionality works via legacy fallback.

### Phase 2: Admin Route Scoping

**Goal:** All admin routes filtered by org_id.

6. **Update all admin GET routes** to add `WHERE org_id = $1`
   - groups, keys, sites, blocklist, users, downloads, activity, sessions, plugins

7. **Update all admin POST/PUT/DELETE routes** to include org_id
   - groups CRUD, keys CRUD, blocklist CRUD, user management, invites

8. **Update `src/lib/helpers.ts`**
   - `checkDownloadAuth` gains org_id parameter
   - `bootstrapOwner` creates org membership for mzv
   - `validateSiteKey` — no change needed (key is globally unique by hash)

9. **Update `src/lib/logging.ts`**
   - `logActivity` gains optional `org_id` parameter

**Deploy checkpoint:** Admin dashboard now shows org-scoped data.

### Phase 3: Public API + R2

**Goal:** Public routes org-aware, R2 re-prefixed.

10. **Update `src/lib/r2.ts`** — `getObject` and `listObjects` gain org prefix
11. **Update `src/app/[slug]/[filename]/route.ts`** — org resolution from `?org=` param
12. **Update `src/app/api/register/route.ts`** — org-scoped registration
13. **Run R2 migration script** — prefix existing files with `mzv/`
14. **Add dynamic `download_url` rewriting** in update.json serving

**Deploy checkpoint:** Public API works with `?org=` param, defaults to mzv.

### Phase 4: Dashboard UX

**Goal:** Org switcher and org management in the dashboard.

15. **Add org switcher component** to dashboard header
16. **Add "Organization" tab** with member list, settings, create new org
17. **Update invite UI** to show org name
18. **Add org creation modal**

**Deploy checkpoint:** Full multi-org dashboard.

### Phase 5: um-updater.php + Cleanup

**Goal:** WP clients send org context, legacy fallbacks removed.

19. **Update um-updater.php** with `UM_ORG` constant and `?org=` param
20. **Ship plugin updates** with new um-updater.php
21. **After rollout:** Remove legacy HMAC format support
22. **After rollout:** Remove `?org` default-to-mzv fallback (make it required)
23. **Drop `users.role` column** (all code reads from `org_memberships`)

---

## Appendix A: Files That Need Changes

| File | Phase | Change Type |
|------|-------|-------------|
| `db/002-org-scoping.sql` | 1 | New file |
| `src/lib/auth.ts` | 1 | Major rewrite |
| `src/lib/helpers.ts` | 2 | Add org params |
| `src/lib/logging.ts` | 2 | Add org_id param |
| `src/lib/r2.ts` | 3 | Add org prefix |
| `src/lib/db.ts` | — | No change |
| `src/lib/crypto.ts` | — | No change |
| `src/app/api/admin/login/route.ts` | 1 | Org-aware login |
| `src/app/api/admin/switch-org/route.ts` | 1 | New file |
| `src/app/api/admin/orgs/route.ts` | 1 | New file |
| `src/app/api/admin/groups/route.ts` | 2 | Add org scoping |
| `src/app/api/admin/groups/[id]/route.ts` | 2 | Add org scoping |
| `src/app/api/admin/groups/[id]/plugins/route.ts` | 2 | Add org scoping |
| `src/app/api/admin/groups/[id]/plugins/[slug]/route.ts` | 2 | Add org scoping |
| `src/app/api/admin/keys/route.ts` | 2 | Add org scoping |
| `src/app/api/admin/keys/[id]/route.ts` | 2 | Add org scoping |
| `src/app/api/admin/sites/route.ts` | 2 | Add org scoping |
| `src/app/api/admin/blocklist/route.ts` | 2 | Add org scoping |
| `src/app/api/admin/blocklist/[url]/route.ts` | 2 | Add org scoping |
| `src/app/api/admin/users/route.ts` | 2 | Major rewrite (memberships) |
| `src/app/api/admin/users/[id]/route.ts` | 2 | Membership-based role changes |
| `src/app/api/admin/users/accept-invite/route.ts` | 2 | Cross-org user handling |
| `src/app/api/admin/users/transfer-ownership/route.ts` | 2 | Org-scoped transfer |
| `src/app/api/admin/downloads/route.ts` | 2 | Add org scoping |
| `src/app/api/admin/activity/route.ts` | 2 | Add org scoping |
| `src/app/api/admin/sessions/route.ts` | 2 | Add org scoping |
| `src/app/api/admin/plugins/route.ts` | 3 | R2 org prefix |
| `src/app/api/admin/invite/route.ts` | 2 | Add org info to response |
| `src/app/api/admin/profile/route.ts` | — | No change (global user data) |
| `src/app/api/admin/logout/route.ts` | — | No change |
| `src/app/api/admin/errors/route.ts` | — | No change (global) |
| `src/app/[slug]/[filename]/route.ts` | 3 | Org resolution + R2 prefix |
| `src/app/api/register/route.ts` | 3 | Org-scoped registration |
| `src/app/admin/sites/page.tsx` | 4 | Org switcher + org tab |
| `scripts/migrate-r2-to-org-prefix.ts` | 3 | New file |

## Appendix B: Environment Variables

No new env vars required for v1. The existing `REGISTRATION_SECRET` and `ADMIN_TOKEN` remain global.

Future consideration: `DEFAULT_ORG_SLUG=mzv` env var to configure which org is the fallback for legacy requests.

## Appendix C: API Response Shape Changes

### Login Response (updated)
```json
{
  "ok": true,
  "user": { "id": 1, "email": "mike@mzv.com", "display_name": "Mike", "role": "owner" },
  "org": { "id": 1, "slug": "mzv", "name": "Mike Zielonka Ventures" },
  "orgs": [
    { "id": 1, "slug": "mzv", "name": "Mike Zielonka Ventures", "role": "owner" },
    { "id": 2, "slug": "acme", "name": "ACME Corp", "role": "admin" }
  ]
}
```

### Switch Org Response (new)
```json
{
  "ok": true,
  "org": { "id": 2, "slug": "acme", "name": "ACME Corp" },
  "role": "admin"
}
```

### Orgs List Response (new)
```json
{
  "orgs": [
    { "id": 1, "slug": "mzv", "name": "Mike Zielonka Ventures", "role": "owner", "created_at": "2026-01-01T00:00:00Z" }
  ],
  "current_org_id": 1
}
```

### Create Org Response (new)
```json
{
  "id": 3,
  "name": "New Org",
  "slug": "new-org"
}
```

---

*End of specification.*
