-- Phase 0 rollback script
-- NOTE: This is intentionally non-destructive for safety.
-- Do not drop schema_migrations in production rollback.
-- Instead, remove only the marker if needed.

DELETE FROM schema_migrations
WHERE migration_key = '000_phase0_baseline';
