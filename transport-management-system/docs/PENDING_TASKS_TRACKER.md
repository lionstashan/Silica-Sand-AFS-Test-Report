# Pending Tasks Tracker

Last updated: 2026-05-12

## In Progress

1. IAM unification (single username/password + access-based permissions with controlled legacy PIN fallback).
2. Accounts sales analytics UI polish (chart-first presentable dashboard).
3. Master-data centralization cleanup (remove remaining hardcoded option sources).

## Completed in this pass

1. Added safe unified UAT seed script:
- `npm run seed:uat` (requires `CONFIRM_UAT_SEED=YES`)
- Seeds: transport trips, customer expected trucks, expense claims in multiple statuses, tasks, role users, master data.

2. Added staging readiness validation script:
- `npm run validate:staging`
- Checks environment mode, core data presence, role coverage, master data coverage.

3. Reduced hardcoded transporter dependency:
- Transport UI and Customer UI now default to master-driven transporter options.

## Pending execution checks

1. Run on staging:
- `CONFIRM_UAT_SEED=YES npm run seed:uat`
- `npm run validate:staging`

2. Smoke test after seeding:
- Transport flow (Gate -> Billing)
- Expected trucks flow
- Expense flow (Employee -> Accounts -> Manager -> Admin -> Payment)
- Tasks flow (create/reassign/comment/status)

3. Confirm no regression in production-only data:
- Use staging DB/service only for seeding.

