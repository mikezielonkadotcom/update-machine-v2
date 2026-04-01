# Local Development Setup

## Environments

| Environment | URL | Stack |
|---|---|---|
| **Production** | `updatemachine.com` | Vercel + Neon Postgres + Cloudflare R2 |
| **Canary/Staging** | `canary.update-machine.com` | Vercel Preview + Neon branch |
| **Local Dev** | `update-machine.local:3100` | Next.js dev server + Docker services |

## Prerequisites

- Node.js 20+
- Docker Desktop
- MinIO Client CLI (`brew install minio/stable/mc`)

## Quick Start

### 1. Host DNS Setup

Add the local domain to your `/etc/hosts`:

```bash
echo '127.0.0.1 update-machine.local' | sudo tee -a /etc/hosts
```

Verify:
```bash
ping -c1 update-machine.local
# Should resolve to 127.0.0.1
```

### 2. Start Docker Services

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts:
- **Postgres 16** — App database on port `5432`
- **MySQL 8** — WordPress database on port `3308`
- **WordPress 6** — Test WP instance on port `8082`
- **MinIO** — S3-compatible R2 replacement on ports `9000` (API) / `9001` (console)
- **minio-init** — One-shot bucket creator for `update-machine-releases`

The WordPress service includes `extra_hosts` mapping so `update-machine.local` resolves to the Docker host automatically.

### 3. Configure Environment

```bash
cp .env.local.template .env.local
```

Key settings (defaults work out of the box):
- `DATABASE_URL` → local Postgres
- `R2_*` → local MinIO
- `NEXT_PUBLIC_BASE_URL` → `http://update-machine.local:3100`
- `REGISTRATION_SECRET` → `local-dev-registration-secret`

### 4. Start the Dev Server

```bash
npm install
PORT=3100 npm run dev
```

> **Why port 3100?** Port 3000 is commonly used by other local services. Using 3100 avoids conflicts.

Verify:
```bash
curl http://update-machine.local:3100/api/health
# {"status":"ok","timestamp":"..."}
```

### 5. Set Up WordPress

Complete the WP install (first time only):

```bash
# Install WP-CLI in the container
docker exec update-machine-v2-wordpress-1 bash -c \
  'curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp'

# Run the install
docker exec update-machine-v2-wordpress-1 wp core install \
  --url="http://localhost:8082" \
  --title="UM Test Site" \
  --admin_user=admin \
  --admin_password=admin \
  --admin_email=admin@test.com \
  --skip-email \
  --allow-root

# Set the registration secret (must match .env.local)
docker exec update-machine-v2-wordpress-1 wp config set \
  UM_REGISTRATION_SECRET 'local-dev-registration-secret' \
  --type=constant --allow-root
```

### 6. Allow Local Downloads (mu-plugin)

WordPress blocks downloads from non-standard hostnames by default. Install this mu-plugin to allow `update-machine.local`:

```bash
docker exec update-machine-v2-wordpress-1 bash -c 'mkdir -p /var/www/html/wp-content/mu-plugins && cat > /var/www/html/wp-content/mu-plugins/allow-local-updates.php << "EOF"
<?php
/**
 * Allow WordPress to download from update-machine.local (dev only).
 */
add_filter( "http_request_host_is_external", function( $is_external, $host ) {
    if ( $host === "update-machine.local" ) {
        return true;
    }
    return $is_external;
}, 10, 2 );

add_filter( "http_request_args", function( $args, $url ) {
    if ( strpos( $url, "update-machine.local" ) !== false ) {
        $args["reject_unsafe_urls"] = false;
    }
    return $args;
}, 10, 2 );
EOF'
```

> **Note:** `wp_http_validate_url()` rejects `.local` domains as "unsafe." This mu-plugin bypasses that for dev only. Not needed in production.

## End-to-End Update Test

This simulates the full plugin update flow: WordPress detects an update, downloads the zip from Update Machine, and installs it.

### 1. Build a Test Plugin Zip

Using Macros Block as an example:

```bash
# Clone the plugin
git clone https://github.com/mikezielonkadotcom/macros-block /tmp/macros-block
cd /tmp/macros-block && npm install && npm run build

# Create a clean production zip (v1.9.4)
mkdir -p /tmp/macros-block-pkg
rsync -a --exclude='.git' --exclude='node_modules' --exclude='vendor' \
  --exclude='src' --exclude='composer.*' --exclude='package*.json' \
  --exclude='.github' --exclude='.claude' --exclude='.githooks' \
  --exclude='*.md' --exclude='.distignore' \
  ./ /tmp/macros-block-pkg/macros-block/
cd /tmp/macros-block-pkg && zip -r /tmp/macros-block-1.9.4.zip macros-block/
```

### 2. Create an "Old" Version to Install

```bash
cp -r /tmp/macros-block-pkg /tmp/macros-block-old
cd /tmp/macros-block-old/macros-block

# Downgrade version to 1.9.3
sed -i '' 's/Version:           1.9.4/Version:           1.9.3/' macros-block.php
sed -i '' "s/MACROS_BLOCK_VERSION', '1.9.4'/MACROS_BLOCK_VERSION', '1.9.3'/" macros-block.php

# Point at local Update Machine
sed -i '' "s|https://updatemachine.com/macros-block/update.json|http://update-machine.local:3100/macros-block/update.json|" macros-block.php
sed -i '' "s|'server'     => 'https://updatemachine.com'|'server'     => 'http://update-machine.local:3100'|" macros-block.php

cd /tmp/macros-block-old && zip -r /tmp/macros-block-1.9.3.zip macros-block/
```

### 3. Create the Update Manifest

```bash
cat > /tmp/macros-block-update.json << 'EOF'
{
  "name": "Macros Block",
  "slug": "macros-block",
  "version": "1.9.4",
  "download_url": "http://update-machine.local:3100/macros-block/macros-block-1.9.4.zip",
  "requires": "6.4",
  "requires_php": "8.1",
  "tested": "6.9",
  "author": "Mike Zielonka",
  "homepage": "https://github.com/mikezielonkadotcom/macros-block",
  "sections": {
    "changelog": "<h4>1.9.4</h4><p>Latest release.</p>"
  }
}
EOF
```

### 4. Upload to MinIO (R2)

```bash
# Configure mc CLI (first time)
mc alias set local http://localhost:9000 minioadmin minioadmin

# Upload
mc cp /tmp/macros-block-update.json local/update-machine-releases/macros-block/update.json
mc cp /tmp/macros-block-1.9.4.zip local/update-machine-releases/macros-block/macros-block-1.9.4.zip

# Verify via UM
curl http://update-machine.local:3100/macros-block/update.json
```

### 5. Install the Old Plugin & Run the Update

```bash
# Install v1.9.3 on WordPress
docker cp /tmp/macros-block-1.9.3.zip update-machine-v2-wordpress-1:/tmp/
docker exec update-machine-v2-wordpress-1 wp plugin install /tmp/macros-block-1.9.3.zip --activate --allow-root

# Trigger update check
docker exec update-machine-v2-wordpress-1 wp transient delete --all --allow-root
docker exec update-machine-v2-wordpress-1 wp cron event run wp_update_plugins --allow-root

# Verify WP sees the update
docker exec update-machine-v2-wordpress-1 wp plugin list --allow-root
# Should show: macros-block  active  available  1.9.3  1.9.4

# Run the update!
docker exec update-machine-v2-wordpress-1 wp plugin update macros-block --allow-root
# Should show: macros-block  1.9.3  1.9.4  Updated
```

### 6. Verify Server-Side

```bash
# Check site analytics recorded
docker exec update-machine-v2-postgres-1 psql -U um_dev -d update_machine \
  -c "SELECT site_url, site_name, plugin_slug, plugin_version, check_count FROM sites;"

# Check download logs
docker exec update-machine-v2-postgres-1 psql -U um_dev -d update_machine \
  -c "SELECT plugin_slug, plugin_version, user_agent, created_at FROM download_log ORDER BY id DESC LIMIT 5;"
```

## Service URLs

| Service | URL | Credentials |
|---|---|---|
| Update Machine | http://update-machine.local:3100 | admin@localhost / admin |
| WordPress | http://localhost:8082/wp-admin | admin / admin |
| MinIO Console | http://localhost:9001 | minioadmin / minioadmin |
| Postgres | localhost:5432 | um_dev / um_dev_password |

## Design Decisions

- **MinIO instead of mock R2** — Real S3-compatible API, so `@aws-sdk/client-s3` works without code changes.
- **Schema auto-migration** — SQL files mounted into Postgres `docker-entrypoint-initdb.d/` — runs once on fresh volumes.
- **Next.js runs on host** — Not containerized. Avoids node_modules volume sync issues, keeps hot reload fast.
- **`.local` domain** — Clean hostname that mirrors production URL patterns. Avoids `host.docker.internal` which WP blocks harder.
- **Port 3100** — Avoids port 3000 conflicts with other local services.
- **`extra_hosts` in docker-compose** — WordPress container can reach `update-machine.local` on the host without manual `/etc/hosts` editing inside the container.

## Reset

```bash
# Stop everything
docker compose -f docker-compose.dev.yml down

# Full reset (removes all data)
docker compose -f docker-compose.dev.yml down -v
```
