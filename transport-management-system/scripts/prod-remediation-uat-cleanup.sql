-- Production remediation: remove UAT-seeded test data safely.
-- IMPORTANT:
-- 1) Take DB backup BEFORE running.
-- 2) Run in maintenance window (write freeze recommended).
-- 3) This script removes ONLY rows tagged as UAT test data.
--
-- Usage (psql):
--   psql "$DATABASE_URL" -f scripts/prod-remediation-uat-cleanup.sql

BEGIN;

-- =========================
-- Pre-check counts
-- =========================
SELECT 'pre.trips_uat' AS check_name, COUNT(*)::int AS count
FROM trips
WHERE truck_number LIKE 'UAT-%';

SELECT 'pre.expected_uat' AS check_name, COUNT(*)::int AS count
FROM expected_trucks
WHERE truck_number LIKE 'UAT-%';

SELECT 'pre.expense_claims_uat' AS check_name, COUNT(*)::int AS count
FROM expense_claims
WHERE claim_number LIKE 'UAT-%'
  AND deleted_at IS NULL;

SELECT 'pre.tasks_uat' AS check_name, COUNT(*)::int AS count
FROM tasks
WHERE title LIKE 'UAT %';

-- =========================
-- Delete UAT expense claims
-- Cascades to:
-- - expense_claim_documents
-- - expense_claim_history
-- - expense_notifications(entity_id FK)
-- =========================
DELETE FROM expense_claims
WHERE claim_number LIKE 'UAT-%';

-- =========================
-- Delete UAT tasks
-- Cascades to:
-- - task_comments
-- - task_activity
-- - task_notifications(task_id FK)
-- =========================
DELETE FROM tasks
WHERE title LIKE 'UAT %';

-- =========================
-- Delete UAT expected trucks
-- =========================
DELETE FROM expected_trucks
WHERE truck_number LIKE 'UAT-%';

-- =========================
-- Delete UAT trips
-- Cascades to trip_documents(trip_id FK).
-- =========================
DELETE FROM trips
WHERE truck_number LIKE 'UAT-%';

-- =========================
-- Post-check counts
-- =========================
SELECT 'post.trips_uat' AS check_name, COUNT(*)::int AS count
FROM trips
WHERE truck_number LIKE 'UAT-%';

SELECT 'post.expected_uat' AS check_name, COUNT(*)::int AS count
FROM expected_trucks
WHERE truck_number LIKE 'UAT-%';

SELECT 'post.expense_claims_uat' AS check_name, COUNT(*)::int AS count
FROM expense_claims
WHERE claim_number LIKE 'UAT-%'
  AND deleted_at IS NULL;

SELECT 'post.tasks_uat' AS check_name, COUNT(*)::int AS count
FROM tasks
WHERE title LIKE 'UAT %';

COMMIT;

