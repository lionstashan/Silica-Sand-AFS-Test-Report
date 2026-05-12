# SQL Migrations (Phase 0 Baseline)

This folder stores explicit SQL migration scripts and matching rollback scripts.

## Naming

- Forward migration: `NNN_description.up.sql`
- Rollback migration: `NNN_description.down.sql`

## Current execution model

- Application startup still uses `initDb()` for backward compatibility.
- This folder is now the source for controlled production migration planning.
- Every production deployment should:
  1. Run backup checklist.
  2. Apply migration SQL in order.
  3. Record the applied migration key in `schema_migrations`.
  4. Keep matching rollback SQL ready.

## Rule

- Never delete historical migration files.
- Add only append-only migration entries.
