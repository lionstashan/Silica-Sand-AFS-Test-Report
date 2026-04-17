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
      loading_point TEXT,
      labour_team TEXT,
      eta TIMESTAMPTZ,
      expected_weight NUMERIC,
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
    ADD COLUMN IF NOT EXISTS packing TEXT
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
    ALTER TABLE trips
    ALTER COLUMN in_time TYPE TIMESTAMPTZ USING in_time AT TIME ZONE 'Asia/Kolkata',
    ALTER COLUMN out_time TYPE TIMESTAMPTZ USING out_time AT TIME ZONE 'Asia/Kolkata'
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
