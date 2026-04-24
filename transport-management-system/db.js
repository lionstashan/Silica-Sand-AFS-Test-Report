require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required in environment variables');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDb() {
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
    ADD COLUMN IF NOT EXISTS condition TEXT,
    ADD COLUMN IF NOT EXISTS packing TEXT,
    ADD COLUMN IF NOT EXISTS location TEXT
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
