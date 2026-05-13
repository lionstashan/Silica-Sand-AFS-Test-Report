require('dotenv').config();
const { Pool } = require('pg');

function resolveDatabaseUrl() {
  // Priority:
  // 1) Explicit DATABASE_URL
  // 2) Railway private URL (no egress, intra-network)
  // 3) Railway public URL fallback (local/dev)
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_PRIVATE_URL ||
    process.env.DATABASE_PUBLIC_URL ||
    null
  );
}

const resolvedDatabaseUrl = resolveDatabaseUrl();

if (!resolvedDatabaseUrl) {
  console.error('One of DATABASE_URL / DATABASE_PRIVATE_URL / DATABASE_PUBLIC_URL is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: resolvedDatabaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_key TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      rollback_key TEXT
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
    ON schema_migrations(applied_at DESC)
  `);

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS trips (
      id SERIAL PRIMARY KEY,
      sequence_number INTEGER,
      truck_number TEXT,
      customer_name TEXT,
      transporter TEXT,
      driver_name TEXT,
      driver_phone TEXT,
      gate_person_name TEXT,
      dispatch_manager_name TEXT,
      weight_operator_name TEXT,
      loading_person_name TEXT,
      accounts_person_name TEXT,
      dispatch_done_by TEXT,
      tare_done_by TEXT,
      gross_done_by TEXT,
      loading_done_by TEXT,
      billing_done_by TEXT,
      material_type TEXT,
      grade TEXT,
      condition TEXT,
      packing TEXT,
      location TEXT,
      loading_point TEXT,
      labour_team TEXT,
      eta TIMESTAMPTZ,
      expected_weight NUMERIC,
      customer_notes TEXT,
      waiting_reason TEXT,
      load_fix_reason TEXT,
      tare_weight NUMERIC,
      gross_weight NUMERIC,
      net_weight NUMERIC,
      rate_used_per_mt NUMERIC,
      gst_percent_used NUMERIC,
      taxable_amount NUMERIC,
      gst_amount NUMERIC,
      total_amount NUMERIC,
      net_weight_snapshot_mt NUMERIC,
      billing_calculated_at TIMESTAMPTZ,
      billing_calculated_by TEXT,
      gross_weight_attempts JSONB DEFAULT '[]'::jsonb,
      status TEXT,
      final_status TEXT,
      is_cancelled BOOLEAN DEFAULT false,
      cancel_reason TEXT,
      in_time TIMESTAMPTZ,
      out_time TIMESTAMPTZ,
      last_status_update_time TIMESTAMPTZ,
      status_history JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  await pool.query(createTableQuery);
  await pool.query(`
    ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS labour_team TEXT,
    ADD COLUMN IF NOT EXISTS eta TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expected_weight NUMERIC,
    ADD COLUMN IF NOT EXISTS customer_notes TEXT,
    ADD COLUMN IF NOT EXISTS waiting_reason TEXT,
    ADD COLUMN IF NOT EXISTS load_fix_reason TEXT,
    ADD COLUMN IF NOT EXISTS last_status_update_time TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS final_status TEXT,
    ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS gross_weight_attempts JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS loading_person_name TEXT,
    ADD COLUMN IF NOT EXISTS accounts_person_name TEXT,
    ADD COLUMN IF NOT EXISTS dispatch_done_by TEXT,
    ADD COLUMN IF NOT EXISTS tare_done_by TEXT,
    ADD COLUMN IF NOT EXISTS gross_done_by TEXT,
    ADD COLUMN IF NOT EXISTS loading_done_by TEXT,
    ADD COLUMN IF NOT EXISTS billing_done_by TEXT,
    ADD COLUMN IF NOT EXISTS rate_used_per_mt NUMERIC,
    ADD COLUMN IF NOT EXISTS gst_percent_used NUMERIC,
    ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS gst_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS net_weight_snapshot_mt NUMERIC,
    ADD COLUMN IF NOT EXISTS billing_calculated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS billing_calculated_by TEXT,
    ADD COLUMN IF NOT EXISTS condition TEXT,
    ADD COLUMN IF NOT EXISTS packing TEXT,
    ADD COLUMN IF NOT EXISTS location TEXT
  `);
  await pool.query(`
    ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1
  `);
  await pool.query(`
    ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS afs_value_used NUMERIC,
    ADD COLUMN IF NOT EXISTS afs_report_id INTEGER,
    ADD COLUMN IF NOT EXISTS afs_linked_at TIMESTAMPTZ
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_trips_status_updated_at
    ON trips(status, updated_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trip_events (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      actor_role TEXT NOT NULL,
      actor_name TEXT,
      event_type TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      request_id TEXT,
      remarks TEXT,
      field_changes_json JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_trip_events_trip_created
    ON trip_events(trip_id, created_at DESC)
  `);
  await pool.query(`
    ALTER TABLE trips
    ALTER COLUMN expected_weight TYPE NUMERIC USING expected_weight::numeric,
    ALTER COLUMN tare_weight TYPE NUMERIC USING tare_weight::numeric,
    ALTER COLUMN gross_weight TYPE NUMERIC USING gross_weight::numeric,
    ALTER COLUMN net_weight TYPE NUMERIC USING net_weight::numeric
  `);
  await pool.query(`
    UPDATE trips
    SET status_history = '[]'::jsonb
    WHERE status_history IS NULL
  `);
  await pool.query(`
    UPDATE trips
    SET gross_weight_attempts = '[]'::jsonb
    WHERE gross_weight_attempts IS NULL
  `);
  await pool.query(`
    UPDATE trips
    SET updated_at = COALESCE(updated_at, created_at, in_time, NOW())
    WHERE updated_at IS NULL
  `);
  await pool.query(`
    DO $$
    DECLARE
      in_time_type TEXT;
      out_time_type TEXT;
    BEGIN
      SELECT data_type INTO in_time_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = 'in_time';

      SELECT data_type INTO out_time_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = 'out_time';

      IF in_time_type = 'timestamp without time zone' THEN
        EXECUTE 'ALTER TABLE trips ALTER COLUMN in_time TYPE TIMESTAMPTZ USING in_time AT TIME ZONE ''Asia/Kolkata''';
      END IF;

      IF out_time_type = 'timestamp without time zone' THEN
        EXECUTE 'ALTER TABLE trips ALTER COLUMN out_time TYPE TIMESTAMPTZ USING out_time AT TIME ZONE ''Asia/Kolkata''';
      END IF;
    END $$;
  `);
  await pool.query(`
    ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS expected_truck_id INTEGER
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_users (
      id SERIAL PRIMARY KEY,
      customer_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      display_name TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expected_trucks (
      id SERIAL PRIMARY KEY,
      submitted_by_user_id INTEGER NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
      customer_name TEXT,
      truck_number TEXT NOT NULL,
      driver_name TEXT NOT NULL,
      driver_phone TEXT NOT NULL,
      transporter TEXT,
      expected_quantity_mt NUMERIC NOT NULL,
      material_type TEXT,
      grade TEXT,
      condition TEXT,
      packing TEXT,
      location TEXT,
      eta TIMESTAMPTZ,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'SUBMITTED',
      linked_trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      status_updated_at TIMESTAMPTZ DEFAULT NOW(),
      status_updated_by TEXT DEFAULT 'CUSTOMER',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expected_trucks_status ON expected_trucks(status)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expected_trucks_linked_trip ON expected_trucks(linked_trip_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expected_trucks_submitted_by ON expected_trucks(submitted_by_user_id)
  `);
  await pool.query(`
    ALTER TABLE expected_trucks
    ADD COLUMN IF NOT EXISTS location TEXT
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trip_documents (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      expected_truck_id INTEGER REFERENCES expected_trucks(id) ON DELETE SET NULL,
      doc_type TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      uploaded_by_role TEXT NOT NULL,
      uploaded_by_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_trip_documents_trip_id ON trip_documents(trip_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_trip_documents_expected_id ON trip_documents(expected_truck_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      team TEXT NOT NULL,
      assignee_user_id INTEGER,
      assignee_name_snapshot TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      eta TIMESTAMPTZ NOT NULL,
      created_by_role TEXT NOT NULL,
      created_by_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      done_at TIMESTAMPTZ,
      done_by_role TEXT,
      done_by_name TEXT
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_eta ON tasks(eta)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      comment_text TEXT,
      attachment_name TEXT,
      attachment_mime_type TEXT,
      attachment_size INTEGER,
      attachment_path TEXT,
      created_by_role TEXT NOT NULL,
      created_by_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_activity (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      from_value TEXT,
      to_value TEXT,
      note TEXT,
      actor_role TEXT NOT NULL,
      actor_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_task_activity_task_id ON task_activity(task_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_notifications (
      id SERIAL PRIMARY KEY,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      target_role TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_message TEXT,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      read_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_task_notifications_role_read ON task_notifications(target_role, is_read)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_task_notifications_created_at ON task_notifications(created_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_users (
      id SERIAL PRIMARY KEY,
      employee_code TEXT UNIQUE,
      full_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('Employee', 'Accounts', 'Manager', 'Admin')),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_users_role ON expense_users(role)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_claims (
      id SERIAL PRIMARY KEY,
      claim_number TEXT UNIQUE NOT NULL,
      employee_id INTEGER NOT NULL REFERENCES expense_users(id) ON DELETE RESTRICT,
      pay_to TEXT NOT NULL,
      voucher_no TEXT NOT NULL,
      claim_date DATE NOT NULL,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
      purpose TEXT NOT NULL,
      status TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      previous_review_stage TEXT,
      previous_status TEXT,
      more_info_requested_by_user_id INTEGER REFERENCES expense_users(id) ON DELETE SET NULL,
      more_info_requested_by_role TEXT,
      current_assigned_role TEXT,
      current_assigned_user_id INTEGER REFERENCES expense_users(id) ON DELETE SET NULL,
      submitted_at TIMESTAMPTZ,
      accounts_reviewed_by INTEGER REFERENCES expense_users(id) ON DELETE SET NULL,
      manager_reviewed_by INTEGER REFERENCES expense_users(id) ON DELETE SET NULL,
      admin_reviewed_by INTEGER REFERENCES expense_users(id) ON DELETE SET NULL,
      payment_initiated_by INTEGER REFERENCES expense_users(id) ON DELETE SET NULL,
      payment_completed_by INTEGER REFERENCES expense_users(id) ON DELETE SET NULL,
      payment_initiated_at TIMESTAMPTZ,
      payment_completed_at TIMESTAMPTZ,
      rejection_reason TEXT,
      more_info_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    DROP INDEX IF EXISTS idx_expense_claims_voucher_no_unique
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_claims_employee_voucher_lookup
    ON expense_claims(employee_id, lower(trim(voucher_no)))
    WHERE deleted_at IS NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_claims_status ON expense_claims(status)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_claims_employee_created ON expense_claims(employee_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_claims_assigned_role ON expense_claims(current_assigned_role, status)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_claims_updated_at
    ON expense_claims(updated_at DESC)
    WHERE deleted_at IS NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_claims_status_updated
    ON expense_claims(status, updated_at DESC)
    WHERE deleted_at IS NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_claims_claim_date
    ON expense_claims(claim_date DESC)
    WHERE deleted_at IS NULL
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_claim_documents (
      id SERIAL PRIMARY KEY,
      claim_id INTEGER NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL CHECK (doc_type IN ('BILL', 'PAYMENT_PROOF', 'SUPPORTING')),
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      uploaded_by_user_id INTEGER REFERENCES expense_users(id) ON DELETE SET NULL,
      uploaded_by_role TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_claim_documents_claim ON expense_claim_documents(claim_id, created_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_claim_history (
      id SERIAL PRIMARY KEY,
      claim_id INTEGER NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      actor_user_id INTEGER REFERENCES expense_users(id) ON DELETE SET NULL,
      actor_role TEXT NOT NULL,
      actor_transport_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_transport_role TEXT,
      remarks TEXT,
      field_changes_json JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE expense_claim_history
    ADD COLUMN IF NOT EXISTS actor_transport_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS actor_transport_role TEXT
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_claim_history_claim ON expense_claim_history(claim_id, created_at ASC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_notifications (
      id SERIAL PRIMARY KEY,
      target_role TEXT NOT NULL,
      target_user_id INTEGER REFERENCES expense_users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      title TEXT,
      entity_type TEXT NOT NULL DEFAULT 'EXPENSE_CLAIM',
      entity_id INTEGER REFERENCES expense_claims(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      read_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_notifications_target ON expense_notifications(target_role, is_read, created_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_login_attempts (
      id SERIAL PRIMARY KEY,
      username TEXT,
      ip_address TEXT,
      success BOOLEAN NOT NULL,
      failure_reason TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_login_attempts_user_ip_time
    ON expense_login_attempts(username, ip_address, created_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_token_revocations (
      id SERIAL PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES expense_users(id) ON DELETE CASCADE,
      revoked_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_token_revocations_expires_at
    ON expense_token_revocations(expires_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transport_token_revocations (
      id SERIAL PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      revoked_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_transport_token_revocations_expires_at
    ON transport_token_revocations(expires_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transport_expense_user_map (
      id SERIAL PRIMARY KEY,
      transport_username TEXT,
      transport_role TEXT NOT NULL,
      expense_user_id INTEGER NOT NULL REFERENCES expense_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(transport_role, expense_user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_sso_nonces (
      id SERIAL PRIMARY KEY,
      nonce_hash TEXT NOT NULL UNIQUE,
      transport_role TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expense_sso_nonces_expiry
    ON expense_sso_nonces(expires_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_roles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_name TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, role_name)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_roles_role_name
    ON user_roles(role_name)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      permission_key TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id SERIAL PRIMARY KEY,
      role_name TEXT NOT NULL,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(role_name, permission_id)
    )
  `);
  const defaultPermissions = [
    ['transport.trip.create', 'Create transport trips'],
    ['transport.trip.read', 'Read transport trips'],
    ['transport.trip.update', 'Update transport trip state/details'],
    ['transport.trip.delete', 'Delete transport trips'],
    ['transport.documents.upload', 'Upload transport documents'],
    ['transport.documents.view', 'View transport documents'],
    ['transport.documents.delete', 'Delete transport documents'],
    ['transport.tasks.view', 'View task board'],
    ['transport.tasks.update', 'Update/reassign/comment task'],
    ['transport.tasks.create', 'Create task'],
    ['transport.dashboard.view', 'View transport dashboard'],
    ['transport.analytics.view', 'View accounts analytics'],
    ['transport.customer_portal.view', 'View customer portal admin data'],
    ['transport.expected_trucks.view', 'View expected trucks'],
    ['transport.expected_trucks.manage', 'Manage expected trucks'],
    ['transport.reports.view', 'View lab reports'],
    ['transport.reports.edit', 'Create or edit lab reports'],
    ['transport.reports.finalize', 'Finalize lab reports'],
    ['transport.admin.control', 'Manage admin control panel'],
    ['transport.customer_users.manage', 'Manage customer portal users'],
    ['transport.expense.sso', 'Access expense via transport SSO']
  ];
  for (const [permissionKey, description] of defaultPermissions) {
    await pool.query(
      `INSERT INTO permissions(permission_key, description)
       VALUES ($1, $2)
       ON CONFLICT (permission_key) DO NOTHING`,
      [permissionKey, description]
    );
  }
  const rolePermissionDefaults = {
    Gate: ['transport.trip.create', 'transport.trip.read', 'transport.trip.update', 'transport.expected_trucks.view', 'transport.tasks.view', 'transport.tasks.update'],
    Dispatch: ['transport.trip.read', 'transport.trip.update', 'transport.documents.upload', 'transport.documents.view', 'transport.tasks.view', 'transport.tasks.update', 'transport.dashboard.view', 'transport.expected_trucks.view', 'transport.expected_trucks.manage', 'transport.customer_portal.view'],
    Loading: ['transport.trip.read', 'transport.trip.update', 'transport.tasks.view', 'transport.tasks.update', 'transport.dashboard.view'],
    Weighbridge: ['transport.trip.read', 'transport.trip.update', 'transport.documents.upload', 'transport.documents.view', 'transport.tasks.view', 'transport.tasks.update', 'transport.dashboard.view'],
    LAB: ['transport.reports.view', 'transport.reports.edit', 'transport.tasks.view', 'transport.tasks.update'],
    Expense: ['transport.expense.sso'],
    Accounts: ['transport.trip.read', 'transport.trip.update', 'transport.documents.upload', 'transport.documents.view', 'transport.tasks.view', 'transport.tasks.update', 'transport.dashboard.view', 'transport.analytics.view', 'transport.customer_portal.view', 'transport.expense.sso'],
    Manager: ['transport.trip.read', 'transport.dashboard.view', 'transport.analytics.view', 'transport.customer_portal.view', 'transport.expected_trucks.view', 'transport.documents.view', 'transport.reports.view', 'transport.tasks.view', 'transport.tasks.update', 'transport.expense.sso'],
    Admin: ['transport.trip.create', 'transport.trip.read', 'transport.trip.update', 'transport.trip.delete', 'transport.documents.upload', 'transport.documents.view', 'transport.documents.delete', 'transport.tasks.view', 'transport.tasks.update', 'transport.tasks.create', 'transport.dashboard.view', 'transport.analytics.view', 'transport.customer_portal.view', 'transport.expected_trucks.view', 'transport.expected_trucks.manage', 'transport.reports.view', 'transport.reports.edit', 'transport.reports.finalize', 'transport.admin.control', 'transport.customer_users.manage', 'transport.expense.sso']
  };
  for (const [roleName, keys] of Object.entries(rolePermissionDefaults)) {
    for (const permissionKey of keys) {
      await pool.query(
        `INSERT INTO role_permissions(role_name, permission_id)
         SELECT $1, p.id
         FROM permissions p
         WHERE p.permission_key = $2
         ON CONFLICT (role_name, permission_id) DO NOTHING`,
        [roleName, permissionKey]
      );
    }
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_master_values (
      id SERIAL PRIMARY KEY,
      master_type TEXT NOT NULL,
      value TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      metadata_json JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(master_type, value)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_master_values_type_active
    ON admin_master_values(master_type, is_active, updated_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_reports (
      id SERIAL PRIMARY KEY,
      report_number TEXT NOT NULL UNIQUE,
      trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
      is_generic BOOLEAN NOT NULL DEFAULT false,
      truck_number TEXT NOT NULL,
      customer_name TEXT,
      loading_point TEXT,
      report_date DATE NOT NULL,
      material_type TEXT,
      grade TEXT,
      sieve_size TEXT,
      afs_reference TEXT,
      afs_multiplier NUMERIC DEFAULT 1,
      total_quantity NUMERIC DEFAULT 0,
      total_product NUMERIC DEFAULT 0,
      total_afs NUMERIC DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      line_items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes TEXT,
      created_by_role TEXT NOT NULL,
      created_by_name TEXT,
      finalized_by_role TEXT,
      finalized_by_name TEXT,
      finalized_at TIMESTAMPTZ,
      branding_snapshot_json JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE lab_reports
    ADD COLUMN IF NOT EXISTS sieve_size TEXT
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lab_reports_report_date
    ON lab_reports(report_date DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lab_reports_trip
    ON lab_reports(trip_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lab_reports_truck
    ON lab_reports(lower(truck_number))
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lab_report_history (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL REFERENCES lab_reports(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      actor_name TEXT,
      remarks TEXT,
      old_values_json JSONB DEFAULT '{}'::jsonb,
      new_values_json JSONB DEFAULT '{}'::jsonb,
      request_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lab_report_history_report
    ON lab_report_history(report_id, created_at DESC)
  `);
  await pool.query(`
    ALTER TABLE expense_claims
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS previous_status TEXT,
    ADD COLUMN IF NOT EXISTS more_info_requested_by_user_id INTEGER REFERENCES expense_users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS more_info_requested_by_role TEXT
  `);
  await pool.query(`
    ALTER TABLE expense_claims
    ALTER COLUMN pay_to DROP NOT NULL,
    ALTER COLUMN voucher_no DROP NOT NULL,
    ALTER COLUMN claim_date DROP NOT NULL,
    ALTER COLUMN amount DROP NOT NULL,
    ALTER COLUMN purpose DROP NOT NULL
  `);
  await pool.query(`
    ALTER TABLE expense_notifications
    ADD COLUMN IF NOT EXISTS title TEXT
  `);
  await pool.query(`
    INSERT INTO expense_categories(name)
    VALUES
      ('Diesel / Fuel'),
      ('Vehicle Maintenance'),
      ('Labour Payment'),
      ('Loading / Unloading'),
      ('Office Expense'),
      ('Travel Expense'),
      ('Food / Refreshment'),
      ('Repair & Maintenance'),
      ('Utility Bills'),
      ('Miscellaneous')
    ON CONFLICT (name) DO NOTHING
  `);
  console.log('Connected to database');
}

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

module.exports = {
  pool,
  initDb
};
