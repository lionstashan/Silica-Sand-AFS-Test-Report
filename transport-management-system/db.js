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
      material_type TEXT,
      grade TEXT,
      loading_point TEXT,
      labour_team TEXT,
      eta TIMESTAMPTZ,
      waiting_reason TEXT,
      tare_weight NUMERIC,
      gross_weight NUMERIC,
      net_weight NUMERIC,
      status TEXT,
      final_status TEXT,
      is_cancelled BOOLEAN DEFAULT false,
      cancel_reason TEXT,
      in_time TIMESTAMPTZ,
      out_time TIMESTAMPTZ,
      last_status_update_time TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  await pool.query(createTableQuery);
  await pool.query(`
    ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS labour_team TEXT,
    ADD COLUMN IF NOT EXISTS eta TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS waiting_reason TEXT,
    ADD COLUMN IF NOT EXISTS last_status_update_time TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS final_status TEXT
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
