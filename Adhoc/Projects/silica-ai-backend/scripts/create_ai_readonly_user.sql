-- Run this on the transport PostgreSQL database as an admin user.
-- Replace the password before executing.

CREATE USER ai_readonly WITH PASSWORD 'replace-with-strong-password';

GRANT CONNECT ON DATABASE railway TO ai_readonly;
GRANT USAGE ON SCHEMA public TO ai_readonly;

GRANT SELECT ON
  trips,
  expense_claims,
  lab_reports
TO ai_readonly;
