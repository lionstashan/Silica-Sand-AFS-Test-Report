require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
  return date.toISOString();
}

function getIstParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const mapped = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') mapped[part.type] = part.value;
  });
  return mapped;
}

async function run() {
  const now = new Date();
  const nowIst = getIstParts(now);

  const inCurrentMonthA = subDays(now, 4);
  const inCurrentMonthB = subDays(now, 2);
  const inCancelledExited = subDays(now, 1);
  const inPrevMonth = new Date(Date.UTC(
    Number(nowIst.year),
    Math.max(0, Number(nowIst.month) - 2),
    20,
    8,
    30,
    0
  ));
  const inPrevYear = new Date(Date.UTC(
    Number(nowIst.year) - 1,
    11,
    15,
    9,
    0,
    0
  ));

  const trips = [
    {
      truck: 'DEMO-COMP-001',
      status: 'EXITED',
      finalStatus: 'COMPLETED',
      inTime: inCurrentMonthA,
      outTime: addHours(inCurrentMonthA, 10),
      netWeight: 25000
    },
    {
      truck: 'DEMO-COMP-002',
      status: 'EXITED',
      finalStatus: 'COMPLETED',
      inTime: inCurrentMonthB,
      outTime: addHours(inCurrentMonthB, 12),
      netWeight: 18000
    },
    {
      truck: 'DEMO-CANX-001',
      status: 'EXITED',
      finalStatus: 'CANCELLED',
      inTime: inCancelledExited,
      outTime: addHours(inCancelledExited, 6),
      cancelReason: 'Truck document mismatch',
      isCancelled: true
    },
    {
      truck: 'DEMO-COMP-PM',
      status: 'EXITED',
      finalStatus: 'COMPLETED',
      inTime: inPrevMonth,
      outTime: addHours(inPrevMonth, 9),
      netWeight: 22000
    },
    {
      truck: 'DEMO-COMP-PY',
      status: 'EXITED',
      finalStatus: 'COMPLETED',
      inTime: inPrevYear,
      outTime: addHours(inPrevYear, 8),
      netWeight: 30000
    },
    { truck: 'DEMO-DISP-INGATE', status: 'IN_GATE', inTime: subHours(now, 2) },
    { truck: 'DEMO-DISP-ATDSP', status: 'AT_DISPATCH', inTime: subHours(now, 5) },
    { truck: 'DEMO-DISP-WAIT', status: 'WAITING', inTime: subHours(now, 13), waitingReason: 'Queue' },
    {
      truck: 'DEMO-DISP-READY',
      status: 'READY_FOR_LOADING',
      inTime: subHours(now, 26),
      loadingPoint: 'L1',
      labourTeam: 'T1',
      materialType: 'Silica A',
      grade: 'Grade 1',
      eta: addHours(now, 2)
    },
    { truck: 'DEMO-DISP-LOADIP', status: 'LOADING_IN_PROGRESS', inTime: subHours(now, 8) },
    { truck: 'DEMO-DISP-LOADDONE', status: 'LOADING_COMPLETED', inTime: subHours(now, 30) },
    { truck: 'DEMO-WB-SENT', status: 'SENT_FOR_TARE_WEIGHT', inTime: subHours(now, 4) },
    { truck: 'DEMO-WB-TARE', status: 'TARE_WEIGHT_DONE', inTime: subHours(now, 14), tareWeight: 4200 },
    { truck: 'DEMO-WB-GROSSP', status: 'GROSS_WEIGHT_PENDING', inTime: subHours(now, 25), tareWeight: 4100 },
    {
      truck: 'DEMO-WB-GROSSD',
      status: 'GROSS_WEIGHT_DONE',
      inTime: subHours(now, 1),
      tareWeight: 4300,
      grossWeight: 9800,
      netWeight: 5500
    },
    { truck: 'DEMO-FIN-PEND', status: 'BILLING_PENDING', inTime: subHours(now, 3), netWeight: 6400 },
    { truck: 'DEMO-FIN-DONE', status: 'BILLING_COMPLETED', inTime: subHours(now, 15), netWeight: 7100 },
    {
      truck: 'DEMO-COMP-NOEXIT',
      status: 'COMPLETED',
      finalStatus: 'COMPLETED',
      inTime: subHours(now, 6),
      outTime: subHours(now, 1),
      netWeight: 12000
    },
    {
      truck: 'DEMO-CANX-NOEXIT',
      status: 'CANCELLED',
      finalStatus: 'CANCELLED',
      inTime: subHours(now, 7),
      outTime: subHours(now, 1),
      cancelReason: 'Driver unavailable',
      isCancelled: true
    },
    {
      truck: 'DEMO-DISP-OLD24',
      status: 'AT_DISPATCH',
      inTime: subHours(now, 49)
    }
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE trips RESTART IDENTITY');

    for (const trip of trips) {
      const inTime = trip.inTime || now;
      const outTime = trip.outTime || null;
      const isCancelled = Boolean(trip.isCancelled);
      const finalStatus = trip.finalStatus || null;
      const lastStatusUpdate = outTime || inTime;
      await client.query(
        `INSERT INTO trips (
          truck_number, customer_name, transporter, driver_name, driver_phone, gate_person_name,
          dispatch_manager_name, weight_operator_name, material_type, grade, loading_point, labour_team,
          eta, waiting_reason, tare_weight, gross_weight, net_weight, status, final_status, is_cancelled,
          cancel_reason, in_time, out_time, last_status_update_time
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
          $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
        )`,
        [
          trip.truck,
          'ABC Cement',
          'XYZ Transport',
          'Demo Driver',
          '9999999999',
          'Sohan',
          'Demo Dispatch',
          'Demo Operator',
          trip.materialType || null,
          trip.grade || null,
          trip.loadingPoint || null,
          trip.labourTeam || null,
          trip.eta ? toIso(trip.eta) : null,
          trip.waitingReason || null,
          trip.tareWeight || null,
          trip.grossWeight || null,
          trip.netWeight || null,
          trip.status,
          finalStatus,
          isCancelled,
          trip.cancelReason || null,
          toIso(inTime),
          outTime ? toIso(outTime) : null,
          toIso(lastStatusUpdate)
        ]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log('Seed complete. Inserted trips:', trips.length);
  console.log('Expected key demo metrics:');
  console.log('- Completed (Month): 2');
  console.log('- Completed (Year): 3');
  console.log('- Quantity (Month): 43.00 tons');
  console.log('- Quantity (Year): 65.00 tons');
  console.log('- Cancelled (Exited): 1');
}

run().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
