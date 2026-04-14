require('dotenv').config();
const path = require('path');
const express = require('express');
const { initDb, pool } = require('./db');
const app = express();
const PORT = process.env.PORT || 3000;

const VALID_ROLES = ['Gate', 'Dispatch', 'Loading', 'Weighbridge', 'Accounts', 'Admin'];
const ROLE_PINS = {
  Gate: '1111',
  Dispatch: '2222',
  Loading: '5555',
  Weighbridge: '3333',
  Accounts: '4444',
  Admin: '9999'
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
  GROSS_WEIGHT_PENDING: ['GROSS_WEIGHT_DONE'],
  GROSS_WEIGHT_DONE: ['BILLING_PENDING'],
  BILLING_PENDING: ['BILLING_COMPLETED'],
  BILLING_COMPLETED: ['COMPLETED'],
  COMPLETED: ['EXITED'],
  CANCELLED: ['EXITED'],
  EXITED: []
};

const ROLE_ALLOWED_TARGETS = {
  Gate: ['EXITED'],
  Dispatch: ['AT_DISPATCH', 'WAITING', 'READY_FOR_LOADING', 'CANCELLED'],
  Loading: ['LOADING_IN_PROGRESS', 'LOADING_COMPLETED'],
  Weighbridge: ['TARE_WEIGHT_DONE', 'GROSS_WEIGHT_DONE'],
  Accounts: ['BILLING_COMPLETED', 'COMPLETED'],
  Admin: STATUS_FLOW
};

const FINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'EXITED']);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function normalizeStatus(status) {
  return STATUS_FLOW.includes(status) ? status : 'IN_GATE';
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

function valuesEqual(field, a, b) {
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

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
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
    material_type,
    grade,
    loading_point,
    labour_team,
    eta,
    waiting_reason,
    tare_weight,
    gross_weight,
    net_weight,
    status,
    final_status,
    is_cancelled,
    cancel_reason,
    in_time,
    out_time,
    last_status_update_time
  } = req.body;

  const safeStatus = status || 'IN_GATE';
  // Use server time as canonical source to avoid client timezone skew.
  const safeInTime = new Date().toISOString();
  const safeLastStatusUpdateTime = last_status_update_time || safeInTime;
  const safeIsCancelled = is_cancelled ?? false;

  try {
    const result = await pool.query(
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
        material_type,
        grade,
        loading_point,
        labour_team,
        eta,
        waiting_reason,
        tare_weight,
        gross_weight,
        net_weight,
        status,
        final_status,
        is_cancelled,
        cancel_reason,
        in_time,
        out_time,
        last_status_update_time
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
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
        material_type,
        grade,
        loading_point,
        labour_team,
        eta,
        waiting_reason,
        tare_weight,
        gross_weight,
        net_weight,
        safeStatus,
        final_status || null,
        safeIsCancelled,
        cancel_reason,
        safeInTime,
        out_time,
        safeLastStatusUpdateTime
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating trip', error);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

app.get('/trips', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM trips ORDER BY id DESC');
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
    'material_type',
    'grade',
    'loading_point',
    'labour_team',
    'eta',
    'waiting_reason',
    'tare_weight',
    'gross_weight',
    'net_weight',
    'status',
    'final_status',
    'is_cancelled',
    'cancel_reason',
    'in_time',
    'out_time',
    'last_status_update_time'
  ];

  const providedFields = allowedFields.filter((field) =>
    Object.prototype.hasOwnProperty.call(req.body, field) && req.body[field] !== undefined
  );

  if (providedFields.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided for update' });
  }

  const currentStatus = normalizeStatus(existingTrip.status);
  const requestedStatus = Object.prototype.hasOwnProperty.call(req.body, 'status')
    ? normalizeStatus(req.body.status)
    : currentStatus;
  const isStatusChange = requestedStatus !== currentStatus;

  if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
    if (isStatusChange) {
      if (!isRoleAllowedForStatus(auth.role, requestedStatus)) {
        return res.status(403).json({ error: `Role ${auth.role} cannot mark status ${requestedStatus}` });
      }
      if (!isValidStatusTransition(currentStatus, requestedStatus)) {
        return res.status(400).json({ error: `Invalid transition: ${currentStatus} -> ${requestedStatus}` });
      }
    }
  }

  const restrictedFields = ['in_time', 'out_time', 'final_status', 'is_cancelled', 'cancel_reason'];
  if (auth.role !== 'Admin') {
    const allowedByTransition = {
      CANCELLED: new Set(['out_time', 'final_status', 'is_cancelled', 'cancel_reason']),
      COMPLETED: new Set(['out_time', 'final_status', 'is_cancelled', 'cancel_reason']),
      EXITED: new Set(['out_time'])
    };
    const allowedRestrictedFields = isStatusChange
      ? (allowedByTransition[requestedStatus] || new Set())
      : new Set();

    for (const field of restrictedFields) {
      if (!providedFields.includes(field)) continue;
      if (valuesEqual(field, req.body[field], existingTrip[field])) continue;
      if (field === 'in_time') {
        return res.status(403).json({ error: `Role ${auth.role} cannot modify in_time` });
      }
      if (!allowedRestrictedFields.has(field)) {
        return res.status(403).json({ error: `Role ${auth.role} cannot modify ${field}` });
      }
    }
  }

  const setClause = providedFields
    .map((field, index) => `${field} = $${index + 1}`)
    .join(', ');
  const values = providedFields.map((field) => req.body[field]);

  try {
    const result = await pool.query(
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
