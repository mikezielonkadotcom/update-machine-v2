# Update Machine v2

Plugin release server for WordPress plugins. Serves update manifests, zip downloads, and manages site registrations with key-based auth.

**Ported from Cloudflare (Worker + D1 + R2) to Vercel (Next.js + Postgres + R2).**

## Documentation

- **[User Guide](docs/USER-GUIDE.md)** — How to use Update Machine: login, plugins, licensing, groups, analytics
- **[Local Dev Setup](LOCAL-DEV-SETUP.md)** — Docker stack, `update-machine.local`, E2E testing

## Stack

- **Runtime**: Next.js (App Router) on Vercel
- **Database**: Vercel Postgres (Neon) — replaces D1/SQLite
- **Storage**: Cloudflare R2 via S3-compatible API — zero file migration
- **Auth**: PBKDF2-SHA256 passwords, HMAC-signed session cookies

## Quick Start

1. Clone and install:
   ```bash
   git clone https://github.com/mikezielonkadotcom/update-machine-v2.git
   cd update-machine-v2
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set up the database:
   ```bash
   psql $DATABASE_URL < db/001-schema.sql
   psql $DATABASE_URL < db/002-rate-limits-and-download-key.sql
   ```

4. Run locally:
   ```bash
   npm run dev
   ```

## API Endpoints

### Public (WordPress clients)
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/{slug}/update.json` | Plugin update manifest |
| GET | `/{slug}/{slug}-{ver}.zip` | Plugin zip download |
| GET | `/{slug}/icon-*.png` | Plugin icons |
| POST | `/api/register` | Site auto-registration |
| GET | `/api/health` | Health check |

### Admin
All admin endpoints require session cookie or Bearer token.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/login` | Login |
| POST | `/api/auth/magic-link` | Request magic link |
| GET | `/api/auth/verify-magic-link` | Verify magic link |
| GET | `/api/admin/sites` | List sites |
| GET | `/api/admin/plugins` | List plugins (from R2) |
| GET/POST | `/api/admin/groups` | Groups CRUD |
| GET/POST | `/api/admin/keys` | License keys |
| GET/POST | `/api/admin/blocklist` | Domain blocklist |
| GET/POST | `/api/admin/users` | User management |
| GET | `/api/admin/downloads` | Download analytics |
| GET | `/api/admin/activity` | Activity log |
| GET | `/api/admin/errors` | Error log |
| GET | `/api/admin/sessions` | Active sessions |
| PUT | `/api/admin/profile` | Update profile |

### Dashboard
| Path | Description |
|------|-------------|
| `/logmein` | Login page |
| `/admin/sites` | Admin dashboard |
| `/admin/invite?token=...` | Invite acceptance |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres connection string |
| `R2_ENDPOINT` | Yes | R2 S3-compatible endpoint |
| `R2_ACCESS_KEY_ID` | Yes | R2 access key |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 secret key |
| `R2_BUCKET_NAME` | Yes | R2 bucket name |
| `ADMIN_TOKEN` | Yes | HMAC signing secret for sessions |
| `ADMIN_EMAIL` | Yes | Bootstrap owner email |
| `ADMIN_PASSWORD_HASH` | Yes | Bootstrap owner password hash |
| `REGISTRATION_SECRET` | Yes | Shared secret for HMAC registration |
| `SLACK_BOT_TOKEN` | No | Slack bot token for notifications |
| `SLACK_CHANNEL` | No | Slack channel ID |
| `CRON_SECRET` | No | Vercel cron auth secret |
| `NEXT_PUBLIC_BASE_URL` | No | Public URL (defaults to request origin) |

## WordPress Client Compatibility

The `um-updater.php` client continues to work unchanged:
- Same URL patterns (`/{slug}/update.json`, `/{slug}/{file}.zip`)
- Same POST body format for update checks
- Same `X-Update-Key` header for auth
- Same HMAC registration flow
- Same response JSON format

## Local Development

See **[LOCAL-DEV-SETUP.md](LOCAL-DEV-SETUP.md)** for the complete local dev environment setup, including:
- Docker stack (Postgres, WordPress, MySQL, MinIO)
- `update-machine.local` hostname configuration
- Full end-to-end plugin update testing walkthrough

## Deployment

1. Connect repo to Vercel
2. Add environment variables in Vercel dashboard
3. Run database migrations: `psql $DATABASE_URL < db/001-schema.sql && psql $DATABASE_URL < db/002-rate-limits-and-download-key.sql`
4. Point `updatemachine.com` DNS to Vercel
5. Generate R2 API tokens in Cloudflare dashboard

## Security

- Passwords: PBKDF2-SHA256 (100K iterations), auto-upgraded from SHA-256
- Sessions: HMAC-signed cookies, HttpOnly + Secure + SameSite=Strict
- Rate limiting: Postgres-backed per-IP (login: 5/min, register: 10/min, download: 60/min)
- Site keys: SHA-256 hashed in DB, never stored in plaintext
- Download auth: Group-based, optional domain locking
- Magic links: SHA-256 hashed tokens, 15-min expiry, single-use

## License

Private — Mike Zielonka Ventures
