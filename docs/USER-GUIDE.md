# Update Machine — User Guide

Update Machine is a private release server for WordPress plugins. It handles update distribution, site registration, download authentication, and analytics — so your plugins can self-update outside of wordpress.org.

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
- [Security](#security)
  - [Blocklist](#blocklist)
  - [Rate Limiting](#rate-limiting)
  - [SHA-256 Integrity Checks](#sha-256-integrity-checks)

---

## Concepts

| Term | What It Is |
|------|-----------|
| **Plugin** | A WordPress plugin distributed through Update Machine. Each plugin has a slug (e.g. `macros-block`) and files stored in R2/S3. |
| **Update Manifest** | A JSON file (`update.json`) that describes the latest version of a plugin — version number, download URL, requirements, changelog. |
| **Site Key** | A credential that identifies a WordPress site. Can be auto-generated on registration or manually created as a license key. |
| **Group** | A collection of plugins with shared access rules. Sites get assigned to a group, and that group determines which plugins they can access. |
| **um-updater.php** | The drop-in PHP client that WordPress plugins include to check for updates from Update Machine. |

---

## Admin Dashboard

### Logging In

Navigate to `/logmein` on your Update Machine instance (e.g. `https://updatemachine.com/logmein`).

**Two ways to log in:**

1. **Email + Password** — Enter your credentials and click **Log In**. Check "Remember me for 30 days" for a longer session (default is 7 days).

2. **Magic Link** — Enter your email and click **Send me a login link**. A one-time login link is delivered via Slack (if configured). The link expires in 15 minutes.

After logging in, you're redirected to the **Sites** dashboard at `/admin/sites`.

**First-time setup:** The first user (owner) is bootstrapped from the `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` environment variables. Once the owner exists, additional users are added via invites.

### Dashboard Overview

The admin dashboard (`/admin/sites`) is a single-page app with tabbed navigation:

| Tab | What It Shows |
|-----|--------------|
| **Sites** | All WordPress sites that have checked in — URL, plugin, version, last seen, check count |
| **Plugins** | All plugins in R2 storage — name, version, requirements, tested-up-to |
| **Keys** | Site keys (both auto-generated and manual license keys) — key type, site URL, group, status |
| **Groups** | Plugin groups with auth settings — which plugins belong to which group, key requirements |
| **Users** | Team members — email, role, status |
| **Downloads** | Download log — who downloaded what, when, from where |
| **Activity** | Audit trail — logins, key creation, group changes, etc. |
| **Errors** | Server error log for debugging |
| **Blocklist** | Blocked domains that can't register or download |

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

To add a new plugin:

1. **Build a production zip** of your plugin (no dev files — no `node_modules`, `vendor`, `.git`, source files, etc.)
2. **Create an `update.json` manifest** (see format below)
3. **Upload both files** to R2 under `{plugin-slug}/`

You can upload via:
- **Cloudflare Dashboard** → R2 → `update-machine-releases` bucket
- **CLI** (`wrangler r2 object put`, `mc cp`, or `aws s3 cp`)
- **API** (any S3-compatible client)

The plugin appears in the dashboard's **Plugins** tab automatically once its `update.json` is in R2.

### Releasing an Update

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

The HMAC signature uses a shared secret (`UM_REGISTRATION_SECRET`) that proves the request is legitimate. The default secret is WordPress's `AUTH_KEY` constant — unique per install, requires no manual setup.

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

**Give the key to your customer.** They add it to `wp-config.php`:
```php
define( 'UM_SITE_KEY_your_plugin_slug', 'umsk_m_abc123...' );
```

Or the plugin can provide a settings page where users paste their key (implementation is up to the plugin author).

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
   - **Name** — Display name (e.g. "Pro Bundle")
   - **Slug** — URL-safe identifier (e.g. `pro-bundle`)
   - **Auth Mode** — How sites authenticate (see below)
   - **Require Key** — Whether downloads require a site key

### Assigning Plugins to Groups

In the **Groups** tab, each group shows its plugins. Click **Add Plugin** to assign a plugin slug to the group.

A plugin can belong to multiple groups (e.g. a plugin could be in both "Free" and "Pro" groups).

### Auth Modes

| Mode | Behavior |
|------|----------|
| `auto` | Sites auto-register via HMAC and get assigned to this group automatically |
| `license-key` | Sites must present a manually-issued key for this group |
| `both` | Either auto-registration or manual key works |

The default group uses `auto` mode — sites register themselves and get access without any manual key distribution.

---

## User Management

### Roles

| Role | Permissions |
|------|------------|
| **Owner** | Full access — manage users, keys, groups, blocklist, everything |
| **Admin** | Full access except user management |
| **Viewer** | Read-only — can view sites, plugins, logs, but can't change anything |

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

- **Site URL** — The WordPress site's URL
- **Site Name** — Blog name (from `bloginfo`)
- **Plugin** — Which plugin they're checking
- **Version** — Their installed version
- **Last Seen** — When they last checked for updates
- **Check Count** — Total number of update checks
- **Group** — Which group they belong to

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
