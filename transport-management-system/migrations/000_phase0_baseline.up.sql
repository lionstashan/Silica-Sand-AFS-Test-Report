-- Phase 0 baseline bootstrap
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  migration_key TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  rollback_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
ON schema_migrations(applied_at DESC);

INSERT INTO schema_migrations (migration_key, rollback_key)
VALUES ('000_phase0_baseline', '000_phase0_baseline')
ON CONFLICT (migration_key) DO NOTHING;
