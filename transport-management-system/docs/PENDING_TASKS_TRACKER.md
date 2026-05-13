# Pending Tasks Tracker

Last updated: 2026-05-13

## In Progress

1. IAM unification (single username/password + access-based permissions with controlled legacy PIN fallback).
2. Accounts sales analytics UI polish (chart-first presentable dashboard).
3. Master-data centralization cleanup (remove remaining hardcoded option sources).

## Current UI/Flow Hardening (May 13)

1. Feedback consistency hardening:
- Added shared frontend helpers in `public/permissions.js` (`showModal`, `showToast`, `setBusy`, `setPageLoading`, `parseApiError`).
- Started replacing page-specific alerts with shared modal flow.

2. Loading-state consistency:
- Added global page-loading overlay and feedback modal styles in `public/style.css`.
- Applied to core async reviewer flows in expense module.

3. Header/nav consistency:
- Added shared responsive behavior for header action stacks (mobile/tablet overlap fixes).
- Wired shared permissions loader into major pages.

4. Expense reviewer UX:
- Added quick queue filters and “Last 5 acted claims” panel.
- Improved empty-state handling and navigation behavior.

5. Analytics usability:
- Implemented filter persistence (`accountsAnalyticsFiltersV1`).
- Implemented saved views (`accountsAnalyticsSavedViewsV1`) with save/apply flow.
- Implemented “Export Current View” CSV from current loaded dataset.

## Completed in this pass

1. Added safe unified UAT seed script:
- `npm run seed:uat` (requires `CONFIRM_UAT_SEED=YES`)
- Seeds: transport trips, customer expected trucks, expense claims in multiple statuses, tasks, role users, master data.

2. Added staging readiness validation script:
- `npm run validate:staging`
- Checks environment mode, core data presence, role coverage, master data coverage.

3. Reduced hardcoded transporter dependency:
- Transport UI and Customer UI now default to master-driven transporter options.

4. Added DB target safety guardrails:
- `npm run db:whereami` to print DB target fingerprint/host/db before any write script.
- `seed:uat` now requires:
  - `APP_ENV=staging`
  - `CONFIRM_UAT_SEED=YES`
  - `CONFIRM_DB_TARGET=STAGING_DB`
  - blocks when `NODE_ENV=production` or DB URL appears production-like.
- `seed:demo` now requires:
  - `APP_ENV=staging` or `APP_ENV=local`
  - `CONFIRM_DEMO_SEED=YES`
  - blocks when `NODE_ENV=production` or DB URL appears production-like.

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
