CREATE TABLE IF NOT EXISTS update_check_log (
  id SERIAL PRIMARY KEY,
  plugin_slug TEXT NOT NULL,
  site_url TEXT NOT NULL DEFAULT '',
  site_name TEXT NOT NULL DEFAULT '',
  plugin_version TEXT NOT NULL DEFAULT '',
  site_ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  site_key_id INTEGER REFERENCES site_keys(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_update_check_log_created_at ON update_check_log(created_at);
CREATE INDEX IF NOT EXISTS idx_update_check_log_plugin_slug ON update_check_log(plugin_slug);
