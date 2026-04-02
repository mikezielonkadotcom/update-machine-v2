-- Migration 003: Add TOTP two-factor authentication
-- Run: psql $DATABASE_URL < db/003-totp.sql

-- Add TOTP columns to users table
-- NOTE: As of migration 004, this column stores encrypted payloads at rest.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_codes TEXT;

-- Temporary pending login challenges for 2FA step-up
CREATE TABLE IF NOT EXISTS pending_2fa (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  ip_address TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_2fa_expires ON pending_2fa(expires_at);
