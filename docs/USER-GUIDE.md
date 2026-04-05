# Update Machine - User Guide

Update Machine is a private release server for WordPress plugins. It handles update distribution, site registration, download authentication, and analytics - so your plugins can self-update outside of wordpress.org.

## Table of Contents

- [Concepts](#concepts)
- [Admin Dashboard](#admin-dashboard)
  - [Logging In](#logging-in)
  - [Dashboard Overview](#dashboard-overview)
- [Managing Plugins](#managing-plugins)
  - [Adding a New Plugin](#adding-a-new-plugin)
  - [Releasing an Update](#releasing-an-update)
  - [Update Manifest Format](#update-manifest-format)
- [WordPress Client Setup](#wordpress-client-setup)
  - [Installing um-updater.php](#installing-um-updaterphp)
  - [Registering Your Plugin](#registering-your-plugin)
  - [How Update Checks Work](#how-update-checks-work)
- [Site Keys & Licensing](#site-keys--licensing)
  - [Auto-Registration (Default)](#auto-registration-default)
  - [Manual License Keys](#manual-license-keys)
  - [Requiring Keys for Downloads](#requiring-keys-for-downloads)
  - [Domain Locking](#domain-locking)
- [Groups](#groups)
  - [What Are Groups?](#what-are-groups)
  - [Creating a Group](#creating-a-group)
  - [Assigning Plugins to Groups](#assigning-plugins-to-groups)
  - [Auth Modes](#auth-modes)
- [User Management](#user-management)
  - [Roles](#roles)
  - [Inviting Team Members](#inviting-team-members)
- [Analytics & Monitoring](#analytics--monitoring)
  - [Site Tracking](#site-tracking)
  - [Download Logs](#download-logs)
  - [Activity Log](#activity-log)
  - [Error Log](#error-log)
- [CI/CD Integration](#cicd-integration)
  - [GitHub Actions Workflow](#github-actions-workflow)
  - [Required Secrets](#required-secrets)
  - [New Plugin Checklist](#new-plugin-checklist)
  - [Troubleshooting](#troubleshooting)
- [Security](#security)
  - [Blocklist](#blocklist)
  - [Rate Limiting](#rate-limiting)
  - [SHA-256 Integrity Checks](#sha-256-integrity-checks)

---

## Concepts

| Term | What It Is |
|------|-----------|
| **Plugin** | A WordPress plugin distributed through Update Machine. Each plugin has a slug (e.g. `macros-block`) and files stored in R2/S3. |
| **Update Manifest** | A JSON file (`update.json`) that describes the latest version of a plugin - version number, download URL, requirements, changelog. |
| **Site Key** | A credential that identifies a WordPress site. Can be auto-generated on registration or manually created as a license key. |
| **Group** | A collection of plugins with shared access rules. Sites get assigned to a group, and that group determines which plugins they can access. |
| **um-updater.php** | The drop-in PHP client that WordPress plugins include to check for updates from Update Machine. |

---

## Admin Dashboard

### Logging In

Navigate to `/logmein` on your Update Machine instance (e.g. `https://updatemachine.com/logmein`).

**Two ways to log in:**

1. **Email + Password** - Enter your credentials and click **Log In**. Check "Remember me for 30 days" for a longer session (default is 7 days).

2. **Magic Link** - Enter your email and click **Send me a login link**. A one-time login link is delivered via **Slack DM** (requires `SLACK_BOT_TOKEN` and `SLACK_CHANNEL` to be configured). The link expires in 15 minutes. Note: magic links are not sent via email - Slack is the only delivery channel.

After logging in, you're redirected to the **Sites** dashboard at `/admin/sites`.

**First-time setup:** The first user (owner) is bootstrapped from the `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` environment variables. Once the owner exists, additional users are added via invites.

### Dashboard Overview

The admin dashboard (`/admin/sites`) is a single-page app with tabbed navigation:

| Tab | What It Shows |
|-----|--------------|
| **Sites** | All WordPress sites that have checked in - URL, plugin, version, last seen, check count |
| **Plugins** | All plugins in R2 storage - name, version, requirements, tested-up-to |
| **Groups** | Plugin groups with auth settings - which plugins belong to which group, key requirements |
| **Keys** | Site keys (both auto-generated and manual license keys) - key type, site URL, group, status |
| **Blocklist** | Blocked domains that can't register or download |
| **Users** | Team members - email, role, status |
| **Downloads** | Download log - who downloaded what, when, from where |
| **Activity** | Audit trail - logins, key creation, group changes, etc. |
| **Errors** | Server error log for debugging |
| **Security** | Active sessions - who's logged in, session expiry, revoke sessions |
| **Profile** | Your account - display name, password change |

The top of the dashboard shows summary stats: total sites, active keys, plugins tracked, and downloads.

---

## Managing Plugins

### Adding a New Plugin

Plugins are stored in Cloudflare R2 (or MinIO locally). Each plugin lives in its own folder:

```
update-machine-releases/
├── macros-block/
│   ├── update.json              ← update manifest
│   ├── macros-block-1.9.4.zip   ← latest release zip
│   ├── icon-128x128.png         ← optional plugin icon
│   └── icon-256x256.png         ← optional hi-res icon
├── link-leash/
│   ├── update.json
│   └── link-leash-1.2.0.zip
└── ...
```

**⚠️ URL Routing: Update Machine uses `/{slug}/{filename}` - there is NO `/plugins/` prefix.**

| What | Correct URL | R2 Key |
|------|------------|--------|
| Manifest | `updatemachine.com/{slug}/update.json` | `update-machine-releases/{slug}/update.json` |
| Zip | `updatemachine.com/{slug}/{slug}-{ver}.zip` | `update-machine-releases/{slug}/{slug}-{ver}.zip` |

> **Common mistake:** Using `updatemachine.com/plugins/{slug}/update.json` → 404. The Worker routes are flat.

To add a new plugin:

1. **Build a production zip** of your plugin (no dev files - no `node_modules`, `vendor`, `.git`, source files, etc.)
2. **Create an `update.json` manifest** (see format below)
3. **Upload both files** to R2 under `{plugin-slug}/`

You can upload via:
- **Upload API** (`POST /api/admin/plugins`) — recommended for CI/CD. Accepts zip + metadata, auto-generates `update.json`. Auth: `Authorization: Bearer {ADMIN_TOKEN}`
- **Cloudflare Dashboard** → R2 → `update-machine-releases` bucket (manual fallback)
- **S3-compatible client** (direct R2 access, requires CF credentials)

The plugin appears in the dashboard's **Plugins** tab automatically once published.

### Releasing an Update

**Via Upload API (recommended):**
```bash
curl -X POST "https://updatemachine.com/api/admin/plugins" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -F "slug=your-plugin" -F "name=Your Plugin" -F "version=1.9.5" \
  -F "requires=6.4" -F "requires_php=8.1" -F "tested=6.9" \
  -F "file=@your-plugin-1.9.5.zip"
```

**Manually:**
1. Build the new version zip (e.g. `macros-block-1.9.5.zip`)
2. Update `update.json` with the new version number and download URL
3. Upload both files to R2, replacing the old ones
4. WordPress sites will detect the update on their next check (within 1 hour, or immediately if a user clicks "Check Again")

**Tip:** Keep old zips around for a release cycle in case sites need to re-download. The `update.json` only points to the latest version.

### Update Manifest Format

```json
{
  "name": "Macros Block",
  "slug": "macros-block",
  "version": "1.9.4",
  "download_url": "https://updatemachine.com/macros-block/macros-block-1.9.4.zip",
  "requires": "6.4",
  "requires_php": "8.1",
  "tested": "6.9",
  "last_updated": "2026-04-01",
  "author": "Mike Zielonka",
  "author_homepage": "https://mikezielonka.com",
  "homepage": "https://github.com/mikezielonkadotcom/macros-block",
  "sha256": "a1b2c3d4e5f6...",
  "icons": {
    "1x": "https://updatemachine.com/macros-block/icon-128x128.png",
    "2x": "https://updatemachine.com/macros-block/icon-256x256.png"
  },
  "banners": {
    "low": "https://updatemachine.com/macros-block/banner-772x250.png",
    "high": "https://updatemachine.com/macros-block/banner-1544x500.png"
  },
  "sections": {
    "description": "<p>Plugin description here.</p>",
    "changelog": "<h4>1.9.4</h4><ul><li>New feature X</li><li>Fixed bug Y</li></ul>",
    "installation": "<p>Upload the plugin and activate.</p>"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name |
| `slug` | Yes | Plugin directory slug |
| `version` | Yes | Latest version (semver) |
| `download_url` | Yes | Full URL to the zip file |
| `requires` | Recommended | Minimum WordPress version |
| `requires_php` | Recommended | Minimum PHP version |
| `tested` | Recommended | Highest WP version tested |
| `sha256` | Optional | SHA-256 hash of the zip for integrity verification |
| `icons` | Optional | Plugin icons shown in WP admin |
| `banners` | Optional | Plugin page banners |
| `sections` | Optional | Content for the "View details" modal in WP |
| `last_updated` | Optional | Date string |
| `author` | Optional | Author name |
| `homepage` | Optional | Plugin homepage URL |

---

## WordPress Client Setup

### Installing um-updater.php

Every plugin distributed through Update Machine includes a small PHP client file: `um-updater.php`. This hooks into WordPress's native update system.

1. Place `um-updater.php` in your plugin's `includes/` directory
2. In your plugin's main file, add:

```php
require_once __DIR__ . '/includes/um-updater.php';

\UM\PluginUpdater\register( [
    'file'       => __FILE__,
    'slug'       => 'your-plugin-slug',
    'update_url' => 'https://updatemachine.com/your-plugin-slug/update.json',
    'server'     => 'https://updatemachine.com',
] );
```

That's it. The plugin now checks Update Machine for updates using WordPress's built-in update system.

### Registering Your Plugin

Registration happens **automatically** on plugin activation:

1. User installs and activates your plugin on their WordPress site
2. `um-updater.php` sends an HMAC-signed registration request to `/api/register`
3. Update Machine validates the signature, creates a site record, and returns a **site key**
4. The site key is stored in `wp_options` as `um_site_key_{slug}`

The HMAC signature uses a shared secret (`UM_REGISTRATION_SECRET`) that proves the request is legitimate. The default secret is WordPress's `AUTH_KEY` constant - unique per install, requires no manual setup.

**For enhanced security**, set a custom secret in `wp-config.php`:
```php
define( 'UM_REGISTRATION_SECRET', 'your-shared-secret-here' );
```
This must match the `REGISTRATION_SECRET` env var on the Update Machine server.

### How Update Checks Work

1. WordPress periodically runs `wp_update_plugins` (every 12 hours, or on-demand)
2. `um-updater.php` POSTs to `/{slug}/update.json` with site telemetry (URL, name, email, current version)
3. Update Machine serves the manifest from R2 and records the check in the `sites` table
4. If the manifest version is newer than the installed version, WordPress shows "Update available"
5. When the user clicks "Update Now", WordPress downloads the zip via `/{slug}/{slug}-{version}.zip`
6. If the manifest includes a `sha256` hash, `um-updater.php` verifies the zip integrity before installing

The site key (from `X-Update-Key` header) is included in all requests for authentication and tracking.

---

## Site Keys & Licensing

### Auto-Registration (Default)

By default, Update Machine uses **auto-registration**: when a WordPress site activates a plugin, it automatically gets a site key. No manual intervention needed.

Auto-generated keys:
- Start with `umsk_a_` (the `a` indicates "auto")
- Are domain-locked to the registering site's URL
- Belong to the "Default" group
- Show up in the **Keys** tab with type "auto"

This is the simplest setup and works well for free plugins or plugins included with a purchase.

### Manual License Keys

For premium plugins or subscription models, you can create **manual license keys**:

1. Go to the **Keys** tab in the dashboard
2. Click **Generate Key**
3. Set the **site URL** (or leave blank for a portable key)
4. Choose the **group** (determines which plugins the key can access)
5. Toggle **domain locking** on/off

Manual keys start with `umsk_m_` and can be:
- Pre-assigned to a specific site URL
- Left unbound so the customer can use it on any site
- Revoked at any time from the dashboard

**Give the key to your customer.** The plugin should provide a settings page where users paste their key. The key is stored in `wp_options` as `um_site_key_{slug}` and included in all update check requests via the `X-Update-Key` header.

For plugins using `um-updater.php`, you can set the key programmatically:
```php
update_option( 'um_site_key_your-plugin-slug', 'umsk_m_abc123...' );
```

### Requiring Keys for Downloads

By default, anyone can download plugin zips. To restrict downloads:

1. Create a **Group** with `require_key` enabled
2. Add your plugins to that group
3. Only sites with a valid key for that group can download zips

Unauthorized download attempts get a `403 Forbidden` response.

### Domain Locking

When a key is domain-locked:
- It only works from the site URL it was registered to
- The server checks the `Origin` / `Referer` header against the key's stored URL
- Prevents key sharing across multiple sites

Auto-registration keys are always domain-locked. Manual keys can be locked or unlocked.

---

## Groups

### What Are Groups?

Groups are collections of plugins with shared access rules. Think of them as "license tiers" or "product bundles."

**Example setup:**
| Group | Plugins | Require Key |
|-------|---------|-------------|
| Default | macros-block, link-leash | No |
| Pro | content-locker, unfold | Yes |

Sites in the "Default" group can download macros-block and link-leash without a key. Sites in the "Pro" group need a valid key to download content-locker and unfold.

### Creating a Group

1. Go to the **Groups** tab
2. Click **Create Group**
3. Set:
   - **Name** - Display name (e.g. "Pro Bundle")
   - **Slug** - URL-safe identifier (e.g. `pro-bundle`)
   - **Auth Mode** - How sites authenticate (see below)
   - **Require Key** - Whether downloads require a site key

### Assigning Plugins to Groups

In the **Groups** tab, each group shows its plugins. Click **Add Plugin** to assign a plugin slug to the group.

A plugin can belong to multiple groups (e.g. a plugin could be in both "Free" and "Pro" groups).

### Auth Modes

| Mode | Behavior |
|------|----------|
| `auto` | Sites auto-register via HMAC and get assigned to this group automatically |
| `license-key` | Sites must present a manually-issued key for this group |
| `both` | Either auto-registration or manual key works |

The default group uses `auto` mode - sites register themselves and get access without any manual key distribution.

---

## User Management

### Roles

| Role | Permissions |
|------|------------|
| **Owner** | Full access - manage users, keys, groups, blocklist, everything |
| **Admin** | Full access except user management |
| **Viewer** | Read-only - can view sites, plugins, logs, but can't change anything |

### Inviting Team Members

1. Go to the **Users** tab
2. Click **Invite User**
3. Enter their email and select a role
4. They receive an invite link (valid for 7 days)
5. They click the link, set a password, and they're in

The invite link goes to `/admin/invite?token=...` where they complete registration.

---

## Analytics & Monitoring

### Site Tracking

The **Sites** tab shows every WordPress site that has checked in:

- **Site URL** - The WordPress site's URL
- **Site Name** - Blog name (from `bloginfo`)
- **Plugin** - Which plugin they're checking
- **Version** - Their installed version
- **Last Seen** - When they last checked for updates
- **Check Count** - Total number of update checks
- **Group** - Which group they belong to

This data comes from the telemetry payload that `um-updater.php` sends with each update check.

### Download Logs

The **Downloads** tab shows every zip download:

- Plugin slug and version
- Site URL and IP
- User agent (WordPress version)
- Timestamp
- Associated site key (if any)

### Activity Log

The **Activity** tab is an audit trail of all admin actions:

- User logins
- Key creation/revocation
- Group changes
- Blocklist additions
- User invites

### Error Log

The **Errors** tab shows server-side errors:

- R2 storage failures
- Database errors
- Rate limit hits
- Failed authentication attempts

---

## Security

### Blocklist

Block specific site URLs from registering or downloading:

1. Go to the **Blocklist** tab
2. Add a site URL and optional reason
3. That URL is immediately blocked from all registration and download requests

### Rate Limiting

Update Machine enforces per-IP rate limits:

| Action | Limit |
|--------|-------|
| Login attempts | 5 per minute |
| Registration | 10 per minute |
| Zip downloads | 60 per minute |

Exceeding limits returns a `429 Too Many Requests` response.

### Download URL Validation

`um-updater.php` includes a built-in safety check: it validates that download URLs point to the configured Update Machine server before downloading. This prevents a compromised manifest from redirecting downloads to a malicious host.

If a `download_url` in `update.json` doesn't match the plugin's configured `server` URL, the download is blocked.

### SHA-256 Integrity Checks

If your `update.json` includes a `sha256` field:

1. WordPress downloads the zip to a temp file
2. `um-updater.php` computes the SHA-256 hash of the downloaded file
3. If the hash doesn't match the manifest, the update is **blocked** with an error message
4. If it matches, the update proceeds normally

This prevents tampering with zip files in transit or at rest.

To generate the hash:
```bash
shasum -a 256 your-plugin-1.0.0.zip | awk '{print $1}'
```

Add it to your manifest:
```json
{
  "sha256": "a1b2c3d4e5f6..."
}
```

If you omit the `sha256` field, updates proceed without integrity checks (with a logged warning).

---

## CI/CD Integration

The recommended way to publish releases to Update Machine is via GitHub Actions. This automates: building the zip, creating a GitHub Release, generating the `update.json` manifest, and uploading everything to R2.

### GitHub Actions Workflow

The canonical workflow template lives in the **macros-block** repo (`.github/workflows/release.yml`). It has two jobs:

**Job 1: `release`** - Build and create a GitHub Release
- Triggers on push of a version tag (`v*`)
- Checks out the repo
- Builds production assets (`npm ci && npm run build`, if applicable)
- Creates a clean zip using `.distignore` (excludes dev files)
- Creates a GitHub Release with the zip attached

**Job 2: `publish-update-machine`** — Upload via API
- Runs after the `release` job completes
- Downloads the release zip artifact
- Parses the main plugin file’s PHP headers (`Plugin Name`, `Description`, `Requires at least`, `Requires PHP`, `Tested up to`)
- Calls `POST /api/admin/plugins` with the zip and metadata
- Update Machine handles everything server-side: R2 storage, `update.json` generation, download URL construction, Slack notification

#### Example curl upload:

```bash
curl -X POST "https://updatemachine.com/api/admin/plugins" \
  -H "Authorization: Bearer ${UM_ADMIN_TOKEN}" \
  -F "slug=your-plugin" \
  -F "name=Your Plugin" \
  -F "version=1.2.3" \
  -F "requires=6.4" \
  -F "requires_php=8.1" \
  -F "tested=6.9" \
  -F "description=Plugin description" \
  -F "changelog=See GitHub releases." \
  -F "file=@your-plugin-1.2.3.zip"
```

> **Note:** The upload API generates `update.json` server-side with the correct `download_url`, so you don’t need to build the manifest yourself.

### Required Secrets

Add this as a GitHub Actions secret in your repo (**Settings → Secrets and variables → Actions**):

| Secret | Description |
|--------|-------------|
| `UM_ADMIN_TOKEN` | The `ADMIN_TOKEN` value from Update Machine’s Vercel env vars. Authenticates as owner via Bearer token. |

One secret per repo. Same token value across all plugin repos.

### New Plugin Checklist

When integrating a new WordPress plugin with Update Machine:

- [ ] Add `includes/um-updater.php` to your plugin (copy from macros-block)
- [ ] Add `Update URI: https://updatemachine.com/{slug}/update.json` header to main plugin file
- [ ] Add `require_once` + `\UM\PluginUpdater\register()` call with correct `update_url`
- [ ] Verify `update_url` uses `updatemachine.com/{slug}/update.json` (**no** `/plugins/` prefix!)
- [ ] Copy `.github/workflows/release.yml` from macros-block and adapt slug/build steps
- [ ] Add `UM_ADMIN_TOKEN` secret to your GitHub repo
- [ ] Tag your first release: `git tag v1.0.0 && git push --tags`
- [ ] Verify manifest: `curl -s https://updatemachine.com/{slug}/update.json | jq .`
- [ ] Test update in WordPress: install the plugin, visit Dashboard → Updates, confirm it appears

### Troubleshooting

#### 404 on update.json

**Symptom:** `curl https://updatemachine.com/{slug}/update.json` returns 404.

**Most likely cause:** A `/plugins/` prefix in the URL. Update Machine routes are `/{slug}/update.json`, not `/plugins/{slug}/update.json`.

**Check:**
1. The `update_url` in your plugin's PHP `register()` call
2. The R2 upload path in your GitHub Actions workflow - should be `update-machine-releases/{slug}/update.json`
3. The `download_url` in your `update.json` manifest

#### Updates not showing in WordPress

**Possible causes:**
- **Transient cache:** WordPress caches update checks for up to 12 hours. Click "Check Again" on Dashboard → Updates.
- **Version mismatch:** `update.json` version must be *higher* than the installed version (`version_compare()`).
- **Missing `Update URI` header:** WordPress 5.8+ requires this header to allow third-party update servers.

#### CI workflow runs but upload fails

**Check:**
- `UM_ADMIN_TOKEN` secret is set in the repo (Settings → Secrets)
- The token value matches the `ADMIN_TOKEN` in Vercel env vars
- The curl call returns HTTP 200 (check workflow logs for status code)
- The zip file is under 50MB (API limit)
- The slug uses lowercase letters and hyphens only (e.g. `my-plugin`, not `My Plugin`)
