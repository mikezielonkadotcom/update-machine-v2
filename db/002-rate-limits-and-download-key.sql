-- Migration 002: Add rate_limits table and site_key_id to download_log
-- Run: psql $DATABASE_URL < db/002-rate-limits-and-download-key.sql

-- Postgres-backed rate limiter for serverless (replaces in-memory)
CREATE TABLE IF NOT EXISTS rate_limits (
  limiter TEXT NOT NULL,
  key TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (limiter, key)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

-- Per-key audit trail for download analytics
ALTER TABLE download_log ADD COLUMN IF NOT EXISTS site_key_id INTEGER REFERENCES site_keys(id);
CREATE INDEX IF NOT EXISTS idx_download_log_site_key_id ON download_log(site_key_id);
