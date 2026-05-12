require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { initDb, pool } = require('./db');
const { appConfig, validateProductionConfig } = require('./config');
const app = express();
const PORT = process.env.PORT || 3000;

const VALID_ROLES = ['Gate', 'Dispatch', 'Loading', 'Weighbridge', 'Accounts', 'Manager', 'Admin'];
const ROLE_PINS = appConfig.rolePins;

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
  READY_FOR_LOADING: ['WAITING', 'LOADING_IN_PROGRESS'],
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
  Loading: ['WAITING', 'LOADING_IN_PROGRESS', 'LOADING_COMPLETED'],
  Weighbridge: ['TARE_WEIGHT_DONE', 'LOAD_FIX_REQUIRED', 'GROSS_WEIGHT_DONE'],
  Accounts: ['BILLING_COMPLETED'],
  Manager: [],
  Admin: STATUS_FLOW
};

const FINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'EXITED']);
const EXPECTED_TRUCK_STATUSES = ['SUBMITTED', 'REVIEW_PENDING', 'APPROVED', 'CANCELLED', 'EXPIRED', 'GATE_IN_DONE'];
const EXPENSE_ROLES = ['Employee', 'Accounts', 'Manager', 'Admin'];
const EXPENSE_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'ACCOUNTS_REVIEW',
  'MANAGER_REVIEW',
  'ADMIN_REVIEW',
  'NEED_MORE_INFO',
  'PAYMENT_PENDING',
  'PAYMENT_INITIATED',
  'PAYMENT_COMPLETED',
  'REJECTED'
];
const EXPENSE_FINAL_STATUSES = new Set(['PAYMENT_COMPLETED', 'REJECTED']);
const EXPENSE_DOC_TYPES = new Set(['BILL', 'PAYMENT_PROOF', 'SUPPORTING']);
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
const EXPENSE_DOC_ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
const EXPENSE_DOC_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg'
]);
const EXPENSE_DOC_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const DOC_UPLOAD_DIR = path.resolve(process.env.DOC_UPLOAD_DIR || path.join(__dirname, 'uploads', 'docs'));
const UPLOADS_ROOT_DIR = path.resolve(path.join(__dirname, 'uploads'));
const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];
const TASK_TEAMS = VALID_ROLES;
const CUSTOMER_TOKEN_SECRET = appConfig.secrets.customerTokenSecret;
const CUSTOMER_TOKEN_TTL_SECONDS = Number.parseInt(process.env.CUSTOMER_TOKEN_TTL_SECONDS || '604800', 10); // 7 days
const EXPENSE_TOKEN_SECRET = appConfig.secrets.expenseTokenSecret;
const EXPENSE_TOKEN_TTL_SECONDS = Number.parseInt(process.env.EXPENSE_TOKEN_TTL_SECONDS || '604800', 10); // 7 days
const TRANSPORT_TOKEN_SECRET = appConfig.secrets.transportTokenSecret;
const TRANSPORT_TOKEN_TTL_SECONDS = Number.parseInt(process.env.TRANSPORT_TOKEN_TTL_SECONDS || '86400', 10); // 1 day
const EXPENSE_LOGIN_MAX_ATTEMPTS = 5;
const EXPENSE_LOGIN_WINDOW_MINUTES = 15;
const EXPENSE_LOGIN_LOCK_MINUTES = 15;
const BCRYPT_COST = Number.parseInt(process.env.BCRYPT_COST || '10', 10);
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

const uploadTaskCommentAttachment = multer({
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

const uploadExpenseDocument = multer({
  storage: documentStorage,
  limits: { fileSize: EXPENSE_DOC_MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = String(path.extname(file.originalname || '')).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (!EXPENSE_DOC_ALLOWED_EXTENSIONS.has(ext) || !EXPENSE_DOC_ALLOWED_MIME_TYPES.has(mime)) {
      cb(new Error('Unsupported file type. Allowed: PDF, JPG, JPEG, PNG'));
      return;
    }
    cb(null, true);
  }
});

app.use(express.json());
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  if (isExpenseRoute(req.path)) {
    req.expenseRequestId = req.requestId;
  }
  next();
});
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

function normalizeTaskStatus(status) {
  const normalized = String(status || '').toUpperCase();
  return TASK_STATUSES.includes(normalized) ? normalized : null;
}

function normalizeTaskTeam(team) {
  const normalized = String(team || '').trim();
  return TASK_TEAMS.includes(normalized) ? normalized : null;
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
  const bearer = String(req.header('authorization') || '').trim();
  const tokenHeader = String(req.header('x-user-token') || '').trim();
  const token = tokenHeader || (bearer.toLowerCase().startsWith('bearer ') ? bearer.slice(7).trim() : '');

  if (token) {
    if (!role) return { error: 'Missing role for token-authenticated request', status: 401 };
    if (!VALID_ROLES.includes(role)) return { error: 'Invalid role', status: 403 };
    const verified = verifyTransportToken(token);
    if (verified.error) return { error: verified.error, status: verified.status };
    const tokenRoles = Array.isArray(verified.payload.roles) ? verified.payload.roles : [];
    if (!tokenRoles.includes(role)) {
      return { error: 'Role not assigned to authenticated user', status: 403 };
    }
    return {
      role,
      user: {
        id: verified.payload.sub,
        username: verified.payload.username,
        full_name: verified.payload.full_name || null
      },
      auth_mode: 'token'
    };
  }

  if (!role || !pin) {
    return { error: 'Missing role credentials', status: 401 };
  }
  if (!VALID_ROLES.includes(role)) {
    return { error: 'Invalid role', status: 403 };
  }
  if (ROLE_PINS[role] !== pin) {
    return { error: 'Invalid role PIN', status: 403 };
  }
  return { role, auth_mode: 'pin' };
}

async function authenticateTransportV2WithPassword(username, password) {
  const result = await pool.query(
    `SELECT id, username, full_name, password_hash, is_active
     FROM users
     WHERE username = $1
     LIMIT 1`,
    [username]
  );
  if (!result.rows.length) return { error: 'Invalid credentials', status: 403 };
  const user = result.rows[0];
  if (!user.is_active) return { error: 'User is inactive', status: 403 };
  const matches = await bcrypt.compare(String(password || ''), String(user.password_hash || ''));
  if (!matches) return { error: 'Invalid credentials', status: 403 };
  const rolesRes = await pool.query(
    `SELECT role_name
     FROM user_roles
     WHERE user_id = $1 AND is_active = true
     ORDER BY role_name ASC`,
    [user.id]
  );
  const roles = rolesRes.rows.map((row) => row.role_name).filter((role) => VALID_ROLES.includes(role));
  return {
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      roles
    }
  };
}

function getUploaderDisplayNameForRole(role, trip) {
  if (!trip) return null;
  if (role === 'Dispatch') return normalizeEmpty(trip.dispatch_manager_name || trip.dispatch_done_by);
  if (role === 'Weighbridge') return normalizeEmpty(trip.weight_operator_name || trip.tare_done_by || trip.gross_done_by);
  if (role === 'Accounts') return normalizeEmpty(trip.accounts_person_name || trip.billing_done_by);
  if (role === 'Admin') return 'Admin';
  return null;
}

function toBase64Url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

function createCustomerToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    username: user.username,
    iat: now,
    exp: now + CUSTOMER_TOKEN_TTL_SECONDS
  };
  const headerPart = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', CUSTOMER_TOKEN_SECRET)
    .update(`${headerPart}.${payloadPart}`)
    .digest();
  const signaturePart = toBase64Url(signature);
  return `${headerPart}.${payloadPart}.${signaturePart}`;
}

function verifyCustomerToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { error: 'Invalid customer token format', status: 401 };
  const [headerPart, payloadPart, signaturePart] = parts;
  const expectedSignaturePart = toBase64Url(
    crypto
      .createHmac('sha256', CUSTOMER_TOKEN_SECRET)
      .update(`${headerPart}.${payloadPart}`)
      .digest()
  );
  if (signaturePart !== expectedSignaturePart) {
    return { error: 'Invalid customer token signature', status: 401 };
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadPart).toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload !== 'object' || !payload.sub || !payload.username) {
      return { error: 'Invalid customer token payload', status: 401 };
    }
    if (!payload.exp || payload.exp <= now) {
      return { error: 'Customer token expired', status: 401 };
    }
    return { payload };
  } catch (_error) {
    return { error: 'Invalid customer token payload', status: 401 };
  }
}

async function getActiveCustomerUserByIdAndUsername(id, username) {
  const result = await pool.query(
    `SELECT id, customer_name, username, display_name, is_active
     FROM customer_users
     WHERE id = $1 AND username = $2
     LIMIT 1`,
    [id, username]
  );
  if (!result.rows.length) {
    return { error: 'Invalid customer credentials', status: 403 };
  }
  const user = result.rows[0];
  if (!user.is_active) {
    return { error: 'Customer user is inactive', status: 403 };
  }
  return { user };
}

async function authenticateCustomerWithPassword(username, password) {
  try {
    const result = await pool.query(
      `SELECT id, customer_name, username, display_name, is_active, password
       FROM customer_users
       WHERE username = $1
       LIMIT 1`,
      [username]
    );
    if (!result.rows.length) {
      return { error: 'Invalid customer credentials', status: 403 };
    }
    const user = result.rows[0];
    if (!user.is_active) {
      return { error: 'Customer user is inactive', status: 403 };
    }

    const storedPassword = String(user.password || '');
    const isHashed = /^\$2[abxy]\$\d{2}\$/.test(storedPassword);
    const passwordMatches = isHashed
      ? await bcrypt.compare(password, storedPassword)
      : storedPassword === password;

    if (!passwordMatches) {
      return { error: 'Invalid customer credentials', status: 403 };
    }

    if (!isHashed) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
      await pool.query(
        `UPDATE customer_users
         SET password = $1, updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, user.id]
      );
    }

    return {
      user: {
        id: user.id,
        customer_name: user.customer_name,
        username: user.username,
        display_name: user.display_name,
        is_active: user.is_active
      }
    };
  } catch (error) {
    console.error('Customer password auth failed', error);
    return { error: 'Failed to validate customer credentials', status: 500 };
  }
}

async function readCustomerFromRequest(req) {
  const bearer = String(req.header('authorization') || '').trim();
  const tokenHeader = String(req.header('x-customer-token') || '').trim();
  const token = tokenHeader || (bearer.toLowerCase().startsWith('bearer ') ? bearer.slice(7).trim() : '');
  if (token) {
    const verified = verifyCustomerToken(token);
    if (verified.error) return verified;
    try {
      return await getActiveCustomerUserByIdAndUsername(verified.payload.sub, verified.payload.username);
    } catch (error) {
      console.error('Customer token auth failed', error);
      return { error: 'Failed to validate customer credentials', status: 500 };
    }
  }

  const username = String(req.header('x-customer-username') || '').trim();
  const password = String(req.header('x-customer-password') || '').trim();
  if (!username || !password) {
    return { error: 'Missing customer credentials', status: 401 };
  }
  return authenticateCustomerWithPassword(username, password);
}

function normalizeExpenseStatus(status) {
  const normalized = String(status || '').toUpperCase();
  return EXPENSE_STATUSES.includes(normalized) ? normalized : null;
}

const EXPENSE_TRANSITIONS = {
  DRAFT: ['ACCOUNTS_REVIEW'],
  SUBMITTED: ['ACCOUNTS_REVIEW'],
  ACCOUNTS_REVIEW: ['MANAGER_REVIEW', 'NEED_MORE_INFO', 'REJECTED'],
  MANAGER_REVIEW: ['ADMIN_REVIEW', 'NEED_MORE_INFO', 'REJECTED'],
  ADMIN_REVIEW: ['PAYMENT_PENDING', 'NEED_MORE_INFO', 'REJECTED'],
  NEED_MORE_INFO: ['ACCOUNTS_REVIEW', 'MANAGER_REVIEW', 'ADMIN_REVIEW'],
  PAYMENT_PENDING: ['PAYMENT_INITIATED'],
  PAYMENT_INITIATED: ['PAYMENT_COMPLETED'],
  PAYMENT_COMPLETED: [],
  REJECTED: []
};

function isValidExpenseTransition(fromStatus, toStatus) {
  const allowed = EXPENSE_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

function parseExpectedVersion(req) {
  const raw = req.body?.version;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function assertExpenseVersion(expectedVersion, currentVersion) {
  return expectedVersion !== null && Number(expectedVersion) === Number(currentVersion);
}

function canEditExpenseClaimByStatus(status) {
  return status === 'DRAFT' || status === 'NEED_MORE_INFO';
}

function getExpenseReviewStageFromStatus(status) {
  if (status === 'ACCOUNTS_REVIEW') return 'ACCOUNTS';
  if (status === 'MANAGER_REVIEW') return 'MANAGER';
  if (status === 'ADMIN_REVIEW') return 'ADMIN';
  return null;
}

function createExpenseToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    role: user.role,
    username: user.username,
    iat: now,
    exp: now + EXPENSE_TOKEN_TTL_SECONDS
  };
  const headerPart = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signaturePart = toBase64Url(
    crypto
      .createHmac('sha256', EXPENSE_TOKEN_SECRET)
      .update(`${headerPart}.${payloadPart}`)
      .digest()
  );
  return `${headerPart}.${payloadPart}.${signaturePart}`;
}

function createTransportToken(user, roles) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    username: user.username,
    full_name: user.full_name,
    roles: Array.isArray(roles) ? roles : [],
    iat: now,
    exp: now + TRANSPORT_TOKEN_TTL_SECONDS
  };
  const headerPart = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signaturePart = toBase64Url(
    crypto
      .createHmac('sha256', TRANSPORT_TOKEN_SECRET)
      .update(`${headerPart}.${payloadPart}`)
      .digest()
  );
  return `${headerPart}.${payloadPart}.${signaturePart}`;
}

function verifyTransportToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { error: 'Invalid transport token format', status: 401 };
  const [headerPart, payloadPart, signaturePart] = parts;
  const expectedSignature = toBase64Url(
    crypto
      .createHmac('sha256', TRANSPORT_TOKEN_SECRET)
      .update(`${headerPart}.${payloadPart}`)
      .digest()
  );
  if (signaturePart !== expectedSignature) {
    return { error: 'Invalid transport token signature', status: 401 };
  }
  try {
    const payload = JSON.parse(fromBase64Url(payloadPart).toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!payload || !payload.sub || !payload.username || !Array.isArray(payload.roles)) {
      return { error: 'Invalid transport token payload', status: 401 };
    }
    if (!payload.exp || payload.exp <= now) {
      return { error: 'Transport token expired', status: 401 };
    }
    return { payload };
  } catch (_err) {
    return { error: 'Invalid transport token payload', status: 401 };
  }
}

function verifyExpenseToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { error: 'Invalid expense token format', status: 401 };
  const [headerPart, payloadPart, signaturePart] = parts;
  const expectedSignature = toBase64Url(
    crypto
      .createHmac('sha256', EXPENSE_TOKEN_SECRET)
      .update(`${headerPart}.${payloadPart}`)
      .digest()
  );
  if (signaturePart !== expectedSignature) {
    return { error: 'Invalid expense token signature', status: 401 };
  }
  try {
    const payload = JSON.parse(fromBase64Url(payloadPart).toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!payload || !payload.sub || !payload.username || !payload.role) {
      return { error: 'Invalid expense token payload', status: 401 };
    }
    if (!payload.exp || payload.exp <= now) {
      return { error: 'Expense token expired', status: 401 };
    }
    return { payload };
  } catch (_err) {
    return { error: 'Invalid expense token payload', status: 401 };
  }
}

async function getActiveExpenseUserById(id) {
  const result = await pool.query(
    `SELECT id, employee_code, full_name, username, role, is_active
     FROM expense_users
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  if (!result.rows.length) {
    return { error: 'Expense user not found', status: 403 };
  }
  const user = result.rows[0];
  if (!user.is_active) {
    return { error: 'Expense user inactive', status: 403 };
  }
  return { user };
}

async function authenticateExpenseWithPassword(username, password) {
  const result = await pool.query(
    `SELECT id, employee_code, full_name, username, role, is_active, password
     FROM expense_users
     WHERE username = $1
     LIMIT 1`,
    [username]
  );
  if (!result.rows.length) {
    return { error: 'Invalid expense credentials', status: 403 };
  }
  const user = result.rows[0];
  if (!user.is_active) {
    return { error: 'Expense user inactive', status: 403 };
  }
  const storedPassword = String(user.password || '');
  const isHashed = /^\$2[abxy]\$\d{2}\$/.test(storedPassword);
  const matches = isHashed ? await bcrypt.compare(password, storedPassword) : storedPassword === password;
  if (!matches) {
    return { error: 'Invalid expense credentials', status: 403 };
  }
  if (!isHashed) {
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    await pool.query(`UPDATE expense_users SET password = $1, updated_at = NOW() WHERE id = $2`, [hash, user.id]);
  }
  return {
    user: {
      id: user.id,
      employee_code: user.employee_code,
      full_name: user.full_name,
      username: user.username,
      role: user.role
    }
  };
}

async function readExpenseUserFromRequest(req) {
  const bearer = String(req.header('authorization') || '').trim();
  const tokenHeader = String(req.header('x-expense-token') || '').trim();
  const token = tokenHeader || (bearer.toLowerCase().startsWith('bearer ') ? bearer.slice(7).trim() : '');
  if (token) {
    const verified = verifyExpenseToken(token);
    if (verified.error) return verified;
    const tokenHash = hashExpenseToken(token);
    const revoked = await pool.query(
      `SELECT id
       FROM expense_token_revocations
       WHERE token_hash = $1
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    if (revoked.rows.length) {
      return { error: 'Expense token revoked. Please login again.', status: 401 };
    }
    const fromDb = await getActiveExpenseUserById(verified.payload.sub);
    if (fromDb.error) return fromDb;
    if (fromDb.user.username !== verified.payload.username || fromDb.user.role !== verified.payload.role) {
      return { error: 'Expense user token mismatch', status: 401 };
    }
    return fromDb;
  }
  const username = String(req.header('x-expense-username') || '').trim();
  const password = String(req.header('x-expense-password') || '').trim();
  if (!username || !password) return { error: 'Missing expense credentials', status: 401 };
  return authenticateExpenseWithPassword(username, password);
}

function canExpenseRoleReview(role, status) {
  if (role === 'Accounts' && status === 'ACCOUNTS_REVIEW') return true;
  if (role === 'Manager' && status === 'MANAGER_REVIEW') return true;
  if (role === 'Admin' && status === 'ADMIN_REVIEW') return true;
  return false;
}

async function addExpenseHistory(client, {
  claimId, actionType, fromStatus = null, toStatus = null, actorUserId, actorRole, remarks = null, fieldChanges = {}
}) {
  const changes = fieldChanges && typeof fieldChanges === 'object' ? { ...fieldChanges } : {};
  await client.query(
    `INSERT INTO expense_claim_history (
      claim_id, action_type, from_status, to_status, actor_user_id, actor_role, remarks, field_changes_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [claimId, actionType, fromStatus, toStatus, actorUserId, actorRole, remarks, JSON.stringify(changes)]
  );
}

async function addExpenseNotification(client, {
  targetRole, targetUserId = null, eventType, claimId, title = null, message
}) {
  await client.query(
    `INSERT INTO expense_notifications(target_role, target_user_id, event_type, title, entity_id, message)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [targetRole, targetUserId, eventType, title, claimId, message]
  );
}

function canExpenseUserAccessClaim(user, claim) {
  if (!user || !claim) return false;
  if (user.role === 'Admin') return true;
  if (user.role === 'Employee') return claim.employee_id === user.id;
  if (user.role === 'Accounts') {
    if (['ACCOUNTS_REVIEW', 'PAYMENT_PENDING', 'PAYMENT_INITIATED', 'PAYMENT_COMPLETED'].includes(claim.status)) return true;
    if (Number(claim.accounts_reviewed_by) === Number(user.id) || Number(claim.payment_initiated_by) === Number(user.id) || Number(claim.payment_completed_by) === Number(user.id)) return true;
    return false;
  }
  if (user.role === 'Manager') {
    if (['MANAGER_REVIEW', 'ADMIN_REVIEW', 'PAYMENT_PENDING', 'PAYMENT_INITIATED', 'PAYMENT_COMPLETED', 'REJECTED'].includes(claim.status)) return true;
    if (Number(claim.manager_reviewed_by) === Number(user.id)) return true;
    return false;
  }
  return false;
}

function getRequestIp(req) {
  const forwarded = String(req.header('x-forwarded-for') || '').trim();
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

function isExpenseRoute(pathname) {
  return pathname.startsWith('/expense') || pathname.startsWith('/expenses');
}

function getPagination(req, defaults = { page: 1, limit: 25 }, maxLimit = 100) {
  const rawPage = Number.parseInt(String(req.query.page || defaults.page), 10);
  const rawLimit = Number.parseInt(String(req.query.limit || defaults.limit), 10);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : defaults.page;
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaults.limit;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function getPaginationMeta({ page, limit, total }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  };
}

function hashExpenseToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function hashNonce(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function safeCsvValue(value) {
  if (value === null || value === undefined) return '';
  let raw = String(value);
  if (/^[=+\-@]/.test(raw)) raw = `'${raw}`;
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function buildTripFieldChanges(before, after, fields) {
  const changes = {};
  fields.forEach((field) => {
    const beforeValue = before?.[field];
    const afterValue = after?.[field];
    if (valuesEqual(field, beforeValue, afterValue)) return;
    changes[field] = { old: beforeValue ?? null, new: afterValue ?? null };
  });
  return changes;
}

async function recordExpenseLoginAttempt({ username, ipAddress, success, failureReason = null, userAgent = null }) {
  try {
    await pool.query(
      `INSERT INTO expense_login_attempts(username, ip_address, success, failure_reason, user_agent)
       VALUES ($1,$2,$3,$4,$5)`,
      [normalizeEmpty(username), normalizeEmpty(ipAddress), success, normalizeEmpty(failureReason), normalizeEmpty(userAgent)]
    );
  } catch (error) {
    console.error('Failed to log expense login attempt', error);
  }
}

async function checkExpenseLoginLock(username, ipAddress) {
  const result = await pool.query(
    `SELECT created_at
     FROM expense_login_attempts
     WHERE username = $1
       AND ip_address = $2
       AND success = false
       AND created_at >= NOW() - ($3::text || ' minutes')::interval
     ORDER BY created_at DESC`,
    [username, ipAddress, String(EXPENSE_LOGIN_WINDOW_MINUTES)]
  );
  if (result.rows.length < EXPENSE_LOGIN_MAX_ATTEMPTS) return { locked: false };
  const latest = new Date(result.rows[0].created_at);
  const lockUntil = new Date(latest.getTime() + (EXPENSE_LOGIN_LOCK_MINUTES * 60 * 1000));
  if (Date.now() >= lockUntil.getTime()) return { locked: false };
  return { locked: true, lockUntil };
}

async function migratePlainExpensePasswords() {
  const rows = await pool.query(`SELECT id, password FROM expense_users`);
  for (const row of rows.rows) {
    const stored = String(row.password || '');
    const isHashed = /^\$2[abxy]\$\d{2}\$/.test(stored);
    if (isHashed) continue;
    const hash = await bcrypt.hash(stored, BCRYPT_COST);
    await pool.query(`UPDATE expense_users SET password = $1, updated_at = NOW() WHERE id = $2`, [hash, row.id]);
  }
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function getExpenseAccessWhereSql(user, alias = 'ec', startIndex = 1) {
  const params = [];
  if (user.role === 'Admin') return { where: '1=1', params, nextIndex: startIndex };
  if (user.role === 'Employee') {
    params.push(user.id);
    return { where: `${alias}.employee_id = $${startIndex}`, params, nextIndex: startIndex + 1 };
  }
  if (user.role === 'Accounts') {
    params.push(user.id);
    return {
      where: `(
        ${alias}.status IN ('ACCOUNTS_REVIEW', 'PAYMENT_PENDING', 'PAYMENT_INITIATED', 'PAYMENT_COMPLETED')
        OR ${alias}.accounts_reviewed_by = $${startIndex}
        OR ${alias}.payment_initiated_by = $${startIndex}
        OR ${alias}.payment_completed_by = $${startIndex}
      )`,
      params,
      nextIndex: startIndex + 1
    };
  }
  if (user.role === 'Manager') {
    params.push(user.id);
    return {
      where: `(
        ${alias}.status IN ('MANAGER_REVIEW', 'ADMIN_REVIEW', 'PAYMENT_PENDING', 'PAYMENT_INITIATED', 'PAYMENT_COMPLETED', 'REJECTED')
        OR ${alias}.manager_reviewed_by = $${startIndex}
      )`,
      params,
      nextIndex: startIndex + 1
    };
  }
  return { where: '1=0', params, nextIndex: startIndex };
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

function parseCustomerUserId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function canRoleActOnTask(role, task) {
  if (role === 'Admin') return true;
  return role === task.team;
}

async function logTaskActivity(client, {
  taskId,
  actionType,
  fromValue = null,
  toValue = null,
  note = null,
  actorRole,
  actorName = null
}) {
  await client.query(
    `INSERT INTO task_activity (task_id, action_type, from_value, to_value, note, actor_role, actor_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [taskId, actionType, fromValue, toValue, note, actorRole, actorName]
  );
}

async function createTaskNotification(client, {
  taskId,
  targetRole,
  eventType,
  eventMessage = null
}) {
  if (!TASK_TEAMS.includes(targetRole)) return;
  await client.query(
    `INSERT INTO task_notifications (task_id, target_role, event_type, event_message, is_read, created_at)
     VALUES ($1, $2, $3, $4, false, NOW())`,
    [taskId, targetRole, eventType, eventMessage]
  );
}

async function getTaskById(taskId) {
  const result = await pool.query(
    `SELECT
      id, title, description, team, assignee_user_id, assignee_name_snapshot,
      status, eta, created_by_role, created_by_name, created_at, updated_at,
      done_at, done_by_role, done_by_name
     FROM tasks
     WHERE id = $1
     LIMIT 1`,
    [taskId]
  );
  return result.rows[0] || null;
}

async function getTaskComments(taskId) {
  const result = await pool.query(
    `SELECT
      id, task_id, comment_text, attachment_name, attachment_mime_type, attachment_size,
      created_by_role, created_by_name, created_at
     FROM task_comments
     WHERE task_id = $1
     ORDER BY created_at ASC, id ASC`,
    [taskId]
  );
  return result.rows;
}

async function getTaskActivity(taskId) {
  const result = await pool.query(
    `SELECT
      id, task_id, action_type, from_value, to_value, note, actor_role, actor_name, created_at
     FROM task_activity
     WHERE task_id = $1
     ORDER BY created_at ASC, id ASC`,
    [taskId]
  );
  return result.rows;
}

async function getTaskAssigneeSuggestions() {
  const fromTrips = await pool.query(
    `SELECT DISTINCT name FROM (
      SELECT dispatch_manager_name AS name FROM trips
      UNION
      SELECT loading_person_name AS name FROM trips
      UNION
      SELECT weight_operator_name AS name FROM trips
      UNION
      SELECT accounts_person_name AS name FROM trips
      UNION
      SELECT dispatch_done_by AS name FROM trips
      UNION
      SELECT tare_done_by AS name FROM trips
      UNION
      SELECT gross_done_by AS name FROM trips
      UNION
      SELECT loading_done_by AS name FROM trips
      UNION
      SELECT billing_done_by AS name FROM trips
    ) x
    WHERE name IS NOT NULL AND TRIM(name) <> ''`
  );

  const seeded = [
    { team: 'Gate', name: 'X' },
    { team: 'Gate', name: 'Y' },
    { team: 'Gate', name: 'Z' },
    { team: 'Dispatch', name: 'Jitendra Yadav' },
    { team: 'Loading', name: 'Rajesh Kumar' },
    { team: 'Loading', name: 'Jai Bhagwan' },
    { team: 'Weighbridge', name: 'Anil Sharma' },
    { team: 'Weighbridge', name: 'Ajay' },
    { team: 'Accounts', name: 'Ashutosh' }
  ];

  const unique = new Set();
  const merged = [];
  seeded.forEach((row) => {
    const key = `${row.team}|${row.name}`.toLowerCase();
    if (unique.has(key)) return;
    unique.add(key);
    merged.push(row);
  });
  fromTrips.rows.forEach((row) => {
    const clean = String(row.name || '').trim();
    if (!clean) return;
    const key = `any|${clean}`.toLowerCase();
    if (unique.has(key)) return;
    unique.add(key);
    merged.push({ team: null, name: clean });
  });
  return merged.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function loadExpectedTrucksForCustomerUser(customerUserId) {
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
    [customerUserId]
  );
  return result.rows.map((row) => ({
    ...row,
    current_status: getExpectedTruckCurrentStatus(row)
  }));
}

async function loadCustomerDashboardSummary(customerUserId, customerNameFilter) {
  const result = await pool.query(
    `SELECT
      t.id, t.truck_number, t.status, t.final_status, t.is_cancelled, t.net_weight, t.in_time, t.out_time,
      et.customer_name
     FROM expected_trucks et
     JOIN trips t ON t.id = et.linked_trip_id
     WHERE et.submitted_by_user_id = $1
     ${customerNameFilter ? 'AND et.customer_name = $2' : ''}
     ORDER BY t.updated_at DESC, t.id DESC`,
    customerNameFilter ? [customerUserId, customerNameFilter] : [customerUserId]
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

  return {
    summary,
    records: rows
  };
}

async function loadCustomerTripTimeline(tripId, customerUserId) {
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
    [tripId, customerUserId]
  );
  return result.rows[0] || null;
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

function roundTo3(value) {
  const numeric = toFiniteNumberOrNull(value);
  if (numeric === null) return null;
  return Number(numeric.toFixed(3));
}

async function resolveBillingDefaultsByGrade(grade) {
  const safeGrade = String(grade || '').trim();
  let ratePerMt = null;
  let gstPercent = null;

  if (safeGrade) {
    const gradeRate = await pool.query(
      `SELECT metadata_json
       FROM admin_master_values
       WHERE master_type = 'grades' AND is_active = true AND lower(value) = lower($1)
       LIMIT 1`,
      [safeGrade]
    );
    ratePerMt = toFiniteNumberOrNull(gradeRate.rows[0]?.metadata_json?.price_per_mt);
  }

  const pricingDefaults = await pool.query(
    `SELECT value_json
     FROM admin_settings
     WHERE key = 'pricing_defaults'
     LIMIT 1`
  );
  gstPercent = toFiniteNumberOrNull(pricingDefaults.rows[0]?.value_json?.default_gst_percent);
  return { ratePerMt, gstPercent };
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

app.get('/accounts-analytics', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'accounts-analytics.html'));
});

app.get('/expected-trucks-page', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'expected-trucks.html'));
});
app.get('/admin-control', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-control.html'));
});

app.get('/customer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer.html'));
});

app.get('/expense', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'expense.html'));
});

app.get('/expense-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'expense-dashboard.html'));
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

app.get('/accounts/sales-analytics', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!['Accounts', 'Admin', 'Manager'].includes(auth.role)) {
    return res.status(403).json({ error: 'Role cannot access sales analytics' });
  }

  const fromDate = normalizeEmpty(req.query.from_date);
  const toDate = normalizeEmpty(req.query.to_date);
  const customer = normalizeEmpty(req.query.customer);
  const grade = normalizeEmpty(req.query.grade);
  const material = normalizeEmpty(req.query.material);
  const statusScope = normalizeEmpty(req.query.status_scope) || 'BILLED_ONLY';

  let statuses = ['BILLING_COMPLETED'];
  if (statusScope === 'COMPLETED_EXITED') statuses = ['COMPLETED', 'EXITED'];
  if (statusScope === 'ALL_BILLED') statuses = ['BILLING_COMPLETED', 'COMPLETED', 'EXITED'];

  const conditions = [
    `status = ANY($1::text[])`,
    `COALESCE(total_amount, 0) >= 0`,
    `COALESCE(net_weight_snapshot_mt, net_weight, 0) >= 0`
  ];
  const params = [statuses];

  if (fromDate) {
    params.push(fromDate);
    conditions.push(`(COALESCE(billing_calculated_at, out_time, updated_at) AT TIME ZONE 'Asia/Kolkata')::date >= $${params.length}::date`);
  }
  if (toDate) {
    params.push(toDate);
    conditions.push(`(COALESCE(billing_calculated_at, out_time, updated_at) AT TIME ZONE 'Asia/Kolkata')::date <= $${params.length}::date`);
  }
  if (customer) {
    params.push(customer);
    conditions.push(`lower(customer_name) = lower($${params.length})`);
  }
  if (grade) {
    params.push(grade);
    conditions.push(`lower(grade) = lower($${params.length})`);
  }
  if (material) {
    params.push(material);
    conditions.push(`lower(material_type) = lower($${params.length})`);
  }

  const baseSql = `
    WITH filtered AS (
      SELECT
        id,
        customer_name,
        grade,
        material_type,
        COALESCE(net_weight_snapshot_mt, net_weight, 0)::numeric AS qty_mt,
        COALESCE(rate_used_per_mt, 0)::numeric AS rate_used_per_mt,
        COALESCE(gst_percent_used, 0)::numeric AS gst_percent_used,
        COALESCE(taxable_amount, 0)::numeric AS taxable_amount,
        COALESCE(gst_amount, 0)::numeric AS gst_amount,
        COALESCE(total_amount, 0)::numeric AS total_amount,
        status,
        COALESCE(billing_calculated_at, out_time, updated_at) AS metric_ts
      FROM trips
      WHERE ${conditions.join(' AND ')}
    )
    SELECT * FROM filtered
  `;

  try {
    const filtered = await pool.query(baseSql, params);
    const rows = filtered.rows;

    const toNum = (v) => Number(v || 0);
    const summary = rows.reduce((acc, row) => {
      acc.total_trips += 1;
      acc.total_qty_mt += toNum(row.qty_mt);
      acc.total_taxable_amount += toNum(row.taxable_amount);
      acc.total_gst_amount += toNum(row.gst_amount);
      acc.total_sales_amount += toNum(row.total_amount);
      return acc;
    }, { total_trips: 0, total_qty_mt: 0, total_taxable_amount: 0, total_gst_amount: 0, total_sales_amount: 0 });
    summary.avg_realization_per_mt = summary.total_qty_mt > 0
      ? Number((summary.total_sales_amount / summary.total_qty_mt).toFixed(2))
      : 0;

    const aggregateBy = (key) => {
      const map = new Map();
      rows.forEach((row) => {
        const name = String(row[key] || 'Unspecified');
        const current = map.get(name) || { key: name, qty_mt: 0, total_amount: 0, trips: 0 };
        current.qty_mt += toNum(row.qty_mt);
        current.total_amount += toNum(row.total_amount);
        current.trips += 1;
        map.set(name, current);
      });
      return Array.from(map.values())
        .map((item) => ({
          ...item,
          qty_mt: Number(item.qty_mt.toFixed(3)),
          total_amount: Number(item.total_amount.toFixed(2)),
          avg_rate_per_mt: item.qty_mt > 0 ? Number((item.total_amount / item.qty_mt).toFixed(2)) : 0
        }))
        .sort((a, b) => b.total_amount - a.total_amount);
    };

    const gradeWise = aggregateBy('grade');
    const customerWise = aggregateBy('customer_name');
    const materialWise = aggregateBy('material_type');

    const trendMap = new Map();
    rows.forEach((row) => {
      const d = new Date(row.metric_ts);
      const key = Number.isNaN(d.getTime()) ? 'Unknown' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
      const current = trendMap.get(key) || { date: key, qty_mt: 0, total_amount: 0, trips: 0 };
      current.qty_mt += toNum(row.qty_mt);
      current.total_amount += toNum(row.total_amount);
      current.trips += 1;
      trendMap.set(key, current);
    });
    const trend = Array.from(trendMap.values())
      .map((item) => ({
        ...item,
        qty_mt: Number(item.qty_mt.toFixed(3)),
        total_amount: Number(item.total_amount.toFixed(2))
      }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    return res.json({
      scope: { status_scope: statusScope, statuses },
      filters: { from_date: fromDate, to_date: toDate, customer, grade, material },
      summary: {
        ...summary,
        total_qty_mt: Number(summary.total_qty_mt.toFixed(3)),
        total_taxable_amount: Number(summary.total_taxable_amount.toFixed(2)),
        total_gst_amount: Number(summary.total_gst_amount.toFixed(2)),
        total_sales_amount: Number(summary.total_sales_amount.toFixed(2))
      },
      trend,
      grade_wise: gradeWise,
      customer_wise: customerWise,
      material_wise: materialWise
    });
  } catch (error) {
    console.error('Failed to load sales analytics', error);
    return res.status(500).json({ error: 'Failed to load sales analytics' });
  }
});

app.put('/trip/:id', async (req, res) => {
  const { id } = req.params;
  const auth = readRoleFromRequest(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const expectedVersion = parsePositiveId(req.body?.version);
  if (!expectedVersion) {
    return res.status(400).json({ error: 'version is required for update' });
  }
  delete req.body.version;

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
    'rate_used_per_mt',
    'gst_percent_used',
    'taxable_amount',
    'gst_amount',
    'total_amount',
    'net_weight_snapshot_mt',
    'billing_calculated_at',
    'billing_calculated_by',
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

  if (isStatusChange && requestedStatus === 'BILLING_COMPLETED') {
    const effectiveNetWeight = toFiniteNumberOrNull(req.body.net_weight ?? existingTrip.net_weight);
    if (effectiveNetWeight === null || effectiveNetWeight <= 0) {
      return res.status(400).json({ error: 'Cannot complete billing without valid net weight' });
    }

    const defaults = await resolveBillingDefaultsByGrade(req.body.grade ?? existingTrip.grade);
    const resolvedRate = toFiniteNumberOrNull(req.body.rate_used_per_mt ?? existingTrip.rate_used_per_mt ?? defaults.ratePerMt);
    const resolvedGst = toFiniteNumberOrNull(req.body.gst_percent_used ?? existingTrip.gst_percent_used ?? defaults.gstPercent);
    const safeRate = resolvedRate !== null && resolvedRate >= 0 ? resolvedRate : 0;
    const safeGst = resolvedGst !== null && resolvedGst >= 0 ? resolvedGst : 0;
    const taxable = roundTo3(effectiveNetWeight * safeRate) || 0;
    const gstAmount = roundTo3((taxable * safeGst) / 100) || 0;
    const totalAmount = roundTo3(taxable + gstAmount) || 0;
    const accountsName = normalizeEmpty(req.body.accounts_person_name ?? existingTrip.accounts_person_name);

    req.body.rate_used_per_mt = roundTo3(safeRate) || 0;
    req.body.gst_percent_used = roundTo3(safeGst) || 0;
    req.body.taxable_amount = taxable;
    req.body.gst_amount = gstAmount;
    req.body.total_amount = totalAmount;
    req.body.net_weight_snapshot_mt = roundTo3(effectiveNetWeight) || 0;
    req.body.billing_calculated_at = new Date().toISOString();
    req.body.billing_calculated_by = accountsName || auth.role;
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
    'version = version + 1',
    'updated_at = NOW()'
  ].join(', ');
  const values = providedFields.map((field) => (
    (field === 'status_history' || field === 'gross_weight_attempts')
      ? JSON.stringify(req.body[field])
      : req.body[field]
  ));

  if (Number(existingTrip.version) !== Number(expectedVersion)) {
    return res.status(409).json({ error: 'This trip was updated by another user. Please refresh.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updateQuery = `UPDATE trips SET ${setClause} WHERE id = $${providedFields.length + 1} AND version = $${providedFields.length + 2} RETURNING *`;
    const result = await client.query(
      updateQuery,
      [...values, id, expectedVersion]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This trip was updated by another user. Please refresh.' });
    }

    const updated = result.rows[0];
    const fieldChanges = buildTripFieldChanges(existingTrip, updated, providedFields);
    await client.query(
      `INSERT INTO trip_events (
        trip_id, actor_role, actor_name, event_type, from_status, to_status, request_id, remarks, field_changes_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        Number(id),
        auth.role,
        null,
        isStatusChange ? 'STATUS_CHANGE' : 'DATA_UPDATE',
        currentStatus,
        normalizeStatus(updated.status),
        req.requestId || null,
        null,
        JSON.stringify(fieldChanges)
      ]
    );

    await client.query('COMMIT');
    res.json(updated);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_err) {}
    console.error('Error updating trip', error);
    res.status(500).json({ error: 'Failed to update trip' });
  } finally {
    client.release();
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
    const absolutePath = resolveStoredFilePath(doc.storage_path);
    if (!absolutePath) {
      return res.status(404).json({ error: 'Document file missing' });
    }

    return sendFileInline(res, absolutePath, doc.file_name, doc.mime_type || null);
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
    const absolutePath = resolveStoredFilePath(doc.storage_path);
    if (!absolutePath) {
      return res.status(404).json({ error: 'Document file missing' });
    }
    return sendFileInline(res, absolutePath, doc.file_name);
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
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const result = await pool.query(
      `INSERT INTO customer_users (customer_name, username, password, display_name, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, customer_name, username, display_name, is_active, created_at`,
      [customerName, username, passwordHash, displayName]
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

app.get('/tasks/assignees', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const suggestions = await getTaskAssigneeSuggestions();
    return res.json(suggestions);
  } catch (error) {
    console.error('Failed to load task assignee suggestions', error);
    return res.status(500).json({ error: 'Failed to load assignee suggestions' });
  }
});

app.get('/assignees/by-role', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const result = await pool.query(
      `SELECT u.full_name, ur.role_name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.is_active = true
         AND ur.is_active = true
         AND ur.role_name = ANY($1::text[])
         AND u.full_name IS NOT NULL
         AND length(trim(u.full_name)) > 0
       ORDER BY ur.role_name, u.full_name`,
      [['Gate', 'Dispatch', 'Loading', 'Weighbridge', 'Accounts', 'Manager', 'Admin']]
    );
    const byRole = {
      Gate: [],
      Dispatch: [],
      Loading: [],
      Weighbridge: [],
      Accounts: [],
      Manager: [],
      Admin: []
    };
    result.rows.forEach((row) => {
      const roleName = String(row.role_name || '').trim();
      const fullName = String(row.full_name || '').trim();
      if (!roleName || !fullName || !byRole[roleName]) return;
      if (!byRole[roleName].includes(fullName)) byRole[roleName].push(fullName);
    });
    return res.json(byRole);
  } catch (error) {
    console.error('Failed to load assignees by role', error);
    return res.status(500).json({ error: 'Failed to load assignees by role' });
  }
});

app.post('/tasks', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can create tasks' });

  const title = normalizeEmpty(req.body.title);
  const description = normalizeEmpty(req.body.description);
  const team = normalizeTaskTeam(req.body.team);
  const assigneeName = normalizeEmpty(req.body.assignee_name);
  const eta = normalizeEmpty(req.body.eta);
  const assigneeUserId = parsePositiveId(req.body.assignee_user_id);
  const initialComment = normalizeEmpty(req.body.comment);

  if (!title || !description || !team || !assigneeName || !eta) {
    return res.status(400).json({ error: 'title, description, team, assignee_name and eta are required' });
  }
  const etaDate = new Date(eta);
  if (Number.isNaN(etaDate.getTime())) {
    return res.status(400).json({ error: 'Invalid eta' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO tasks (
        title, description, team, assignee_user_id, assignee_name_snapshot, status, eta,
        created_by_role, created_by_name, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, 'OPEN', $6,
        $7, $8, NOW(), NOW()
      )
      RETURNING id, title, description, team, assignee_user_id, assignee_name_snapshot, status, eta, created_by_role, created_by_name, created_at, updated_at`,
      [title, description, team, assigneeUserId, assigneeName, etaDate.toISOString(), auth.role, 'Admin']
    );
    const task = inserted.rows[0];

    await logTaskActivity(client, {
      taskId: task.id,
      actionType: 'CREATE',
      toValue: `team:${team}|assignee:${assigneeName}|eta:${task.eta}`,
      actorRole: auth.role,
      actorName: 'Admin'
    });

    if (initialComment) {
      await client.query(
        `INSERT INTO task_comments (task_id, comment_text, created_by_role, created_by_name, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [task.id, initialComment, auth.role, 'Admin']
      );
      await logTaskActivity(client, {
        taskId: task.id,
        actionType: 'COMMENT',
        note: initialComment,
        actorRole: auth.role,
        actorName: 'Admin'
      });
    }

    await createTaskNotification(client, {
      taskId: task.id,
      targetRole: team,
      eventType: 'TASK_ASSIGNED',
      eventMessage: `Task #${task.id} assigned to ${team}`
    });

    await client.query('COMMIT');
    return res.status(201).json(task);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to create task', error);
    return res.status(500).json({ error: 'Failed to create task' });
  } finally {
    client.release();
  }
});

app.get('/tasks', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const statusFilter = normalizeTaskStatus(req.query.status);
  const teamFilter = normalizeTaskTeam(req.query.team);
  const filters = [];
  const values = [];
  if (req.query.status) {
    if (!statusFilter) return res.status(400).json({ error: 'Invalid status filter' });
    values.push(statusFilter);
    filters.push(`t.status = $${values.length}`);
  }
  if (req.query.team) {
    if (!teamFilter) return res.status(400).json({ error: 'Invalid team filter' });
    values.push(teamFilter);
    filters.push(`t.team = $${values.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  try {
    const result = await pool.query(
      `SELECT
        t.id, t.title, t.description, t.team, t.assignee_user_id, t.assignee_name_snapshot,
        t.status, t.eta, t.created_by_role, t.created_by_name, t.created_at, t.updated_at,
        t.done_at, t.done_by_role, t.done_by_name
       FROM tasks t
       ${where}
       ORDER BY
         CASE WHEN t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') THEN 0 ELSE 1 END ASC,
         t.eta ASC,
         t.id DESC`,
      values
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Failed to load tasks', error);
    return res.status(500).json({ error: 'Failed to load tasks' });
  }
});

app.get('/tasks/:id', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const taskId = parsePositiveId(req.params.id);
  if (!taskId) return res.status(400).json({ error: 'Invalid task id' });
  try {
    const task = await getTaskById(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const [comments, activity] = await Promise.all([
      getTaskComments(taskId),
      getTaskActivity(taskId)
    ]);
    return res.json({ task, comments, activity });
  } catch (error) {
    console.error('Failed to load task details', error);
    return res.status(500).json({ error: 'Failed to load task details' });
  }
});

app.put('/tasks/:id/status', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const taskId = parsePositiveId(req.params.id);
  const nextStatus = normalizeTaskStatus(req.body.status);
  const note = normalizeEmpty(req.body.note);
  if (!taskId || !nextStatus) return res.status(400).json({ error: 'Valid task id and status are required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingResult = await client.query(
      `SELECT id, team, assignee_name_snapshot, status
       FROM tasks
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [taskId]
    );
    if (!existingResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found' });
    }
    const task = existingResult.rows[0];
    if (!canRoleActOnTask(auth.role, task)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only Admin or assigned team can update this task' });
    }
    if (task.status === 'CANCELLED' && auth.role !== 'Admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only Admin can change status of a cancelled task' });
    }
    const updateResult = await client.query(
      `UPDATE tasks
       SET status = $1,
           updated_at = NOW(),
           done_at = CASE WHEN $1 = 'DONE' THEN NOW() ELSE NULL END,
           done_by_role = CASE WHEN $1 = 'DONE' THEN $2 ELSE NULL END,
           done_by_name = CASE WHEN $1 = 'DONE' THEN $3 ELSE NULL END
       WHERE id = $4
       RETURNING id, title, description, team, assignee_user_id, assignee_name_snapshot, status, eta, created_by_role, created_by_name, created_at, updated_at, done_at, done_by_role, done_by_name`,
      [nextStatus, auth.role, auth.role, taskId]
    );
    const updatedTask = updateResult.rows[0];

    await logTaskActivity(client, {
      taskId,
      actionType: 'STATUS_CHANGE',
      fromValue: task.status,
      toValue: nextStatus,
      note,
      actorRole: auth.role,
      actorName: auth.role
    });

    if (nextStatus === 'DONE') {
      await createTaskNotification(client, {
        taskId,
        targetRole: 'Admin',
        eventType: 'TASK_DONE',
        eventMessage: `Task #${taskId} marked DONE by ${auth.role}`
      });
    } else {
      await createTaskNotification(client, {
        taskId,
        targetRole: 'Admin',
        eventType: 'TASK_STATUS_UPDATED',
        eventMessage: `Task #${taskId} status changed to ${nextStatus}`
      });
    }

    await client.query('COMMIT');
    return res.json(updatedTask);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to update task status', error);
    return res.status(500).json({ error: 'Failed to update task status' });
  } finally {
    client.release();
  }
});

app.put('/tasks/:id/reassign', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const taskId = parsePositiveId(req.params.id);
  const nextTeam = normalizeTaskTeam(req.body.team);
  const nextAssignee = normalizeEmpty(req.body.assignee_name);
  const nextAssigneeUserId = parsePositiveId(req.body.assignee_user_id);
  if (!taskId || !nextTeam || !nextAssignee) {
    return res.status(400).json({ error: 'task id, team and assignee_name are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingResult = await client.query(
      `SELECT id, team, assignee_name_snapshot, status
       FROM tasks
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [taskId]
    );
    if (!existingResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found' });
    }
    const task = existingResult.rows[0];
    if (!canRoleActOnTask(auth.role, task)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only Admin or assigned team can reassign this task' });
    }
    if (task.status === 'CANCELLED' && auth.role !== 'Admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only Admin can modify a cancelled task' });
    }

    const nextStatus = ['DONE', 'CANCELLED'].includes(task.status) ? 'OPEN' : task.status;
    const updateResult = await client.query(
      `UPDATE tasks
       SET team = $1,
           assignee_user_id = $2,
           assignee_name_snapshot = $3,
           status = $4,
           updated_at = NOW(),
           done_at = CASE WHEN $4 = 'DONE' THEN done_at ELSE NULL END,
           done_by_role = CASE WHEN $4 = 'DONE' THEN done_by_role ELSE NULL END,
           done_by_name = CASE WHEN $4 = 'DONE' THEN done_by_name ELSE NULL END
       WHERE id = $5
       RETURNING id, title, description, team, assignee_user_id, assignee_name_snapshot, status, eta, created_by_role, created_by_name, created_at, updated_at, done_at, done_by_role, done_by_name`,
      [nextTeam, nextAssigneeUserId, nextAssignee, nextStatus, taskId]
    );
    const updatedTask = updateResult.rows[0];

    await logTaskActivity(client, {
      taskId,
      actionType: 'REASSIGN',
      fromValue: `team:${task.team}|assignee:${task.assignee_name_snapshot}`,
      toValue: `team:${nextTeam}|assignee:${nextAssignee}`,
      actorRole: auth.role,
      actorName: auth.role
    });

    await createTaskNotification(client, {
      taskId,
      targetRole: nextTeam,
      eventType: 'TASK_REASSIGNED',
      eventMessage: `Task #${taskId} reassigned to ${nextTeam}`
    });
    await createTaskNotification(client, {
      taskId,
      targetRole: 'Admin',
      eventType: 'TASK_REASSIGNED',
      eventMessage: `Task #${taskId} reassigned to ${nextTeam} by ${auth.role}`
    });

    await client.query('COMMIT');
    return res.json(updatedTask);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to reassign task', error);
    return res.status(500).json({ error: 'Failed to reassign task' });
  } finally {
    client.release();
  }
});

app.post('/tasks/:id/comments', (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const taskId = parsePositiveId(req.params.id);
  if (!taskId) return res.status(400).json({ error: 'Invalid task id' });

  uploadTaskCommentAttachment.single('attachment')(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ error: uploadError.message || 'Failed to upload attachment' });
    }

    const commentText = normalizeEmpty(req.body.comment || req.body.comment_text);
    const file = req.file || null;
    if (!commentText && !file) {
      return res.status(400).json({ error: 'comment or attachment is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const taskResult = await client.query(
        `SELECT id, team FROM tasks WHERE id = $1 LIMIT 1 FOR UPDATE`,
        [taskId]
      );
      if (!taskResult.rows.length) {
        await client.query('ROLLBACK');
        if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(404).json({ error: 'Task not found' });
      }

      const inserted = await client.query(
        `INSERT INTO task_comments (
          task_id, comment_text, attachment_name, attachment_mime_type, attachment_size, attachment_path,
          created_by_role, created_by_name, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, NOW()
        )
        RETURNING id, task_id, comment_text, attachment_name, attachment_mime_type, attachment_size, created_by_role, created_by_name, created_at`,
        [
          taskId,
          commentText,
          file?.originalname || null,
          file?.mimetype || null,
          file?.size || null,
          file?.path || null,
          auth.role,
          auth.role
        ]
      );
      const comment = inserted.rows[0];

      await logTaskActivity(client, {
        taskId,
        actionType: file ? 'COMMENT_UPLOAD' : 'COMMENT',
        note: commentText || file?.originalname || 'Attachment added',
        actorRole: auth.role,
        actorName: auth.role
      });

      const targetTeam = taskResult.rows[0].team;
      await createTaskNotification(client, {
        taskId,
        targetRole: targetTeam,
        eventType: 'TASK_COMMENT',
        eventMessage: `New comment on task #${taskId}`
      });
      await createTaskNotification(client, {
        taskId,
        targetRole: 'Admin',
        eventType: 'TASK_COMMENT',
        eventMessage: `New comment on task #${taskId} by ${auth.role}`
      });

      await client.query('COMMIT');
      return res.status(201).json(comment);
    } catch (error) {
      await client.query('ROLLBACK');
      if (file?.path && fs.existsSync(file.path)) {
        try { fs.unlinkSync(file.path); } catch (_error) {}
      }
      console.error('Failed to add task comment', error);
      return res.status(500).json({ error: 'Failed to add task comment' });
    } finally {
      client.release();
    }
  });
});

app.get('/tasks/comments/:id/download', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const commentId = parsePositiveId(req.params.id);
  if (!commentId) return res.status(400).json({ error: 'Invalid comment id' });
  try {
    const result = await pool.query(
      `SELECT id, attachment_name, attachment_path
       FROM task_comments
       WHERE id = $1
       LIMIT 1`,
      [commentId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Attachment not found' });
    const comment = result.rows[0];
    if (!comment.attachment_path) return res.status(404).json({ error: 'No attachment for this comment' });
    const absolutePath = resolveStoredFilePath(comment.attachment_path);
    if (!absolutePath) {
      return res.status(404).json({ error: 'Attachment file missing' });
    }
    return sendFileInline(res, absolutePath, comment.attachment_name || 'attachment');
  } catch (error) {
    console.error('Failed to download task comment attachment', error);
    return res.status(500).json({ error: 'Failed to download attachment' });
  }
});

app.get('/task-notifications', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const [rowsResult, unreadResult] = await Promise.all([
      pool.query(
        `SELECT id, task_id, target_role, event_type, event_message, is_read, created_at, read_at
         FROM task_notifications
         WHERE target_role = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 50`,
        [auth.role]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS unread_count
         FROM task_notifications
         WHERE target_role = $1 AND is_read = false`,
        [auth.role]
      )
    ]);
    return res.json({
      unread_count: unreadResult.rows[0]?.unread_count || 0,
      rows: rowsResult.rows
    });
  } catch (error) {
    console.error('Failed to load task notifications', error);
    return res.status(500).json({ error: 'Failed to load task notifications' });
  }
});

app.post('/task-notifications/mark-read', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const notificationIds = Array.isArray(req.body.notification_ids) ? req.body.notification_ids : [];
  try {
    if (!notificationIds.length) {
      await pool.query(
        `UPDATE task_notifications
         SET is_read = true, read_at = NOW()
         WHERE target_role = $1 AND is_read = false`,
        [auth.role]
      );
      return res.json({ ok: true });
    }
    const cleaned = notificationIds.map((id) => parsePositiveId(id)).filter(Boolean);
    if (!cleaned.length) return res.status(400).json({ error: 'No valid notification ids' });
    await pool.query(
      `UPDATE task_notifications
       SET is_read = true, read_at = NOW()
       WHERE target_role = $1 AND id = ANY($2::int[])`,
      [auth.role, cleaned]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Failed to mark task notifications as read', error);
    return res.status(500).json({ error: 'Failed to update notifications' });
  }
});

app.get('/admin/customer-portal/customers', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view customer portal customers' });
  try {
    const result = await pool.query(
      `SELECT id, customer_name, username, display_name, is_active
       FROM customer_users
       WHERE is_active = true
       ORDER BY customer_name ASC, username ASC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Failed to load admin customer portal customer list', error);
    return res.status(500).json({ error: 'Failed to load customers' });
  }
});

app.get('/admin/customer-portal/expected-trucks', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view customer portal data' });

  const customerUserId = parseCustomerUserId(req.query.customer_user_id);
  if (!customerUserId) {
    return res.status(400).json({ error: 'customer_user_id is required' });
  }

  try {
    const rows = await loadExpectedTrucksForCustomerUser(customerUserId);
    return res.json(rows);
  } catch (error) {
    console.error('Failed to load expected trucks for admin customer portal', error);
    return res.status(500).json({ error: 'Failed to load expected trucks' });
  }
});

app.get('/admin/customer-portal/dashboard-summary', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view customer portal summary' });

  const customerUserId = parseCustomerUserId(req.query.customer_user_id);
  if (!customerUserId) {
    return res.status(400).json({ error: 'customer_user_id is required' });
  }

  const customerNameFilter = normalizeEmpty(req.query.customer_name);
  try {
    const data = await loadCustomerDashboardSummary(customerUserId, customerNameFilter);
    return res.json(data);
  } catch (error) {
    console.error('Failed to load admin customer portal dashboard summary', error);
    return res.status(500).json({ error: 'Failed to load customer dashboard summary' });
  }
});

app.get('/admin/customer-portal/trip-documents', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view customer portal documents' });

  const customerUserId = parseCustomerUserId(req.query.customer_user_id);
  if (!customerUserId) {
    return res.status(400).json({ error: 'customer_user_id is required' });
  }

  const tripId = Number(req.query.trip_id || 0);
  if (!Number.isInteger(tripId) || tripId <= 0) {
    return res.status(400).json({ error: 'trip_id is required' });
  }

  try {
    const allowed = await canCustomerAccessTripDocuments(customerUserId, tripId);
    if (!allowed) {
      return res.status(403).json({ error: 'Selected customer cannot access documents for this trip' });
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
    console.error('Failed to load admin customer portal trip documents', error);
    return res.status(500).json({ error: 'Failed to load documents' });
  }
});

app.get('/admin/customer-portal/trips/:id/timeline', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view customer portal timeline' });

  const customerUserId = parseCustomerUserId(req.query.customer_user_id);
  if (!customerUserId) {
    return res.status(400).json({ error: 'customer_user_id is required' });
  }

  const tripId = Number(req.params.id);
  if (!Number.isInteger(tripId) || tripId <= 0) {
    return res.status(400).json({ error: 'Invalid trip id' });
  }

  try {
    const trip = await loadCustomerTripTimeline(tripId, customerUserId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    return res.json(trip);
  } catch (error) {
    console.error('Failed to load admin customer portal trip timeline', error);
    return res.status(500).json({ error: 'Failed to load trip timeline' });
  }
});

app.get('/admin/customer-portal/documents/:id/download', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can download customer portal documents' });

  const customerUserId = parseCustomerUserId(req.query.customer_user_id);
  if (!customerUserId) {
    return res.status(400).json({ error: 'customer_user_id is required' });
  }

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
    const allowed = await canCustomerAccessTripDocuments(customerUserId, doc.trip_id);
    if (!allowed) {
      return res.status(403).json({ error: 'Selected customer cannot access this document' });
    }
    const absolutePath = resolveStoredFilePath(doc.storage_path);
    if (!absolutePath) {
      return res.status(404).json({ error: 'Document file missing' });
    }
    return sendFileInline(res, absolutePath, doc.file_name);
  } catch (error) {
    console.error('Failed to download admin customer portal document', error);
    return res.status(500).json({ error: 'Failed to download document' });
  }
});

app.post('/customer/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const auth = await authenticateCustomerWithPassword(username, password);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const token = createCustomerToken(auth.user);
  return res.json({
    ok: true,
    token,
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
  if (!['Gate', 'Dispatch', 'Manager', 'Admin'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only Gate/Dispatch/Manager/Admin can view expected trucks' });
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

async function runExpenseSecurityCleanup() {
  try {
    await pool.query(`DELETE FROM expense_token_revocations WHERE expires_at <= NOW()`);
    await pool.query(`DELETE FROM expense_login_attempts WHERE created_at < NOW() - INTERVAL '90 days'`);
    await pool.query(`DELETE FROM expense_sso_nonces WHERE expires_at <= NOW() OR used_at IS NOT NULL`);
  } catch (error) {
    console.error('Expense security cleanup failed', error);
  }
}

function mapTransportRoleToExpenseRole(transportRole) {
  if (transportRole === 'Admin') return 'Admin';
  if (transportRole === 'Accounts') return 'Accounts';
  if (transportRole === 'Manager') return 'Manager';
  if (['Gate', 'Dispatch', 'Loading', 'Weighbridge'].includes(transportRole)) return 'Employee';
  return null;
}

function normalizeExpenseSsoUsername(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'employee';
}

async function ensureExpenseSsoUser(client, transportRole, transportUser = null) {
  const expenseRole = mapTransportRoleToExpenseRole(transportRole);
  if (!expenseRole) return null;
  const isNamedEmployeeSso = expenseRole === 'Employee' && transportUser && transportUser.username;
  const username = isNamedEmployeeSso
    ? normalizeExpenseSsoUsername(transportUser.username)
    : `sso_${expenseRole.toLowerCase()}`;
  const fullName = isNamedEmployeeSso
    ? String(transportUser.full_name || transportUser.username || `Transport ${transportRole}`).trim()
    : `Transport ${expenseRole} SSO`;
  const employeeCode = isNamedEmployeeSso
    ? `EMP-${String(transportUser.id || username).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}`
    : `SSO-${expenseRole.toUpperCase()}`;
  const existing = await client.query(
    `SELECT id, employee_code, full_name, username, role, is_active
     FROM expense_users
     WHERE username = $1 OR employee_code = $2
     ORDER BY CASE WHEN username = $1 THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    [username, employeeCode]
  );
  if (existing.rows.length) {
    const user = existing.rows[0];
    if (
      !user.is_active ||
      user.role !== expenseRole ||
      user.username !== username ||
      user.employee_code !== employeeCode ||
      user.full_name !== fullName
    ) {
      await client.query(
        `UPDATE expense_users
         SET role = $1, is_active = true, full_name = $2, employee_code = $3, username = $4, updated_at = NOW()
         WHERE id = $5`,
        [expenseRole, fullName, employeeCode, username, user.id]
      );
    }
    const refreshed = await client.query(
      `SELECT id, employee_code, full_name, username, role, is_active
       FROM expense_users WHERE id = $1`,
      [user.id]
    );
    return refreshed.rows[0];
  }

  const randomPassword = crypto.randomBytes(24).toString('hex');
  const hash = await bcrypt.hash(randomPassword, BCRYPT_COST);
  const inserted = await client.query(
    `INSERT INTO expense_users(employee_code, full_name, username, password, role, is_active)
     VALUES ($1,$2,$3,$4,$5,true)
     RETURNING id, employee_code, full_name, username, role, is_active`,
    [employeeCode, fullName, username, hash, expenseRole]
  );
  return inserted.rows[0];
}

function makeClaimNumber(id) {
  return `EXP-${String(id).padStart(6, '0')}`;
}

app.post('/expense/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  const ipAddress = getRequestIp(req);
  const userAgent = String(req.header('user-agent') || '').slice(0, 500);
  if (!username || !password) {
    await recordExpenseLoginAttempt({ username, ipAddress, success: false, failureReason: 'missing_credentials', userAgent });
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    const lockState = await checkExpenseLoginLock(username, ipAddress);
    if (lockState.locked) {
      await recordExpenseLoginAttempt({ username, ipAddress, success: false, failureReason: 'locked', userAgent });
      return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }
    const auth = await authenticateExpenseWithPassword(username, password);
    if (auth.error) {
      await recordExpenseLoginAttempt({ username, ipAddress, success: false, failureReason: auth.error, userAgent });
      return res.status(auth.status).json({ error: auth.error });
    }
    if (['Accounts', 'Manager', 'Admin'].includes(auth.user.role)) {
      await recordExpenseLoginAttempt({
        username,
        ipAddress,
        success: false,
        failureReason: 'use_transport_sso_for_privileged_roles',
        userAgent
      });
      return res.status(403).json({ error: 'Use Transport login and open Expense via SSO for this role.' });
    }
    await recordExpenseLoginAttempt({ username, ipAddress, success: true, failureReason: null, userAgent });
    const token = createExpenseToken(auth.user);
    console.log(`[expense][${req.expenseRequestId}] login success username=${username}`);
    return res.json({ ok: true, token, user: auth.user, request_id: req.expenseRequestId });
  } catch (error) {
    console.error('Expense login failed', error);
    await recordExpenseLoginAttempt({ username, ipAddress, success: false, failureReason: 'internal_error', userAgent });
    return res.status(500).json({ error: 'Expense login failed' });
  }
});

app.post('/expense/logout', async (req, res) => {
  const rawTokenHeader = String(req.header('x-expense-token') || '').trim();
  const rawBearer = String(req.header('authorization') || '').trim();
  const token = rawTokenHeader || (rawBearer.toLowerCase().startsWith('bearer ') ? rawBearer.slice(7).trim() : '');
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const verified = verifyExpenseToken(token);
  if (verified.error) return res.status(401).json({ error: 'Invalid expense token for logout' });
  const tokenHash = hashExpenseToken(token);
  const exp = new Date(Number(verified.payload.exp) * 1000);
  await pool.query(
    `INSERT INTO expense_token_revocations(token_hash, user_id, expires_at)
     VALUES ($1,$2,$3)
     ON CONFLICT (token_hash) DO NOTHING`,
    [tokenHash, auth.user.id, exp]
  );
  console.log(`[expense][${req.expenseRequestId}] logout user=${auth.user.username}`);
  return res.json({ ok: true, request_id: req.expenseRequestId });
});

app.post('/expense/sso/challenge', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const expenseRole = mapTransportRoleToExpenseRole(auth.role);
  if (!expenseRole) return res.status(403).json({ error: 'You are not authorized for Expense access.' });

  const nonce = crypto.randomBytes(24).toString('hex');
  const nonceHash = hashNonce(nonce);
  try {
    await pool.query(
      `INSERT INTO expense_sso_nonces(nonce_hash, transport_role, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '2 minutes')`,
      [nonceHash, auth.role]
    );
    return res.json({ ok: true, nonce, expires_in_seconds: 120, request_id: req.requestId });
  } catch (error) {
    console.error('Expense SSO challenge failed', error);
    return res.status(500).json({ error: 'Failed to create SSO challenge' });
  }
});

app.post('/expense/sso', async (req, res) => {
  const auth = readRoleFromRequest(req);
  const ipAddress = getRequestIp(req);
  const userAgent = String(req.header('user-agent') || '').slice(0, 500);
  const transportRole = auth.error ? null : auth.role;
  const expenseRole = mapTransportRoleToExpenseRole(transportRole);

  if (auth.error || !expenseRole) {
    await recordExpenseLoginAttempt({
      username: transportRole || 'unknown',
      ipAddress,
      success: false,
      failureReason: auth.error || 'transport_role_not_allowed_for_expense_sso',
      userAgent
    });
    return res.status(403).json({ error: 'You are not authorized for Expense access.' });
  }

  const nonce = String(req.header('x-sso-nonce') || '').trim();
  if (nonce) {
    const nonceHash = hashNonce(nonce);
    const nonceRes = await pool.query(
      `UPDATE expense_sso_nonces
       SET used_at = NOW()
       WHERE nonce_hash = $1
         AND transport_role = $2
         AND used_at IS NULL
         AND expires_at > NOW()
       RETURNING id`,
      [nonceHash, transportRole]
    );
    if (!nonceRes.rows.length) {
      await recordExpenseLoginAttempt({
        username: `transport_${transportRole}`,
        ipAddress,
        success: false,
        failureReason: 'expense_sso_nonce_invalid_or_expired',
        userAgent
      });
      return res.status(403).json({ error: 'Invalid or expired SSO challenge' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const expenseUser = await ensureExpenseSsoUser(client, transportRole, auth.user || null);
    if (!expenseUser) {
      await client.query('ROLLBACK');
      await recordExpenseLoginAttempt({
        username: `transport_${transportRole}`,
        ipAddress,
        success: false,
        failureReason: 'failed_to_resolve_expense_sso_user',
        userAgent
      });
      return res.status(500).json({ error: 'Failed to create expense session' });
    }
    await client.query(
      `INSERT INTO transport_expense_user_map(transport_username, transport_role, expense_user_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (transport_role, expense_user_id) DO NOTHING`,
      [String(auth.user?.username || transportRole || '').toLowerCase(), transportRole, expenseUser.id]
    );
    await client.query('COMMIT');

    await recordExpenseLoginAttempt({
      username: expenseUser.username,
      ipAddress,
      success: true,
      failureReason: 'transport_sso',
      userAgent
    });

    const token = createExpenseToken(expenseUser);
    console.log(`[expense][${req.expenseRequestId}] transport sso success role=${transportRole} expense_user=${expenseUser.username}`);
    return res.json({
      ok: true,
      token,
      user: expenseUser,
      request_id: req.expenseRequestId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Expense SSO failed', error);
    await recordExpenseLoginAttempt({
      username: `transport_${transportRole || 'unknown'}`,
      ipAddress,
      success: false,
      failureReason: 'expense_sso_internal_error',
      userAgent
    });
    return res.status(500).json({ error: 'Failed to create expense session' });
  } finally {
    client.release();
  }
});

app.post('/auth/v2/login', async (req, res) => {
  if (!appConfig.flags.enableUserAuthV2) {
    return res.status(403).json({ error: 'User auth v2 is disabled' });
  }
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    const auth = await authenticateTransportV2WithPassword(username, password);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const token = createTransportToken(auth.user, auth.user.roles);
    return res.json({ ok: true, token, user: auth.user, request_id: req.requestId });
  } catch (error) {
    console.error('Transport v2 login failed', error);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

app.post('/auth/employee-login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    const auth = await authenticateTransportV2WithPassword(username, password);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const token = createTransportToken(auth.user, auth.user.roles);
    return res.json({
      ok: true,
      token,
      user: {
        id: auth.user.id,
        username: auth.user.username,
        full_name: auth.user.full_name,
        roles: auth.user.roles
      },
      request_id: req.requestId
    });
  } catch (error) {
    console.error('Employee login failed', error);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/auth/v2/me', async (req, res) => {
  if (!appConfig.flags.enableUserAuthV2) {
    return res.status(403).json({ error: 'User auth v2 is disabled' });
  }
  const bearer = String(req.header('authorization') || '').trim();
  const tokenHeader = String(req.header('x-user-token') || '').trim();
  const token = tokenHeader || (bearer.toLowerCase().startsWith('bearer ') ? bearer.slice(7).trim() : '');
  if (!token) return res.status(401).json({ error: 'Missing transport token' });
  const verified = verifyTransportToken(token);
  if (verified.error) return res.status(verified.status).json({ error: verified.error });
  try {
    const result = await pool.query(
      `SELECT id, username, full_name, is_active FROM users WHERE id = $1 LIMIT 1`,
      [verified.payload.sub]
    );
    if (!result.rows.length) return res.status(403).json({ error: 'User not found' });
    const user = result.rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'User inactive' });
    const rolesRes = await pool.query(
      `SELECT role_name FROM user_roles WHERE user_id = $1 AND is_active = true ORDER BY role_name ASC`,
      [user.id]
    );
    return res.json({
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      roles: rolesRes.rows.map((row) => row.role_name).filter((role) => VALID_ROLES.includes(role))
    });
  } catch (error) {
    console.error('Transport v2 me failed', error);
    return res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

app.get('/expense/me', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  return res.json(auth.user);
});

app.get('/expense-categories', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const result = await pool.query(
      `SELECT id, name, is_active
       FROM expense_categories
       WHERE is_active = true
       ORDER BY name ASC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Failed to load expense categories', error);
    return res.status(500).json({ error: 'Failed to load expense categories' });
  }
});

app.post('/expenses', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.user.role !== 'Employee') {
    return res.status(403).json({ error: 'Only Employee can create expense claims' });
  }

  const claimDate = normalizeEmpty(req.body.claim_date);
  const amount = toFiniteNumberOrNull(req.body.amount);
  const categoryId = parsePositiveId(req.body.category_id);
  const payload = {
    pay_to: normalizeEmpty(req.body.pay_to),
    voucher_no: normalizeEmpty(req.body.voucher_no),
    claim_date: claimDate,
    amount,
    category_id: categoryId,
    purpose: normalizeEmpty(req.body.purpose)
  };

  if (payload.amount !== null && payload.amount <= 0) {
    return res.status(400).json({ error: 'amount must be greater than 0 when provided' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (payload.voucher_no) {
      const duplicateVoucher = await client.query(
        `SELECT id
         FROM expense_claims
         WHERE employee_id = $1
           AND lower(trim(voucher_no)) = lower(trim($2))
           AND deleted_at IS NULL
         LIMIT 1`,
        [auth.user.id, payload.voucher_no]
      );
      if (duplicateVoucher.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Duplicate voucher number for this employee' });
      }
    }
    const insert = await client.query(
      `INSERT INTO expense_claims(
        claim_number, employee_id, pay_to, voucher_no, claim_date, amount, category_id, purpose, status, current_assigned_role, version
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT','Employee',1)
      RETURNING *`,
      ['TEMP', auth.user.id, payload.pay_to, payload.voucher_no, payload.claim_date, payload.amount, payload.category_id, payload.purpose]
    );
    const claim = insert.rows[0];
    const claimNumber = makeClaimNumber(claim.id);
    const updated = await client.query(
      `UPDATE expense_claims SET claim_number = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [claimNumber, claim.id]
    );
    await addExpenseHistory(client, {
      claimId: claim.id,
      actionType: 'CREATE',
      fromStatus: null,
      toStatus: 'DRAFT',
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      remarks: 'Claim created',
      fieldChanges: { ...payload, request_id: req.expenseRequestId }
    });
    await client.query('COMMIT');
    console.log(`[expense][${req.expenseRequestId}] claim created id=${updated.rows[0].id}`);
    return res.status(201).json({ ...updated.rows[0], request_id: req.expenseRequestId });
  } catch (error) {
    await client.query('ROLLBACK');
    if (String(error.code) === '23505') {
      return res.status(409).json({ error: 'Voucher No already exists' });
    }
    console.error('Failed to create expense claim', error);
    return res.status(500).json({ error: 'Failed to create expense claim' });
  } finally {
    client.release();
  }
});

app.get('/expenses/my', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.user.role !== 'Employee') return res.status(403).json({ error: 'Only Employee can access my claims' });
  try {
    const result = await pool.query(
      `SELECT ec.*, cat.name AS category_name
       FROM expense_claims ec
       LEFT JOIN expense_categories cat ON cat.id = ec.category_id
       WHERE ec.employee_id = $1 AND ec.deleted_at IS NULL
       ORDER BY ec.updated_at DESC, ec.id DESC`,
      [auth.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Failed to load my expense claims', error);
    return res.status(500).json({ error: 'Failed to load my expense claims' });
  }
});

app.get('/expenses/pending', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!['Accounts', 'Manager', 'Admin'].includes(auth.user.role)) {
    return res.status(403).json({ error: 'Only reviewers can access pending queue' });
  }

  const queueForRole = auth.user.role === 'Accounts'
    ? `ec.status IN ('ACCOUNTS_REVIEW', 'PAYMENT_PENDING', 'PAYMENT_INITIATED')`
    : auth.user.role === 'Manager'
      ? `ec.status = 'MANAGER_REVIEW'`
      : `ec.status = 'ADMIN_REVIEW'`;

  try {
    const result = await pool.query(
      `SELECT
        ec.id, ec.claim_number, ec.employee_id, eu.full_name AS employee_name, eu.employee_code,
        ec.pay_to, ec.voucher_no, ec.claim_date, ec.amount, ec.status, ec.version, ec.current_assigned_role,
        ec.purpose, ec.updated_at, cat.name AS category_name
       FROM expense_claims ec
       JOIN expense_users eu ON eu.id = ec.employee_id
       LEFT JOIN expense_categories cat ON cat.id = ec.category_id
       WHERE ec.deleted_at IS NULL
         AND ${queueForRole}
       ORDER BY ec.updated_at DESC, ec.id DESC`
    );
    const ids = result.rows.map((row) => row.id);
    return res.json({ rows: result.rows, claim_ids: ids });
  } catch (error) {
    console.error('Failed to load expense pending queue', error);
    return res.status(500).json({ error: 'Failed to load expense pending queue' });
  }
});

app.get('/expenses/:id(\\d+)', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const claimId = parsePositiveId(req.params.id);
  if (!claimId) return res.status(400).json({ error: 'Invalid claim id' });

  try {
    const result = await pool.query(
      `SELECT ec.*, cat.name AS category_name, eu.full_name AS employee_name, eu.employee_code
       FROM expense_claims ec
       JOIN expense_users eu ON eu.id = ec.employee_id
       LEFT JOIN expense_categories cat ON cat.id = ec.category_id
       WHERE ec.id = $1 AND ec.deleted_at IS NULL
       LIMIT 1`,
      [claimId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Claim not found' });
    const claim = result.rows[0];
    if (!canExpenseUserAccessClaim(auth.user, claim)) {
      return res.status(403).json({ error: 'Not allowed to access this claim' });
    }
    const [docs, history] = await Promise.all([
      pool.query(
        `SELECT id, claim_id, doc_type, file_name, mime_type, file_size, uploaded_by_user_id, uploaded_by_role, created_at
         FROM expense_claim_documents WHERE claim_id = $1 ORDER BY created_at DESC, id DESC`,
        [claimId]
      ),
      pool.query(
        `SELECT h.*, u.full_name AS actor_name
         FROM expense_claim_history h
         LEFT JOIN expense_users u ON u.id = h.actor_user_id
         WHERE h.claim_id = $1
         ORDER BY h.created_at ASC, h.id ASC`,
        [claimId]
      )
    ]);
    return res.json({ claim, documents: docs.rows, history: history.rows });
  } catch (error) {
    console.error('Failed to load expense claim detail', error);
    return res.status(500).json({ error: 'Failed to load expense claim detail' });
  }
});

app.put('/expenses/:id(\\d+)', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const claimId = parsePositiveId(req.params.id);
  if (!claimId) return res.status(400).json({ error: 'Invalid claim id' });

  const client = await pool.connect();
  try {
    const expectedVersion = parseExpectedVersion(req);
    if (expectedVersion === null) {
      return res.status(400).json({ error: 'version is required for update' });
    }
    await client.query('BEGIN');
    const existingRes = await client.query(`SELECT * FROM expense_claims WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [claimId]);
    if (!existingRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Claim not found' });
    }
    const existing = existingRes.rows[0];
    if (!assertExpenseVersion(expectedVersion, existing.version)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This expense claim was updated by another user. Please refresh.' });
    }
    if (auth.user.role === 'Employee') {
      if (existing.employee_id !== auth.user.id || !canEditExpenseClaimByStatus(existing.status)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Claim cannot be edited in current state' });
      }
    } else if (!['Accounts', 'Admin'].includes(auth.user.role)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Role cannot edit claim' });
    }

    const next = {
      pay_to: normalizeEmpty(req.body.pay_to ?? existing.pay_to),
      voucher_no: normalizeEmpty(req.body.voucher_no ?? existing.voucher_no),
      claim_date: normalizeEmpty(req.body.claim_date ?? existing.claim_date),
      amount: toFiniteNumberOrNull(req.body.amount ?? existing.amount),
      category_id: parsePositiveId(req.body.category_id ?? existing.category_id),
      purpose: normalizeEmpty(req.body.purpose ?? existing.purpose)
    };
    if (next.amount !== null && next.amount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'amount must be greater than 0 when provided' });
    }
    if (next.voucher_no) {
      const duplicateVoucher = await client.query(
        `SELECT id FROM expense_claims
         WHERE employee_id = $1
           AND lower(trim(voucher_no)) = lower(trim($2))
           AND id <> $3
           AND deleted_at IS NULL
         LIMIT 1`,
        [existing.employee_id, next.voucher_no, claimId]
      );
      if (duplicateVoucher.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Duplicate voucher number for this employee' });
      }
    }

    const fieldChanges = {};
    ['pay_to', 'voucher_no', 'claim_date', 'amount', 'category_id', 'purpose'].forEach((key) => {
      if (String(existing[key]) !== String(next[key])) {
        fieldChanges[key] = { old: existing[key], new: next[key] };
      }
    });

    const updated = await client.query(
      `UPDATE expense_claims
       SET pay_to = $1, voucher_no = $2, claim_date = $3, amount = $4, category_id = $5, purpose = $6, updated_at = NOW()
       , version = version + 1
       WHERE id = $7
       RETURNING *`,
      [next.pay_to, next.voucher_no, next.claim_date, next.amount, next.category_id, next.purpose, claimId]
    );
    if (Object.keys(fieldChanges).length) {
      await addExpenseHistory(client, {
        claimId,
        actionType: 'EDIT',
        fromStatus: existing.status,
        toStatus: existing.status,
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        remarks: normalizeEmpty(req.body.remarks) || 'Claim edited',
        fieldChanges: { ...fieldChanges, request_id: req.expenseRequestId }
      });
    }
    await client.query('COMMIT');
    console.log(`[expense][${req.expenseRequestId}] claim edited id=${claimId}`);
    return res.json({ ...updated.rows[0], request_id: req.expenseRequestId });
  } catch (error) {
    await client.query('ROLLBACK');
    if (String(error.code) === '23505') {
      return res.status(409).json({ error: 'Voucher No already exists' });
    }
    console.error('Failed to update expense claim', error);
    return res.status(500).json({ error: 'Failed to update expense claim' });
  } finally {
    client.release();
  }
});

app.post('/expenses/:id(\\d+)/submit', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.user.role !== 'Employee') return res.status(403).json({ error: 'Only Employee can submit claim' });
  const claimId = parsePositiveId(req.params.id);
  if (!claimId) return res.status(400).json({ error: 'Invalid claim id' });

  const client = await pool.connect();
  try {
    const expectedVersion = parseExpectedVersion(req);
    if (expectedVersion === null) {
      return res.status(400).json({ error: 'version is required for submit' });
    }
    await client.query('BEGIN');
    const claimRes = await client.query(`SELECT * FROM expense_claims WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [claimId]);
    if (!claimRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Claim not found' });
    }
    const claim = claimRes.rows[0];
    if (!assertExpenseVersion(expectedVersion, claim.version)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This expense claim was updated by another user. Please refresh.' });
    }
    if (claim.employee_id !== auth.user.id || !canEditExpenseClaimByStatus(claim.status)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Claim cannot be submitted in current state' });
    }

    const toStatus = claim.status === 'DRAFT'
      ? 'ACCOUNTS_REVIEW'
      : claim.previous_review_stage === 'MANAGER'
        ? 'MANAGER_REVIEW'
        : claim.previous_review_stage === 'ADMIN'
          ? 'ADMIN_REVIEW'
          : 'ACCOUNTS_REVIEW';
    const assignedRole = toStatus === 'ACCOUNTS_REVIEW'
      ? 'Accounts'
      : toStatus === 'MANAGER_REVIEW'
        ? 'Manager'
        : 'Admin';
    if (!isValidExpenseTransition(claim.status, toStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Invalid transition: ${claim.status} -> ${toStatus}` });
    }

    const updated = await client.query(
      `UPDATE expense_claims
       SET status = $1,
           current_assigned_role = $2,
           submitted_at = COALESCE(submitted_at, NOW()),
           more_info_reason = NULL,
           previous_status = NULL,
           more_info_requested_by_user_id = NULL,
           more_info_requested_by_role = NULL,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [toStatus, assignedRole, claimId]
    );
    await addExpenseHistory(client, {
      claimId,
      actionType: claim.status === 'DRAFT' ? 'SUBMIT' : 'RESUBMIT',
      fromStatus: claim.status,
      toStatus,
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      remarks: normalizeEmpty(req.body.remarks) || null,
      fieldChanges: { request_id: req.expenseRequestId }
    });
    await addExpenseNotification(client, {
      targetRole: toStatus === 'ACCOUNTS_REVIEW' ? 'Accounts' : toStatus === 'MANAGER_REVIEW' ? 'Manager' : 'Admin',
      eventType: 'CLAIM_SUBMITTED',
      claimId,
      title: 'Claim Submitted',
      message: `Claim ${claim.claim_number} submitted for ${toStatus.replace('_', ' ')}`
    });
    await client.query('COMMIT');
    console.log(`[expense][${req.expenseRequestId}] claim submitted id=${claimId} to=${toStatus}`);
    return res.json({ ...updated.rows[0], request_id: req.expenseRequestId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to submit expense claim', error);
    return res.status(500).json({ error: 'Failed to submit expense claim' });
  } finally {
    client.release();
  }
});

async function handleExpenseReviewAction(req, res, reviewerRole) {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.user.role !== reviewerRole && auth.user.role !== 'Admin') {
    return res.status(403).json({ error: `Only ${reviewerRole}/Admin can perform this action` });
  }
  const claimId = parsePositiveId(req.params.id);
  if (!claimId) return res.status(400).json({ error: 'Invalid claim id' });
  const action = String(req.body.action || '').toLowerCase();
  const remarks = normalizeEmpty(req.body.remarks);
  const expectedVersion = parseExpectedVersion(req);
  if (expectedVersion === null) return res.status(400).json({ error: 'version is required for review action' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimRes = await client.query(`SELECT * FROM expense_claims WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [claimId]);
    if (!claimRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Claim not found' });
    }
    const claim = claimRes.rows[0];
    if (!assertExpenseVersion(expectedVersion, claim.version)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This expense claim was updated by another user. Please refresh.' });
    }
    if (!canExpenseRoleReview(reviewerRole, claim.status) && !(auth.user.role === 'Admin' && claim.status === `${reviewerRole.toUpperCase()}_REVIEW`)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Claim is not in ${reviewerRole} review stage` });
    }

    let nextStatus;
    let nextAssignedRole = null;
    let actionType;
    const patch = {};
    if (action === 'approve') {
      actionType = 'APPROVE';
      if (claim.status === 'ACCOUNTS_REVIEW') {
        nextStatus = 'MANAGER_REVIEW';
        nextAssignedRole = 'Manager';
        patch.accounts_reviewed_by = auth.user.id;
      } else if (claim.status === 'MANAGER_REVIEW') {
        nextStatus = 'ADMIN_REVIEW';
        nextAssignedRole = 'Admin';
        patch.manager_reviewed_by = auth.user.id;
      } else {
        nextStatus = 'PAYMENT_PENDING';
        nextAssignedRole = 'Accounts';
        patch.admin_reviewed_by = auth.user.id;
      }
      patch.rejection_reason = null;
      patch.more_info_reason = null;
    } else if (action === 'reject') {
      actionType = 'REJECT';
      nextStatus = 'REJECTED';
      nextAssignedRole = null;
      patch.rejection_reason = remarks || 'Rejected';
      patch.more_info_reason = null;
      if (claim.status === 'ACCOUNTS_REVIEW') patch.accounts_reviewed_by = auth.user.id;
      if (claim.status === 'MANAGER_REVIEW') patch.manager_reviewed_by = auth.user.id;
      if (claim.status === 'ADMIN_REVIEW') patch.admin_reviewed_by = auth.user.id;
    } else if (action === 'need_info') {
      actionType = 'NEED_INFO';
      nextStatus = 'NEED_MORE_INFO';
      nextAssignedRole = 'Employee';
      patch.more_info_reason = remarks || 'Need more details';
      patch.previous_review_stage = getExpenseReviewStageFromStatus(claim.status);
      patch.previous_status = claim.status;
      patch.more_info_requested_by_user_id = auth.user.id;
      patch.more_info_requested_by_role = auth.user.role;
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'action must be approve/reject/need_info' });
    }
    if (!isValidExpenseTransition(claim.status, nextStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Invalid transition: ${claim.status} -> ${nextStatus}` });
    }

    const updatedRes = await client.query(
      `UPDATE expense_claims
       SET status = $1,
           current_assigned_role = $2,
           accounts_reviewed_by = COALESCE($3, accounts_reviewed_by),
           manager_reviewed_by = COALESCE($4, manager_reviewed_by),
           admin_reviewed_by = COALESCE($5, admin_reviewed_by),
           rejection_reason = $6,
           more_info_reason = $7,
           previous_review_stage = COALESCE($8, previous_review_stage),
           previous_status = COALESCE($9, previous_status),
           more_info_requested_by_user_id = COALESCE($10, more_info_requested_by_user_id),
           more_info_requested_by_role = COALESCE($11, more_info_requested_by_role),
           version = version + 1,
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        nextStatus,
        nextAssignedRole,
        patch.accounts_reviewed_by || null,
        patch.manager_reviewed_by || null,
        patch.admin_reviewed_by || null,
        patch.rejection_reason || null,
        patch.more_info_reason || null,
        patch.previous_review_stage || null,
        patch.previous_status || null,
        patch.more_info_requested_by_user_id || null,
        patch.more_info_requested_by_role || null,
        claimId
      ]
    );

    await addExpenseHistory(client, {
      claimId,
      actionType,
      fromStatus: claim.status,
      toStatus: nextStatus,
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      remarks,
      fieldChanges: { request_id: req.expenseRequestId }
    });

    const targetRole = nextStatus === 'NEED_MORE_INFO' ? 'Employee' : nextAssignedRole;
    if (targetRole) {
      const targetUserId = targetRole === 'Employee' ? claim.employee_id : null;
      await addExpenseNotification(client, {
        targetRole,
        targetUserId,
        eventType: actionType,
        claimId,
        title: `Expense ${nextStatus.replaceAll('_', ' ')}`,
        message: `Claim ${claim.claim_number} moved to ${nextStatus}`
      });
    }
    await client.query('COMMIT');
    console.log(`[expense][${req.expenseRequestId}] review action=${actionType} claim=${claimId} to=${nextStatus}`);
    return res.json({ ...updatedRes.rows[0], request_id: req.expenseRequestId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed expense review action', error);
    return res.status(500).json({ error: 'Failed to process review action' });
  } finally {
    client.release();
  }
}

app.post('/expenses/:id(\\d+)/accounts-review', async (req, res) => handleExpenseReviewAction(req, res, 'Accounts'));
app.post('/expenses/:id(\\d+)/manager-review', async (req, res) => handleExpenseReviewAction(req, res, 'Manager'));
app.post('/expenses/:id(\\d+)/admin-review', async (req, res) => handleExpenseReviewAction(req, res, 'Admin'));

app.post('/expenses/:id(\\d+)/payment-initiated', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.user.role !== 'Accounts') return res.status(403).json({ error: 'Only Accounts can mark payment initiated' });
  const claimId = parsePositiveId(req.params.id);
  if (!claimId) return res.status(400).json({ error: 'Invalid claim id' });
  const expectedVersion = parseExpectedVersion(req);
  if (expectedVersion === null) return res.status(400).json({ error: 'version is required for payment action' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimRes = await client.query(`SELECT * FROM expense_claims WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [claimId]);
    if (!claimRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Claim not found' });
    }
    const claim = claimRes.rows[0];
    if (!assertExpenseVersion(expectedVersion, claim.version)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This expense claim was updated by another user. Please refresh.' });
    }
    if (claim.status !== 'PAYMENT_PENDING') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Claim is not in PAYMENT_PENDING status' });
    }
    if (!isValidExpenseTransition(claim.status, 'PAYMENT_INITIATED')) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Invalid transition: ${claim.status} -> PAYMENT_INITIATED` });
    }
    const updated = await client.query(
      `UPDATE expense_claims
       SET status = 'PAYMENT_INITIATED',
           payment_initiated_by = $1,
           payment_initiated_at = NOW(),
           current_assigned_role = 'Accounts',
           version = version + 1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [auth.user.id, claimId]
    );
    await addExpenseHistory(client, {
      claimId,
      actionType: 'PAYMENT_INITIATED',
      fromStatus: claim.status,
      toStatus: 'PAYMENT_INITIATED',
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      remarks: normalizeEmpty(req.body.remarks) || null,
      fieldChanges: { request_id: req.expenseRequestId }
    });
    await addExpenseNotification(client, {
      targetRole: 'Employee',
      targetUserId: claim.employee_id,
      eventType: 'PAYMENT_INITIATED',
      claimId,
      title: 'Payment Initiated',
      message: `Payment initiated for claim ${claim.claim_number}`
    });
    await client.query('COMMIT');
    console.log(`[expense][${req.expenseRequestId}] payment initiated claim=${claimId}`);
    return res.json({ ...updated.rows[0], request_id: req.expenseRequestId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to mark payment initiated', error);
    return res.status(500).json({ error: 'Failed to mark payment initiated' });
  } finally {
    client.release();
  }
});

app.post('/expenses/:id(\\d+)/payment-completed', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.user.role !== 'Accounts') return res.status(403).json({ error: 'Only Accounts can mark payment completed' });
  const claimId = parsePositiveId(req.params.id);
  if (!claimId) return res.status(400).json({ error: 'Invalid claim id' });
  const expectedVersion = parseExpectedVersion(req);
  if (expectedVersion === null) return res.status(400).json({ error: 'version is required for payment action' });
  const remarks = normalizeEmpty(req.body.remarks);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimRes = await client.query(`SELECT * FROM expense_claims WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [claimId]);
    if (!claimRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Claim not found' });
    }
    const claim = claimRes.rows[0];
    if (!assertExpenseVersion(expectedVersion, claim.version)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This expense claim was updated by another user. Please refresh.' });
    }
    if (claim.status !== 'PAYMENT_INITIATED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Claim is not in PAYMENT_INITIATED status' });
    }
    if (!isValidExpenseTransition(claim.status, 'PAYMENT_COMPLETED')) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Invalid transition: ${claim.status} -> PAYMENT_COMPLETED` });
    }
    const updated = await client.query(
      `UPDATE expense_claims
       SET status = 'PAYMENT_COMPLETED',
           payment_completed_by = $1,
           payment_completed_at = NOW(),
           current_assigned_role = NULL,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [auth.user.id, claimId]
    );
    await addExpenseHistory(client, {
      claimId,
      actionType: 'PAYMENT_COMPLETED',
      fromStatus: claim.status,
      toStatus: 'PAYMENT_COMPLETED',
      actorUserId: auth.user.id,
      actorRole: auth.user.role,
      remarks,
      fieldChanges: { request_id: req.expenseRequestId }
    });
    await addExpenseNotification(client, {
      targetRole: 'Employee',
      targetUserId: claim.employee_id,
      eventType: 'PAYMENT_COMPLETED',
      claimId,
      title: 'Payment Completed',
      message: `Payment completed for claim ${claim.claim_number}`
    });
    await client.query('COMMIT');
    console.log(`[expense][${req.expenseRequestId}] payment completed claim=${claimId}`);
    return res.json({ ...updated.rows[0], request_id: req.expenseRequestId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to mark payment completed', error);
    return res.status(500).json({ error: 'Failed to mark payment completed' });
  } finally {
    client.release();
  }
});

app.post('/expenses/:id(\\d+)/documents', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const claimId = parsePositiveId(req.params.id);
  if (!claimId) return res.status(400).json({ error: 'Invalid claim id' });

  uploadExpenseDocument.single('file')(req, res, async (uploadError) => {
    if (uploadError) return res.status(400).json({ error: uploadError.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'File is required' });
    const docType = String(req.body.doc_type || '').toUpperCase();
    if (!EXPENSE_DOC_TYPES.has(docType)) {
      try { fs.unlinkSync(req.file.path); } catch (_err) {}
      return res.status(400).json({ error: 'Invalid doc_type' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const claimRes = await client.query(`SELECT * FROM expense_claims WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [claimId]);
      if (!claimRes.rows.length) {
        await client.query('ROLLBACK');
        try { fs.unlinkSync(req.file.path); } catch (_err) {}
        return res.status(404).json({ error: 'Claim not found' });
      }
      const claim = claimRes.rows[0];
      if (!canExpenseUserAccessClaim(auth.user, claim)) {
        await client.query('ROLLBACK');
        try { fs.unlinkSync(req.file.path); } catch (_err) {}
        return res.status(403).json({ error: 'Role cannot upload expense documents for this claim' });
      }
      if (auth.user.role === 'Employee' && !canEditExpenseClaimByStatus(claim.status)) {
        await client.query('ROLLBACK');
        try { fs.unlinkSync(req.file.path); } catch (_err) {}
        return res.status(403).json({ error: 'Claim does not allow employee upload now' });
      }

      const storagePath = path.relative(__dirname, req.file.path);
      const insert = await client.query(
        `INSERT INTO expense_claim_documents(
          claim_id, doc_type, file_name, mime_type, file_size, storage_path, uploaded_by_user_id, uploaded_by_role
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id, claim_id, doc_type, file_name, mime_type, file_size, uploaded_by_user_id, uploaded_by_role, created_at`,
        [claimId, docType, req.file.originalname, req.file.mimetype, req.file.size, storagePath, auth.user.id, auth.user.role]
      );
      await addExpenseHistory(client, {
        claimId,
        actionType: 'DOC_UPLOADED',
        fromStatus: claim.status,
        toStatus: claim.status,
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        remarks: `${docType} uploaded`,
        fieldChanges: { request_id: req.expenseRequestId, doc_type: docType }
      });
      await client.query('COMMIT');
      console.log(`[expense][${req.expenseRequestId}] document uploaded claim=${claimId} doc=${insert.rows[0].id}`);
      return res.status(201).json({ ...insert.rows[0], request_id: req.expenseRequestId });
    } catch (error) {
      await client.query('ROLLBACK');
      try { fs.unlinkSync(req.file.path); } catch (_err) {}
      console.error('Failed expense document upload', error);
      return res.status(500).json({ error: 'Failed to upload document' });
    } finally {
      client.release();
    }
  });
});

app.get('/expenses/documents/:id/download', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const docId = parsePositiveId(req.params.id);
  if (!docId) return res.status(400).json({ error: 'Invalid document id' });
  try {
    const docRes = await pool.query(
      `SELECT d.*, c.*
       FROM expense_claim_documents d
       JOIN expense_claims c ON c.id = d.claim_id
       WHERE d.id = $1 AND c.deleted_at IS NULL
       LIMIT 1`,
      [docId]
    );
    if (!docRes.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = docRes.rows[0];
    if (!canExpenseUserAccessClaim(auth.user, doc)) {
      return res.status(403).json({ error: 'Not allowed to view this document' });
    }
    const absolutePath = resolveStoredFilePath(doc.storage_path);
    if (!absolutePath) return res.status(404).json({ error: 'File missing' });
    return sendFileInline(res, absolutePath, doc.file_name, doc.mime_type || null);
  } catch (error) {
    console.error('Failed to download expense document', error);
    return res.status(500).json({ error: 'Failed to download expense document' });
  }
});

app.get('/expenses/notifications', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const result = await pool.query(
      `SELECT id, target_role, target_user_id, event_type, entity_type, entity_id, message, is_read, created_at, read_at
      , title
       FROM expense_notifications
       WHERE target_role = $1
         AND (target_user_id IS NULL OR target_user_id = $2)
       ORDER BY created_at DESC, id DESC
       LIMIT 200`,
      [auth.user.role, auth.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Failed to load expense notifications', error);
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
});

app.post('/expenses/notifications/mark-read', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(parsePositiveId).filter(Boolean) : [];
  try {
    if (ids.length) {
      await pool.query(
        `UPDATE expense_notifications
         SET is_read = true, read_at = NOW()
         WHERE id = ANY($1::int[])
           AND target_role = $2
           AND (target_user_id IS NULL OR target_user_id = $3)`,
        [ids, auth.user.role, auth.user.id]
      );
    } else {
      await pool.query(
        `UPDATE expense_notifications
         SET is_read = true, read_at = NOW()
         WHERE target_role = $1
           AND (target_user_id IS NULL OR target_user_id = $2)
           AND is_read = false`,
        [auth.user.role, auth.user.id]
      );
    }
    return res.json({ ok: true, request_id: req.expenseRequestId });
  } catch (error) {
    console.error('Failed to mark expense notifications as read', error);
    return res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

app.get('/expenses/dashboard', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!['Employee', 'Accounts', 'Manager', 'Admin'].includes(auth.user.role)) {
    return res.status(403).json({ error: 'Role cannot view dashboard' });
  }
  const { page, limit } = getPagination(req, { page: 1, limit: 25 }, 100);
  const fromDate = normalizeEmpty(req.query.from_date);
  const toDate = normalizeEmpty(req.query.to_date);
  const employeeId = parsePositiveId(req.query.employee_id);
  const categoryId = parsePositiveId(req.query.category_id);
  const statusFilter = normalizeExpenseStatus(req.query.status);
  const minAmount = toFiniteNumberOrNull(req.query.min_amount);
  const maxAmount = toFiniteNumberOrNull(req.query.max_amount);
  const values = [];
  const access = getExpenseAccessWhereSql(auth.user, 'ec', 1);
  values.push(...access.params);
  const filters = ['ec.deleted_at IS NULL', access.where];
  if (fromDate) {
    values.push(fromDate);
    filters.push(`ec.claim_date >= $${values.length}::date`);
  }
  if (toDate) {
    values.push(toDate);
    filters.push(`ec.claim_date <= $${values.length}::date`);
  }
  if (employeeId) {
    values.push(employeeId);
    filters.push(`ec.employee_id = $${values.length}`);
  }
  if (categoryId) {
    values.push(categoryId);
    filters.push(`ec.category_id = $${values.length}`);
  }
  if (statusFilter) {
    values.push(statusFilter);
    filters.push(`ec.status = $${values.length}`);
  }
  if (minAmount !== null) {
    values.push(minAmount);
    filters.push(`ec.amount >= $${values.length}`);
  }
  if (maxAmount !== null) {
    values.push(maxAmount);
    filters.push(`ec.amount <= $${values.length}`);
  }
  const where = filters.join(' AND ');
  try {
    const result = await pool.query(
      `SELECT ec.*, cat.name AS category_name, eu.full_name AS employee_name
       FROM expense_claims ec
       JOIN expense_users eu ON eu.id = ec.employee_id
       LEFT JOIN expense_categories cat ON cat.id = ec.category_id
       WHERE ${where}`,
      values
    );
    const rows = result.rows;
    const summary = {
      total_claims: rows.length,
      total_submitted: rows.filter((r) => ['SUBMITTED', 'ACCOUNTS_REVIEW', 'MANAGER_REVIEW', 'ADMIN_REVIEW', 'PAYMENT_PENDING', 'PAYMENT_INITIATED', 'PAYMENT_COMPLETED', 'REJECTED', 'NEED_MORE_INFO'].includes(r.status)).length,
      total_approved: rows.filter((r) => ['PAYMENT_PENDING', 'PAYMENT_INITIATED', 'PAYMENT_COMPLETED'].includes(r.status)).length,
      total_paid: rows.filter((r) => r.status === 'PAYMENT_COMPLETED').length,
      total_amount_claimed: rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
      total_amount_paid: rows.filter((r) => r.status === 'PAYMENT_COMPLETED').reduce((s, r) => s + (Number(r.amount) || 0), 0),
      pending_accounts: rows.filter((r) => r.status === 'ACCOUNTS_REVIEW').length,
      pending_manager: rows.filter((r) => r.status === 'MANAGER_REVIEW').length,
      pending_admin: rows.filter((r) => r.status === 'ADMIN_REVIEW').length,
      payment_pending: rows.filter((r) => r.status === 'PAYMENT_PENDING').length,
      payment_initiated: rows.filter((r) => r.status === 'PAYMENT_INITIATED').length,
      payment_completed: rows.filter((r) => r.status === 'PAYMENT_COMPLETED').length,
      rejected: rows.filter((r) => r.status === 'REJECTED').length
    };

    const categoryTotals = Object.values(rows.reduce((acc, row) => {
      const key = row.category_name || 'Uncategorized';
      if (!acc[key]) acc[key] = { category: key, count: 0, amount: 0 };
      acc[key].count += 1;
      acc[key].amount += Number(row.amount) || 0;
      return acc;
    }, {}));
    const employeeTotals = Object.values(rows.reduce((acc, row) => {
      const key = row.employee_name || `Employee-${row.employee_id}`;
      if (!acc[key]) acc[key] = { employee: key, count: 0, amount: 0 };
      acc[key].count += 1;
      acc[key].amount += Number(row.amount) || 0;
      return acc;
    }, {}));

    const pendingQueue = rows
      .filter((r) => ['ACCOUNTS_REVIEW', 'MANAGER_REVIEW', 'ADMIN_REVIEW', 'NEED_MORE_INFO'].includes(r.status))
      .slice(0, 500);
    const paymentQueue = rows
      .filter((r) => ['PAYMENT_PENDING', 'PAYMENT_INITIATED'].includes(r.status))
      .slice(0, 500);
    const sortedRecent = [...rows].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    const totalRecent = sortedRecent.length;
    const start = (page - 1) * limit;
    const recentClaims = sortedRecent.slice(start, start + limit);
    const recentClaimsMeta = getPaginationMeta({ page, limit, total: totalRecent });

    const includeRows = String(req.query.include_rows || 'false').toLowerCase() === 'true';
    return res.json({
      summary,
      pendingQueue,
      paymentQueue,
      recentClaims,
      recentClaimsMeta,
      categoryTotals,
      employeeTotals,
      rows: includeRows ? rows : [],
      rows_truncated: !includeRows
    });
  } catch (error) {
    console.error('Failed to load expense dashboard', error);
    return res.status(500).json({ error: 'Failed to load expense dashboard' });
  }
});

app.post('/admin/expense-users/seed', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can seed expense users' });
  const users = [
    ['EMP001', 'Employee 1', 'emp1', 'emp#4Pq1', 'Employee'],
    ['EMP002', 'Employee 2', 'emp2', 'emp#5Kr2', 'Employee'],
    ['EMP003', 'Employee 3', 'emp3', 'emp#6La3', 'Employee'],
    ['EMP004', 'Employee 4', 'emp4', 'emp#7Mx4', 'Employee'],
    ['EMP005', 'Employee 5', 'emp5', 'emp#8Ny5', 'Employee'],
    ['EMP006', 'Employee 6', 'emp6', 'emp#9Oz6', 'Employee'],
    ['EMP007', 'Employee 7', 'emp7', 'emp#1Pa7', 'Employee'],
    ['EMP008', 'Employee 8', 'emp8', 'emp#2Qb8', 'Employee'],
    ['EMP009', 'Employee 9', 'emp9', 'emp#3Rc9', 'Employee'],
    ['EMP010', 'Employee 10', 'emp10', 'emp#4Sd0', 'Employee'],
    ['MGR001', 'Expense Manager', 'exp_manager', 'mgr#9Tk2', 'Manager'],
    ['ACC001', 'Expense Accounts', 'exp_accounts', 'acc#8Vm3', 'Accounts'],
    ['ADM001', 'Expense Admin', 'exp_admin', 'adm#7Wn4', 'Admin']
  ];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [code, name, username, password, role] of users) {
      const hash = await bcrypt.hash(password, BCRYPT_COST);
      await client.query(
        `INSERT INTO expense_users(employee_code, full_name, username, password, role, is_active)
         VALUES($1,$2,$3,$4,$5,true)
         ON CONFLICT (username) DO UPDATE SET
           employee_code = EXCLUDED.employee_code,
           full_name = EXCLUDED.full_name,
           role = EXCLUDED.role,
           is_active = true,
           updated_at = NOW()`,
        [code, name, username, hash, role]
      );
    }
    await client.query('COMMIT');
    return res.json({ ok: true, seeded: users.length, request_id: req.expenseRequestId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to seed expense users', error);
    return res.status(500).json({ error: 'Failed to seed expense users' });
  } finally {
    client.release();
  }
});

app.get('/expenses/export', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (!['Employee', 'Accounts', 'Manager', 'Admin'].includes(auth.user.role)) {
    return res.status(403).json({ error: 'Role cannot export expenses' });
  }
  const MAX_EXPORT_ROWS = 10000;
  try {
    const access = getExpenseAccessWhereSql(auth.user, 'ec', 1);
    const fromDate = normalizeEmpty(req.query.from_date);
    const toDate = normalizeEmpty(req.query.to_date);
    const employeeId = parsePositiveId(req.query.employee_id);
    const categoryId = parsePositiveId(req.query.category_id);
    const statusFilter = normalizeExpenseStatus(req.query.status);
    const minAmount = toFiniteNumberOrNull(req.query.min_amount);
    const maxAmount = toFiniteNumberOrNull(req.query.max_amount);
    const values = [...access.params];
    const filters = ['ec.deleted_at IS NULL', access.where];
    if (fromDate) {
      values.push(fromDate);
      filters.push(`ec.claim_date >= $${values.length}::date`);
    }
    if (toDate) {
      values.push(toDate);
      filters.push(`ec.claim_date <= $${values.length}::date`);
    }
    if (employeeId) {
      values.push(employeeId);
      filters.push(`ec.employee_id = $${values.length}`);
    }
    if (categoryId) {
      values.push(categoryId);
      filters.push(`ec.category_id = $${values.length}`);
    }
    if (statusFilter) {
      values.push(statusFilter);
      filters.push(`ec.status = $${values.length}`);
    }
    if (minAmount !== null) {
      values.push(minAmount);
      filters.push(`ec.amount >= $${values.length}`);
    }
    if (maxAmount !== null) {
      values.push(maxAmount);
      filters.push(`ec.amount <= $${values.length}`);
    }
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM expense_claims ec
       WHERE ${filters.join(' AND ')}`,
      values
    );
    const total = countRes.rows[0]?.total || 0;
    if (total > MAX_EXPORT_ROWS) {
      return res.status(400).json({ error: `Export limit exceeded. Please narrow filters (max ${MAX_EXPORT_ROWS} rows).` });
    }
    const result = await pool.query(
      `SELECT
        ec.id, ec.claim_number, eu.full_name AS employee_name, ec.pay_to, ec.voucher_no, ec.claim_date, ec.amount,
        cat.name AS category_name, ec.status, ec.purpose, ec.submitted_at, ec.current_assigned_role,
        ec.payment_initiated_at, ec.payment_completed_at
       FROM expense_claims ec
       JOIN expense_users eu ON eu.id = ec.employee_id
       LEFT JOIN expense_categories cat ON cat.id = ec.category_id
       WHERE ${filters.join(' AND ')}
       ORDER BY ec.updated_at DESC, ec.id DESC`,
      values
    );
    const headers = [
      'Claim ID',
      'Claim Number',
      'Employee',
      'Pay To',
      'Voucher No',
      'Date',
      'Amount',
      'Category',
      'Status',
      'Purpose',
      'Submitted At',
      'Current Assigned Role',
      'Payment Initiated At',
      'Payment Completed At'
    ];
    const lines = [headers.join(',')];
    result.rows.forEach((row) => {
      lines.push([
        safeCsvValue(row.id),
        safeCsvValue(row.claim_number),
        safeCsvValue(row.employee_name),
        safeCsvValue(row.pay_to),
        safeCsvValue(row.voucher_no),
        safeCsvValue(row.claim_date),
        safeCsvValue(row.amount),
        safeCsvValue(row.category_name),
        safeCsvValue(row.status),
        safeCsvValue(row.purpose),
        safeCsvValue(row.submitted_at),
        safeCsvValue(row.current_assigned_role),
        safeCsvValue(row.payment_initiated_at),
        safeCsvValue(row.payment_completed_at)
      ].join(','));
    });
    const fileName = `expense_claims_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(lines.join('\n'));
  } catch (error) {
    console.error('Failed to export expenses', error);
    return res.status(500).json({ error: 'Failed to export expenses' });
  }
});

app.get('/expenses', async (req, res) => {
  const auth = await readExpenseUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.user.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view all claims' });
  try {
    const { page, limit, offset } = getPagination(req);
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM expense_claims WHERE deleted_at IS NULL`);
    const total = countRes.rows[0]?.total || 0;
    const result = await pool.query(
      `SELECT ec.*, eu.full_name AS employee_name, cat.name AS category_name
       FROM expense_claims ec
       JOIN expense_users eu ON eu.id = ec.employee_id
       LEFT JOIN expense_categories cat ON cat.id = ec.category_id
       WHERE ec.deleted_at IS NULL
       ORDER BY ec.updated_at DESC, ec.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return res.json({ rows: result.rows, meta: getPaginationMeta({ page, limit, total }) });
  } catch (error) {
    console.error('Failed to load all expense claims', error);
    return res.status(500).json({ error: 'Failed to load all expense claims' });
  }
});

app.get('/admin/control/users', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can manage control panel users' });
  try {
    const usersRes = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.is_active, u.created_at, u.updated_at,
              COALESCE(json_agg(ur.role_name ORDER BY ur.role_name) FILTER (WHERE ur.role_name IS NOT NULL), '[]'::json) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = true
       GROUP BY u.id
       ORDER BY u.updated_at DESC, u.id DESC`
    );
    return res.json(usersRes.rows);
  } catch (error) {
    console.error('Failed to load control panel users', error);
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

app.get('/admin/control/employees', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view employees' });
  try {
    const usersRes = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.is_active, u.updated_at,
              COALESCE(json_agg(ur.role_name ORDER BY ur.role_name) FILTER (WHERE ur.role_name IS NOT NULL AND ur.is_active = true), '[]'::json) AS transport_roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       GROUP BY u.id
       ORDER BY u.updated_at DESC, u.id DESC`
    );
    const expenseRes = await pool.query(
      `SELECT id, username, full_name, role, is_active, updated_at
       FROM expense_users
       ORDER BY updated_at DESC, id DESC`
    );

    const byUsername = new Map();
    usersRes.rows.forEach((u) => {
      byUsername.set(u.username, {
        username: u.username,
        full_name: u.full_name,
        is_active: u.is_active,
        updated_at: u.updated_at,
        transport_roles: Array.isArray(u.transport_roles) ? u.transport_roles : [],
        expense_role: null,
        source: 'transport'
      });
    });
    expenseRes.rows.forEach((e) => {
      if (byUsername.has(e.username)) {
        const row = byUsername.get(e.username);
        row.expense_role = e.role;
        row.is_active = row.is_active && e.is_active;
        row.updated_at = row.updated_at > e.updated_at ? row.updated_at : e.updated_at;
        row.source = 'both';
      } else {
        byUsername.set(e.username, {
          username: e.username,
          full_name: e.full_name,
          is_active: e.is_active,
          updated_at: e.updated_at,
          transport_roles: [],
          expense_role: e.role,
          source: 'expense'
        });
      }
    });
    return res.json(Array.from(byUsername.values()).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
  } catch (error) {
    console.error('Failed to load employees', error);
    return res.status(500).json({ error: 'Failed to load employees' });
  }
});

app.post('/admin/control/employees', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can manage employees' });

  const username = String(req.body.username || '').trim();
  const fullName = String(req.body.full_name || '').trim();
  const password = normalizeEmpty(req.body.password);
  const isActive = req.body.is_active === undefined ? true : Boolean(req.body.is_active);
  const transportRoles = Array.isArray(req.body.transport_roles)
    ? req.body.transport_roles.filter((r) => VALID_ROLES.includes(r))
    : [];
  const expenseRole = normalizeEmpty(req.body.expense_role);
  const validExpenseRole = expenseRole && EXPENSE_ROLES.includes(expenseRole) ? expenseRole : null;

  if (!username || !fullName) {
    return res.status(400).json({ error: 'username and full_name are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let transportUserId = null;
    if (transportRoles.length > 0) {
      const existingTransportUser = await client.query(
        `SELECT id, password_hash FROM users WHERE username = $1 LIMIT 1`,
        [username]
      );
      const hash = password ? await bcrypt.hash(String(password), BCRYPT_COST) : null;
      const existingHash = existingTransportUser.rows.length ? existingTransportUser.rows[0].password_hash : null;
      const hashForInsert = hash || existingHash || await bcrypt.hash('ChangeMe#123', BCRYPT_COST);
      const uRes = await client.query(
        `INSERT INTO users(username, full_name, password_hash, is_active)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (username) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             is_active = EXCLUDED.is_active,
             password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
             updated_at = NOW()
         RETURNING id`,
        [username, fullName, hashForInsert, isActive]
      );
      transportUserId = uRes.rows[0].id;
      await client.query(`UPDATE user_roles SET is_active = false, updated_at = NOW() WHERE user_id = $1`, [transportUserId]);
      for (const roleName of transportRoles) {
        await client.query(
          `INSERT INTO user_roles(user_id, role_name, is_active)
           VALUES ($1,$2,true)
           ON CONFLICT (user_id, role_name)
           DO UPDATE SET is_active = true, updated_at = NOW()`,
          [transportUserId, roleName]
        );
      }
    }

    if (validExpenseRole) {
      const existing = await client.query(`SELECT id FROM expense_users WHERE username = $1 LIMIT 1`, [username]);
      const hash = password ? await bcrypt.hash(String(password), BCRYPT_COST) : null;
      if (existing.rows.length) {
        await client.query(
          `UPDATE expense_users
           SET full_name = $1,
               role = $2,
               is_active = $3,
               password = COALESCE($4, password),
               updated_at = NOW()
           WHERE id = $5`,
          [fullName, validExpenseRole, isActive, hash, existing.rows[0].id]
        );
      } else {
        const finalHash = hash || await bcrypt.hash('ChangeMe#123', BCRYPT_COST);
        await client.query(
          `INSERT INTO expense_users(employee_code, full_name, username, password, role, is_active)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [null, fullName, username, finalHash, validExpenseRole, isActive]
        );
      }
    }

    await client.query('COMMIT');
    return res.status(201).json({ ok: true, username, full_name: fullName, transport_roles: transportRoles, expense_role: validExpenseRole, is_active: isActive });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to upsert employee', error);
    return res.status(500).json({ error: `Failed to save employee: ${error.message || 'unknown error'}` });
  } finally {
    client.release();
  }
});

app.get('/admin/control/overview', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view control overview' });
  try {
    const [usersCount, expenseUsersCount, customersCount] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE is_active = true`),
      pool.query(`SELECT COUNT(*)::int AS count FROM expense_users WHERE is_active = true`),
      pool.query(`SELECT COUNT(*)::int AS count FROM customer_users WHERE is_active = true`)
    ]);
    return res.json({
      flags: appConfig.flags,
      role_pins: ROLE_PINS,
      counts: {
        users_active: usersCount.rows[0]?.count || 0,
        expense_users_active: expenseUsersCount.rows[0]?.count || 0,
        customer_users_active: customersCount.rows[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('Failed to load control overview', error);
    return res.status(500).json({ error: 'Failed to load control overview' });
  }
});

app.post('/admin/control/users', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can create control panel users' });

  const username = String(req.body.username || '').trim();
  const fullName = String(req.body.full_name || '').trim();
  const password = String(req.body.password || '').trim();
  const roles = Array.isArray(req.body.roles) ? req.body.roles.filter((r) => VALID_ROLES.includes(r)) : [];
  if (!username || !fullName || !password || !roles.length) {
    return res.status(400).json({ error: 'username, full_name, password and at least one valid role are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const userRes = await client.query(
      `INSERT INTO users(username, full_name, password_hash, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (username) DO UPDATE SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash, is_active = true, updated_at = NOW()
       RETURNING id, username, full_name, is_active`,
      [username, fullName, hash]
    );
    const userId = userRes.rows[0].id;
    await client.query(`UPDATE user_roles SET is_active = false, updated_at = NOW() WHERE user_id = $1`, [userId]);
    for (const roleName of roles) {
      await client.query(
        `INSERT INTO user_roles(user_id, role_name, is_active)
         VALUES ($1, $2, true)
         ON CONFLICT (user_id, role_name) DO UPDATE SET is_active = true, updated_at = NOW()`,
        [userId, roleName]
      );
    }
    await client.query('COMMIT');
    return res.status(201).json({ ...userRes.rows[0], roles });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to upsert control panel user', error);
    return res.status(500).json({ error: 'Failed to upsert user' });
  } finally {
    client.release();
  }
});

app.get('/admin/control/expense-users', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view expense users' });
  try {
    const result = await pool.query(
      `SELECT id, employee_code, full_name, username, role, is_active, created_at, updated_at
       FROM expense_users
       ORDER BY updated_at DESC, id DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Failed to load expense users', error);
    return res.status(500).json({ error: 'Failed to load expense users' });
  }
});

app.post('/admin/control/expense-users', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can upsert expense users' });
  const employeeCode = normalizeEmpty(req.body.employee_code);
  const fullName = String(req.body.full_name || '').trim();
  const username = String(req.body.username || '').trim();
  const role = String(req.body.role || '').trim();
  const password = normalizeEmpty(req.body.password);
  const isActive = req.body.is_active === undefined ? true : Boolean(req.body.is_active);
  if (!fullName || !username || !EXPENSE_ROLES.includes(role)) {
    return res.status(400).json({ error: 'full_name, username and valid role are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT id, password FROM expense_users WHERE username = $1 LIMIT 1`, [username]);
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(String(password), BCRYPT_COST);
    }
    let row;
    if (existing.rows.length) {
      const current = existing.rows[0];
      await client.query(
        `UPDATE expense_users
         SET employee_code = COALESCE($1, employee_code),
             full_name = $2,
             role = $3,
             is_active = $4,
             password = COALESCE($5, password),
             updated_at = NOW()
         WHERE id = $6`,
        [employeeCode, fullName, role, isActive, passwordHash, current.id]
      );
      const refreshed = await client.query(
        `SELECT id, employee_code, full_name, username, role, is_active, created_at, updated_at
         FROM expense_users WHERE id = $1`,
        [current.id]
      );
      row = refreshed.rows[0];
    } else {
      const finalHash = passwordHash || await bcrypt.hash('ChangeMe#123', BCRYPT_COST);
      const inserted = await client.query(
        `INSERT INTO expense_users(employee_code, full_name, username, password, role, is_active)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, employee_code, full_name, username, role, is_active, created_at, updated_at`,
        [employeeCode, fullName, username, finalHash, role, isActive]
      );
      row = inserted.rows[0];
    }
    await client.query('COMMIT');
    return res.status(201).json(row);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to upsert expense user', error);
    return res.status(500).json({ error: 'Failed to upsert expense user' });
  } finally {
    client.release();
  }
});

app.get('/admin/control/customer-users', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view customer users' });
  try {
    const result = await pool.query(
      `SELECT id, customer_name, username, display_name, is_active, created_at, updated_at
       FROM customer_users
       ORDER BY updated_at DESC, id DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Failed to load customer users', error);
    return res.status(500).json({ error: 'Failed to load customer users' });
  }
});

app.post('/admin/control/customer-users', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can upsert customer users' });
  const customerName = String(req.body.customer_name || '').trim();
  const username = String(req.body.username || '').trim();
  const displayName = normalizeEmpty(req.body.display_name);
  const password = normalizeEmpty(req.body.password);
  const isActive = req.body.is_active === undefined ? true : Boolean(req.body.is_active);
  if (!customerName || !username) {
    return res.status(400).json({ error: 'customer_name and username are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT id, password FROM customer_users WHERE username = $1 LIMIT 1`, [username]);
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(String(password), BCRYPT_COST);
    }
    let row;
    if (existing.rows.length) {
      const current = existing.rows[0];
      await client.query(
        `UPDATE customer_users
         SET customer_name = $1,
             display_name = $2,
             is_active = $3,
             password = COALESCE($4, password),
             updated_at = NOW()
         WHERE id = $5`,
        [customerName, displayName, isActive, passwordHash, current.id]
      );
      const refreshed = await client.query(
        `SELECT id, customer_name, username, display_name, is_active, created_at, updated_at
         FROM customer_users WHERE id = $1`,
        [current.id]
      );
      row = refreshed.rows[0];
    } else {
      const finalHash = passwordHash || await bcrypt.hash('ChangeMe#123', BCRYPT_COST);
      const inserted = await client.query(
        `INSERT INTO customer_users(customer_name, username, password, display_name, is_active)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, customer_name, username, display_name, is_active, created_at, updated_at`,
        [customerName, username, finalHash, displayName, isActive]
      );
      row = inserted.rows[0];
    }
    await client.query('COMMIT');
    return res.status(201).json(row);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to upsert customer user', error);
    return res.status(500).json({ error: 'Failed to upsert customer user' });
  } finally {
    client.release();
  }
});

app.post('/admin/control/seed-current-data', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can run control seed sync' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seedAccounts = [
      { role: 'Admin', username: 'admin_role', full_name: 'Transport Admin', password: 'Admin@1234' },
      { role: 'Manager', username: 'manager_role', full_name: 'Transport Manager', password: 'Manager@1234' },
      { role: 'Accounts', username: 'accounts_role', full_name: 'Transport Accounts', password: 'Accounts@1234' },
      { role: 'Dispatch', username: 'dispatch_role', full_name: 'Transport Dispatch', password: 'Dispatch@1234' },
      { role: 'Loading', username: 'loading_role', full_name: 'Transport Loading', password: 'Loading@1234' },
      { role: 'Weighbridge', username: 'weighbridge_role', full_name: 'Transport Weighbridge', password: 'Weighbridge@1234' },
      { role: 'Gate', username: 'gate_role', full_name: 'Transport Gate', password: 'Gate@1234' }
    ];

    for (const account of seedAccounts) {
      const hash = await bcrypt.hash(account.password, BCRYPT_COST);
      const userRes = await client.query(
        `INSERT INTO users(username, full_name, password_hash, is_active)
         VALUES ($1,$2,$3,true)
         ON CONFLICT (username)
         DO UPDATE SET full_name = EXCLUDED.full_name, is_active = true, updated_at = NOW()
         RETURNING id`,
        [account.username, account.full_name, hash]
      );
      const userId = userRes.rows[0].id;
      await client.query(
        `INSERT INTO user_roles(user_id, role_name, is_active)
         VALUES ($1,$2,true)
         ON CONFLICT (user_id, role_name)
         DO UPDATE SET is_active = true, updated_at = NOW()`,
        [userId, account.role]
      );
    }

    const masterQueries = [
      {
        type: 'materials',
        sql: `SELECT DISTINCT NULLIF(TRIM(material_type), '') AS value FROM trips WHERE NULLIF(TRIM(material_type), '') IS NOT NULL`
      },
      {
        type: 'grades',
        sql: `SELECT DISTINCT NULLIF(TRIM(grade), '') AS value FROM trips WHERE NULLIF(TRIM(grade), '') IS NOT NULL`
      },
      {
        type: 'conditions',
        sql: `SELECT DISTINCT NULLIF(TRIM(condition), '') AS value FROM trips WHERE NULLIF(TRIM(condition), '') IS NOT NULL`
      },
      {
        type: 'packing',
        sql: `SELECT DISTINCT NULLIF(TRIM(packing), '') AS value FROM trips WHERE NULLIF(TRIM(packing), '') IS NOT NULL`
      },
      {
        type: 'loading_points',
        sql: `SELECT DISTINCT NULLIF(TRIM(loading_point), '') AS value FROM trips WHERE NULLIF(TRIM(loading_point), '') IS NOT NULL`
      },
      {
        type: 'loading_teams',
        sql: `SELECT DISTINCT NULLIF(TRIM(labour_team), '') AS value FROM trips WHERE NULLIF(TRIM(labour_team), '') IS NOT NULL`
      },
      {
        type: 'transporters',
        sql: `
          SELECT DISTINCT value FROM (
            SELECT NULLIF(TRIM(transporter), '') AS value FROM trips
            UNION
            SELECT NULLIF(TRIM(transporter), '') AS value FROM expected_trucks
          ) x WHERE value IS NOT NULL`
      },
      {
        type: 'locations',
        sql: `
          SELECT DISTINCT value FROM (
            SELECT NULLIF(TRIM(location), '') AS value FROM trips
            UNION
            SELECT NULLIF(TRIM(location), '') AS value FROM expected_trucks
          ) x WHERE value IS NOT NULL`
      }
    ];

    let mastersInserted = 0;
    for (const def of masterQueries) {
      const rows = await client.query(def.sql);
      for (const row of rows.rows) {
        if (!row.value) continue;
        const upsert = await client.query(
          `INSERT INTO admin_master_values(master_type, value, is_active, metadata_json)
           VALUES ($1,$2,true,'{}'::jsonb)
           ON CONFLICT (master_type, value)
           DO UPDATE SET is_active = true, updated_at = NOW()
           RETURNING id`,
          [def.type, row.value]
        );
        if (upsert.rows.length) mastersInserted += 1;
      }
    }

    await client.query('COMMIT');
    return res.json({
      ok: true,
      transport_users_seeded: seedAccounts.length,
      master_values_synced: mastersInserted
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to seed current control data', error);
    return res.status(500).json({ error: 'Failed to seed current data' });
  } finally {
    client.release();
  }
});

function normalizeMasterType(type) {
  const key = String(type || '').trim().toLowerCase();
  const aliases = {
    packings: 'packing',
    materials: 'materials',
    grades: 'grades',
    conditions: 'conditions',
    loading_points: 'loading_points',
    loading_teams: 'loading_teams',
    transporters: 'transporters',
    locations: 'locations',
    products: 'products',
    packing: 'packing'
  };
  return aliases[key] || key;
}

function sendFileInline(res, absolutePath, fileName, mimeType = null) {
  if (mimeType) res.type(mimeType);
  const safeName = String(fileName || 'document').replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  return res.sendFile(absolutePath);
}

function resolveStoredFilePath(storagePath) {
  const raw = String(storagePath || '').trim();
  if (!raw) return null;
  const candidates = [];
  if (path.isAbsolute(raw)) {
    candidates.push(path.resolve(raw));
  }
  candidates.push(path.resolve(__dirname, raw));
  if (!raw.startsWith('uploads/')) {
    candidates.push(path.resolve(UPLOADS_ROOT_DIR, raw));
    candidates.push(path.resolve(DOC_UPLOAD_DIR, raw));
  }
  const roots = [UPLOADS_ROOT_DIR, DOC_UPLOAD_DIR];
  for (const candidate of candidates) {
    if (roots.some((root) => candidate.startsWith(root)) && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getMasterFallbackQueries() {
  return {
    materials: `SELECT DISTINCT NULLIF(TRIM(material_type), '') AS value FROM trips WHERE NULLIF(TRIM(material_type), '') IS NOT NULL`,
    grades: `SELECT DISTINCT NULLIF(TRIM(grade), '') AS value FROM trips WHERE NULLIF(TRIM(grade), '') IS NOT NULL`,
    conditions: `SELECT DISTINCT NULLIF(TRIM(condition), '') AS value FROM trips WHERE NULLIF(TRIM(condition), '') IS NOT NULL`,
    packing: `SELECT DISTINCT NULLIF(TRIM(packing), '') AS value FROM trips WHERE NULLIF(TRIM(packing), '') IS NOT NULL`,
    loading_points: `SELECT DISTINCT NULLIF(TRIM(loading_point), '') AS value FROM trips WHERE NULLIF(TRIM(loading_point), '') IS NOT NULL`,
    loading_teams: `SELECT DISTINCT NULLIF(TRIM(labour_team), '') AS value FROM trips WHERE NULLIF(TRIM(labour_team), '') IS NOT NULL`,
    transporters: `
      SELECT DISTINCT value FROM (
        SELECT NULLIF(TRIM(transporter), '') AS value FROM trips
        UNION
        SELECT NULLIF(TRIM(transporter), '') AS value FROM expected_trucks
      ) x WHERE value IS NOT NULL`,
    locations: `
      SELECT DISTINCT value FROM (
        SELECT NULLIF(TRIM(location), '') AS value FROM trips
        UNION
        SELECT NULLIF(TRIM(location), '') AS value FROM expected_trucks
      ) x WHERE value IS NOT NULL`
  };
}

async function readMasterOptionsForTypes(types = []) {
  const fallbackQueries = getMasterFallbackQueries();
  const result = {};
  for (const rawType of types) {
    const masterType = normalizeMasterType(rawType);
    if (!masterType || masterType === 'customers') continue;
    const rows = await pool.query(
      `SELECT value, metadata_json
       FROM admin_master_values
       WHERE master_type = $1 AND is_active = true
       ORDER BY updated_at DESC, id DESC`,
      [masterType]
    );
    if (rows.rows.length) {
      if (masterType === 'materials' || masterType === 'grades') {
        result[rawType] = rows.rows.map((r) => ({
          value: r.value,
          price_per_mt: Number(r.metadata_json?.price_per_mt) || null
        }));
      } else {
        result[rawType] = rows.rows.map((r) => r.value).filter(Boolean);
      }
      continue;
    }
    const fallbackSql = fallbackQueries[masterType];
    if (!fallbackSql) {
      result[rawType] = [];
      continue;
    }
    const fallback = await pool.query(fallbackSql);
    if (masterType === 'materials' || masterType === 'grades') {
      result[rawType] = fallback.rows.map((r) => ({ value: r.value, price_per_mt: null })).filter((r) => r.value);
    } else {
      result[rawType] = fallback.rows.map((r) => r.value).filter(Boolean);
    }
  }
  return result;
}

app.get('/admin/control/masters/:masterType', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view master values' });
  const masterType = normalizeMasterType(req.params.masterType);
  if (masterType === 'customers') {
    return res.status(400).json({ error: 'customers master type is disabled. Manage customers from Customers section.' });
  }
  if (!masterType) return res.status(400).json({ error: 'masterType is required' });
  try {
    const rows = await pool.query(
      `SELECT id, master_type, value, is_active, metadata_json, created_at, updated_at
       FROM admin_master_values
       WHERE master_type = $1
       ORDER BY is_active DESC, updated_at DESC, id DESC`,
      [masterType]
    );
    if (rows.rows.length) {
      return res.json(rows.rows);
    }

    const sql = getMasterFallbackQueries()[masterType];
    if (!sql) return res.json([]);
    const fallback = await pool.query(sql);
    const mapped = fallback.rows
      .map((r, idx) => ({
        id: -(idx + 1),
        master_type: masterType,
        value: r.value,
        is_active: true,
        metadata_json: {},
        created_at: null,
        updated_at: null
      }));
    return res.json(mapped);
  } catch (error) {
    console.error('Failed to load master values', error);
    return res.status(500).json({ error: 'Failed to load master values' });
  }
});

app.post('/admin/control/masters/:masterType', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can update master values' });
  const masterType = normalizeMasterType(req.params.masterType);
  if (masterType === 'customers') {
    return res.status(400).json({ error: 'customers master type is disabled. Manage customers from Customers section.' });
  }
  const value = String(req.body.value || '').trim();
  const isActive = req.body.is_active === undefined ? true : Boolean(req.body.is_active);
  const metadata = req.body.metadata_json && typeof req.body.metadata_json === 'object'
    ? req.body.metadata_json
    : {};
  if (masterType === 'materials' || masterType === 'grades') {
    const rate = req.body.price_per_mt;
    metadata.price_per_mt = rate === '' || rate === null || rate === undefined ? null : Number(rate);
    if (metadata.price_per_mt !== null && (!Number.isFinite(metadata.price_per_mt) || metadata.price_per_mt < 0)) {
      return res.status(400).json({ error: 'price_per_mt must be a valid non-negative number' });
    }
  }
  if (!masterType || !value) {
    return res.status(400).json({ error: 'masterType and value are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO admin_master_values(master_type, value, is_active, metadata_json)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (master_type, value)
       DO UPDATE SET is_active = EXCLUDED.is_active, metadata_json = EXCLUDED.metadata_json, updated_at = NOW()
       RETURNING id, master_type, value, is_active, metadata_json, created_at, updated_at`,
      [masterType, value, isActive, JSON.stringify(metadata)]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Failed to upsert master value', error);
    return res.status(500).json({ error: 'Failed to upsert master value' });
  }
});

app.get('/masters/options', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const types = String(req.query.types || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (!types.length) return res.status(400).json({ error: 'types query is required' });
  try {
    const data = await readMasterOptionsForTypes(types);
    return res.json(data);
  } catch (error) {
    console.error('Failed to load masters options', error);
    return res.status(500).json({ error: 'Failed to load masters options' });
  }
});

app.get('/customers/options', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const result = await pool.query(
      `SELECT DISTINCT value FROM (
         SELECT NULLIF(TRIM(customer_name), '') AS value FROM customer_users WHERE is_active = true
         UNION
         SELECT NULLIF(TRIM(customer_name), '') AS value FROM trips
         UNION
         SELECT NULLIF(TRIM(customer_name), '') AS value FROM expected_trucks
       ) x
       WHERE value IS NOT NULL
       ORDER BY value ASC`
    );
    return res.json(result.rows.map((r) => r.value).filter(Boolean));
  } catch (error) {
    console.error('Failed to load customer options', error);
    return res.status(500).json({ error: 'Failed to load customer options' });
  }
});

app.get('/pricing/defaults', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    const row = await pool.query(`SELECT value_json FROM admin_settings WHERE key = 'pricing_defaults' LIMIT 1`);
    return res.json({
      default_gst_percent: toFiniteNumberOrNull(row.rows[0]?.value_json?.default_gst_percent)
    });
  } catch (error) {
    console.error('Failed to load pricing defaults', error);
    return res.status(500).json({ error: 'Failed to load pricing defaults' });
  }
});

app.get('/customer/masters/options', async (req, res) => {
  const auth = await readCustomerUserFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const types = String(req.query.types || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (!types.length) return res.status(400).json({ error: 'types query is required' });
  try {
    const data = await readMasterOptionsForTypes(types);
    return res.json(data);
  } catch (error) {
    console.error('Failed to load customer masters options', error);
    return res.status(500).json({ error: 'Failed to load master options' });
  }
});

app.get('/admin/control/settings', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can view settings' });
  try {
    const row = await pool.query(`SELECT value_json FROM admin_settings WHERE key = 'pricing_defaults' LIMIT 1`);
    return res.json(row.rows[0]?.value_json || { default_gst_percent: null });
  } catch (error) {
    console.error('Failed to load admin settings', error);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.post('/admin/control/settings', async (req, res) => {
  const auth = readRoleFromRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  if (auth.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can update settings' });
  const gst = req.body.default_gst_percent;
  const gstValue = gst === '' || gst === null || gst === undefined ? null : Number(gst);
  if (gstValue !== null && (!Number.isFinite(gstValue) || gstValue < 0 || gstValue > 100)) {
    return res.status(400).json({ error: 'default_gst_percent must be between 0 and 100' });
  }
  try {
    const valueJson = { default_gst_percent: gstValue };
    const result = await pool.query(
      `INSERT INTO admin_settings(key, value_json, updated_at)
       VALUES ('pricing_defaults', $1::jsonb, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
       RETURNING value_json, updated_at`,
      [JSON.stringify(valueJson)]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update admin settings', error);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

validateProductionConfig();

initDb()
  .then(async () => {
    await migratePlainExpensePasswords();
    runExpectedTruckAutomation();
    runExpenseSecurityCleanup();
    setInterval(runExpectedTruckAutomation, 5 * 60 * 1000);
    setInterval(runExpenseSecurityCleanup, 60 * 60 * 1000);
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
