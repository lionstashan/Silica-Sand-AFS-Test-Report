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
  'waiting_reason',
  'load_fix_reason',
  'cancel_reason',
  'loading_point',
  'labour_team',
  'material_type',
  'grade',
  'condition',
  'packing',
  'eta',
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
    loading_point,
    labour_team,
    eta,
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
        loading_point,
        labour_team,
        eta,
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
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37)
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
        loading_point,
        labour_team,
        eta,
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
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating trip', error);
    res.status(500).json({ error: 'Failed to create trip' });
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
    'loading_point',
    'labour_team',
    'eta',
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

      if (requestedStatus === 'LOADING_IN_PROGRESS') {
        const effective = {
          material_type: normalizeEmpty(req.body.material_type ?? existingTrip.material_type),
          grade: normalizeEmpty(req.body.grade ?? existingTrip.grade),
          condition: normalizeEmpty(req.body.condition ?? existingTrip.condition),
          packing: normalizeEmpty(req.body.packing ?? existingTrip.packing),
          loading_point: normalizeEmpty(req.body.loading_point ?? existingTrip.loading_point),
          labour_team: normalizeEmpty(req.body.labour_team ?? existingTrip.labour_team),
          eta: normalizeEmpty(req.body.eta ?? existingTrip.eta)
        };
        const summarize = () => ({
          material_type: effective.material_type || null,
          grade: effective.grade || null,
          condition: effective.condition || null,
          packing: effective.packing || null,
          loading_point: effective.loading_point || null,
          labour_team: effective.labour_team || null,
          eta: effective.eta || null
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
    const requestedDetailChanges = getDetailChanges(existingTrip, { ...mergedTripData, status: requestedStatus });
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
