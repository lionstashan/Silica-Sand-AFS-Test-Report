-- Production impact audit helper
-- Use this to see likely impacted rows by recent updates and UAT patterns.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/prod-impact-audit.sql

-- UAT-tagged data
SELECT 'uat.trips' AS bucket, COUNT(*)::int AS count
FROM trips
WHERE truck_number LIKE 'UAT-%';

SELECT 'uat.expected_trucks' AS bucket, COUNT(*)::int AS count
FROM expected_trucks
WHERE truck_number LIKE 'UAT-%';

SELECT 'uat.expense_claims' AS bucket, COUNT(*)::int AS count
FROM expense_claims
WHERE claim_number LIKE 'UAT-%'
  AND deleted_at IS NULL;

SELECT 'uat.tasks' AS bucket, COUNT(*)::int AS count
FROM tasks
WHERE title LIKE 'UAT %';

-- Recently modified security-critical user tables (last 48h)
SELECT username, full_name, is_active, updated_at
FROM users
WHERE updated_at > NOW() - INTERVAL '48 hours'
ORDER BY updated_at DESC, username ASC;

SELECT u.username, ur.role_name, ur.is_active, ur.updated_at
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
WHERE ur.updated_at > NOW() - INTERVAL '48 hours'
ORDER BY ur.updated_at DESC, u.username ASC, ur.role_name ASC;

SELECT username, role, is_active, updated_at
FROM expense_users
WHERE updated_at > NOW() - INTERVAL '48 hours'
ORDER BY updated_at DESC, username ASC;

SELECT username, customer_name, is_active, updated_at
FROM customer_users
WHERE updated_at > NOW() - INTERVAL '48 hours'
ORDER BY updated_at DESC, username ASC;

-- Recently modified configuration-like data (last 48h)
SELECT master_type, value, is_active, metadata_json, updated_at
FROM admin_master_values
WHERE updated_at > NOW() - INTERVAL '48 hours'
ORDER BY updated_at DESC, master_type ASC, value ASC;

SELECT key, value_json, updated_at
FROM admin_settings
WHERE updated_at > NOW() - INTERVAL '48 hours'
ORDER BY updated_at DESC, key ASC;

