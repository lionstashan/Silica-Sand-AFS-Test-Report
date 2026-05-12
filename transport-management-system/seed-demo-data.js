require('dotenv').config();
const { pool, initDb } = require('./db');

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function subHours(date, hours) {
  return new Date(date.getTime() - hours * 60 * 60 * 1000);
}

function subDays(date, days) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function toIso(date) {
  return date ? date.toISOString() : null;
}

function withDefaults(trip) {
  return {
    customer_name: 'Bhagwat Minerals',
    transporter: 'Shree Balaji Logistics',
    driver_name: 'Ramesh Kumar',
    driver_phone: '9876543210',
    gate_person_name: 'X',
    dispatch_manager_name: null,
    weight_operator_name: null,
    loading_person_name: null,
    accounts_person_name: null,
    dispatch_done_by: null,
    tare_done_by: null,
    gross_done_by: null,
    loading_done_by: null,
    billing_done_by: null,
    material_type: null,
    grade: null,
    condition: null,
    packing: null,
    loading_point: null,
    labour_team: null,
    eta: null,
    expected_weight: null,
    waiting_reason: null,
    load_fix_reason: null,
    tare_weight: null,
    gross_weight: null,
    net_weight: null,
    gross_weight_attempts: [],
    final_status: null,
    is_cancelled: false,
    cancel_reason: null,
    ...trip
  };
}

async function run() {
  const appEnv = String(process.env.APP_ENV || '').trim().toLowerCase();
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  const dbUrl = String(process.env.DATABASE_URL || '');
  const dbUrlLc = dbUrl.toLowerCase();

  if (appEnv !== 'staging' && appEnv !== 'local') {
    throw new Error(`Safety check failed: APP_ENV must be 'staging' or 'local'. Current APP_ENV='${process.env.APP_ENV || ''}'`);
  }
  if (nodeEnv === 'production') {
    throw new Error('Safety check failed: NODE_ENV=production is blocked for seed-demo-data.');
  }
  if (!dbUrl) {
    throw new Error('Safety check failed: DATABASE_URL is missing.');
  }
  if (dbUrlLc.includes('prod') || dbUrlLc.includes('production')) {
    throw new Error('Safety check failed: DATABASE_URL appears to target production.');
  }
  if (process.env.CONFIRM_DEMO_SEED !== 'YES') {
    throw new Error("Safety check failed: set CONFIRM_DEMO_SEED=YES after verifying target with 'npm run db:whereami'.");
  }

  await initDb();
  const now = new Date();
  const trips = [
    withDefaults({
      truck_number: 'RJ14GA1021',
      status: 'EXITED',
      final_status: 'COMPLETED',
      customer_name: 'Jaipur Silica Sand Pvt Ltd',
      transporter: 'Agarwal Roadlines',
      driver_name: 'Suresh Meena',
      driver_phone: '9829123456',
      gate_person_name: 'X',
      dispatch_manager_name: 'Jitendra Yadav',
      weight_operator_name: 'Anil Sharma',
      loading_person_name: 'Rajesh Kumar',
      accounts_person_name: 'Anil Sharma',
      dispatch_done_by: 'Jitendra Yadav',
      tare_done_by: 'Anil Sharma',
      gross_done_by: 'Ajay',
      loading_done_by: 'Rajesh Kumar',
      billing_done_by: 'Anil Sharma',
      material_type: 'Silica Sand',
      grade: 'Glass Grade',
      condition: 'Dry',
      packing: 'Loose',
      loading_point: 'Office Front',
      labour_team: 'Dinesh',
      eta: addHours(subDays(now, 1), 2),
      expected_weight: 25.0,
      tare_weight: 14.6,
      gross_weight: 39.8,
      net_weight: 25.2,
      in_time: subDays(now, 1),
      out_time: subHours(now, 8),
      last_status_update_time: subHours(now, 8)
    }),
    withDefaults({
      truck_number: 'RJ14GA1022',
      status: 'EXITED',
      final_status: 'COMPLETED',
      customer_name: 'Silica Sand India Pvt Ltd',
      transporter: 'Shri Ram Transport',
      driver_name: 'Pawan Yadav',
      driver_phone: '9829011223',
      gate_person_name: 'Y',
      dispatch_manager_name: 'Jitendra Yadav',
      weight_operator_name: 'Ajay',
      loading_person_name: 'Jai Bhagwan',
      accounts_person_name: 'Ajay',
      dispatch_done_by: 'Jitendra Yadav',
      tare_done_by: 'Ajay',
      gross_done_by: 'Anil Sharma',
      loading_done_by: 'Jai Bhagwan',
      billing_done_by: 'Ajay',
      material_type: 'Ball Clay',
      grade: 'Ball Clay',
      condition: 'Wet',
      packing: '4G',
      loading_point: 'Warehouse',
      labour_team: 'JCB Loader',
      eta: addHours(subDays(now, 2), 3),
      expected_weight: 24.0,
      tare_weight: 13.9,
      gross_weight: 37.7,
      net_weight: 23.8,
      in_time: subDays(now, 2),
      out_time: subDays(now, 1.5),
      last_status_update_time: subDays(now, 1.5)
    }),
    withDefaults({
      truck_number: 'RJ14GA1023',
      status: 'EXITED',
      final_status: 'CANCELLED',
      is_cancelled: true,
      cancel_reason: 'Customer hold after dispatch',
      customer_name: 'Kamdhenu Minerals',
      transporter: 'Ganpati Carriers',
      driver_name: 'Rakesh Gurjar',
      driver_phone: '9870012345',
      gate_person_name: 'Z',
      dispatch_manager_name: 'Jitendra Yadav',
      dispatch_done_by: 'Jitendra Yadav',
      tare_done_by: 'Ajay',
      tare_weight: 14.2,
      waiting_reason: 'Document clarification',
      in_time: subHours(now, 36),
      out_time: subHours(now, 24),
      last_status_update_time: subHours(now, 24)
    }),
    withDefaults({
      truck_number: 'RJ14GA1024',
      status: 'SENT_FOR_TARE_WEIGHT',
      customer_name: 'Meenakshi Minerals',
      gate_person_name: 'X',
      in_time: subHours(now, 1),
      last_status_update_time: subHours(now, 0.4)
    }),
    withDefaults({
      truck_number: 'RJ14GA1025',
      status: 'TARE_WEIGHT_DONE',
      customer_name: 'Vishwakarma Minerals',
      gate_person_name: 'Y',
      tare_weight: 14.4,
      weight_operator_name: 'Anil Sharma',
      tare_done_by: 'Anil Sharma',
      in_time: subHours(now, 2),
      last_status_update_time: subHours(now, 1.2)
    }),
    withDefaults({
      truck_number: 'RJ14GA1026',
      status: 'AT_DISPATCH',
      customer_name: 'Ganesh Minerals',
      gate_person_name: 'Z',
      tare_weight: 14.1,
      weight_operator_name: 'Ajay',
      tare_done_by: 'Ajay',
      dispatch_manager_name: 'Jitendra Yadav',
      in_time: subHours(now, 4),
      last_status_update_time: subHours(now, 1.5)
    }),
    withDefaults({
      truck_number: 'RJ14GA1027',
      status: 'WAITING',
      customer_name: 'JMD',
      gate_person_name: 'X',
      tare_weight: 14.3,
      waiting_reason: 'Loading bay occupied',
      dispatch_manager_name: 'Jitendra Yadav',
      dispatch_done_by: 'Jitendra Yadav',
      in_time: subHours(now, 13),
      last_status_update_time: subHours(now, 2.3)
    }),
    withDefaults({
      truck_number: 'RJ14GA1028',
      status: 'READY_FOR_LOADING',
      customer_name: 'Dashmesh Minerals Pvt Ltd',
      gate_person_name: 'Y',
      dispatch_manager_name: 'Jitendra Yadav',
      dispatch_done_by: 'Jitendra Yadav',
      weight_operator_name: 'Anil Sharma',
      tare_done_by: 'Anil Sharma',
      material_type: 'Silica Sand',
      grade: 'Foundry Grade',
      condition: 'Dry',
      packing: 'Old',
      loading_point: 'Old Dry Plant',
      eta: addHours(now, 1),
      expected_weight: 26.0,
      tare_weight: 14.8,
      in_time: subHours(now, 7),
      last_status_update_time: subHours(now, 1)
    }),
    withDefaults({
      truck_number: 'RJ14GA1029',
      status: 'LOADING_IN_PROGRESS',
      customer_name: 'R.R. Minerals',
      gate_person_name: 'Z',
      dispatch_manager_name: 'Jitendra Yadav',
      dispatch_done_by: 'Jitendra Yadav',
      loading_person_name: 'Rajesh Kumar',
      loading_done_by: 'Rajesh Kumar',
      material_type: 'Silica Sand',
      grade: '30-80',
      condition: 'Dry',
      packing: '3G',
      loading_point: 'Near Crusher Plant',
      labour_team: 'Shambhu',
      eta: addHours(now, 0.8),
      expected_weight: 24.5,
      tare_weight: 14.0,
      in_time: subHours(now, 9),
      last_status_update_time: subHours(now, 1.1)
    }),
    withDefaults({
      truck_number: 'RJ14GA1030',
      status: 'LOADING_COMPLETED',
      customer_name: 'Ojaswi Mines and Minerals',
      gate_person_name: 'X',
      dispatch_manager_name: 'Jitendra Yadav',
      dispatch_done_by: 'Jitendra Yadav',
      loading_person_name: 'Jai Bhagwan',
      loading_done_by: 'Jai Bhagwan',
      material_type: 'Ball Clay',
      grade: 'Raw',
      condition: 'Wet',
      packing: 'Loose',
      loading_point: 'Glass Plant',
      labour_team: 'Chandan',
      eta: addHours(now, 0.5),
      expected_weight: 23.0,
      tare_weight: 13.7,
      in_time: subHours(now, 12),
      last_status_update_time: subHours(now, 0.8)
    }),
    withDefaults({
      truck_number: 'RJ14GA1031',
      status: 'GROSS_WEIGHT_PENDING',
      customer_name: 'SKM',
      gate_person_name: 'Y',
      dispatch_manager_name: 'Jitendra Yadav',
      dispatch_done_by: 'Jitendra Yadav',
      loading_person_name: 'Rajesh Kumar',
      loading_done_by: 'Rajesh Kumar',
      material_type: 'Silica Sand',
      grade: '30-150',
      condition: 'Dry',
      packing: '4G',
      loading_point: 'Office Front',
      labour_team: 'JCB Loader',
      eta: addHours(now, 0.2),
      expected_weight: 25.5,
      tare_weight: 14.5,
      in_time: subHours(now, 16),
      last_status_update_time: subHours(now, 2)
    }),
    withDefaults({
      truck_number: 'RJ14GA1032',
      status: 'LOAD_FIX_REQUIRED',
      customer_name: 'RP Mines',
      gate_person_name: 'Z',
      dispatch_manager_name: 'Jitendra Yadav',
      dispatch_done_by: 'Jitendra Yadav',
      loading_person_name: 'Jai Bhagwan',
      loading_done_by: 'Jai Bhagwan',
      weight_operator_name: 'Ajay',
      gross_done_by: 'Ajay',
      material_type: 'Silica Sand',
      grade: '18-30',
      condition: 'Dry',
      packing: 'Loose',
      loading_point: 'Warehouse',
      labour_team: 'JCB Loader',
      eta: addHours(now, 1.2),
      expected_weight: 24.0,
      tare_weight: 14.2,
      gross_weight: 37.5,
      net_weight: 23.3,
      load_fix_reason: 'Net weight under expected, send back for correction',
      gross_weight_attempts: [
        {
          tare_weight: 14.2,
          gross_weight: 37.5,
          net_weight: 23.3,
          decision: 'RECHECK',
          reason: 'Net weight under expected, send back for correction',
          operator_name: 'Ajay',
          at: toIso(subHours(now, 0.6))
        }
      ],
      in_time: subHours(now, 20),
      last_status_update_time: subHours(now, 0.6)
    }),
    withDefaults({
      truck_number: 'RJ14GA1033',
      status: 'GROSS_WEIGHT_DONE',
      customer_name: 'Tejaswi Minerals',
      gate_person_name: 'X',
      dispatch_manager_name: 'Jitendra Yadav',
      dispatch_done_by: 'Jitendra Yadav',
      weight_operator_name: 'Anil Sharma',
      tare_done_by: 'Anil Sharma',
      gross_done_by: 'Anil Sharma',
      material_type: 'Silica Sand',
      grade: 'Foundry Grade',
      condition: 'Dry',
      packing: 'Old',
      loading_point: 'Old Dry Plant',
      labour_team: 'Tractor',
      eta: addHours(now, 0.1),
      expected_weight: 24.0,
      tare_weight: 14.3,
      gross_weight: 38.4,
      net_weight: 24.1,
      in_time: subHours(now, 6),
      last_status_update_time: subHours(now, 0.7)
    }),
    withDefaults({
      truck_number: 'RJ14GA1034',
      status: 'BILLING_PENDING',
      customer_name: 'Harsidhi Harbel',
      gate_person_name: 'Y',
      dispatch_manager_name: 'Jitendra Yadav',
      dispatch_done_by: 'Jitendra Yadav',
      accounts_person_name: 'Ajay',
      billing_done_by: null,
      material_type: 'Ball Clay',
      grade: 'Ball Clay',
      condition: 'Wet',
      packing: '3G',
      loading_point: 'Warehouse',
      labour_team: 'Dinesh',
      eta: addHours(now, 0.1),
      expected_weight: 22.5,
      tare_weight: 13.6,
      gross_weight: 36.0,
      net_weight: 22.4,
      in_time: subHours(now, 11),
      last_status_update_time: subHours(now, 0.3)
    }),
    withDefaults({
      truck_number: 'RJ14GA1035',
      status: 'COMPLETED',
      final_status: 'COMPLETED',
      customer_name: 'Bhagwat Minerals',
      gate_person_name: 'Z',
      dispatch_manager_name: 'Jitendra Yadav',
      dispatch_done_by: 'Jitendra Yadav',
      accounts_person_name: 'Anil Sharma',
      billing_done_by: 'Anil Sharma',
      material_type: 'Silica Sand',
      grade: '16-30',
      condition: 'Dry',
      packing: 'Loose',
      loading_point: 'Glass Plant',
      labour_team: 'JCB Loader',
      eta: addHours(subHours(now, 8), 1),
      expected_weight: 23.5,
      tare_weight: 14.0,
      gross_weight: 37.8,
      net_weight: 23.8,
      in_time: subHours(now, 8),
      out_time: subHours(now, 1.5),
      last_status_update_time: subHours(now, 1.5)
    }),
    withDefaults({
      truck_number: 'RJ14GA1036',
      status: 'CANCELLED',
      final_status: 'CANCELLED',
      is_cancelled: true,
      cancel_reason: 'Driver unavailable for dispatch',
      customer_name: 'Kamdhenu Minerals',
      gate_person_name: 'X',
      dispatch_manager_name: 'Jitendra Yadav',
      dispatch_done_by: 'Jitendra Yadav',
      tare_weight: 14.4,
      waiting_reason: 'Driver lunch break exceeded',
      in_time: subHours(now, 10),
      out_time: subHours(now, 4),
      last_status_update_time: subHours(now, 4)
    })
  ];

  const insertSql = `
    INSERT INTO trips (
      truck_number, customer_name, transporter, driver_name, driver_phone, gate_person_name,
      dispatch_manager_name, weight_operator_name, loading_person_name, accounts_person_name,
      dispatch_done_by, tare_done_by, gross_done_by, loading_done_by, billing_done_by,
      material_type, grade, condition, packing, loading_point, labour_team, eta, expected_weight,
      waiting_reason, load_fix_reason, tare_weight, gross_weight, net_weight, gross_weight_attempts,
      status, final_status, is_cancelled, cancel_reason, in_time, out_time, last_status_update_time
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,
      $7,$8,$9,$10,
      $11,$12,$13,$14,$15,
      $16,$17,$18,$19,$20,$21,$22,$23,
      $24,$25,$26,$27,$28,$29,
      $30,$31,$32,$33,$34,$35,$36
    )
  `;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE trips RESTART IDENTITY');

    for (const trip of trips) {
      await client.query(insertSql, [
        trip.truck_number,
        trip.customer_name,
        trip.transporter,
        trip.driver_name,
        trip.driver_phone,
        trip.gate_person_name,
        trip.dispatch_manager_name,
        trip.weight_operator_name,
        trip.loading_person_name,
        trip.accounts_person_name,
        trip.dispatch_done_by,
        trip.tare_done_by,
        trip.gross_done_by,
        trip.loading_done_by,
        trip.billing_done_by,
        trip.material_type,
        trip.grade,
        trip.condition,
        trip.packing,
        trip.loading_point,
        trip.labour_team,
        toIso(trip.eta),
        trip.expected_weight,
        trip.waiting_reason,
        trip.load_fix_reason,
        trip.tare_weight,
        trip.gross_weight,
        trip.net_weight,
        JSON.stringify(trip.gross_weight_attempts || []),
        trip.status,
        trip.final_status,
        trip.is_cancelled,
        trip.cancel_reason,
        toIso(trip.in_time),
        toIso(trip.out_time),
        toIso(trip.last_status_update_time)
      ]);
    }

    await client.query('COMMIT');
    console.log(`Seed complete. Inserted trips: ${trips.length}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
