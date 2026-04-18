require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { initDb, pool } = require('./db');
const app = express();
const PORT = process.env.PORT || 3000;

const VALID_ROLES = ['Gate', 'Dispatch', 'Loading', 'Weighbridge', 'Accounts', 'Admin'];
const ROLE_PINS = {
  Gate: 'G8P2',
  Weighbridge: 'W3K7',
  Dispatch: 'D9M4',
  Loading: 'L5Q8',
  Accounts: 'A6R1',
  Admin: '2802'
};

const STATUS_FLOW = [
  'IN_GATE',
  'SENT_FOR_TARE_WEIGHT',
  'TARE_WEIGHT_DONE',
  'AT_DISPATCH',
  'WAITING',
  'READY_FOR_LOADING',
  'LOADING_IN_PROGRESS',
  'LOADING_COMPLETED',
  'GROSS_WEIGHT_PENDING',
  'LOAD_FIX_REQUIRED',
  'GROSS_WEIGHT_DONE',
  'BILLING_PENDING',
  'BILLING_COMPLETED',
  'COMPLETED',
  'CANCELLED',
  'EXITED'
];

const STATUS_TRANSITIONS = {
  IN_GATE: ['SENT_FOR_TARE_WEIGHT'],
  SENT_FOR_TARE_WEIGHT: ['TARE_WEIGHT_DONE'],
  TARE_WEIGHT_DONE: ['AT_DISPATCH'],
  AT_DISPATCH: ['WAITING', 'READY_FOR_LOADING'],
  WAITING: ['READY_FOR_LOADING'],
  READY_FOR_LOADING: ['LOADING_IN_PROGRESS'],
  LOADING_IN_PROGRESS: ['LOADING_COMPLETED'],
  LOADING_COMPLETED: ['GROSS_WEIGHT_PENDING'],
  GROSS_WEIGHT_PENDING: ['LOAD_FIX_REQUIRED', 'GROSS_WEIGHT_DONE'],
  LOAD_FIX_REQUIRED: ['LOADING_IN_PROGRESS'],
  GROSS_WEIGHT_DONE: ['BILLING_PENDING'],
  BILLING_PENDING: ['BILLING_COMPLETED'],
  BILLING_COMPLETED: ['COMPLETED'],
  COMPLETED: ['EXITED'],
  CANCELLED: ['EXITED'],
  EXITED: []
};

const AUTO_STATUS_TRANSITIONS = {
  IN_GATE: 'SENT_FOR_TARE_WEIGHT',
  TARE_WEIGHT_DONE: 'AT_DISPATCH',
  LOADING_COMPLETED: 'GROSS_WEIGHT_PENDING',
  GROSS_WEIGHT_DONE: 'BILLING_PENDING',
  BILLING_COMPLETED: 'COMPLETED'
};

const ROLE_ALLOWED_TARGETS = {
  Gate: ['EXITED'],
  Dispatch: ['AT_DISPATCH', 'WAITING', 'READY_FOR_LOADING', 'CANCELLED'],
  Loading: ['LOADING_IN_PROGRESS', 'LOADING_COMPLETED'],
  Weighbridge: ['TARE_WEIGHT_DONE', 'LOAD_FIX_REQUIRED', 'GROSS_WEIGHT_DONE'],
  Accounts: ['BILLING_COMPLETED'],
  Admin: STATUS_FLOW
};

const FINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'EXITED']);
const EXPECTED_TRUCK_STATUSES = ['SUBMITTED', 'REVIEW_PENDING', 'APPROVED', 'CANCELLED', 'EXPIRED', 'GATE_IN_DONE'];
const DOC_UPLOAD_ROLES = new Set(['Dispatch', 'Weighbridge', 'Accounts', 'Admin']);
const DOC_VIEW_ROLES = new Set(['Dispatch', 'Weighbridge', 'Accounts', 'Admin']);
const DOC_ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.xlsx', '.xls']);
const DOC_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
const DOC_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const DOC_UPLOAD_DIR = path.resolve(process.env.DOC_UPLOAD_DIR || path.join(__dirname, 'uploads', 'docs'));
fs.mkdirSync(DOC_UPLOAD_DIR, { recursive: true });

const documentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DOC_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeBase = path.basename(file.originalname || 'document')
      .replace(/[^\w.\- ]+/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 120);
    const ext = path.extname(safeBase) || '';
    const base = safeBase.replace(ext, '');
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${base}${ext}`);
  }
});

const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: DOC_MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = String(path.extname(file.originalname || '')).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (!DOC_ALLOWED_EXTENSIONS.has(ext) || !DOC_ALLOWED_MIME_TYPES.has(mime)) {
      cb(new Error('Unsupported file type'));
      return;
    }
    cb(null, true);
  }
});

app.use(express.json());
app.use((req, res, next) => {
  if (req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function normalizeStatus(status) {
  return STATUS_FLOW.includes(status) ? status : 'IN_GATE';
}

function normalizeEmpty(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

function hasValue(value) {
  return normalizeEmpty(value) !== null;
}

const TRACKED_DETAIL_FIELDS = [
  'customer_notes',
  'waiting_reason',
  'load_fix_reason',
  'cancel_reason',
  'loading_point',
  'labour_team',
  'material_type',
  'grade',
  'condition',
  'packing',
  'location',
  'eta',
  'expected_weight',
  'tare_weight',
  'gross_weight',
  'net_weight',
  'gross_weight_attempts',
  'dispatch_manager_name',
  'weight_operator_name',
  'loading_person_name',
  'accounts_person_name',
  'dispatch_done_by',
  'tare_done_by',
  'gross_done_by',
  'loading_done_by',
  'billing_done_by',
  'final_status'
];

function getDetailChanges(beforeTripData, afterTripData) {
  const changes = {};
  TRACKED_DETAIL_FIELDS.forEach((field) => {
    const beforeValue = normalizeEmpty(beforeTripData?.[field]);
    const afterValue = normalizeEmpty(afterTripData?.[field]);

    let changed = false;
    if (field === 'eta') {
      const beforeTs = beforeValue ? new Date(beforeValue).getTime() : null;
      const afterTs = afterValue ? new Date(afterValue).getTime() : null;
      changed = beforeTs !== afterTs;
    } else {
      changed = String(beforeValue) !== String(afterValue);
    }

    if (!changed) return;
    if (afterValue === null) return;
    changes[field] = afterValue;
  });
  return changes;
}

function getReadyForLoadingSnapshot(existingTrip, requestBody) {
  const resolved = {
    material_type: normalizeEmpty(requestBody.material_type ?? existingTrip.material_type),
    grade: normalizeEmpty(requestBody.grade ?? existingTrip.grade),
    condition: normalizeEmpty(requestBody.condition ?? existingTrip.condition),
    packing: normalizeEmpty(requestBody.packing ?? existingTrip.packing),
    location: normalizeEmpty(requestBody.location ?? existingTrip.location),
    loading_point: normalizeEmpty(requestBody.loading_point ?? existingTrip.loading_point),
    eta: normalizeEmpty(requestBody.eta ?? existingTrip.eta),
    expected_weight: toFiniteNumberOrNull(requestBody.expected_weight ?? existingTrip.expected_weight),
    dispatch_manager_name: normalizeEmpty(requestBody.dispatch_manager_name ?? existingTrip.dispatch_manager_name),
    dispatch_done_by: normalizeEmpty(requestBody.dispatch_done_by ?? existingTrip.dispatch_done_by)
  };

  const snapshot = {};
  Object.entries(resolved).forEach(([field, value]) => {
    if (value === null || value === undefined || value === '') return;
    snapshot[field] = value;
  });
  return snapshot;
}

function getStatusHistoryWithInitialDetails(initialStatus, details = {}) {
  const history = buildInitialStatusHistory(initialStatus);
  const filteredDetails = Object.fromEntries(
    Object.entries(details || {}).filter(([, value]) => value !== null && value !== undefined && value !== '')
  );
  if (!history.length || !Object.keys(filteredDetails).length) return history;
  const last = history[history.length - 1];
  return [
    ...history.slice(0, -1),
    { ...last, details: { ...(last.details || {}), ...filteredDetails } }
  ];
}

function getCurrentIstTimestamp() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const mapped = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') mapped[part.type] = part.value;
  });

  return `${mapped.year}-${mapped.month}-${mapped.day}T${mapped.hour}:${mapped.minute}:${mapped.second}+05:30`;
}

function normalizeStatusHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry) => entry && typeof entry === 'object' && entry.status)
    .map((entry) => ({
      status: normalizeStatus(entry.status),
      entry_time: entry.entry_time || null,
      exit_time: entry.exit_time || null,
      details: entry.details && typeof entry.details === 'object' ? entry.details : {}
    }));
}

function applyStatusHistoryTransition(existingHistory, nextStatus, nowIst, details = {}) {
  const history = normalizeStatusHistory(existingHistory);
  if (!history.length) {
    return [{
      status: normalizeStatus(nextStatus),
      entry_time: nowIst,
      exit_time: null,
      details: { ...details }
    }];
  }

  const cloned = history.map((entry) => ({ ...entry }));
  const last = cloned[cloned.length - 1];
  if (!last.exit_time) {
    last.exit_time = nowIst;
  }

  if (last.status !== normalizeStatus(nextStatus)) {
    cloned.push({
      status: normalizeStatus(nextStatus),
      entry_time: nowIst,
      exit_time: null,
      details: { ...details }
    });
  } else {
    last.exit_time = null;
    last.details = { ...details };
  }

  return cloned;
}

function buildInitialStatusHistory(initialStatus) {
  const nowIst = getCurrentIstTimestamp();
  const history = [
    {
      status: 'IN_GATE',
      entry_time: nowIst,
      exit_time: null,
      details: {}
    }
  ];

  if (initialStatus !== 'IN_GATE') {
    history[0].exit_time = nowIst;
    history.push({
      status: normalizeStatus(initialStatus),
      entry_time: nowIst,
      exit_time: null,
      details: {}
    });
  }

  return history;
}

function readRoleFromRequest(req) {
  const role = req.header('x-user-role');
  const pin = req.header('x-user-pin');

  if (!role || !pin) {
    return { error: 'Missing role credentials', status: 401 };
  }
  if (!VALID_ROLES.includes(role)) {
    return { error: 'Invalid role', status: 403 };
  }
  if (ROLE_PINS[role] !== pin) {
    return { error: 'Invalid role PIN', status: 403 };
  }
  return { role };
}

function getUploaderDisplayNameForRole(role, trip) {
  if (!trip) return null;
  if (role === 'Dispatch') return normalizeEmpty(trip.dispatch_manager_name || trip.dispatch_done_by);
  if (role === 'Weighbridge') return normalizeEmpty(trip.weight_operator_name || trip.tare_done_by || trip.gross_done_by);
  if (role === 'Accounts') return normalizeEmpty(trip.accounts_person_name || trip.billing_done_by);
  if (role === 'Admin') return 'Admin';
  return null;
}

async function readCustomerFromRequest(req) {
  const username = String(req.header('x-customer-username') || '').trim();
  const password = String(req.header('x-customer-password') || '').trim();
  if (!username || !password) {
    return { error: 'Missing customer credentials', status: 401 };
  }
  try {
    const result = await pool.query(
      `SELECT id, customer_name, username, display_name, is_active
       FROM customer_users
       WHERE username = $1 AND password = $2
       LIMIT 1`,
      [username, password]
    );
    if (!result.rows.length) {
      return { error: 'Invalid customer credentials', status: 403 };
    }
    const user = result.rows[0];
    if (!user.is_active) {
      return { error: 'Customer user is inactive', status: 403 };
    }
    return { user };
  } catch (error) {
    console.error('Customer auth failed', error);
    return { error: 'Failed to validate customer credentials', status: 500 };
  }
}

async function canCustomerAccessTripDocuments(customerUserId, tripId) {
  const result = await pool.query(
    `SELECT 1
     FROM trips t
     JOIN expected_trucks et ON (et.id = t.expected_truck_id OR et.linked_trip_id = t.id)
     WHERE t.id = $1 AND et.submitted_by_user_id = $2
     LIMIT 1`,
    [tripId, customerUserId]
  );
  return result.rows.length > 0;
}

function normalizeExpectedTruckStatus(status) {
  const normalized = String(status || '').toUpperCase();
  return EXPECTED_TRUCK_STATUSES.includes(normalized) ? normalized : 'SUBMITTED';
}

function getExpectedTruckCurrentStatus(row) {
  if (row.trip_status) return row.trip_status;
  return row.status;
}

function isTripCompletedForCustomer(trip) {
  if (!trip) return false;
  if (trip.status === 'EXITED') {
    const outcome = trip.final_status || (trip.is_cancelled ? 'CANCELLED' : 'COMPLETED');
    return outcome === 'COMPLETED';
  }
  return trip.status === 'COMPLETED';
}

function valuesEqual(field, a, b) {
  if (field === 'status_history') {
    return JSON.stringify(normalizeStatusHistory(a)) === JSON.stringify(normalizeStatusHistory(b));
  }
  if (field === 'gross_weight_attempts') {
    return JSON.stringify(normalizeGrossWeightAttempts(a)) === JSON.stringify(normalizeGrossWeightAttempts(b));
  }
  if (field === 'in_time' || field === 'out_time' || field === 'last_status_update_time' || field === 'eta') {
    if (!a && !b) return true;
    if (!a || !b) return false;
    const aTime = new Date(a).getTime();
    const bTime = new Date(b).getTime();
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) return String(a) === String(b);
    return aTime === bTime;
  }
  return a === b;
}

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeGrossWeightAttempts(value) {
  if (value == null) return [];
  const source = typeof value === 'string' ? (() => {
    try {
      return JSON.parse(value);
    } catch (_err) {
      return [];
    }
  })() : value;
  if (!Array.isArray(source)) return [];
  return source
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry, index) => ({
      attempt_no: Number(entry.attempt_no) || (index + 1),
      tare_weight: toFiniteNumberOrNull(entry.tare_weight),
      gross_weight: toFiniteNumberOrNull(entry.gross_weight),
      net_weight: toFiniteNumberOrNull(entry.net_weight),
      decision: String(entry.decision || '').toUpperCase() || 'RECHECK',
      reason: normalizeEmpty(entry.reason),
      operator_name: normalizeEmpty(entry.operator_name),
      timestamp_ist: normalizeEmpty(entry.timestamp_ist) || getCurrentIstTimestamp()
    }));
}

function isRoleAllowedForStatus(role, targetStatus) {
  const allowed = ROLE_ALLOWED_TARGETS[role] || [];
  return allowed.includes(targetStatus);
}

function isValidStatusTransition(currentStatus, nextStatus) {
  if (nextStatus === 'CANCELLED') {
    return !FINAL_STATUSES.has(currentStatus);
  }
  const allowed = STATUS_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
}

function isAdminRollbackAllowed(currentStatus, nextStatus) {
  const currentIndex = STATUS_FLOW.indexOf(currentStatus);
  const nextIndex = STATUS_FLOW.indexOf(nextStatus);
  if (currentIndex === -1 || nextIndex === -1) return false;
  return nextIndex < currentIndex;
}

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/expected-trucks-page', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'expected-trucks.html'));
});

app.get('/customer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer.html'));
});

app.post('/trip', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }
  if (!['Gate', 'Admin'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only Gate/Admin can create trips' });
  }

  const {
    sequence_number,
    truck_number,
    customer_name,
    transporter,
    driver_name,
    driver_phone,
    gate_person_name,
    dispatch_manager_name,
    weight_operator_name,
    loading_person_name,
    accounts_person_name,
    dispatch_done_by,
    tare_done_by,
    gross_done_by,
    loading_done_by,
    billing_done_by,
    material_type,
    grade,
    condition,
    packing,
    location,
    loading_point,
    labour_team,
    eta,
    expected_weight,
    customer_notes,
    waiting_reason,
    load_fix_reason,
    tare_weight,
    gross_weight,
    net_weight,
    gross_weight_attempts,
    status,
    final_status,
    is_cancelled,
    cancel_reason,
    in_time,
    out_time,
    last_status_update_time,
    status_history
  } = req.body;

  const requestedStatus = normalizeStatus(status || 'IN_GATE');
  const safeStatus = requestedStatus === 'IN_GATE' ? 'SENT_FOR_TARE_WEIGHT' : requestedStatus;
  // Use server time as canonical source to avoid client timezone skew.
  const safeInTime = new Date().toISOString();
  const safeLastStatusUpdateTime = safeInTime;
  const safeIsCancelled = is_cancelled ?? false;
  const safeStatusHistory = buildInitialStatusHistory(safeStatus);
  const safeGrossWeightAttempts = normalizeGrossWeightAttempts(gross_weight_attempts);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tripInsertResult = await client.query(
      `INSERT INTO trips(
        sequence_number,
        truck_number,
        customer_name,
        transporter,
        driver_name,
        driver_phone,
        gate_person_name,
        dispatch_manager_name,
        weight_operator_name,
        loading_person_name,
        accounts_person_name,
        dispatch_done_by,
        tare_done_by,
        gross_done_by,
        loading_done_by,
        billing_done_by,
        material_type,
        grade,
        condition,
        packing,
        location,
        loading_point,
        labour_team,
        eta,
        expected_weight,
        customer_notes,
        waiting_reason,
        load_fix_reason,
        tare_weight,
        gross_weight,
        net_weight,
        gross_weight_attempts,
        status,
        final_status,
        is_cancelled,
        cancel_reason,
        in_time,
        out_time,
        last_status_update_time,
        status_history
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40)
      RETURNING *`,
      [
        sequence_number,
        truck_number,
        customer_name,
        transporter,
        driver_name,
        driver_phone,
        gate_person_name,
        dispatch_manager_name,
        weight_operator_name,
        loading_person_name,
        accounts_person_name,
        dispatch_done_by,
        tare_done_by,
        gross_done_by,
        loading_done_by,
        billing_done_by,
        material_type,
        grade,
        condition,
        packing,
        location,
        loading_point,
        labour_team,
        eta,
        expected_weight,
        customer_notes,
        waiting_reason,
        load_fix_reason,
        tare_weight,
        gross_weight,
        net_weight,
        JSON.stringify(safeGrossWeightAttempts),
        safeStatus,
        final_status || null,
        safeIsCancelled,
        cancel_reason,
        safeInTime,
        out_time,
        safeLastStatusUpdateTime,
        JSON.stringify(safeStatusHistory)
      ]
    );
    const createdTrip = tripInsertResult.rows[0];
    const normalizedCustomerName = normalizeEmpty(customer_name);
    const normalizedTruckNumber = normalizeEmpty(truck_number);
    let syncedExpectedTruckId = null;

    // Auto-sync gate entries into customer expected-truck list when profile exists.
    if (normalizedCustomerName && normalizedTruckNumber) {
      const todayIst = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      const dedupeKey = `expected-sync:${normalizedCustomerName.trim().toLowerCase()}:${normalizedTruckNumber.trim().toLowerCase()}:${todayIst}`;
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [dedupeKey]);

      const customerUserRes = await client.query(
        `SELECT id, customer_name
         FROM customer_users
         WHERE is_active = true
           AND lower(trim(customer_name)) = lower(trim($1))
         ORDER BY id ASC
         LIMIT 1`,
        [normalizedCustomerName]
      );

      if (customerUserRes.rows.length) {
        const customerUser = customerUserRes.rows[0];
        const existingExpectedRes = await client.query(
          `SELECT id, linked_trip_id
           FROM expected_trucks
           WHERE submitted_by_user_id = $1
             AND lower(trim(customer_name)) = lower(trim($2))
             AND lower(trim(truck_number)) = lower(trim($3))
             AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
           ORDER BY id DESC
           LIMIT 1
           FOR UPDATE`,
          [customerUser.id, normalizedCustomerName, normalizedTruckNumber]
        );

        if (existingExpectedRes.rows.length) {
          const existingExpected = existingExpectedRes.rows[0];
          syncedExpectedTruckId = existingExpected.id;
          if (!existingExpected.linked_trip_id) {
            await client.query(
              `UPDATE expected_trucks
               SET linked_trip_id = $1,
                   status = 'GATE_IN_DONE',
                   status_updated_at = NOW(),
                   status_updated_by = 'SYSTEM_GATE_SYNC',
                   updated_at = NOW()
               WHERE id = $2`,
              [createdTrip.id, existingExpected.id]
            );
          }
        } else {
          const insertedExpectedRes = await client.query(
            `INSERT INTO expected_trucks (
              submitted_by_user_id, customer_name, truck_number, driver_name, driver_phone, transporter,
              expected_quantity_mt, material_type, grade, condition, packing, location, eta, notes,
              status, linked_trip_id, submitted_at, status_updated_at, status_updated_by
            ) VALUES (
              $1,$2,$3,$4,$5,$6,
              $7,$8,$9,$10,$11,$12,$13,$14,
              'GATE_IN_DONE',$15,NOW(),NOW(),'SYSTEM_GATE_SYNC'
            )
            RETURNING id`,
            [
              customerUser.id,
              normalizedCustomerName,
              normalizedTruckNumber,
              normalizeEmpty(driver_name),
              normalizeEmpty(driver_phone),
              normalizeEmpty(transporter),
              toFiniteNumberOrNull(expected_weight) ?? 0,
              normalizeEmpty(material_type),
              normalizeEmpty(grade),
              normalizeEmpty(condition),
              normalizeEmpty(packing),
              normalizeEmpty(location),
              normalizeEmpty(eta),
              normalizeEmpty(customer_notes),
              createdTrip.id
            ]
          );
          syncedExpectedTruckId = insertedExpectedRes.rows[0].id;
        }

        if (syncedExpectedTruckId) {
          await client.query(
            `UPDATE trips
             SET expected_truck_id = COALESCE(expected_truck_id, $1),
                 updated_at = NOW()
             WHERE id = $2`,
            [syncedExpectedTruckId, createdTrip.id]
          );
        }
      }
    }

    await client.query('COMMIT');

    const finalTripRes = await pool.query('SELECT * FROM trips WHERE id = $1 LIMIT 1', [createdTrip.id]);
    return res.status(201).json(finalTripRes.rows[0] || createdTrip);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating trip', error);
    return res.status(500).json({ error: 'Failed to create trip' });
  } finally {
    client.release();
  }
});

app.get('/trips', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM trips ORDER BY updated_at DESC, id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching trips', error);
    res.status(500).json({ error: 'Failed to load trips' });
  }
});

app.put('/trip/:id', async (req, res) => {
  const { id } = req.params;
  const auth = readRoleFromRequest(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  let existingTrip;
  try {
    const tripResult = await pool.query('SELECT * FROM trips WHERE id = $1', [id]);
    if (tripResult.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    existingTrip = tripResult.rows[0];
  } catch (error) {
    console.error('Error fetching trip for update', error);
    return res.status(500).json({ error: 'Failed to validate update request' });
  }

  const allowedFields = [
    'sequence_number',
    'truck_number',
    'customer_name',
    'transporter',
    'driver_name',
    'driver_phone',
    'gate_person_name',
    'dispatch_manager_name',
    'weight_operator_name',
    'loading_person_name',
    'accounts_person_name',
    'dispatch_done_by',
    'tare_done_by',
    'gross_done_by',
    'loading_done_by',
    'billing_done_by',
    'material_type',
    'grade',
    'condition',
    'packing',
    'location',
    'loading_point',
    'labour_team',
    'eta',
    'expected_weight',
    'customer_notes',
    'waiting_reason',
    'load_fix_reason',
    'tare_weight',
    'gross_weight',
    'net_weight',
    'gross_weight_attempts',
    'status',
    'final_status',
    'is_cancelled',
    'cancel_reason',
    'in_time',
    'out_time',
    'last_status_update_time',
    'status_history'
  ];

  const currentStatus = normalizeStatus(existingTrip.status);
  const requestedStatus = Object.prototype.hasOwnProperty.call(req.body, 'status')
    ? normalizeStatus(req.body.status)
    : currentStatus;
  const isStatusChange = requestedStatus !== currentStatus;
  const isAdminRollback = auth.role === 'Admin' && isStatusChange && isAdminRollbackAllowed(currentStatus, requestedStatus);
  const mergedTripData = { ...existingTrip, ...req.body, status: requestedStatus };
  let systemManagedStatusHistoryUpdate = false;

  if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
    if (isStatusChange) {
      if (!isRoleAllowedForStatus(auth.role, requestedStatus)) {
        return res.status(403).json({ error: `Role ${auth.role} cannot mark status ${requestedStatus}` });
      }
      if (!isAdminRollback && !isValidStatusTransition(currentStatus, requestedStatus)) {
        return res.status(400).json({ error: `Invalid transition: ${currentStatus} -> ${requestedStatus}` });
      }

      if (requestedStatus === 'READY_FOR_LOADING') {
        const expectedWeight = toFiniteNumberOrNull(req.body.expected_weight ?? existingTrip.expected_weight);
        if (expectedWeight === null || expectedWeight <= 0) {
          return res.status(400).json({ error: 'Expected weight (MT) is required before ready for loading' });
        }
      }

      if (requestedStatus === 'LOADING_IN_PROGRESS') {
        const effective = {
          material_type: normalizeEmpty(req.body.material_type ?? existingTrip.material_type),
          grade: normalizeEmpty(req.body.grade ?? existingTrip.grade),
          condition: normalizeEmpty(req.body.condition ?? existingTrip.condition),
          packing: normalizeEmpty(req.body.packing ?? existingTrip.packing),
          loading_point: normalizeEmpty(req.body.loading_point ?? existingTrip.loading_point),
          labour_team: normalizeEmpty(req.body.labour_team ?? existingTrip.labour_team),
          eta: normalizeEmpty(req.body.eta ?? existingTrip.eta),
          expected_weight: toFiniteNumberOrNull(req.body.expected_weight ?? existingTrip.expected_weight)
        };
        const summarize = () => ({
          material_type: effective.material_type || null,
          grade: effective.grade || null,
          condition: effective.condition || null,
          packing: effective.packing || null,
          loading_point: effective.loading_point || null,
          labour_team: effective.labour_team || null,
          eta: effective.eta || null,
          expected_weight: effective.expected_weight
        });

        if (!hasValue(effective.material_type)) {
          return res.status(400).json({ error: 'Material type is required before starting loading', received: summarize() });
        }
        if (!hasValue(effective.grade)) {
          return res.status(400).json({ error: 'Grade is required before starting loading', received: summarize() });
        }
        if (!hasValue(effective.condition)) {
          return res.status(400).json({ error: 'Condition is required before starting loading', received: summarize() });
        }
        if (!hasValue(effective.packing)) {
          return res.status(400).json({ error: 'Packing is required before starting loading', received: summarize() });
        }
        if (!hasValue(effective.loading_point)) {
          return res.status(400).json({ error: 'Loading point is required before starting loading', received: summarize() });
        }
        if (!hasValue(effective.labour_team)) {
          return res.status(400).json({ error: 'Loading team is required before starting loading', received: summarize() });
        }
        if (!hasValue(effective.eta)) {
          return res.status(400).json({ error: 'ETA is required before starting loading', received: summarize() });
        }
        if (effective.expected_weight === null || effective.expected_weight <= 0) {
          return res.status(400).json({ error: 'Expected weight (MT) is required before starting loading', received: summarize() });
        }
      }

      if (requestedStatus === 'LOAD_FIX_REQUIRED') {
        const effectiveReason = normalizeEmpty(req.body.load_fix_reason ?? existingTrip.load_fix_reason);
        if (!hasValue(effectiveReason)) {
          return res.status(400).json({ error: 'Load fix reason is required' });
        }
      }
    }
  }

  // status_history is system-managed; ignore direct client writes unless generated below.
  if (!isStatusChange && Object.prototype.hasOwnProperty.call(req.body, 'status_history')) {
    delete req.body.status_history;
  }

  if (isStatusChange) {
    let requestedDetailChanges = getDetailChanges(existingTrip, { ...mergedTripData, status: requestedStatus });
    if (requestedStatus === 'READY_FOR_LOADING') {
      requestedDetailChanges = {
        ...getReadyForLoadingSnapshot(existingTrip, req.body),
        ...requestedDetailChanges
      };
    }
    const requestedAtIst = getCurrentIstTimestamp();
    let nextHistory = applyStatusHistoryTransition(
      existingTrip.status_history,
      requestedStatus,
      requestedAtIst,
      requestedDetailChanges
    );
    let finalStatus = requestedStatus;
    const autoNext = AUTO_STATUS_TRANSITIONS[requestedStatus];

    if (autoNext) {
      const autoAtIst = getCurrentIstTimestamp();
      nextHistory = applyStatusHistoryTransition(
        nextHistory,
        autoNext,
        autoAtIst,
        {}
      );
      finalStatus = autoNext;
    }

    req.body.status = finalStatus;
    req.body.status_history = nextHistory;
    req.body.last_status_update_time = new Date().toISOString();
    systemManagedStatusHistoryUpdate = true;

    const nowIso = new Date().toISOString();
    if (finalStatus === 'CANCELLED') {
      req.body.final_status = 'CANCELLED';
      req.body.is_cancelled = true;
      if (!req.body.cancel_reason) {
        req.body.cancel_reason = existingTrip.cancel_reason || 'Cancelled';
      }
      req.body.out_time = nowIso;
    } else if (finalStatus === 'COMPLETED') {
      req.body.final_status = 'COMPLETED';
      req.body.is_cancelled = false;
      req.body.cancel_reason = null;
      req.body.out_time = nowIso;
    } else if (finalStatus === 'EXITED') {
      const resolvedFinal = existingTrip.final_status || (existingTrip.is_cancelled ? 'CANCELLED' : 'COMPLETED');
      req.body.final_status = resolvedFinal;
      req.body.is_cancelled = resolvedFinal === 'CANCELLED';
      if (resolvedFinal !== 'CANCELLED') {
        req.body.cancel_reason = null;
      }
      req.body.out_time = nowIso;
    } else if (isAdminRollback) {
      req.body.final_status = null;
      req.body.is_cancelled = false;
      req.body.cancel_reason = null;
      req.body.out_time = null;
    }
  } else {
    const detailChanges = getDetailChanges(existingTrip, mergedTripData);
    if (Object.keys(detailChanges).length) {
      const nowIst = getCurrentIstTimestamp();
      const history = normalizeStatusHistory(existingTrip.status_history);
      const nextHistory = history.map((entry) => ({ ...entry }));
      if (nextHistory.length) {
        const last = nextHistory[nextHistory.length - 1];
        if (!last.exit_time && last.status === currentStatus) {
          last.exit_time = nowIst;
        }
      }
      nextHistory.push({
        status: currentStatus,
        entry_time: nowIst,
        exit_time: null,
        details: detailChanges
      });

      req.body.status_history = nextHistory;
      systemManagedStatusHistoryUpdate = true;
    }
  }

  // Net weight is system-calculated from tare and gross whenever either changes.
  if (
    Object.prototype.hasOwnProperty.call(req.body, 'tare_weight') ||
    Object.prototype.hasOwnProperty.call(req.body, 'gross_weight')
  ) {
    const effectiveTare = Object.prototype.hasOwnProperty.call(req.body, 'tare_weight')
      ? toFiniteNumberOrNull(req.body.tare_weight)
      : toFiniteNumberOrNull(existingTrip.tare_weight);
    const effectiveGross = Object.prototype.hasOwnProperty.call(req.body, 'gross_weight')
      ? toFiniteNumberOrNull(req.body.gross_weight)
      : toFiniteNumberOrNull(existingTrip.gross_weight);

    if (effectiveTare !== null && effectiveGross !== null) {
      req.body.net_weight = Number((effectiveGross - effectiveTare).toFixed(2));
    } else {
      req.body.net_weight = null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'gross_weight_attempts')) {
    req.body.gross_weight_attempts = normalizeGrossWeightAttempts(req.body.gross_weight_attempts);
  }

  const providedFields = allowedFields.filter((field) =>
    Object.prototype.hasOwnProperty.call(req.body, field) && req.body[field] !== undefined
  );

  if (providedFields.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided for update' });
  }

  const restrictedFields = ['in_time', 'out_time', 'final_status', 'is_cancelled', 'cancel_reason', 'status_history'];
  if (auth.role !== 'Admin') {
    const allowedByTransition = {
      CANCELLED: new Set(['out_time', 'final_status', 'is_cancelled', 'cancel_reason', 'status_history']),
      COMPLETED: new Set(['out_time', 'final_status', 'is_cancelled', 'cancel_reason', 'status_history']),
      EXITED: new Set(['out_time', 'status_history']),
      AT_DISPATCH: new Set(['status_history']),
      GROSS_WEIGHT_PENDING: new Set(['status_history']),
      BILLING_PENDING: new Set(['status_history'])
    };
    const finalRequestedStatus = normalizeStatus(req.body.status || requestedStatus);
    const allowedRestrictedFields = isStatusChange
      ? (allowedByTransition[finalRequestedStatus] || new Set())
      : new Set();

    for (const field of restrictedFields) {
      if (!providedFields.includes(field)) continue;
      if (valuesEqual(field, req.body[field], existingTrip[field])) continue;
      if (field === 'status_history' && systemManagedStatusHistoryUpdate) continue;
      if (field === 'in_time') {
        return res.status(403).json({ error: `Role ${auth.role} cannot modify in_time` });
      }
      if (!allowedRestrictedFields.has(field)) {
        return res.status(403).json({ error: `Role ${auth.role} cannot modify ${field}` });
      }
    }
  }

  const setClause = [
    ...providedFields.map((field, index) => `${field} = $${index + 1}`),
    'updated_at = NOW()'
  ].join(', ');
  const values = providedFields.map((field) => (
    (field === 'status_history' || field === 'gross_weight_attempts')
      ? JSON.stringify(req.body[field])
      : req.body[field]
  ));

  try {
    let result = await pool.query(
      `UPDATE trips SET ${setClause} WHERE id = $${providedFields.length + 1} RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating trip', error);
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

app.delete('/trip/:id', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') {
    return res.status(403).json({ error: 'Only Admin can delete trips' });
  }

  const tripId = Number(req.params.id);
  if (!Number.isInteger(tripId) || tripId <= 0) {
    return res.status(400).json({ error: 'Invalid trip id' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM trips WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [tripId]
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Trip not found' });
    }

    const docRows = await client.query(
      `SELECT storage_path FROM trip_documents WHERE trip_id = $1`,
      [tripId]
    );

    await client.query(`DELETE FROM trips WHERE id = $1`, [tripId]);
    await client.query('COMMIT');

    docRows.rows.forEach((row) => {
      try {
        const absolutePath = path.resolve(__dirname, row.storage_path || '');
        if (absolutePath.startsWith(path.resolve(DOC_UPLOAD_DIR)) && fs.existsSync(absolutePath)) {
          fs.unlinkSync(absolutePath);
        }
      } catch (_err) {
        // no-op; db deletion is already committed
      }
    });

    return res.json({ ok: true, deleted_trip_id: tripId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to delete trip', error);
    return res.status(500).json({ error: 'Failed to delete trip' });
  } finally {
    client.release();
  }
});

app.get('/trip/:id/documents', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!DOC_VIEW_ROLES.has(auth.role)) {
    return res.status(403).json({ error: 'Role cannot view trip documents' });
  }

  const tripId = Number(req.params.id);
  if (!Number.isInteger(tripId) || tripId <= 0) {
    return res.status(400).json({ error: 'Invalid trip id' });
  }

  try {
    const result = await pool.query(
      `SELECT id, trip_id, expected_truck_id, doc_type, file_name, mime_type, file_size, uploaded_by_role, uploaded_by_name, created_at
       FROM trip_documents
       WHERE trip_id = $1
       ORDER BY created_at DESC, id DESC`,
      [tripId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Failed to load trip documents', error);
    return res.status(500).json({ error: 'Failed to load trip documents' });
  }
});

app.post('/trip/:id/documents', (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!DOC_UPLOAD_ROLES.has(auth.role)) {
    return res.status(403).json({ error: 'Role cannot upload trip documents' });
  }

  const tripId = Number(req.params.id);
  if (!Number.isInteger(tripId) || tripId <= 0) {
    return res.status(400).json({ error: 'Invalid trip id' });
  }

  uploadDocument.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError.message || 'Failed to upload file';
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tripRes = await client.query('SELECT id, expected_truck_id, dispatch_manager_name, dispatch_done_by, weight_operator_name, tare_done_by, gross_done_by, accounts_person_name, billing_done_by FROM trips WHERE id = $1 FOR UPDATE', [tripId]);
      if (!tripRes.rows.length) {
        await client.query('ROLLBACK');
        try { fs.unlinkSync(req.file.path); } catch (_err) {}
        return res.status(404).json({ error: 'Trip not found' });
      }

      const trip = tripRes.rows[0];
      const docType = normalizeEmpty(req.body.doc_type);
      const uploadedByName = getUploaderDisplayNameForRole(auth.role, trip);
      const storagePath = path.relative(__dirname, req.file.path);
      const insert = await client.query(
        `INSERT INTO trip_documents (
          trip_id, expected_truck_id, doc_type, file_name, mime_type, file_size, storage_path, uploaded_by_role, uploaded_by_name
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id, trip_id, expected_truck_id, doc_type, file_name, mime_type, file_size, uploaded_by_role, uploaded_by_name, created_at`,
        [
          trip.id,
          trip.expected_truck_id || null,
          docType,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          storagePath,
          auth.role,
          uploadedByName
        ]
      );
      await client.query('COMMIT');
      return res.status(201).json(insert.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      try { fs.unlinkSync(req.file.path); } catch (_err) {}
      console.error('Failed to upload trip document', error);
      return res.status(500).json({ error: 'Failed to upload trip document' });
    } finally {
      client.release();
    }
  });
});

app.get('/documents/:id/download', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!DOC_VIEW_ROLES.has(auth.role)) {
    return res.status(403).json({ error: 'Role cannot download trip documents' });
  }

  const documentId = Number(req.params.id);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    return res.status(400).json({ error: 'Invalid document id' });
  }

  try {
    const result = await pool.query(
      `SELECT id, file_name, mime_type, storage_path
       FROM trip_documents
       WHERE id = $1
       LIMIT 1`,
      [documentId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];
    const absolutePath = path.resolve(__dirname, doc.storage_path);
    if (!absolutePath.startsWith(path.resolve(DOC_UPLOAD_DIR))) {
      return res.status(403).json({ error: 'Invalid document path' });
    }
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Document file missing' });
    }

    return res.download(absolutePath, doc.file_name);
  } catch (error) {
    console.error('Failed to download trip document', error);
    return res.status(500).json({ error: 'Failed to download trip document' });
  }
});

app.delete('/trip/:tripId/documents/:docId', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!DOC_UPLOAD_ROLES.has(auth.role) && auth.role !== 'Admin') {
    return res.status(403).json({ error: 'Role cannot delete trip documents' });
  }

  const tripId = Number(req.params.tripId);
  const documentId = Number(req.params.docId);
  if (!Number.isInteger(tripId) || tripId <= 0 || !Number.isInteger(documentId) || documentId <= 0) {
    return res.status(400).json({ error: 'Invalid identifiers' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, trip_id, storage_path, uploaded_by_role
       FROM trip_documents
       WHERE id = $1 AND trip_id = $2
       LIMIT 1
       FOR UPDATE`,
      [documentId, tripId]
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = existing.rows[0];
    if (auth.role !== 'Admin' && doc.uploaded_by_role !== auth.role) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only delete documents uploaded by your role' });
    }

    await client.query('DELETE FROM trip_documents WHERE id = $1', [doc.id]);
    await client.query('COMMIT');
    try {
      const absolutePath = path.resolve(__dirname, doc.storage_path);
      if (absolutePath.startsWith(path.resolve(DOC_UPLOAD_DIR)) && fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch (_err) {}
    return res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to delete trip document', error);
    return res.status(500).json({ error: 'Failed to delete trip document' });
  } finally {
    client.release();
  }
});

app.get('/customer/trip-documents', async (req, res) => {
  const auth = await readCustomerFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const tripId = Number(req.query.trip_id || 0);
  if (!Number.isInteger(tripId) || tripId <= 0) {
    return res.status(400).json({ error: 'trip_id is required' });
  }

  try {
    const allowed = await canCustomerAccessTripDocuments(auth.user.id, tripId);
    if (!allowed) {
      return res.status(403).json({ error: 'Not allowed to view documents for this trip' });
    }
    const result = await pool.query(
      `SELECT id, trip_id, expected_truck_id, doc_type, file_name, mime_type, file_size, uploaded_by_role, uploaded_by_name, created_at
       FROM trip_documents
       WHERE trip_id = $1
       ORDER BY created_at DESC, id DESC`,
      [tripId]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Failed to load customer trip documents', error);
    return res.status(500).json({ error: 'Failed to load documents' });
  }
});

app.get('/customer/trips/:id/timeline', async (req, res) => {
  const auth = await readCustomerFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const tripId = Number(req.params.id);
  if (!Number.isInteger(tripId) || tripId <= 0) {
    return res.status(400).json({ error: 'Invalid trip id' });
  }

  try {
    const result = await pool.query(
      `SELECT
        t.id,
        t.truck_number,
        t.status,
        t.final_status,
        t.is_cancelled,
        t.in_time,
        t.out_time,
        t.expected_weight,
        t.net_weight,
        t.material_type,
        t.grade,
        t.condition,
        t.packing,
        t.location,
        COALESCE(t.status_history, '[]'::jsonb) AS status_history
       FROM trips t
       JOIN expected_trucks et ON (et.id = t.expected_truck_id OR et.linked_trip_id = t.id)
       WHERE t.id = $1 AND et.submitted_by_user_id = $2
       LIMIT 1`,
      [tripId, auth.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to load customer trip timeline', error);
    return res.status(500).json({ error: 'Failed to load trip timeline' });
  }
});

app.get('/customer/documents/:id/download', async (req, res) => {
  const auth = await readCustomerFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const documentId = Number(req.params.id);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    return res.status(400).json({ error: 'Invalid document id' });
  }

  try {
    const result = await pool.query(
      `SELECT td.id, td.trip_id, td.file_name, td.storage_path
       FROM trip_documents td
       WHERE td.id = $1
       LIMIT 1`,
      [documentId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const doc = result.rows[0];
    const allowed = await canCustomerAccessTripDocuments(auth.user.id, doc.trip_id);
    if (!allowed) {
      return res.status(403).json({ error: 'Not allowed to download this document' });
    }
    const absolutePath = path.resolve(__dirname, doc.storage_path);
    if (!absolutePath.startsWith(path.resolve(DOC_UPLOAD_DIR))) {
      return res.status(403).json({ error: 'Invalid document path' });
    }
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Document file missing' });
    }
    return res.download(absolutePath, doc.file_name);
  } catch (error) {
    console.error('Failed to download customer document', error);
    return res.status(500).json({ error: 'Failed to download document' });
  }
});

app.post('/admin/customer-users', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can create customer users' });

  const customerName = normalizeEmpty(req.body.customer_name);
  const username = normalizeEmpty(req.body.username);
  const password = normalizeEmpty(req.body.password);
  const displayName = normalizeEmpty(req.body.display_name);

  if (!customerName || !username || !password) {
    return res.status(400).json({ error: 'customer_name, username and password are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO customer_users (customer_name, username, password, display_name, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, customer_name, username, display_name, is_active, created_at`,
      [customerName, username, password, displayName]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('Failed to create customer user', error);
    return res.status(500).json({ error: 'Failed to create customer user' });
  }
});

app.get('/admin/customer-users', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view customer users' });
  try {
    const result = await pool.query(
      `SELECT id, customer_name, username, display_name, is_active, created_at, updated_at
       FROM customer_users
       ORDER BY customer_name ASC, username ASC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Failed to list customer users', error);
    return res.status(500).json({ error: 'Failed to load customer users' });
  }
});

app.post('/customer/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const auth = await readCustomerFromRequest({
    header: (name) => (name === 'x-customer-username' ? username : (name === 'x-customer-password' ? password : null))
  });
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  return res.json({
    ok: true,
    user: {
      id: auth.user.id,
      customer_name: auth.user.customer_name,
      username: auth.user.username,
      display_name: auth.user.display_name
    }
  });
});

app.get('/customer/me', async (req, res) => {
  const auth = await readCustomerFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  return res.json({
    id: auth.user.id,
    customer_name: auth.user.customer_name,
    username: auth.user.username,
    display_name: auth.user.display_name
  });
});

app.post('/customer/expected-trucks', async (req, res) => {
  const auth = await readCustomerFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const truckNumber = normalizeEmpty(req.body.truck_number);
  const driverName = normalizeEmpty(req.body.driver_name);
  const driverPhone = normalizeEmpty(req.body.driver_phone);
  const expectedQty = toFiniteNumberOrNull(req.body.expected_quantity_mt);
  const customerName = normalizeEmpty(req.body.customer_name) || auth.user.customer_name;
  const materialType = normalizeEmpty(req.body.material_type);
  const grade = normalizeEmpty(req.body.grade);
  const condition = normalizeEmpty(req.body.condition);
  const packing = normalizeEmpty(req.body.packing);
  const location = normalizeEmpty(req.body.location);
  const transporter = normalizeEmpty(req.body.transporter);
  const eta = normalizeEmpty(req.body.eta);
  const notes = normalizeEmpty(req.body.notes);

  if (!truckNumber || !driverName || !driverPhone || expectedQty === null || expectedQty <= 0) {
    return res.status(400).json({ error: 'truck_number, driver_name, driver_phone and expected_quantity_mt are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO expected_trucks (
        submitted_by_user_id, customer_name, truck_number, driver_name, driver_phone, transporter,
        expected_quantity_mt, material_type, grade, condition, packing, location, eta, notes,
        status, submitted_at, status_updated_at, status_updated_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,$12,$13,$14,
        'SUBMITTED', NOW(), NOW(), 'CUSTOMER'
      )
      RETURNING *`,
      [
        auth.user.id, customerName, truckNumber, driverName, driverPhone, transporter,
        expectedQty, materialType, grade, condition, packing, location, eta, notes
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create expected truck', error);
    return res.status(500).json({ error: 'Failed to create expected truck' });
  }
});

app.get('/customer/expected-trucks', async (req, res) => {
  const auth = await readCustomerFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  try {
    const result = await pool.query(
      `SELECT
        et.*,
        t.status AS trip_status,
        t.final_status AS trip_final_status,
        t.in_time AS trip_in_time,
        t.out_time AS trip_out_time,
        t.net_weight AS trip_net_weight,
        COALESCE(t.status_history, '[]'::jsonb) AS trip_status_history
       FROM expected_trucks et
       LEFT JOIN trips t ON t.id = et.linked_trip_id
       WHERE et.submitted_by_user_id = $1
       ORDER BY et.created_at DESC, et.id DESC`,
      [auth.user.id]
    );
    const rows = result.rows.map((row) => ({
      ...row,
      current_status: getExpectedTruckCurrentStatus(row)
    }));
    return res.json(rows);
  } catch (error) {
    console.error('Failed to load expected trucks for customer', error);
    return res.status(500).json({ error: 'Failed to load expected trucks' });
  }
});

app.get('/customer/dashboard-summary', async (req, res) => {
  const auth = await readCustomerFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const customerNameFilter = normalizeEmpty(req.query.customer_name);
  try {
    const result = await pool.query(
      `SELECT
        t.id, t.truck_number, t.status, t.final_status, t.is_cancelled, t.net_weight, t.in_time, t.out_time,
        et.customer_name
       FROM expected_trucks et
       JOIN trips t ON t.id = et.linked_trip_id
       WHERE et.submitted_by_user_id = $1
       ${customerNameFilter ? 'AND et.customer_name = $2' : ''}
       ORDER BY t.updated_at DESC, t.id DESC`,
      customerNameFilter ? [auth.user.id, customerNameFilter] : [auth.user.id]
    );

    const rows = result.rows;
    const now = new Date();
    const istDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const nowParts = Object.fromEntries(istDateParts.formatToParts(now).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));

    const completedRows = rows.filter(isTripCompletedForCustomer);
    const getParts = (value) => {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return null;
      return Object.fromEntries(istDateParts.formatToParts(d).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
    };

    const summary = {
      trucks_today: 0,
      trucks_month: 0,
      trucks_year: 0,
      quantity_today_mt: 0,
      quantity_month_mt: 0,
      quantity_year_mt: 0
    };

    completedRows.forEach((row) => {
      const parts = getParts(row.out_time || row.in_time);
      if (!parts) return;
      const net = toFiniteNumberOrNull(row.net_weight) || 0;
      const sameYear = parts.year === nowParts.year;
      const sameMonth = sameYear && parts.month === nowParts.month;
      const sameDay = sameMonth && parts.day === nowParts.day;
      if (sameYear) {
        summary.trucks_year += 1;
        summary.quantity_year_mt += net;
      }
      if (sameMonth) {
        summary.trucks_month += 1;
        summary.quantity_month_mt += net;
      }
      if (sameDay) {
        summary.trucks_today += 1;
        summary.quantity_today_mt += net;
      }
    });

    return res.json({
      summary,
      records: rows
    });
  } catch (error) {
    console.error('Failed to load customer dashboard summary', error);
    return res.status(500).json({ error: 'Failed to load customer dashboard summary' });
  }
});

app.get('/expected-trucks', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!['Gate', 'Dispatch', 'Admin'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only Gate/Dispatch/Admin can view expected trucks' });
  }

  const requestedStatus = normalizeExpectedTruckStatus(req.query.status || '');
  const onlyApproved = req.query.onlyApproved === 'true';
  const filters = [];
  const values = [];
  // Keep recent gate-in conversions visible briefly, hide after 24h.
  filters.push(`NOT (et.status = 'GATE_IN_DONE' AND et.created_at <= NOW() - INTERVAL '24 hours')`);
  if (req.query.status) {
    values.push(requestedStatus);
    filters.push(`et.status = $${values.length}`);
  } else if (onlyApproved) {
    filters.push(`et.status = 'APPROVED'`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT
        et.*,
       cu.display_name AS submitted_by_name,
       cu.username AS submitted_by_username,
       t.status AS trip_status,
       t.final_status AS trip_final_status,
       t.location AS trip_location,
       t.in_time AS trip_in_time,
       t.out_time AS trip_out_time
       FROM expected_trucks et
       JOIN customer_users cu ON cu.id = et.submitted_by_user_id
       LEFT JOIN trips t ON t.id = et.linked_trip_id
       ${where}
       ORDER BY et.created_at DESC, et.id DESC`,
      values
    );
    const rows = result.rows.map((row) => ({
      ...row,
      current_status: getExpectedTruckCurrentStatus(row)
    }));
    return res.json(rows);
  } catch (error) {
    console.error('Failed to load expected trucks', error);
    return res.status(500).json({ error: 'Failed to load expected trucks' });
  }
});

app.put('/expected-trucks/:id/status', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!['Dispatch', 'Admin'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only Dispatch/Admin can update expected truck status' });
  }
  const id = req.params.id;
  const nextStatus = normalizeExpectedTruckStatus(req.body.status);
  if (!['REVIEW_PENDING', 'APPROVED', 'CANCELLED'].includes(nextStatus)) {
    return res.status(400).json({ error: 'Invalid expected truck status transition target' });
  }

  try {
    const existing = await pool.query(`SELECT * FROM expected_trucks WHERE id = $1`, [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Expected truck not found' });
    const row = existing.rows[0];
    if (row.linked_trip_id) {
      return res.status(400).json({ error: 'Cannot update status after gate-in conversion' });
    }

    const approvedAt = nextStatus === 'APPROVED' ? `approved_at = NOW(),` : '';
    const expiresAt = nextStatus === 'APPROVED' ? `expires_at = NOW() + INTERVAL '24 hours',` : '';
    const result = await pool.query(
      `UPDATE expected_trucks
       SET status = $1,
           ${approvedAt}
           ${expiresAt}
           status_updated_at = NOW(),
           status_updated_by = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [nextStatus, auth.role, id]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update expected truck status', error);
    return res.status(500).json({ error: 'Failed to update expected truck status' });
  }
});

app.post('/expected-trucks/:id/mark-gate-in', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!['Gate', 'Admin'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only Gate/Admin can mark expected truck gate-in' });
  }
  const id = req.params.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const expectedRes = await client.query(`SELECT * FROM expected_trucks WHERE id = $1 FOR UPDATE`, [id]);
    if (!expectedRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Expected truck not found' });
    }
    const expected = expectedRes.rows[0];
    if (expected.linked_trip_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Expected truck already converted to trip' });
    }
    if (expected.status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only APPROVED expected trucks can be gate-in converted' });
    }

    const safeStatus = 'SENT_FOR_TARE_WEIGHT';
    const nowIso = new Date().toISOString();
    const customerNotes = normalizeEmpty(expected.notes);
    const statusHistory = getStatusHistoryWithInitialDetails(safeStatus, {
      customer_notes: customerNotes,
      location: normalizeEmpty(expected.location)
    });

    const tripInsert = await client.query(
      `INSERT INTO trips(
        truck_number, customer_name, transporter, driver_name, driver_phone, gate_person_name,
        material_type, grade, condition, packing, location, expected_weight,
        customer_notes,
        status, in_time, last_status_update_time, status_history, expected_truck_id
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *`,
      [
        expected.truck_number,
        expected.customer_name,
        expected.transporter,
        expected.driver_name,
        expected.driver_phone,
        normalizeEmpty(req.body.gate_person_name),
        expected.material_type,
        expected.grade,
        expected.condition,
        expected.packing,
        expected.location,
        expected.expected_quantity_mt,
        customerNotes,
        safeStatus,
        nowIso,
        nowIso,
        JSON.stringify(statusHistory),
        expected.id
      ]
    );
    const trip = tripInsert.rows[0];

    await client.query(
      `UPDATE expected_trucks
       SET linked_trip_id = $1,
           status = 'GATE_IN_DONE',
           status_updated_at = NOW(),
           status_updated_by = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [trip.id, auth.role, expected.id]
    );

    await client.query('COMMIT');
    return res.status(201).json(trip);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to convert expected truck to trip', error);
    return res.status(500).json({ error: 'Failed to mark gate-in for expected truck' });
  } finally {
    client.release();
  }
});

async function runExpectedTruckAutomation() {
  try {
    await pool.query(
      `UPDATE expected_trucks
       SET status = 'APPROVED',
           approved_at = COALESCE(approved_at, NOW()),
           expires_at = COALESCE(expires_at, NOW() + INTERVAL '24 hours'),
           status_updated_at = NOW(),
           status_updated_by = 'SYSTEM',
           updated_at = NOW()
       WHERE linked_trip_id IS NULL
         AND status IN ('SUBMITTED', 'REVIEW_PENDING')
         AND submitted_at <= NOW() - INTERVAL '2 hours'`
    );

    await pool.query(
      `UPDATE expected_trucks
       SET status = 'EXPIRED',
           status_updated_at = NOW(),
           status_updated_by = 'SYSTEM',
           updated_at = NOW()
       WHERE linked_trip_id IS NULL
         AND status = 'APPROVED'
         AND COALESCE(expires_at, approved_at + INTERVAL '24 hours', submitted_at + INTERVAL '26 hours') <= NOW()`
    );
  } catch (error) {
    console.error('Expected truck automation failed', error);
  }
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

initDb()
  .then(() => {
    runExpectedTruckAutomation();
    setInterval(runExpectedTruckAutomation, 5 * 60 * 1000);
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
