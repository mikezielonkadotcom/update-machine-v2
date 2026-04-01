# Local Dev Environment Setup Summary

## What Was Created

### 1. `docker-compose.dev.yml`
Docker Compose stack with five services:
- **postgres** (16-alpine) — App database on port 5432. Auto-runs `db/001-schema.sql` and `db/002-rate-limits-and-download-key.sql` on first start via `docker-entrypoint-initdb.d`.
- **mysql** (8.0) — WordPress database on port 3306.
- **wordpress** (6-apache) — WordPress instance on port 8080 for testing plugin update checks against a real WP install.
- **minio** — S3-compatible object storage on port 9000 (API) and 9001 (web console). Drop-in replacement for Cloudflare R2.
- **minio-init** — One-shot container that creates the `update-machine-releases` bucket.

All services have health checks. Volumes persist data between restarts.

### 2. `.env.local.template`
Pre-configured environment template that works out of the box with the Docker stack:
- `DATABASE_URL` points to local Postgres
- `R2_*` variables point to local MinIO
- `ADMIN_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` set up a default admin account (admin@localhost / admin)
- `REGISTRATION_SECRET` and `CRON_SECRET` set to dev values
- Slack vars commented out (optional)
- `NEXT_PUBLIC_BASE_URL` set to localhost:3000

### 3. README.md Update
Added a "Local Development" section with:
- Prerequisites
- Step-by-step quick start guide
- Service URLs table
- Default credentials
- Container descriptions
- Reset instructions
- WordPress testing guide

## How to Use

```bash
# Start everything
docker compose -f docker-compose.dev.yml up -d
cp .env.local.template .env.local
npm install
npm run dev

# Access
# App:       http://localhost:3000
# WordPress: http://localhost:8080
# MinIO:     http://localhost:9001

# Stop
docker compose -f docker-compose.dev.yml down

# Full reset (removes data)
docker compose -f docker-compose.dev.yml down -v
```

## Design Decisions

- **MinIO instead of mock R2**: Real S3-compatible API, so `@aws-sdk/client-s3` works without code changes.
- **Schema auto-migration**: SQL files mounted into Postgres `docker-entrypoint-initdb.d/` — runs once on fresh volumes.
- **Next.js runs on host**: Not containerized — avoids node_modules volume sync issues and keeps hot reload fast. Just `npm run dev`.
- **No source code changes**: All existing app code works as-is with the local stack.
