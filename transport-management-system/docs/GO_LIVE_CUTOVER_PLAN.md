# Go-Live Cutover Plan

## Scope

- Transport workflow
- Customer portal
- Expense workflow
- SSO integration

## Pre-Cutover

1. Confirm latest code commit and migration scripts.
2. Run DB backup and verify restore in staging.
3. Confirm `PHASE_STATUS.md` reflects completed development phases.
4. Validate `.env` production secrets and non-default role pins.

## Cutover Steps

1. Deploy application build.
2. Run startup migration/bootstrap checks.
3. Smoke test:
   - Transport login + trip update
   - Expense login + review + payment transition
   - Customer expected truck submit + gate conversion
4. Enable feature flags progressively:
   - `ENABLE_USER_AUTH_V2` (pilot users first)
   - `ENABLE_ADMIN_PANEL_V2` (admin-only first)

## Rollback Trigger

- Auth failures > 5% requests
- Trip status update failures
- Expense workflow stuck transitions
- Repeated 5xx in core APIs

## Rollback Steps

1. Disable new feature flags.
2. Revert to previous release.
3. Restore DB backup only if data corruption is detected.
4. Re-run smoke tests on stable release.

## Post-Cutover Monitoring

- API 4xx/5xx rate
- Status transition errors
- Expense document upload/download errors
- DB latency and slow queries
