# Production Backup and Restore Checklist

## Pre-Deployment Backup (Mandatory)

1. Confirm environment and timestamp.
2. Take full PostgreSQL backup (`pg_dump` custom or plain SQL).
3. Verify backup file size is non-zero.
4. Store backup in secure location with date tag.
5. Record backup reference in deployment log.

## App Snapshot

1. Record current git commit hash.
2. Save deployment config/env snapshot (without exposing secrets in logs).
3. Save current migration state from `schema_migrations`.

## Restore Drill (Staging)

1. Restore latest backup to staging DB.
2. Start app against restored DB.
3. Verify key flows:
   - Transport create -> dispatch -> loading -> weighbridge -> billing
   - Expense create -> review -> payment
   - Customer expected trucks visibility
4. Verify dashboard loads and totals are sane.

## Rollback Decision Triggers

- Login/auth widespread failures
- Status update failures
- Expense workflow blocked
- Data corruption/anomalous missing records

## Rollback Steps

1. Stop new writes (maintenance window or route gating).
2. Revert application to previous commit.
3. Run matching `*.down.sql` rollback only if required.
4. Restore DB from backup if data integrity is compromised.
5. Validate critical smoke tests before re-opening traffic.
