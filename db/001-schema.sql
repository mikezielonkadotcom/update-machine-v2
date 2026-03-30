-- Update Machine v2 — Postgres Schema
-- Ported from Cloudflare D1 (SQLite)

CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  auth_mode TEXT NOT NULL DEFAULT 'auto',
  require_key BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO groups (name, slug, auth_mode) VALUES ('Default', 'default', 'auto')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS group_plugins (
  group_id INTEGER NOT NULL REFERENCES groups(id),
  plugin_slug TEXT NOT NULL,
  PRIMARY KEY (group_id, plugin_slug)
);

CREATE TABLE IF NOT EXISTS site_keys (
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

CREATE INDEX IF NOT EXISTS idx_site_keys_key ON site_keys(site_key);
CREATE INDEX IF NOT EXISTS idx_site_keys_url ON site_keys(site_url);

CREATE TABLE IF NOT EXISTS sites (
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

CREATE INDEX IF NOT EXISTS idx_sites_plugin ON sites(plugin_slug);
CREATE INDEX IF NOT EXISTS idx_sites_last_seen ON sites(last_seen);

CREATE TABLE IF NOT EXISTS blocklist (
  id SERIAL PRIMARY KEY,
  site_url TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'viewer')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invites (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by INTEGER NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
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

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS error_log (
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

CREATE INDEX IF NOT EXISTS idx_error_log_created_at ON error_log(created_at);
CREATE INDEX IF NOT EXISTS idx_error_log_level ON error_log(level);
CREATE INDEX IF NOT EXISTS idx_error_log_source ON error_log(source);

CREATE TABLE IF NOT EXISTS download_log (
  id SERIAL PRIMARY KEY,
  plugin_slug TEXT NOT NULL,
  plugin_version TEXT NOT NULL DEFAULT '',
  site_url TEXT NOT NULL DEFAULT '',
  site_ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_download_log_created_at ON download_log(created_at);
CREATE INDEX IF NOT EXISTS idx_download_log_plugin_slug ON download_log(plugin_slug);

CREATE TABLE IF NOT EXISTS magic_links (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_magic_links_token_hash ON magic_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_magic_links_expires_at ON magic_links(expires_at);
