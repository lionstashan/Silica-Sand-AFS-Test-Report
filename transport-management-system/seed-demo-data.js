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
      truck: 'RJ14GH9821',
      status: 'EXITED',
      finalStatus: 'COMPLETED',
      inTime: inCurrentMonthA,
      outTime: addHours(inCurrentMonthA, 10),
      tareWeight: 14500,
      grossWeight: 40000,
      netWeight: 25500,
      materialType: 'Silica A',
      grade: 'Grade 1',
      loadingPoint: 'L1',
      labourTeam: 'T1',
      eta: addHours(inCurrentMonthA, 2)
    },
    {
      truck: 'GJ05TX7743',
      status: 'EXITED',
      finalStatus: 'COMPLETED',
      inTime: inCurrentMonthB,
      outTime: addHours(inCurrentMonthB, 12),
      tareWeight: 14200,
      grossWeight: 32600,
      netWeight: 18400,
      materialType: 'Silica B',
      grade: 'Grade 2',
      loadingPoint: 'L2',
      labourTeam: 'T2',
      eta: addHours(inCurrentMonthB, 1.5)
    },
    {
      truck: 'MH04KU1188',
      status: 'EXITED',
      finalStatus: 'CANCELLED',
      inTime: inCancelledExited,
      outTime: addHours(inCancelledExited, 6),
      cancelReason: 'E-way bill mismatch at dispatch',
      isCancelled: true
    },
    {
      truck: 'RJ19QA6620',
      status: 'EXITED',
      finalStatus: 'COMPLETED',
      inTime: inPrevMonth,
      outTime: addHours(inPrevMonth, 9),
      tareWeight: 14600,
      grossWeight: 36900,
      netWeight: 22300,
      materialType: 'Silica A',
      grade: 'Grade 1',
      loadingPoint: 'L3',
      labourTeam: 'T3',
      eta: addHours(inPrevMonth, 1)
    },
    {
      truck: 'HR38AF4402',
      status: 'EXITED',
      finalStatus: 'COMPLETED',
      inTime: inPrevYear,
      outTime: addHours(inPrevYear, 8),
      tareWeight: 15000,
      grossWeight: 45200,
      netWeight: 30200,
      materialType: 'Silica B',
      grade: 'Grade 2',
      loadingPoint: 'L1',
      labourTeam: 'T2',
      eta: addHours(inPrevYear, 1.25)
    },
    { truck: 'RJ14GL4100', status: 'SENT_FOR_TARE_WEIGHT', inTime: subHours(now, 2), statusAgeHours: 0.5 },
    { truck: 'GJ01HV9034', status: 'TARE_WEIGHT_DONE', inTime: subHours(now, 3), tareWeight: 14100, statusAgeHours: 0.75 },
    { truck: 'RJ27TB2401', status: 'AT_DISPATCH', inTime: subHours(now, 5), tareWeight: 14450, statusAgeHours: 1.5 },
    { truck: 'UP78CM5531', status: 'WAITING', inTime: subHours(now, 13), tareWeight: 14300, waitingReason: 'Loading bay occupied', statusAgeHours: 2 },
    {
      truck: 'RJ09PC7722',
      status: 'READY_FOR_LOADING',
      inTime: subHours(now, 26),
      loadingPoint: 'L1',
      labourTeam: 'T1',
      materialType: 'Silica A',
      grade: 'Grade 1',
      eta: addHours(now, 2),
      tareWeight: 14000,
      statusAgeHours: 3
    },
    {
      truck: 'RJ14NS1289',
      status: 'LOADING_IN_PROGRESS',
      inTime: subHours(now, 8),
      loadingPoint: 'L2',
      labourTeam: 'T2',
      materialType: 'Silica B',
      grade: 'Grade 2',
      eta: addHours(now, 1),
      tareWeight: 13900,
      statusAgeHours: 1
    },
    {
      truck: 'DL1LU8765',
      status: 'LOADING_COMPLETED',
      inTime: subHours(now, 30),
      loadingPoint: 'L3',
      labourTeam: 'T3',
      materialType: 'Silica A',
      grade: 'Grade 1',
      eta: addHours(now, 0.5),
      tareWeight: 14700,
      statusAgeHours: 0.8
    },
    {
      truck: 'CG04LP5510',
      status: 'GROSS_WEIGHT_PENDING',
      inTime: subHours(now, 25),
      tareWeight: 14650,
      statusAgeHours: 1.75
    },
    {
      truck: 'PB10DM2190',
      status: 'GROSS_WEIGHT_DONE',
      inTime: subHours(now, 1),
      tareWeight: 14200,
      grossWeight: 36500,
      netWeight: 22300,
      statusAgeHours: 0.4
    },
    { truck: 'RJ45TA9923', status: 'BILLING_PENDING', inTime: subHours(now, 3), tareWeight: 14100, grossWeight: 35900, netWeight: 21800, statusAgeHours: 1.25 },
    { truck: 'MH12RW6007', status: 'BILLING_COMPLETED', inTime: subHours(now, 15), tareWeight: 14400, grossWeight: 37200, netWeight: 22800, statusAgeHours: 2.5 },
    {
      truck: 'RJ04NA3312',
      status: 'COMPLETED',
      finalStatus: 'COMPLETED',
      inTime: subHours(now, 6),
      outTime: subHours(now, 1),
      tareWeight: 14000,
      grossWeight: 35200,
      netWeight: 21200
    },
    {
      truck: 'GJ18PR4471',
      status: 'CANCELLED',
      finalStatus: 'CANCELLED',
      inTime: subHours(now, 7),
      outTime: subHours(now, 1),
      cancelReason: 'Customer hold at dispatch',
      isCancelled: true
    },
    {
      truck: 'RJ14MK2234',
      status: 'AT_DISPATCH',
      inTime: subHours(now, 49),
      tareWeight: 14500,
      statusAgeHours: 10
    },
    {
      truck: 'UP32HZ1176',
      status: 'WAITING',
      inTime: subHours(now, 22),
      tareWeight: 13800,
      waitingReason: 'Loading team shift change',
      statusAgeHours: 5
    },
    {
      truck: 'KA03MN7742',
      status: 'READY_FOR_LOADING',
      inTime: subHours(now, 11),
      loadingPoint: 'L2',
      labourTeam: 'T1',
      materialType: 'Silica B',
      grade: 'Grade 2',
      eta: addHours(now, 1),
      tareWeight: 13950,
      statusAgeHours: 2
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
      const lastStatusUpdate = trip.statusAgeHours ? subHours(now, trip.statusAgeHours) : (outTime || inTime);
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
          trip.customerName || (trip.materialType === 'Silica B' ? 'Shree Cement' : 'UltraTech Cement'),
          trip.transporter || 'Shree Ram Logistics',
          trip.driverName || 'Ramesh Kumar',
          trip.driverPhone || '9876543210',
          trip.gatePersonName || 'Sohan',
          trip.dispatchManagerName || 'Amit Sharma',
          trip.weightOperatorName || 'Vikas Yadav',
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
  console.log('- Quantity (Month): 43.90 tons');
  console.log('- Quantity (Year): 66.20 tons');
  console.log('- Cancelled (Exited): 1');
  console.log('- Loading zone should have READY_FOR_LOADING / LOADING_IN_PROGRESS / LOADING_COMPLETED entries');
  console.log('- Accounts zone should have BILLING_PENDING / BILLING_COMPLETED entries');
}

run().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
