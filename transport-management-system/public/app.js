let userRole = null;
let employeeSessionRoles = [];
let allTrips = [];
const loadingDetailsDrafts = new Map();
const billingDetailsDrafts = new Map();
const tripDocumentsCache = new Map();
const tripDocumentsLoading = new Set();

const IST_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET = '+05:30';
const TRANSPORTER_STORAGE_KEY = 'transporterOptions';
const TRANSPORTER_STORAGE_VERSION_KEY = 'transporterOptionsVersion';
const TRANSPORTER_STORAGE_VERSION = '2026-05-12-master-source';
const LOCATION_STORAGE_KEY = 'locationOptions';
const EMPLOYEE_TRANSPORT_TOKEN_KEY = 'employeeTransportToken';
const BASE_TRANSPORTER_OPTIONS = [];
const VALID_ROLES = ['Gate', 'Dispatch', 'Loading', 'Weighbridge', 'Accounts', 'Manager', 'Admin'];
const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];

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
  TARE_WEIGHT_DONE: 'AT_DISPATCH',
  LOADING_COMPLETED: 'GROSS_WEIGHT_PENDING',
  GROSS_WEIGHT_DONE: 'BILLING_PENDING',
  BILLING_COMPLETED: 'COMPLETED'
};

const ROLE_PINS = {
  Gate: 'G8P2',
  Weighbridge: 'W3K7',
  Dispatch: 'D9M4',
  Loading: 'L5Q8',
  Accounts: 'A6R1',
  Manager: 'M2N6',
  Admin: '2802'
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
const DOC_UPLOAD_ROLES = ['Dispatch', 'Weighbridge', 'Accounts', 'Admin'];
const DOC_VIEW_ROLES = ['Dispatch', 'Weighbridge', 'Accounts', 'Admin'];

const DEFAULT_DISPATCH_DROPDOWNS = {
  loading_point: ['Other'],
  labour_team: ['Other'],
  material_type: ['Other'],
  grade: ['Other'],
  condition: ['Other'],
  packing: ['Other']
};
let DISPATCH_DROPDOWNS = { ...DEFAULT_DISPATCH_DROPDOWNS };
const DEFAULT_PERSON_DROPDOWNS = {
  Gate: ['Other'],
  Dispatch: ['Other'],
  Loading: ['Other'],
  Weighbridge: ['Other'],
  Accounts: ['Ashutosh', 'Other']
};
let PERSON_DROPDOWNS = { ...DEFAULT_PERSON_DROPDOWNS };
const PERSON_FIELD_BY_ROLE = {
  Dispatch: 'dispatch_manager_name',
  Loading: 'loading_person_name',
  Weighbridge: 'weight_operator_name',
  Accounts: 'accounts_person_name'
};
const STATUS_ASSIGNEE_RULES = [
  { statuses: ['AT_DISPATCH', 'WAITING', 'READY_FOR_LOADING'], roleLabel: 'Dispatch Manager', field: 'dispatch_done_by' },
  { statuses: ['SENT_FOR_TARE_WEIGHT', 'TARE_WEIGHT_DONE'], roleLabel: 'WB Operator (Tare)', field: 'tare_done_by' },
  { statuses: ['LOADING_IN_PROGRESS', 'LOADING_COMPLETED', 'LOAD_FIX_REQUIRED'], roleLabel: 'Loading Manager', field: 'loading_done_by' },
  { statuses: ['GROSS_WEIGHT_PENDING', 'GROSS_WEIGHT_DONE'], roleLabel: 'WB Operator (Gross)', field: 'gross_done_by' },
  { statuses: ['BILLING_PENDING', 'BILLING_COMPLETED', 'COMPLETED'], roleLabel: 'Accounts Manager', field: 'billing_done_by' }
];

const form = document.getElementById('trip-form');
const tripsTable = document.getElementById('trips-table');
const tripsMobileList = document.getElementById('trips-mobile-list');
const tripsHeaderRow = document.querySelector('.table-container table thead tr');
const messageEl = document.getElementById('message');
const clearButton = document.getElementById('clear-button');
const roleIndicator = document.getElementById('role-indicator');
const timelineModal = document.getElementById('timeline-modal');
const timelineModalTitle = document.getElementById('timeline-modal-title');
const timelineModalBody = document.getElementById('timeline-modal-body');
let globalToastTimer = null;
const adminWorkflowModal = document.getElementById('admin-workflow-modal');
const adminWorkflowModalTitle = document.getElementById('admin-workflow-modal-title');
const adminWorkflowModalBody = document.getElementById('admin-workflow-modal-body');
const tasksLink = document.getElementById('tasks-link');
const taskNotificationsBtn = document.getElementById('task-notifications-btn');
const taskNotificationBadge = document.getElementById('task-notification-badge');
const tasksModal = document.getElementById('tasks-modal');
const tasksTable = document.getElementById('tasks-table');
const tasksMobileList = document.getElementById('tasks-mobile-list');
const tasksMessageEl = document.getElementById('tasks-message');
const taskDetailModal = document.getElementById('task-detail-modal');
const taskDetailTitle = document.getElementById('task-detail-title');
const taskDetailBody = document.getElementById('task-detail-body');
const createTaskBtn = document.getElementById('create-task-btn');
const createTaskPanel = document.getElementById('create-task-panel');
const createTaskForm = document.getElementById('create-task-form');
const taskAssigneeOptions = document.getElementById('task-assignee-options');
const taskMarkAllReadBtn = document.getElementById('task-mark-all-read-btn');

const customerSelect = document.getElementById('customer-select');
const customerOther = document.getElementById('customer-other');
const transporterInput = document.getElementById('transporter-input');
const transporterSuggestions = document.getElementById('transporter-suggestions');
const locationOptionsDatalist = document.getElementById('location-options');
const gatePersonSelect = document.getElementById('gate-person-select');
const gatePersonOther = document.getElementById('gate-person-other');
let transporterOptions = [];
let locationOptions = [];
let gradePricingMap = new Map();
let pricingDefaults = { default_gst_percent: null };
let tasksRows = [];
let taskNotificationRows = [];
let tasksNotificationPoll = null;
let expenseNotificationPoll = null;
let currentTaskDetail = null;
let hasUserInteractedForSound = false;
let lastUnreadTaskCount = null;
const taskSoundMuted = false;
let customerOptions = [];

const MAIN_TABLE_COLUMNS = [
  'Trp No.',
  'Truck Number',
  'Status',
  'Customer',
  'In Time',
  'Workflow / Actions'
];

function getStoredRole() {
  const storedRole = localStorage.getItem('userRole');
  return VALID_ROLES.includes(storedRole) ? storedRole : null;
}

function getCurrentRole() {
  const role = getStoredRole();
  userRole = role || null;
  return userRole;
}

function normalizeAssigneeOptions(values, fallback = []) {
  const normalized = Array.isArray(values)
    ? values.map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  const merged = [...new Set([...normalized, ...fallback.filter((v) => v && v !== 'Other')])];
  return [...merged, 'Other'];
}

async function loadRoleBasedPersonDropdowns() {
  try {
    const response = await fetch('/assignees/by-role', { headers: getAuthHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to load assignees');
    }
    const data = await response.json();
    PERSON_DROPDOWNS = {
      Gate: normalizeAssigneeOptions(data.Gate, DEFAULT_PERSON_DROPDOWNS.Gate),
      Dispatch: normalizeAssigneeOptions(data.Dispatch, DEFAULT_PERSON_DROPDOWNS.Dispatch),
      Loading: normalizeAssigneeOptions(data.Loading, DEFAULT_PERSON_DROPDOWNS.Loading),
      Weighbridge: normalizeAssigneeOptions(data.Weighbridge, DEFAULT_PERSON_DROPDOWNS.Weighbridge),
      Accounts: normalizeAssigneeOptions(data.Accounts, DEFAULT_PERSON_DROPDOWNS.Accounts)
    };
  } catch (_error) {
    PERSON_DROPDOWNS = { ...DEFAULT_PERSON_DROPDOWNS };
  }
  renderGateOperatorOptions();
}

function hasRoleAccess(allowedRoles) {
  const role = getCurrentRole();
  return !!role && allowedRoles.includes(role);
}

function getAuthHeaders() {
  const role = getCurrentRole();
  if (!role) return {};
  const token = localStorage.getItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
  if (token) {
    return {
      'x-user-role': role,
      'x-user-token': token
    };
  }
  const pin = ROLE_PINS[role];
  if (!pin) return {};
  return {
    'x-user-role': role,
    'x-user-pin': pin
  };
}

async function ensureExpenseTokenForRole() {
  const role = getCurrentRole();
  if (!['Admin', 'Accounts', 'Manager'].includes(role)) return null;
  const existing = localStorage.getItem('expenseToken');
  if (existing) return existing;
  try {
    const response = await fetch('/expense/sso', { method: 'POST', headers: getAuthHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.token) return null;
    localStorage.setItem('expenseToken', data.token);
    localStorage.setItem('expenseUser', JSON.stringify(data.user || {}));
    return data.token;
  } catch (_error) {
    return null;
  }
}

function renderExpenseUnreadBadge(unreadCount) {
  const expenseLink = document.getElementById('expense-link');
  if (!expenseLink) return;
  const role = getCurrentRole();
  if (!['Admin', 'Accounts', 'Manager'].includes(role)) return;
  let badge = document.getElementById('expense-unread-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'expense-unread-badge';
    badge.className = 'notif-badge';
    badge.style.marginLeft = '6px';
    expenseLink.appendChild(badge);
  }
  const count = Number(unreadCount || 0);
  if (count <= 0) {
    badge.style.display = 'none';
    badge.textContent = '0';
    return;
  }
  badge.style.display = 'inline-block';
  badge.textContent = String(count);
}

async function loadExpenseUnreadCount() {
  const role = getCurrentRole();
  if (!['Admin', 'Accounts', 'Manager'].includes(role)) return;
  const token = await ensureExpenseTokenForRole();
  if (!token) return;
  try {
    const response = await fetch('/expenses/notifications', { headers: { 'x-expense-token': token } });
    if (!response.ok) return;
    const rows = await response.json().catch(() => []);
    const unread = Array.isArray(rows) ? rows.filter((r) => !r.is_read).length : 0;
    renderExpenseUnreadBadge(unread);
  } catch (_error) {}
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getDatePartsInIst(date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const parsed = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') {
      parsed[part.type] = part.value;
    }
  });
  return parsed;
}

function getCurrentISTTimestampISO() {
  // Store canonical UTC; render in IST everywhere using formatDateTime(..., IST_TIMEZONE).
  return new Date().toISOString();
}

function localInputToIstIso(localInput) {
  if (!localInput) return null;
  return `${localInput}:00${IST_OFFSET}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const rawDate = new Date(value);
  if (Number.isNaN(rawDate.getTime())) return '-';
  return rawDate.toLocaleString('en-IN', { timeZone: IST_TIMEZONE });
}

function formatTimeOnly(value) {
  if (!value) return '-';
  const rawDate = new Date(value);
  if (Number.isNaN(rawDate.getTime())) return '-';
  return rawDate.toLocaleTimeString('en-IN', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function parseTripDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isInputEditingActive() {
  const activeEl = document.activeElement;
  if (!activeEl) return false;
  if (activeEl.isContentEditable) return true;
  const tag = (activeEl.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function calculateElapsedMinutes(startTime) {
  if (!startTime) return null;
  const diffMs = Date.now() - startTime.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60));
}

function formatMinutes(totalMinutes) {
  if (totalMinutes === null || Number.isNaN(totalMinutes)) return '-';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatWeightMT(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string' && !value.trim()) return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${numeric.toFixed(3)} MT`;
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function canUploadTripDocuments() {
  return DOC_UPLOAD_ROLES.includes(getCurrentRole());
}

function canViewTripDocuments() {
  return DOC_VIEW_ROLES.includes(getCurrentRole());
}

function canDeleteTripDocument(doc) {
  const role = getCurrentRole();
  if (role === 'Admin') return true;
  return doc && doc.uploaded_by_role === role;
}

function parseStatusHistory(trip) {
  if (!trip || trip.status_history == null) return [];
  if (Array.isArray(trip.status_history)) return trip.status_history;
  if (typeof trip.status_history === 'string') {
    try {
      const parsed = JSON.parse(trip.status_history);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
}

function getWaitingStageFromDetails(details) {
  if (!details || typeof details !== 'object') return '';
  if (details.loading_done_by || details.loading_person_name) return 'LOADING';
  if (details.dispatch_done_by || details.dispatch_manager_name) return 'DISPATCH';
  return '';
}

function getLatestWaitingStageFromHistory(trip) {
  const history = parseStatusHistory(trip);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (normalizeStatus(entry?.status) !== 'WAITING') continue;
    const stage = getWaitingStageFromDetails(entry?.details);
    if (stage) return stage;
  }
  return '';
}

function getLatestStatusDetailValue(trip, field) {
  const history = parseStatusHistory(trip);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const details = history[index]?.details;
    if (!details || typeof details !== 'object') continue;
    const value = details[field];
    if (value === null || value === undefined || value === '') continue;
    return value;
  }
  return null;
}

function statusToLabel(status) {
  return String(status || '').replaceAll('_', ' ');
}

function getStatusLabelForDisplay(status, trip = null, details = null) {
  const normalized = normalizeStatus(status);
  if (normalized !== 'WAITING') return statusToLabel(status);
  const waitingStage = getWaitingStageFromDetails(details)
    || (trip ? getLatestWaitingStageFromHistory(trip) : '');
  if (waitingStage === 'LOADING') return 'WAITING (LOADING)';
  if (waitingStage === 'DISPATCH') return 'WAITING (DISPATCH)';
  return 'WAITING';
}

function statusDetailLabel(key) {
  const labels = {
    customer_notes: 'Customer Note',
    waiting_reason: 'Waiting',
    load_fix_reason: 'Load Fix',
    cancel_reason: 'Cancel',
    loading_point: 'Loading Point',
    labour_team: 'Team',
    material_type: 'Material',
    grade: 'Grade',
    condition: 'Condition',
    packing: 'Packing',
    location: 'Location',
    eta: 'ETA',
    expected_weight: 'Expected',
    tare_weight: 'Tare',
    gross_weight: 'Gross',
    net_weight: 'Net',
    rate_used_per_mt: 'Rate (₹/MT)',
    gst_percent_used: 'GST (%)',
    taxable_amount: 'Taxable Amount (₹)',
    gst_amount: 'GST Amount (₹)',
    total_amount: 'Total Amount (₹)',
    net_weight_snapshot_mt: 'Net Snapshot (MT)',
    gross_weight_attempts: 'Gross Attempts',
    dispatch_manager_name: 'Dispatch Manager',
    loading_person_name: 'Loading Manager',
    weight_operator_name: 'Weighbridge Operator',
    accounts_person_name: 'Accounts Manager',
    dispatch_done_by: 'Dispatch Done By',
    tare_done_by: 'Tare Done By',
    gross_done_by: 'Gross Done By',
    loading_done_by: 'Loading Done By',
    billing_done_by: 'Billing Done By',
    final_status: 'Final'
  };
  return labels[key] || key.replaceAll('_', ' ');
}

function formatStatusDetailValue(key, value) {
  if (value === null || value === undefined || value === '') return null;
  if (key === 'eta') return formatDateTime(value);
  if (key === 'gross_weight_attempts') {
    const attempts = Array.isArray(value) ? value : [];
    return `${attempts.length} entries`;
  }
  if (['expected_weight', 'tare_weight', 'gross_weight', 'net_weight', 'net_weight_snapshot_mt'].includes(key)) return formatWeightMT(value);
  if (['rate_used_per_mt', 'gst_percent_used', 'taxable_amount', 'gst_amount', 'total_amount'].includes(key)) return String(value);
  return String(value);
}

function getGrossAttemptReasons(value) {
  const attempts = Array.isArray(value) ? value : [];
  return attempts
    .map((attempt, index) => {
      const decision = String(attempt?.decision || '').toUpperCase();
      const reason = String(attempt?.reason || '').trim();
      if (decision !== 'RECHECK' || !reason) return null;
      const attemptNo = Number(attempt?.attempt_no);
      const labelNo = Number.isFinite(attemptNo) && attemptNo > 0 ? attemptNo : (index + 1);
      return `Load Fix #${labelNo}: ${reason}`;
    })
    .filter(Boolean);
}

function renderStatusDetails(entry) {
  const details = entry?.details && typeof entry.details === 'object' ? entry.details : null;
  if (!details) return '';
  const detailEntries = Object.entries(details).flatMap(([key, value]) => {
      if (key === 'gross_weight_attempts') {
        const formattedAttempts = formatStatusDetailValue(key, value);
        const reasonLines = getGrossAttemptReasons(value);
        const attemptChip = formattedAttempts
          ? `<span class="timeline-detail-chip"><strong>${escapeHtml(statusDetailLabel(key))}:</strong> ${escapeHtml(formattedAttempts)}</span>`
          : '';
        const reasonChips = reasonLines.map((line) => (
          `<span class="timeline-detail-chip"><strong>Load Fix Reason:</strong> ${escapeHtml(line)}</span>`
        ));
        return [attemptChip, ...reasonChips].filter(Boolean);
      }
      const formatted = formatStatusDetailValue(key, value);
      if (!formatted) return '';
      return [`<span class="timeline-detail-chip"><strong>${escapeHtml(statusDetailLabel(key))}:</strong> ${escapeHtml(formatted)}</span>`];
    })
    .filter(Boolean);
  if (!detailEntries.length) return '';
  return `<div class="timeline-item-details">${detailEntries.join('')}</div>`;
}

function getLatestDetailValueFromHistory(history, endIndex, field) {
  for (let index = endIndex; index >= 0; index -= 1) {
    const details = history[index]?.details;
    if (!details || typeof details !== 'object') continue;
    const value = details[field];
    if (value === null || value === undefined || value === '') continue;
    return value;
  }
  return null;
}

function enrichTimelineEntryDetailsForDisplay(trip, history, entry, index) {
  const status = normalizeStatus(entry?.status);
  if (status !== 'READY_FOR_LOADING') return entry;

  const details = entry?.details && typeof entry.details === 'object' ? { ...entry.details } : {};
  const readyFields = [
    'material_type',
    'grade',
    'condition',
    'packing',
    'location',
    'loading_point',
    'eta',
    'expected_weight',
    'dispatch_done_by',
    'dispatch_manager_name'
  ];

  readyFields.forEach((field) => {
    if (details[field] !== null && details[field] !== undefined && details[field] !== '') return;
    const fromHistory = getLatestDetailValueFromHistory(history, index, field);
    if (fromHistory !== null && fromHistory !== undefined && fromHistory !== '') {
      details[field] = fromHistory;
      return;
    }
    const fromTrip = trip?.[field];
    if (fromTrip !== null && fromTrip !== undefined && fromTrip !== '') {
      details[field] = fromTrip;
    }
  });

  return { ...entry, details };
}

function getStatusDurationMinutes(entry) {
  const entryTime = parseTripDate(entry?.entry_time);
  if (!entryTime) return null;
  const exitTime = parseTripDate(entry?.exit_time) || new Date();
  const diffMs = exitTime.getTime() - entryTime.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60));
}

function getStageDurationSummary(trip) {
  const history = parseStatusHistory(trip);
  const totals = new Map();
  history.forEach((entry) => {
    const status = getStatusLabelForDisplay(entry?.status || '', null, entry?.details);
    const minutes = getStatusDurationMinutes(entry);
    if (!status || minutes === null || Number.isNaN(minutes)) return;
    totals.set(status, (totals.get(status) || 0) + minutes);
  });
  return Array.from(totals.entries()).map(([status, minutes]) => ({ status, minutes }));
}

function renderStageSummary(trip) {
  const summary = getStageDurationSummary(trip);
  if (!summary.length) return '<div class="mini-muted">No stage timing available</div>';
  const chips = summary.map((item) => (
    `<span class="timeline-summary-chip"><strong>${escapeHtml(item.status)}:</strong> ${formatMinutes(item.minutes)}</span>`
  )).join('');
  return `
    <div class="timeline-stage-summary">
      <h4>Stage Time Summary</h4>
      <div class="timeline-summary-grid">${chips}</div>
    </div>
  `;
}

function closeTimelineModal() {
  if (!timelineModal) return;
  timelineModal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

function closeAdminWorkflowModal() {
  if (!adminWorkflowModal) return;
  adminWorkflowModal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

function renderStatusTimeline(trip) {
  const history = parseStatusHistory(trip);
  if (!history.length) {
    return '<div class="mini-muted">No status history available</div>';
  }

  return history.map((entry, index) => {
    const displayEntry = enrichTimelineEntryDetailsForDisplay(trip, history, entry, index);
    const current = !entry.exit_time;
    return `
      <article class="timeline-item ${current ? 'timeline-item-current' : ''}">
        <div class="timeline-item-status">${escapeHtml(getStatusLabelForDisplay(displayEntry.status, null, displayEntry.details))}</div>
        <div class="timeline-item-times">
          <span>${formatTimeOnly(displayEntry.entry_time)} → ${displayEntry.exit_time ? formatTimeOnly(displayEntry.exit_time) : 'Now'}</span>
          <span>${formatMinutes(getStatusDurationMinutes(displayEntry))}</span>
        </div>
        ${renderStatusDetails(displayEntry)}
      </article>
    `;
  }).join('');
}

function openTimelineModal(tripId) {
  const trip = getTripById(tripId);
  if (!trip || !timelineModal || !timelineModalBody || !timelineModalTitle) return;
  const expected = Number(trip.expected_weight);
  const net = Number(trip.net_weight);
  const variance = Number.isFinite(expected) && Number.isFinite(net) ? (net - expected) : null;
  const lastLoadFixReason = getLastLoadFixReason(trip);
  timelineModalTitle.textContent = `Status Timeline - ${trip.truck_number || 'Truck'}`;
  timelineModalBody.innerHTML = `
    <div class="timeline-meta">
      <div><strong>Current:</strong> ${escapeHtml(getStatusLabelForDisplay(trip.status || '-', trip))}</div>
      <div><strong>In Time:</strong> ${formatDateTime(trip.in_time)}</div>
      <div><strong>Transporter:</strong> ${escapeHtml(trip.transporter || '-')}</div>
      <div><strong>Driver:</strong> ${escapeHtml(trip.driver_name || '-')}</div>
      <div><strong>Driver Phone:</strong> ${escapeHtml(trip.driver_phone || '-')}</div>
      <div><strong>Gate Operator:</strong> ${escapeHtml(trip.gate_person_name || '-')}</div>
      <div><strong>Customer Note:</strong> ${escapeHtml(trip.customer_notes || '-')}</div>
      <div><strong>Location:</strong> ${escapeHtml(trip.location || '-')}</div>
      <div><strong>Dispatch Manager:</strong> ${escapeHtml(trip.dispatch_manager_name || '-')}</div>
      <div><strong>Loading Manager:</strong> ${escapeHtml(trip.loading_person_name || '-')}</div>
      <div><strong>Weighbridge Operator:</strong> ${escapeHtml(trip.weight_operator_name || '-')}</div>
      <div><strong>Accounts Manager:</strong> ${escapeHtml(trip.accounts_person_name || '-')}</div>
      <div><strong>Dispatch Done By:</strong> ${escapeHtml(trip.dispatch_done_by || '-')}</div>
      <div><strong>Tare Done By:</strong> ${escapeHtml(trip.tare_done_by || '-')}</div>
      <div><strong>Gross Done By:</strong> ${escapeHtml(trip.gross_done_by || '-')}</div>
      <div><strong>Loading Done By:</strong> ${escapeHtml(trip.loading_done_by || '-')}</div>
      <div><strong>Billing Done By:</strong> ${escapeHtml(trip.billing_done_by || '-')}</div>
      <div><strong>Expected Weight:</strong> ${formatWeightMT(trip.expected_weight)}</div>
      <div><strong>Final Net Weight:</strong> ${formatWeightMT(trip.net_weight)}</div>
      <div><strong>Variance:</strong> ${variance === null ? '-' : formatWeightMT(variance)}</div>
      <div><strong>Rate Used (₹/MT):</strong> ${trip.rate_used_per_mt ?? '-'}</div>
      <div><strong>GST (%):</strong> ${trip.gst_percent_used ?? '-'}</div>
      <div><strong>Taxable Amount (₹):</strong> ${trip.taxable_amount ?? '-'}</div>
      <div><strong>GST Amount (₹):</strong> ${trip.gst_amount ?? '-'}</div>
      <div><strong>Total Amount (₹):</strong> ${trip.total_amount ?? '-'}</div>
      <div><strong>Last Load Fix Reason:</strong> ${escapeHtml(lastLoadFixReason || '-')}</div>
      <div><strong>Gross Attempts:</strong> ${parseGrossWeightAttempts(trip).length}</div>
    </div>
    ${renderStageSummary(trip)}
    <div class="timeline-list">
      ${renderStatusTimeline(trip)}
    </div>
  `;
  timelineModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function getTruckTimelineButton(trip) {
  return `
    <button class="truck-link-btn" data-action="view-timeline" data-trip-id="${trip.id}" type="button">
      ${escapeHtml(trip.truck_number || '-')}
    </button>
  `;
}

function showMessage(text, success = true) {
  messageEl.textContent = text;
  messageEl.style.color = success ? '#047857' : '#b91c1c';
  showGlobalToast(text, success);
}

function showGlobalToast(text, success = true) {
  if (!text) return;
  let wrap = document.getElementById('global-toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'global-toast-wrap';
    wrap.className = 'global-toast-wrap';
    document.body.appendChild(wrap);
  }
  if (globalToastTimer) {
    clearTimeout(globalToastTimer);
    globalToastTimer = null;
  }
  wrap.innerHTML = '';
  const toast = document.createElement('div');
  toast.className = `global-toast ${success ? 'success' : 'error'}`;
  toast.textContent = String(text);
  wrap.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  globalToastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (wrap.contains(toast)) wrap.removeChild(toast);
    }, 200);
  }, success ? 2600 : 5000);
}

function setButtonBusy(button, busy, busyText = 'Processing...') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent || '';
    }
    button.disabled = true;
    button.textContent = busyText;
    button.classList.add('is-busy');
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
    }
    button.classList.remove('is-busy');
  }
}

function showTasksMessage(text, success = true) {
  if (!tasksMessageEl) return;
  tasksMessageEl.textContent = text;
  tasksMessageEl.style.color = success ? '#047857' : '#b91c1c';
}

function playTaskNotificationSound() {
  if (taskSoundMuted || !hasUserInteractedForSound) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const audioContext = new AudioCtx();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.24);
    oscillator.onended = () => {
      audioContext.close().catch(() => {});
    };
  } catch (_error) {}
}

function getTaskStatusChip(status) {
  const raw = String(status || 'OPEN').toUpperCase();
  const safe = TASK_STATUSES.includes(raw) ? raw : 'OPEN';
  const cls = safe.toLowerCase().replace(/_/g, '-');
  return `<span class="task-status-chip task-status-${cls}">${escapeHtml(safe)}</span>`;
}

function openTasksModal() {
  if (!tasksModal) return;
  tasksModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeTasksModal() {
  if (!tasksModal) return;
  tasksModal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

function openTaskDetailModal() {
  if (!taskDetailModal) return;
  taskDetailModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeTaskDetailModal() {
  if (!taskDetailModal) return;
  taskDetailModal.style.display = 'none';
  currentTaskDetail = null;
  document.body.style.overflow = tasksModal?.style.display === 'flex' ? 'hidden' : 'auto';
}

function renderTaskAssigneeSuggestions(rows = []) {
  if (!taskAssigneeOptions) return;
  const unique = new Set();
  const options = rows
    .map((row) => {
      const name = String(row?.name || '').trim();
      const team = String(row?.team || '').trim();
      if (!name) return '';
      const label = team ? `${name} (${team})` : name;
      const key = label.toLowerCase();
      if (unique.has(key)) return '';
      unique.add(key);
      return `<option value="${escapeHtml(label)}"></option>`;
    })
    .filter(Boolean);
  taskAssigneeOptions.innerHTML = options.join('');
}

async function loadTaskAssignees() {
  try {
    const response = await fetch('/tasks/assignees', { headers: getAuthHeaders() });
    if (!response.ok) return;
    const rows = await response.json();
    renderTaskAssigneeSuggestions(rows);
  } catch (_error) {}
}

function renderTasksRows(rows) {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) {
    tasksTable.innerHTML = rows.map((task) => `
      <tr>
        <td>
          <button type="button" class="task-id-link" data-action="open-task-detail" data-task-id="${task.id}">#${task.id}</button>
        </td>
        <td>${escapeHtml(task.title || '-')}</td>
        <td>${escapeHtml(task.team || '-')}</td>
        <td>${escapeHtml(task.assignee_name_snapshot || '-')}</td>
        <td>${getTaskStatusChip(task.status)}</td>
        <td>${formatDateTime(task.eta)}</td>
      </tr>
    `).join('');
    tasksMobileList.innerHTML = '';
  } else {
    tasksTable.innerHTML = '';
    tasksMobileList.innerHTML = rows.map((task) => `
      <article class="mobile-trip-card">
        <div class="mobile-trip-head">
          <div class="mobile-trip-truck">
            <button type="button" class="task-id-link" data-action="open-task-detail" data-task-id="${task.id}">Task #${task.id}</button>
          </div>
          <div>${getTaskStatusChip(task.status)}</div>
        </div>
        <div class="mobile-trip-grid">
          <div><strong>Title:</strong> ${escapeHtml(task.title || '-')}</div>
          <div><strong>Team:</strong> ${escapeHtml(task.team || '-')}</div>
          <div><strong>Assignee:</strong> ${escapeHtml(task.assignee_name_snapshot || '-')}</div>
          <div><strong>ETA:</strong> ${formatDateTime(task.eta)}</div>
        </div>
      </article>
    `).join('');
  }

  document.querySelectorAll('[data-action="open-task-detail"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const taskId = Number(btn.dataset.taskId || 0);
      if (!taskId) return;
      await loadTaskDetail(taskId);
    });
  });
}

async function loadTasks() {
  try {
    const response = await fetch('/tasks', { headers: getAuthHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to load tasks');
    }
    tasksRows = await response.json();
    renderTasksRows(tasksRows);
  } catch (error) {
    showTasksMessage(error.message, false);
  }
}

async function downloadTaskCommentAttachment(commentId) {
  try {
    const response = await fetch(`/tasks/comments/${commentId}/download`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to download attachment');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      URL.revokeObjectURL(url);
      throw new Error('Please allow popups to open attachment preview');
    }
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  } catch (error) {
    showTasksMessage(error.message, false);
  }
}

function renderTaskDetail(taskData) {
  const task = taskData?.task || {};
  const comments = Array.isArray(taskData?.comments) ? taskData.comments : [];
  const activity = Array.isArray(taskData?.activity) ? taskData.activity : [];
  const role = getCurrentRole();
  const canManage = role === 'Admin' || role === task.team;

  taskDetailTitle.textContent = `Task #${task.id} - ${task.title || ''}`;
  taskDetailBody.innerHTML = `
    <div class="task-detail-grid">
      <div><strong>Team:</strong> ${escapeHtml(task.team || '-')}</div>
      <div><strong>Assignee:</strong> ${escapeHtml(task.assignee_name_snapshot || '-')}</div>
      <div><strong>Status:</strong> ${getTaskStatusChip(task.status)}</div>
      <div><strong>ETA:</strong> ${formatDateTime(task.eta)}</div>
      <div><strong>Description:</strong> ${escapeHtml(task.description || '-')}</div>
      <div><strong>Updated:</strong> ${formatDateTime(task.updated_at)}</div>
    </div>

    ${canManage ? `
      <div class="workflow-group">
        <h4>Task Update</h4>
        <form id="task-update-form">
          <div class="form-grid">
            <label>Status
              <select name="status" required>
                ${TASK_STATUSES.map((status) => `<option value="${status}" ${status === task.status ? 'selected' : ''}>${status}</option>`).join('')}
              </select>
            </label>
            <label>Team
              <select name="team" required>
                <option value="">Select team</option>
                ${VALID_ROLES.map((team) => `<option value="${team}" ${team === task.team ? 'selected' : ''}>${team}</option>`).join('')}
              </select>
            </label>
            <label>Assignee
              <input type="text" name="assignee_name" value="${escapeHtml(task.assignee_name_snapshot || '')}" list="task-assignee-options" required />
            </label>
          </div>
          <div class="actions">
            <button type="submit" class="workflow-btn primary">Save Task</button>
          </div>
        </form>
      </div>
    ` : ''}
    <div class="workflow-group">
      <h4>Add Comment</h4>
      <form id="task-comment-form" enctype="multipart/form-data">
        <div class="form-grid">
          <label>Comment
            <textarea name="comment" rows="2"></textarea>
          </label>
          <label>Upload (Optional)
            <input type="file" name="attachment" />
          </label>
        </div>
        <div class="actions">
          <button type="submit" class="workflow-btn primary">Add Comment</button>
        </div>
      </form>
    </div>
    <div class="task-comments-wrap">
      <h4>Comments</h4>
      ${comments.length ? comments.map((item) => `
        <div class="task-comment-item">
          <div><strong>${escapeHtml(item.created_by_name || item.created_by_role || '-')}</strong> · ${formatDateTime(item.created_at)}</div>
          <div>${escapeHtml(item.comment_text || '-')}</div>
          ${item.attachment_name ? `<div><button type="button" class="truck-link-btn" data-action="download-task-comment" data-comment-id="${item.id}">${escapeHtml(item.attachment_name)}</button></div>` : ''}
        </div>
      `).join('') : '<div class="mini-muted">No comments yet</div>'}
    </div>
    <div class="task-activity-wrap">
      <h4>Activity</h4>
      ${activity.length ? activity.map((item) => `
        <div class="task-activity-item">
          <div><strong>${escapeHtml(item.action_type || '-')}</strong> · ${formatDateTime(item.created_at)}</div>
          <div class="mini-muted">${escapeHtml(item.actor_name || item.actor_role || '-')}</div>
          ${item.note ? `<div>${escapeHtml(item.note)}</div>` : ''}
          ${(item.from_value || item.to_value) ? `<div class="mini-muted">${escapeHtml(item.from_value || '-')} → ${escapeHtml(item.to_value || '-')}</div>` : ''}
        </div>
      `).join('') : '<div class="mini-muted">No activity yet</div>'}
    </div>
  `;

  taskDetailBody.querySelector('#task-update-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const nextStatus = String(formData.get('status') || '').trim();
    const nextTeam = String(formData.get('team') || '').trim();
    const nextAssignee = String(formData.get('assignee_name') || '').trim();
    const statusChanged = nextStatus && nextStatus !== String(task.status || '').toUpperCase();
    const assignmentChanged = nextTeam !== String(task.team || '') || nextAssignee !== String(task.assignee_name_snapshot || '');

    if (!statusChanged && !assignmentChanged) {
      showTasksMessage('No changes to save');
      return;
    }

    try {
      if (statusChanged) {
        const statusResp = await fetch(`/tasks/${task.id}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({ status: nextStatus })
        });
        if (!statusResp.ok) {
          const error = await statusResp.json().catch(() => ({}));
          throw new Error(error.error || 'Failed to update status');
        }
      }

      if (assignmentChanged) {
        const reassignResp = await fetch(`/tasks/${task.id}/reassign`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({
            team: nextTeam,
            assignee_name: nextAssignee
          })
        });
        if (!reassignResp.ok) {
          const error = await reassignResp.json().catch(() => ({}));
          throw new Error(error.error || 'Failed to reassign task');
        }
      }

      await Promise.all([loadTaskDetail(task.id), loadTasks(), loadTaskNotifications()]);
      showTasksMessage('Task saved');
    } catch (error) {
      showTasksMessage(error.message, false);
    }
  });

  taskDetailBody.querySelector('#task-comment-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    try {
      const response = await fetch(`/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to add comment');
      }
      await Promise.all([loadTaskDetail(task.id), loadTasks(), loadTaskNotifications()]);
      showTasksMessage('Comment added');
    } catch (error) {
      showTasksMessage(error.message, false);
    }
  });

  taskDetailBody.querySelectorAll('[data-action="download-task-comment"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const commentId = Number(btn.dataset.commentId || 0);
      if (!commentId) return;
      downloadTaskCommentAttachment(commentId);
    });
  });
}

async function loadTaskDetail(taskId) {
  try {
    const response = await fetch(`/tasks/${taskId}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to load task detail');
    }
    currentTaskDetail = await response.json();
    renderTaskDetail(currentTaskDetail);
    openTaskDetailModal();
  } catch (error) {
    showTasksMessage(error.message, false);
  }
}

function renderTaskNotificationBadge(unreadCount) {
  if (!taskNotificationBadge) return;
  const count = Number(unreadCount || 0);
  if (count <= 0) {
    taskNotificationBadge.style.display = 'none';
    taskNotificationBadge.textContent = '0';
    return;
  }
  taskNotificationBadge.style.display = 'inline-block';
  taskNotificationBadge.textContent = String(count);
}

async function loadTaskNotifications() {
  try {
    const response = await fetch('/task-notifications', { headers: getAuthHeaders() });
    if (!response.ok) return;
    const data = await response.json();
    taskNotificationRows = Array.isArray(data.rows) ? data.rows : [];
    const unreadCount = Number(data.unread_count || 0);
    if (lastUnreadTaskCount !== null && unreadCount > lastUnreadTaskCount) {
      playTaskNotificationSound();
    }
    lastUnreadTaskCount = unreadCount;
    renderTaskNotificationBadge(unreadCount);
  } catch (_error) {}
}

async function markAllTaskNotificationsRead() {
  try {
    const response = await fetch('/task-notifications/mark-read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({})
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to mark notifications read');
    }
    await loadTaskNotifications();
    showTasksMessage('Task alerts marked as read');
  } catch (error) {
    showTasksMessage(error.message, false);
  }
}

function showRoleSelection() {
  document.getElementById('role-modal').style.display = 'flex';
  document.getElementById('pin-modal').style.display = 'none';
  const employeeRoleSelectModal = document.getElementById('employee-role-select-modal');
  if (employeeRoleSelectModal) employeeRoleSelectModal.style.display = 'none';
  document.body.style.overflow = 'hidden';
}

function showPINEntry(selectedRole) {
  document.getElementById('role-modal').style.display = 'none';
  document.getElementById('pin-modal').style.display = 'flex';
  document.getElementById('pin-role-label').textContent = `Enter PIN for ${selectedRole}`;
  document.getElementById('pin-input').value = '';
  document.getElementById('pin-error-message').style.display = 'none';
  document.getElementById('pin-input').focus();
  window.currentSelectedRole = selectedRole;
}

function hideModals() {
  document.getElementById('role-modal').style.display = 'none';
  document.getElementById('pin-modal').style.display = 'none';
  const employeeRoleSelectModal = document.getElementById('employee-role-select-modal');
  if (employeeRoleSelectModal) employeeRoleSelectModal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

function getEmployeeAuthSession() {
  try {
    const raw = localStorage.getItem('employeeAuth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.roles)) return null;
    return parsed;
  } catch (_e) {
    return null;
  }
}

function applyRoleUI() {
  const role = getCurrentRole();
  const roleSwitcher = document.getElementById('role-switcher');
  const employeeAuth = getEmployeeAuthSession();
  const sessionRoles = Array.isArray(employeeAuth?.roles) ? employeeAuth.roles.filter((r) => VALID_ROLES.includes(r)) : [];
  const canCreate = hasRoleAccess(['Gate']);
  const gatePanel = form?.closest('.panel');
  const dashboardLink = document.getElementById('dashboard-link');
  const customerPortalLink = document.getElementById('customer-portal-link');
  const expenseLink = document.getElementById('expense-link');
  const expectedTrucksLink = document.getElementById('expected-trucks-link');
  const analyticsLink = document.getElementById('accounts-analytics-link');
  const adminControlLink = document.getElementById('admin-control-link');
  const canSeeTasks = !!role;
  const canSeeDashboard = ['Dispatch', 'Loading', 'Weighbridge', 'Accounts', 'Manager', 'Admin'].includes(role);
  const canSeeCustomerPortal = ['Admin', 'Manager', 'Dispatch', 'Accounts'].includes(role);
  const canSeeExpectedTrucks = ['Gate', 'Admin', 'Manager', 'Dispatch'].includes(role);
  const canSeeExpense = ['Admin', 'Accounts', 'Manager'].includes(role);
  const canSeeAnalytics = ['Admin', 'Accounts', 'Manager'].includes(role);
  const canSeeAdminControl = role === 'Admin';

  if (gatePanel && !canCreate) {
    gatePanel.style.display = 'none';
  }

  if (dashboardLink) {
    dashboardLink.style.display = canSeeDashboard ? 'inline-block' : 'none';
  }
  if (customerPortalLink) {
    customerPortalLink.style.display = canSeeCustomerPortal ? 'inline-block' : 'none';
  }
  if (expenseLink) {
    expenseLink.style.display = canSeeExpense ? 'inline-block' : 'none';
  }
  if (expectedTrucksLink) {
    expectedTrucksLink.style.display = canSeeExpectedTrucks ? 'inline-block' : 'none';
  }
  if (analyticsLink) {
    analyticsLink.style.display = canSeeAnalytics ? 'inline-block' : 'none';
  }
  if (adminControlLink) {
    adminControlLink.style.display = canSeeAdminControl ? 'inline-block' : 'none';
  }
  if (tasksLink) {
    tasksLink.style.display = canSeeTasks ? 'inline-block' : 'none';
  }
  if (taskNotificationsBtn) {
    taskNotificationsBtn.style.display = canSeeTasks ? 'inline-block' : 'none';
  }
  if (createTaskBtn) {
    createTaskBtn.style.display = role === 'Admin' ? 'inline-block' : 'none';
  }

  if (roleIndicator && role) {
    roleIndicator.style.display = 'inline-block';
    roleIndicator.textContent = `Role: ${role}`;
  }

  if (roleSwitcher) {
    if (sessionRoles.length > 1) {
      roleSwitcher.innerHTML = sessionRoles.map((r) => `<option value="${r}">Switch: ${r}</option>`).join('');
      roleSwitcher.value = role || sessionRoles[0];
      roleSwitcher.style.display = 'inline-block';
    } else {
      roleSwitcher.style.display = 'none';
      roleSwitcher.innerHTML = '';
    }
  }
}

async function openExpenseWithSso(event) {
  if (event) event.preventDefault();
  const role = getCurrentRole();
  if (!['Admin', 'Accounts', 'Manager'].includes(role)) {
    alert('You are not authorized for Expense access.');
    return;
  }
  try {
    const response = await fetch('/expense/sso', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (_err) {
      data = {};
    }
    if (!response.ok || !data.token) {
      const backendMessage = data.error || rawText || `HTTP ${response.status}`;
      throw new Error(`Expense SSO failed: ${backendMessage}`);
    }
    localStorage.setItem('expenseToken', data.token);
    localStorage.setItem('expenseUser', JSON.stringify(data.user || {}));
    window.location.href = '/expense';
  } catch (error) {
    alert(error.message || 'You are not authorized for Expense access.');
  }
}

function showAppContent() {
  const panels = document.querySelectorAll('.panel');
  panels.forEach((panel) => {
    panel.style.display = 'block';
  });
  document.getElementById('logout-link').style.display = 'inline-block';
  applyRoleUI();
}

function validatePIN(role, pin) {
  return ROLE_PINS[role] === pin;
}

function logout() {
  localStorage.removeItem('userRole');
  localStorage.removeItem('employeeAuth');
  localStorage.removeItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
  userRole = null;
  window.location.reload();
}

function showEmployeeLoginMessage(message, ok = false) {
  const el = document.getElementById('employee-login-message');
  if (!el) return;
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
  el.style.color = ok ? '#047857' : '#b91c1c';
}

async function loginEmployee() {
  const usernameInput = document.getElementById('employee-login-username');
  const passwordInput = document.getElementById('employee-login-password');
  const loginBtn = document.getElementById('employee-login-btn');
  if (!usernameInput || !passwordInput || !loginBtn) return;
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    showEmployeeLoginMessage('Username and password are required');
    return;
  }
  loginBtn.disabled = true;
  showEmployeeLoginMessage('');
  try {
    const response = await fetch('/auth/employee-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.user) {
      throw new Error(data.error || 'Login failed');
    }
    const roles = Array.isArray(data.user.roles) ? data.user.roles.filter((r) => VALID_ROLES.includes(r)) : [];
    if (!roles.length) {
      throw new Error('No transport role assigned to this user');
    }
    localStorage.setItem('employeeAuth', JSON.stringify({
      id: data.user.id,
      username: data.user.username,
      full_name: data.user.full_name,
      roles
    }));
    if (data.token) {
      localStorage.setItem(EMPLOYEE_TRANSPORT_TOKEN_KEY, data.token);
    } else {
      localStorage.removeItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
    }
    const current = getStoredRole();
    const defaultRole = current && roles.includes(current) ? current : roles[0];
    localStorage.setItem('userRole', defaultRole);
    window.location.reload();
  } catch (error) {
    showEmployeeLoginMessage(error.message || 'Login failed');
  } finally {
    loginBtn.disabled = false;
  }
}

async function autoOpenTasksFromQuery() {
  const params = new URLSearchParams(window.location.search || '');
  if (params.get('openTasks') !== '1') return;
  try {
    await Promise.all([loadTasks(), loadTaskNotifications()]);
    openTasksModal();
  } catch (_error) {}
}

function initializeRole() {
  const employeeAuth = getEmployeeAuthSession();
  if (employeeAuth && Array.isArray(employeeAuth.roles) && employeeAuth.roles.length) {
    const storedRole = getStoredRole();
    if (!storedRole || !employeeAuth.roles.includes(storedRole)) {
      localStorage.setItem('userRole', employeeAuth.roles[0]);
    }
  }
  const activeRole = getStoredRole();
  if (activeRole) {
    userRole = activeRole;
    hideModals();
    showAppContent();
    return;
  }
  showRoleSelection();
}

function syncTripsTableHeader() {
  if (!tripsHeaderRow) return;
  tripsHeaderRow.innerHTML = MAIN_TABLE_COLUMNS.map((label) => `<th>${label}</th>`).join('');
}

function getStatusBadge(status, labelOverride = null) {
  const rawValue = status || 'IN_GATE';
  const displayValue = labelOverride || rawValue;
  const statusClass = rawValue.toLowerCase().replace(/_/g, '-');
  return `<span class="status-badge status-${statusClass}">${displayValue}</span>`;
}

function getAssignedPersonByStatus(trip) {
  const status = normalizeStatus(trip?.status);
  const match = STATUS_ASSIGNEE_RULES.find((rule) => rule.statuses.includes(status));
  if (!match) return { roleLabel: '-', name: '' };
  return { roleLabel: match.roleLabel, name: trip?.[match.field] || '' };
}

function getAssignedPersonCell(trip) {
  const assigned = getAssignedPersonByStatus(trip);
  if (!assigned.name) {
    return `<div class="mini-muted">${escapeHtml(assigned.roleLabel)}: -</div>`;
  }
  return `<div class="mini-muted">${escapeHtml(assigned.roleLabel)}: ${escapeHtml(assigned.name)}</div>`;
}

function renderMobileRoleNames(trip) {
  const roleRows = [
    ['Gate Operator', trip.gate_person_name],
    ['Dispatch Manager', trip.dispatch_manager_name],
    ['Loading Manager', trip.loading_person_name],
    ['Weighbridge Operator', trip.weight_operator_name],
    ['Accounts Manager', trip.accounts_person_name]
  ];
  return roleRows
    .map(([label, value]) => `<div><strong>${label}:</strong> ${escapeHtml(value || '-')}</div>`)
    .join('');
}

function getStatusWithReasonDetails(trip) {
  const statusLabel = trip.status === 'EXITED'
    ? (trip.final_status === 'CANCELLED' ? 'CANCELLED / EXITED' : 'COMPLETED / EXITED')
    : getStatusLabelForDisplay(trip.status, trip);
  const parts = [getStatusBadge(trip.status, statusLabel)];
  if (normalizeStatus(trip.status) === 'WAITING' && trip.waiting_reason) {
    parts.push(`<div class="reason-chip">Waiting: ${escapeHtml(trip.waiting_reason)}</div>`);
  }
  if (normalizeStatus(trip.status) === 'LOAD_FIX_REQUIRED' && trip.load_fix_reason) {
    parts.push(`<div class="reason-chip reason-chip-error">Load Fix: ${escapeHtml(trip.load_fix_reason)}</div>`);
  }
  if ((trip.status === 'CANCELLED' || trip.status === 'EXITED') && trip.cancel_reason) {
    parts.push(`<div class="reason-chip reason-chip-error">Cancel: ${escapeHtml(trip.cancel_reason)}</div>`);
  }
  return `<div class="status-cell">${parts.join('')}</div>`;
}

function getDelayClass(timeSpent) {
  if (timeSpent === null) return '';
  if (timeSpent > 1440) return 'truck-delayed-critical';
  if (timeSpent > 720) return 'truck-delayed-warning';
  return '';
}

function getVisibleTripsForRole(trips) {
  const role = getCurrentRole();
  if (role === 'Gate') {
    return trips.filter((trip) =>
      trip.status !== 'CANCELLED' &&
      trip.status !== 'EXITED' &&
      !trip.is_cancelled
    );
  }
  return trips;
}

function toggleOtherInput(selectElement, inputElement) {
  if (!selectElement || !inputElement) return;
  if (selectElement.value === 'other') {
    inputElement.style.display = 'block';
    inputElement.required = true;
    inputElement.focus();
    return;
  }
  inputElement.style.display = 'none';
  inputElement.required = false;
  inputElement.value = '';
}

function normalizeTransporterName(value) {
  return String(value || '').trim();
}

function getStoredTransporterOptions() {
  try {
    const raw = localStorage.getItem(TRANSPORTER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTransporterName).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function setStoredTransporterOptions(options) {
  const unique = Array.from(new Set(
    options
      .map(normalizeTransporterName)
      .filter((value) => value && value.toLowerCase() !== 'test')
  ));
  localStorage.setItem(TRANSPORTER_STORAGE_KEY, JSON.stringify(unique));
}

function ensureTransporterOptionsSeeded() {
  const version = localStorage.getItem(TRANSPORTER_STORAGE_VERSION_KEY);
  if (version === TRANSPORTER_STORAGE_VERSION) return;
  setStoredTransporterOptions(BASE_TRANSPORTER_OPTIONS);
  localStorage.setItem(TRANSPORTER_STORAGE_VERSION_KEY, TRANSPORTER_STORAGE_VERSION);
}

function refreshTransporterOptions() {
  if (!transporterInput) return;
  ensureTransporterOptionsSeeded();
  const storedOptions = getStoredTransporterOptions();
  const merged = Array.from(new Set([...BASE_TRANSPORTER_OPTIONS, ...storedOptions])).sort((a, b) => a.localeCompare(b));
  setStoredTransporterOptions(merged);
  transporterOptions = merged;
}

function normalizeMasterList(values = [], fallback = []) {
  const fromApi = Array.isArray(values)
    ? values.map((v) => (typeof v === 'object' ? v.value : v)).map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  const merged = [...new Set([...fromApi, ...fallback.filter((v) => v && v !== 'Other')])];
  return [...merged, 'Other'];
}

function toNumOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round3(value) {
  const n = toNumOrNull(value);
  return n === null ? null : Number(n.toFixed(3));
}

function computeBillingAmounts(netWeight, ratePerMt, gstPercent) {
  const net = toNumOrNull(netWeight);
  const rate = Math.max(0, toNumOrNull(ratePerMt) ?? 0);
  const gst = Math.max(0, toNumOrNull(gstPercent) ?? 0);
  if (net === null || net <= 0) {
    return { taxable: 0, gstAmount: 0, total: 0, safeRate: rate, safeGst: gst };
  }
  const taxable = round3(net * rate) || 0;
  const gstAmount = round3((taxable * gst) / 100) || 0;
  const total = round3(taxable + gstAmount) || 0;
  return { taxable, gstAmount, total, safeRate: rate, safeGst: gst };
}

async function loadMasterDropdownOptions() {
  const types = [
    'materials',
    'grades',
    'conditions',
    'packing',
    'loading_points',
    'loading_teams',
    'transporters',
    'locations'
  ];
  try {
    const response = await fetch(`/masters/options?types=${encodeURIComponent(types.join(','))}`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to load master options');
    const data = await response.json();
    DISPATCH_DROPDOWNS.material_type = normalizeMasterList(data.materials, DEFAULT_DISPATCH_DROPDOWNS.material_type);
    DISPATCH_DROPDOWNS.grade = normalizeMasterList(data.grades, DEFAULT_DISPATCH_DROPDOWNS.grade);
    const gradeRows = Array.isArray(data.grades) ? data.grades : [];
    gradePricingMap = new Map(
      gradeRows
        .filter((item) => item && typeof item === 'object' && item.value)
        .map((item) => [String(item.value).trim().toLowerCase(), toNumOrNull(item.price_per_mt)])
    );
    DISPATCH_DROPDOWNS.condition = normalizeMasterList(data.conditions, DEFAULT_DISPATCH_DROPDOWNS.condition);
    DISPATCH_DROPDOWNS.packing = normalizeMasterList(data.packing, DEFAULT_DISPATCH_DROPDOWNS.packing);
    DISPATCH_DROPDOWNS.loading_point = normalizeMasterList(data.loading_points, DEFAULT_DISPATCH_DROPDOWNS.loading_point);
    DISPATCH_DROPDOWNS.labour_team = normalizeMasterList(data.loading_teams, DEFAULT_DISPATCH_DROPDOWNS.labour_team);
    transporterOptions = normalizeMasterList(data.transporters, BASE_TRANSPORTER_OPTIONS);
    locationOptions = normalizeMasterList(data.locations, []);
  } catch (_error) {
    DISPATCH_DROPDOWNS = { ...DEFAULT_DISPATCH_DROPDOWNS };
    transporterOptions = [...BASE_TRANSPORTER_OPTIONS];
    locationOptions = [];
    gradePricingMap = new Map();
  }
}

async function loadCustomerOptions() {
  try {
    const response = await fetch('/customers/options', { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to load customer options');
    const rows = await response.json();
    customerOptions = Array.isArray(rows)
      ? Array.from(new Set(rows.map((v) => String(v || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
      : [];
  } catch (_error) {
    customerOptions = [];
  }
}

function renderCustomerOptions() {
  if (!customerSelect) return;
  const current = String(customerSelect.value || '').trim();
  const options = [
    '<option value="">Select Customer</option>',
    ...customerOptions.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`),
    '<option value="other">Other</option>'
  ];
  customerSelect.innerHTML = options.join('');
  if (current && customerOptions.includes(current)) {
    customerSelect.value = current;
  } else if (current === 'other') {
    customerSelect.value = 'other';
  } else {
    customerSelect.value = '';
  }
}

function renderGateOperatorOptions() {
  if (!gatePersonSelect) return;
  const current = String(gatePersonSelect.value || '').trim();
  const gateOptions = normalizeAssigneeOptions(PERSON_DROPDOWNS.Gate, ['Other']).filter((value) => value && value !== 'Other');
  const options = [
    '<option value="">Select Gate Operator</option>',
    ...gateOptions.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`),
    '<option value="other">Other</option>'
  ];
  gatePersonSelect.innerHTML = options.join('');
  if (current && gateOptions.includes(current)) {
    gatePersonSelect.value = current;
  } else if (current === 'other') {
    gatePersonSelect.value = 'other';
  } else {
    gatePersonSelect.value = '';
  }
}

async function loadPricingDefaults() {
  try {
    const response = await fetch('/pricing/defaults', { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to load pricing defaults');
    const data = await response.json();
    pricingDefaults.default_gst_percent = toNumOrNull(data.default_gst_percent);
  } catch (_error) {
    pricingDefaults.default_gst_percent = null;
  }
}

function normalizeLocationName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function getStoredLocationOptions() {
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeLocationName(item)).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function setStoredLocationOptions(options) {
  const unique = Array.from(new Set((options || []).map((item) => normalizeLocationName(item)).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(unique));
}

function renderLocationOptions() {
  if (!locationOptionsDatalist) return;
  locationOptionsDatalist.innerHTML = locationOptions
    .map((item) => `<option value="${escapeHtml(item)}"></option>`)
    .join('');
}

function refreshLocationOptionsFromTrips() {
  const stored = getStoredLocationOptions();
  const fromTrips = allTrips.map((trip) => normalizeLocationName(trip.location)).filter(Boolean);
  locationOptions = Array.from(new Set([...stored, ...fromTrips])).sort((a, b) => a.localeCompare(b));
  setStoredLocationOptions(locationOptions);
  renderLocationOptions();
}

function hideTransporterSuggestions() {
  if (!transporterSuggestions) return;
  transporterSuggestions.style.display = 'none';
  transporterSuggestions.innerHTML = '';
}

function renderTransporterSuggestions(query) {
  if (!transporterSuggestions) return;
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const filtered = transporterOptions
    .filter((name) => name.toLowerCase().includes(normalizedQuery))
    .slice(0, 8);
  if (!filtered.length) {
    hideTransporterSuggestions();
    return;
  }
  transporterSuggestions.innerHTML = filtered
    .map((name) => `<button type="button" class="typeahead-option" data-transporter-option="${escapeHtml(name)}">${escapeHtml(name)}</button>`)
    .join('');
  transporterSuggestions.style.display = 'block';
}

function getFormData() {
  const formData = new FormData(form);

  let customerName = formData.get('customer_name_select') || '';
  if (customerName === 'other') {
    customerName = formData.get('customer_name') || '';
  }

  const transporter = formData.get('transporter') || '';

  let gatePerson = formData.get('gate_person_select') || '';
  if (gatePerson === 'other') {
    gatePerson = formData.get('gate_person_name') || '';
  }

  return {
    truck_number: String(formData.get('truck_number') || '').trim(),
    customer_name: String(customerName).trim(),
    transporter: String(transporter).trim(),
    driver_name: String(formData.get('driver_name') || '').trim(),
    driver_phone: String(formData.get('driver_phone') || '').trim(),
    gate_person_name: String(gatePerson).trim(),
    status: 'IN_GATE',
    in_time: getCurrentISTTimestampISO(),
    last_status_update_time: getCurrentISTTimestampISO()
  };
}

function resetForm() {
  form.reset();
  toggleOtherInput(customerSelect, customerOther);
  toggleOtherInput(gatePersonSelect, gatePersonOther);
  if (transporterInput) transporterInput.value = '';
  hideTransporterSuggestions();
}

function normalizeStatus(status) {
  return STATUS_FLOW.includes(status) ? status : 'IN_GATE';
}

function getTripById(tripId) {
  return allTrips.find((trip) => String(trip.id) === String(tripId)) || null;
}

function getLoadingDraft(tripId) {
  return loadingDetailsDrafts.get(String(tripId)) || {};
}

function setLoadingDraftField(tripId, field, value) {
  const key = String(tripId);
  const existing = getLoadingDraft(key);
  loadingDetailsDrafts.set(key, { ...existing, [field]: value });
}

function clearLoadingDraft(tripId) {
  loadingDetailsDrafts.delete(String(tripId));
}

function getBillingDraft(tripId) {
  return billingDetailsDrafts.get(String(tripId)) || {};
}

function setBillingDraftField(tripId, field, value) {
  const key = String(tripId);
  const existing = getBillingDraft(key);
  billingDetailsDrafts.set(key, { ...existing, [field]: value });
}

function getBaseTripPayload(trip) {
  if (!trip) return {};
  return {
    sequence_number: trip.sequence_number,
    truck_number: trip.truck_number,
    customer_name: trip.customer_name,
    transporter: trip.transporter,
    driver_name: trip.driver_name,
    driver_phone: trip.driver_phone,
    gate_person_name: trip.gate_person_name,
    dispatch_manager_name: trip.dispatch_manager_name,
    weight_operator_name: trip.weight_operator_name,
    loading_person_name: trip.loading_person_name,
    accounts_person_name: trip.accounts_person_name,
    dispatch_done_by: trip.dispatch_done_by,
    tare_done_by: trip.tare_done_by,
    gross_done_by: trip.gross_done_by,
    loading_done_by: trip.loading_done_by,
    billing_done_by: trip.billing_done_by,
    material_type: trip.material_type,
    grade: trip.grade,
    condition: trip.condition,
    packing: trip.packing,
    location: trip.location,
    loading_point: trip.loading_point,
    labour_team: trip.labour_team,
    eta: trip.eta,
    expected_weight: trip.expected_weight,
    customer_notes: trip.customer_notes,
    waiting_reason: trip.waiting_reason,
    load_fix_reason: trip.load_fix_reason,
    tare_weight: trip.tare_weight,
    gross_weight: trip.gross_weight,
    net_weight: trip.net_weight,
    gross_weight_attempts: trip.gross_weight_attempts,
    rate_used_per_mt: trip.rate_used_per_mt,
    gst_percent_used: trip.gst_percent_used,
    taxable_amount: trip.taxable_amount,
    gst_amount: trip.gst_amount,
    total_amount: trip.total_amount,
    net_weight_snapshot_mt: trip.net_weight_snapshot_mt,
    billing_calculated_at: trip.billing_calculated_at,
    billing_calculated_by: trip.billing_calculated_by,
    status: normalizeStatus(trip.status),
    final_status: trip.final_status,
    is_cancelled: trip.is_cancelled,
    cancel_reason: trip.cancel_reason,
    in_time: trip.in_time,
    out_time: trip.out_time,
    last_status_update_time: trip.last_status_update_time,
    status_history: trip.status_history
  };
}

function isRoleAllowedForStatus(role, targetStatus) {
  const allowedTargets = ROLE_ALLOWED_TARGETS[role] || [];
  return allowedTargets.includes(targetStatus);
}

function isValidStrictTransition(currentStatus, nextStatus) {
  if (nextStatus === 'CANCELLED') {
    return !['COMPLETED', 'CANCELLED', 'EXITED'].includes(currentStatus);
  }
  const allowed = STATUS_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
}

function isAdminRollbackAllowed(currentStatus, nextStatus, role) {
  if (role !== 'Admin') return false;
  const currentIndex = STATUS_FLOW.indexOf(currentStatus);
  const nextIndex = STATUS_FLOW.indexOf(nextStatus);
  if (currentIndex === -1 || nextIndex === -1) return false;
  return nextIndex < currentIndex;
}

function getDispatchDetailsFromRow(tripId) {
  const readValue = (name) => {
    const input = document.querySelector(`[data-trip-id="${tripId}"][data-dispatch-field="${name}"]`);
    return input ? input.value.trim() : '';
  };
  const readOther = (name) => {
    const input = document.querySelector(`[data-trip-id="${tripId}"][data-dispatch-other="${name}"]`);
    return input ? input.value.trim() : '';
  };

  const resolveDropdown = (name) => {
    const selected = readValue(name);
    if (selected !== 'Other') return selected;
    return readOther(name);
  };

  return {
    material_type: resolveDropdown('material_type'),
    grade: resolveDropdown('grade'),
    condition: resolveDropdown('condition'),
    packing: resolveDropdown('packing'),
    location: readValue('location'),
    loading_point: resolveDropdown('loading_point'),
    labour_team: resolveDropdown('labour_team'),
    eta: localInputToIstIso(readValue('eta')),
    expected_weight: readValue('expected_weight')
  };
}

function getMergedDispatchDetails(tripId) {
  const trip = getTripById(tripId);
  const rowDetails = getDispatchDetailsFromRow(tripId);
  const draft = getLoadingDraft(tripId);
  const historyExpectedWeight = getLatestStatusDetailValue(trip, 'expected_weight');
  return {
    material_type: rowDetails.material_type || draft.material_type || trip?.material_type || '',
    grade: rowDetails.grade || draft.grade || trip?.grade || '',
    condition: rowDetails.condition || draft.condition || trip?.condition || '',
    packing: rowDetails.packing || draft.packing || trip?.packing || '',
    location: rowDetails.location || draft.location || trip?.location || '',
    loading_point: rowDetails.loading_point || draft.loading_point || trip?.loading_point || '',
    labour_team: rowDetails.labour_team || draft.labour_team || trip?.labour_team || '',
    eta: rowDetails.eta || draft.eta || trip?.eta || null,
    expected_weight: rowDetails.expected_weight || draft.expected_weight || trip?.expected_weight || historyExpectedWeight || ''
  };
}

function getReadyForLoadingValidationError(details) {
  if (!details.material_type) return 'Material type is required before moving to ready for loading';
  if (!details.grade) return 'Grade is required before moving to ready for loading';
  if (!details.condition) return 'Condition is required before moving to ready for loading';
  if (!details.packing) return 'Packing is required before moving to ready for loading';
  if (!details.location) return 'Location is required before moving to ready for loading';
  if (!details.loading_point) return 'Loading point is required before moving to ready for loading';
  if (!details.eta) return 'ETA is required before moving to ready for loading';
  const expected = Number(details.expected_weight);
  if (!Number.isFinite(expected) || expected <= 0) return 'Expected weight (MT) is required before moving to ready for loading';
  return null;
}

function getLoadingStartValidationError(details) {
  if (!details.labour_team) return 'Loading team is required before starting loading';
  return null;
}

function getWeightFromRow(tripId, field) {
  const input = document.querySelector(`[data-trip-id="${tripId}"][data-weight-field="${field}"]`);
  if (!input) return null;
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) ? value : null;
}

function getTextFromRow(tripId, field) {
  const input = document.querySelector(`[data-trip-id="${tripId}"][data-text-field="${field}"]`);
  return input ? input.value.trim() : '';
}

function renderPersonSelect(roleName, tripId, savedValue) {
  const options = PERSON_DROPDOWNS[roleName] || [];
  const isSavedOther = !!savedValue && !options.includes(savedValue);
  const selectedValue = isSavedOther ? 'Other' : (savedValue || '');
  const optionsHtml = [
    '<option value="">Select</option>',
    ...options.map((option) => (
      `<option value="${option}" ${selectedValue === option ? 'selected' : ''}>${option}</option>`
    ))
  ].join('');

  return `
    <div class="field-inline">
      <select data-trip-id="${tripId}" data-person-role="${roleName}" class="person-input">
        ${optionsHtml}
      </select>
      <input
        type="text"
        data-trip-id="${tripId}"
        data-person-other-role="${roleName}"
        class="person-other-input"
        placeholder="Enter ${roleName} name"
        value="${isSavedOther ? escapeHtml(savedValue) : ''}"
        style="${selectedValue === 'Other' ? 'display:block;' : 'display:none;'}"
      />
    </div>
  `;
}

function getPersonValueFromRow(tripId, roleName, fallbackValue = '') {
  const select = document.querySelector(`[data-trip-id="${tripId}"][data-person-role="${roleName}"]`);
  if (!select) return fallbackValue || '';
  const selected = (select.value || '').trim();
  if (!selected) return fallbackValue || '';
  if (selected !== 'Other') return selected;
  const otherInput = document.querySelector(`[data-trip-id="${tripId}"][data-person-other-role="${roleName}"]`);
  const otherValue = otherInput ? otherInput.value.trim() : '';
  return otherValue || fallbackValue || '';
}

async function putTrip(tripId, payload) {
  const localTrip = getTripById(tripId);
  const requestPayload = {
    ...payload
  };
  if (requestPayload.version === undefined || requestPayload.version === null) {
    requestPayload.version = localTrip?.version;
  }

  const response = await fetch(`/trip/${tripId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(requestPayload)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 409) {
      throw new Error(error.error || 'This trip was updated by another user. Please refresh.');
    }
    const received = error.received ? ` | Received: ${JSON.stringify(error.received)}` : '';
    throw new Error((error.error || 'Trip update failed') + received);
  }

  return response.json();
}

async function applyStatusChange(tripId, requestedStatus, extraFields = {}, sourceButton = null) {
  const role = getCurrentRole();
  const existingTrip = getTripById(tripId);
  if (!existingTrip) {
    showMessage('Trip not found', false);
    return;
  }

  const currentStatus = normalizeStatus(existingTrip.status);
  if (!isRoleAllowedForStatus(role, requestedStatus)) {
    showMessage(`Role ${role} cannot mark status ${requestedStatus}`, false);
    return;
  }

  if (!isValidStrictTransition(currentStatus, requestedStatus)) {
    const isAdminRollback = isAdminRollbackAllowed(currentStatus, requestedStatus, role);
    if (!isAdminRollback) {
      showMessage(`Invalid transition: ${currentStatus} -> ${requestedStatus}`, false);
      return;
    }
  }

  if (requestedStatus === 'READY_FOR_LOADING') {
    const draft = getLoadingDraft(tripId);
    const pendingDetails = {
      material_type: extraFields.material_type || draft.material_type || existingTrip.material_type,
      grade: extraFields.grade || draft.grade || existingTrip.grade,
      condition: extraFields.condition || draft.condition || existingTrip.condition,
      packing: extraFields.packing || draft.packing || existingTrip.packing,
      location: extraFields.location || draft.location || existingTrip.location,
      loading_point: extraFields.loading_point || draft.loading_point || existingTrip.loading_point,
      eta: extraFields.eta || draft.eta || existingTrip.eta,
      expected_weight: extraFields.expected_weight || draft.expected_weight || existingTrip.expected_weight
    };
    const readyError = getReadyForLoadingValidationError(pendingDetails);
    if (readyError) {
      showMessage(readyError, false);
      return;
    }
  }

  if (requestedStatus === 'LOADING_IN_PROGRESS') {
    const draft = getLoadingDraft(tripId);
    const pendingDetails = {
      labour_team: extraFields.labour_team || draft.labour_team || existingTrip.labour_team,
    };
    const loadingError = getLoadingStartValidationError(pendingDetails);
    if (loadingError) {
      showMessage(loadingError, false);
      return;
    }
    if (!existingTrip.tare_weight) {
      showMessage('Cannot start loading without tare weight', false);
      return;
    }
  }

  if (requestedStatus === 'GROSS_WEIGHT_DONE') {
    const tare = Number(existingTrip.tare_weight);
    const gross = Number(existingTrip.gross_weight);
    if (!Number.isFinite(gross)) {
      showMessage('Gross weight is required before marking gross done', false);
      return;
    }
    if (!Number.isFinite(tare)) {
      showMessage('Tare weight is required before marking gross done', false);
      return;
    }
    if (gross <= tare) {
      showMessage('Gross weight must be greater than tare weight', false);
      return;
    }
  }

  if (requestedStatus === 'LOAD_FIX_REQUIRED') {
    const tare = Number(extraFields.tare_weight ?? existingTrip.tare_weight);
    const gross = Number(extraFields.gross_weight ?? existingTrip.gross_weight);
    const reason = String(extraFields.load_fix_reason || '').trim();
    if (!Number.isFinite(gross) || gross <= 0) {
      showMessage('Gross weight is required before sending for load fix', false);
      return;
    }
    if (!Number.isFinite(tare) || tare <= 0) {
      showMessage('Tare weight is required before sending for load fix', false);
      return;
    }
    if (gross <= tare) {
      showMessage('Gross weight must be greater than tare weight', false);
      return;
    }
    if (!reason) {
      showMessage('Load fix reason is required', false);
      return;
    }
  }

  if (requestedStatus === 'BILLING_COMPLETED' && !existingTrip.gross_weight) {
    showMessage('Cannot complete billing without gross weight', false);
    return;
  }

  let payload = {
    ...getBaseTripPayload(existingTrip),
    ...extraFields,
    status: requestedStatus,
    last_status_update_time: getCurrentISTTimestampISO()
  };

  if (requestedStatus === 'CANCELLED') {
    payload.is_cancelled = true;
    payload.final_status = 'CANCELLED';
    payload.out_time = getCurrentISTTimestampISO();
  } else if (requestedStatus === 'COMPLETED') {
    payload.is_cancelled = false;
    payload.cancel_reason = null;
    payload.final_status = 'COMPLETED';
    payload.out_time = getCurrentISTTimestampISO();
  } else if (requestedStatus === 'EXITED') {
    payload.out_time = getCurrentISTTimestampISO();
    if (existingTrip.status === 'CANCELLED' || existingTrip.is_cancelled) {
      payload.is_cancelled = true;
      payload.cancel_reason = existingTrip.cancel_reason || payload.cancel_reason;
      payload.final_status = existingTrip.final_status || 'CANCELLED';
    } else {
      payload.is_cancelled = false;
      payload.cancel_reason = null;
      payload.final_status = existingTrip.final_status || 'COMPLETED';
    }
  } else {
    payload.is_cancelled = false;
    payload.cancel_reason = null;
  }

  try {
    setButtonBusy(sourceButton, true, 'Updating...');
    const updatedTrip = await putTrip(tripId, payload);
    const autoNext = AUTO_STATUS_TRANSITIONS[requestedStatus];

    if (autoNext && normalizeStatus(updatedTrip.status) === autoNext) {
      showMessage(`Status updated to ${requestedStatus} and auto-moved to ${autoNext}`);
    } else {
      showMessage(`Status updated to ${requestedStatus}`);
    }

    await loadTrips();
  } catch (error) {
    showMessage(error.message, false);
    console.error(error);
  } finally {
    setButtonBusy(sourceButton, false);
  }
}

async function cancelTrip(tripId, sourceButton = null) {
  const role = getCurrentRole();
  if (!['Dispatch', 'Admin'].includes(role)) {
    showMessage('Only Dispatch/Admin can cancel trips', false);
    return;
  }

  const existingTrip = getTripById(tripId);
  if (!existingTrip) {
    showMessage('Trip not found', false);
    return;
  }
  if (['COMPLETED', 'CANCELLED', 'EXITED'].includes(normalizeStatus(existingTrip.status))) {
    showMessage('Cannot cancel a final status trip', false);
    return;
  }

  const confirmCancel = window.confirm('Are you sure you want to cancel this trip?');
  if (!confirmCancel) return;

  const reason = window.prompt('Enter cancel reason:');
  if (!reason || !reason.trim()) {
    showMessage('Cancel reason is required', false);
    return;
  }

  const payload = {
    ...getBaseTripPayload(existingTrip),
    status: 'CANCELLED',
    final_status: 'CANCELLED',
    is_cancelled: true,
    cancel_reason: reason.trim(),
    out_time: getCurrentISTTimestampISO(),
    last_status_update_time: getCurrentISTTimestampISO()
  };

  try {
    setButtonBusy(sourceButton, true, 'Cancelling...');
    await putTrip(tripId, payload);
    showMessage('Trip cancelled');
    await loadTrips();
  } catch (error) {
    showMessage(error.message, false);
    console.error(error);
  } finally {
    setButtonBusy(sourceButton, false);
  }
}

function computeNetWeight(tare, gross) {
  if (!Number.isFinite(tare) || !Number.isFinite(gross)) return null;
  return Number((gross - tare).toFixed(2));
}

function getCurrentExpectedWeightValue(trip) {
  if (!trip) return null;
  if (trip.expected_weight !== null && trip.expected_weight !== undefined && trip.expected_weight !== '') {
    return trip.expected_weight;
  }
  return getLatestStatusDetailValue(trip, 'expected_weight');
}

function getCurrentWeightValue(trip, fieldName) {
  if (!trip) return null;
  const currentValue = trip[fieldName];
  if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
    return currentValue;
  }
  return getLatestStatusDetailValue(trip, fieldName);
}

function updateGrossNetPreview(tripId) {
  const previewInput = document.querySelector(`[data-trip-id="${tripId}"][data-weight-field="net_weight_preview"]`);
  if (!previewInput) return;
  const trip = getTripById(tripId);
  if (!trip) {
    previewInput.value = '-';
    return;
  }
  const tare = getWeightFromRow(tripId, 'tare_weight') ?? Number(trip.tare_weight);
  const gross = getWeightFromRow(tripId, 'gross_weight') ?? Number(trip.gross_weight);
  const net = computeNetWeight(tare, gross);
  previewInput.value = net === null ? '-' : formatWeightMT(net);
}

function parseGrossWeightAttempts(trip) {
  if (!trip || trip.gross_weight_attempts == null) return [];
  if (Array.isArray(trip.gross_weight_attempts)) return trip.gross_weight_attempts;
  if (typeof trip.gross_weight_attempts === 'string') {
    try {
      const parsed = JSON.parse(trip.gross_weight_attempts);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
  return [];
}

function getLastLoadFixReason(trip) {
  const directReason = String(trip?.load_fix_reason || '').trim();
  if (directReason) return directReason;
  const attempts = parseGrossWeightAttempts(trip);
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index] || {};
    const decision = String(attempt.decision || '').toUpperCase();
    const reason = String(attempt.reason || '').trim();
    if (decision === 'RECHECK' && reason) return reason;
  }
  return null;
}

function buildGrossAttemptEntry(trip, { tare, gross, net, decision, reason, operatorName }) {
  const attempts = parseGrossWeightAttempts(trip);
  return [
    ...attempts,
    {
      attempt_no: attempts.length + 1,
      tare_weight: tare,
      gross_weight: gross,
      net_weight: net,
      decision,
      reason: reason || null,
      operator_name: operatorName || null,
      timestamp_ist: getCurrentISTTimestampISO()
    }
  ];
}

async function saveTareWeight(tripId, sourceButton = null) {
  if (!hasRoleAccess(['Weighbridge', 'Admin'])) {
    showMessage('Only Weighbridge/Admin can save tare weight', false);
    return;
  }
  const trip = getTripById(tripId);
  const tare = getWeightFromRow(tripId, 'tare_weight');
  if (!trip) return;
  if (!Number.isFinite(tare) || tare <= 0) {
    showMessage('Enter a valid tare weight', false);
    return;
  }
  const operatorName = getPersonValueFromRow(tripId, 'Weighbridge', trip.weight_operator_name || '');
  if (!operatorName) {
    showMessage('Select weighbridge operator name', false);
    return;
  }

  const payload = {
    ...getBaseTripPayload(trip),
    tare_weight: tare,
    weight_operator_name: operatorName
  };

  try {
    setButtonBusy(sourceButton, true, 'Saving...');
    await putTrip(tripId, payload);
    showMessage('Tare weight saved');
    await loadTrips();
  } catch (error) {
    showMessage(error.message, false);
    console.error(error);
  } finally {
    setButtonBusy(sourceButton, false);
  }
}

async function markTareDone(tripId, sourceButton = null) {
  const trip = getTripById(tripId);
  if (!trip) return;
  const tare = getWeightFromRow(tripId, 'tare_weight') || Number(trip.tare_weight);
  if (!Number.isFinite(tare) || tare <= 0) {
    showMessage('Tare weight is required before marking tare done', false);
    return;
  }
  const operatorName = getPersonValueFromRow(tripId, 'Weighbridge', trip.weight_operator_name || '');
  if (!operatorName) {
    showMessage('Select weighbridge operator name', false);
    return;
  }

  const extraFields = { weight_operator_name: operatorName, tare_done_by: operatorName };
  if (!trip.tare_weight) {
    extraFields.tare_weight = tare;
  }

  await applyStatusChange(tripId, 'TARE_WEIGHT_DONE', extraFields, sourceButton);
}

async function saveGrossWeight(tripId, sourceButton = null) {
  if (!hasRoleAccess(['Weighbridge', 'Admin'])) {
    showMessage('Only Weighbridge/Admin can save gross weight', false);
    return;
  }

  const trip = getTripById(tripId);
  if (!trip) return;
  const gross = getWeightFromRow(tripId, 'gross_weight');
  const tare = getWeightFromRow(tripId, 'tare_weight') ?? Number(trip.tare_weight);

  if (!Number.isFinite(gross) || gross <= 0) {
    showMessage('Enter a valid gross weight', false);
    return;
  }
  if (!Number.isFinite(tare) || tare <= 0) {
    showMessage('Tare weight is required before gross weight', false);
    return;
  }
  if (gross <= tare) {
    showMessage('Gross weight must be greater than tare weight', false);
    return;
  }
  const operatorName = getPersonValueFromRow(tripId, 'Weighbridge', trip.weight_operator_name || '');
  if (!operatorName) {
    showMessage('Select weighbridge operator name', false);
    return;
  }

  const net = computeNetWeight(tare, gross);
  const payload = {
    ...getBaseTripPayload(trip),
    tare_weight: tare,
    gross_weight: gross,
    net_weight: net,
    weight_operator_name: operatorName
  };

  try {
    setButtonBusy(sourceButton, true, 'Saving...');
    await putTrip(tripId, payload);
    showMessage('Gross weight saved');
    await loadTrips();
  } catch (error) {
    showMessage(error.message, false);
    console.error(error);
  } finally {
    setButtonBusy(sourceButton, false);
  }
}

async function markGrossDone(tripId, sourceButton = null) {
  const trip = getTripById(tripId);
  if (!trip) return;
  const gross = getWeightFromRow(tripId, 'gross_weight') || Number(trip.gross_weight);
  const tare = getWeightFromRow(tripId, 'tare_weight') ?? Number(trip.tare_weight);

  if (!Number.isFinite(gross) || gross <= 0) {
    showMessage('Gross weight is required before marking gross done', false);
    return;
  }
  if (!Number.isFinite(tare) || tare <= 0) {
    showMessage('Tare weight is required before gross weight done', false);
    return;
  }
  if (gross <= tare) {
    showMessage('Gross weight must be greater than tare weight', false);
    return;
  }
  const operatorName = getPersonValueFromRow(tripId, 'Weighbridge', trip.weight_operator_name || '');
  if (!operatorName) {
    showMessage('Select weighbridge operator name', false);
    return;
  }

  const net = computeNetWeight(tare, gross);
  const nextAttempts = buildGrossAttemptEntry(trip, {
    tare,
    gross,
    net,
    decision: 'ACCEPTED',
    reason: null,
    operatorName
  });
  const extraFields = {
    tare_weight: tare,
    gross_weight: gross,
    net_weight: net,
    weight_operator_name: operatorName,
    gross_done_by: operatorName,
    gross_weight_attempts: nextAttempts,
    load_fix_reason: null
  };
  await applyStatusChange(tripId, 'GROSS_WEIGHT_DONE', extraFields, sourceButton);
}

async function sendForLoadFix(tripId, sourceButton = null) {
  if (!hasRoleAccess(['Weighbridge', 'Admin'])) {
    showMessage('Only Weighbridge/Admin can send for load fix', false);
    return;
  }
  const trip = getTripById(tripId);
  if (!trip) return;

  const gross = getWeightFromRow(tripId, 'gross_weight') ?? Number(trip.gross_weight);
  const tare = getWeightFromRow(tripId, 'tare_weight') ?? Number(trip.tare_weight);
  if (!Number.isFinite(gross) || gross <= 0) {
    showMessage('Gross weight is required before sending for load fix', false);
    return;
  }
  if (!Number.isFinite(tare) || tare <= 0) {
    showMessage('Tare weight is required before sending for load fix', false);
    return;
  }
  if (gross <= tare) {
    showMessage('Gross weight must be greater than tare weight', false);
    return;
  }

  const operatorName = getPersonValueFromRow(tripId, 'Weighbridge', trip.weight_operator_name || '');
  if (!operatorName) {
    showMessage('Select weighbridge operator name', false);
    return;
  }

  const reason = window.prompt('Enter load fix reason:');
  if (!reason || !reason.trim()) {
    showMessage('Load fix reason is mandatory', false);
    return;
  }

  const net = computeNetWeight(tare, gross);
  const nextAttempts = buildGrossAttemptEntry(trip, {
    tare,
    gross,
    net,
    decision: 'RECHECK',
    reason: reason.trim(),
    operatorName
  });

  await applyStatusChange(tripId, 'LOAD_FIX_REQUIRED', {
    tare_weight: tare,
    gross_weight: gross,
    net_weight: net,
    weight_operator_name: operatorName,
    gross_weight_attempts: nextAttempts,
    load_fix_reason: reason.trim()
  }, sourceButton);
}

async function fetchTripDocuments(tripId, force = false) {
  const key = String(tripId);
  if (!force && tripDocumentsCache.has(key)) return tripDocumentsCache.get(key);
  if (tripDocumentsLoading.has(key)) return tripDocumentsCache.get(key) || [];
  if (!canViewTripDocuments()) return [];

  tripDocumentsLoading.add(key);
  try {
    const response = await fetch(`/trip/${tripId}/documents`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to load documents');
    }
    const docs = await response.json();
    tripDocumentsCache.set(key, docs);
    return docs;
  } finally {
    tripDocumentsLoading.delete(key);
  }
}

function renderTripDocumentsSection(trip) {
  const canUpload = canUploadTripDocuments();
  const canView = canViewTripDocuments();
  if (!canUpload && !canView) return '';

  const docs = tripDocumentsCache.get(String(trip.id)) || [];
  const listHtml = !canView
    ? '<div class="mini-muted">Document list hidden for this role</div>'
    : (docs.length
      ? docs.map((doc) => {
        const type = doc.doc_type ? `${escapeHtml(doc.doc_type)} • ` : '';
        const uploaderName = doc.uploaded_by_name ? ` (${escapeHtml(doc.uploaded_by_name)})` : '';
        const deleteBtn = canDeleteTripDocument(doc)
          ? `<button class="workflow-btn danger" data-action="delete-doc" data-trip-id="${trip.id}" data-doc-id="${doc.id}" type="button">Delete</button>`
          : '';
        return `
          <div class="workflow-row">
            <button class="truck-link-btn" data-action="download-doc" data-doc-id="${doc.id}" data-doc-name="${escapeHtml(doc.file_name)}" type="button">${escapeHtml(doc.file_name)}</button>
            <span class="mini-muted">${type}${formatFileSize(doc.file_size)} • ${escapeHtml(doc.uploaded_by_role || '-')} ${uploaderName}</span>
            ${deleteBtn}
          </div>
        `;
      }).join('')
      : '<div class="mini-muted">No documents uploaded</div>');

  const uploadHtml = canUpload ? `
    <div class="workflow-row">
      <input type="text" class="dispatch-input" placeholder="Document type (Invoice/Bill/etc.)" data-doc-type data-trip-id="${trip.id}" />
      <input type="file" class="dispatch-input" data-doc-file data-trip-id="${trip.id}" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,application/pdf,image/png,image/jpeg,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
      <button class="workflow-btn primary" data-action="upload-doc" data-trip-id="${trip.id}" type="button">Upload</button>
    </div>
  ` : '';

  return `
    <div class="workflow-group">
      <div class="mini-muted"><strong>Trip Documents</strong></div>
      ${uploadHtml}
      ${listHtml}
    </div>
  `;
}

async function downloadTripDocument(docId, fileName = 'document') {
  try {
    const response = await fetch(`/documents/${docId}/download`, {
      headers: {
        ...getAuthHeaders()
      }
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to download document');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      URL.revokeObjectURL(url);
      throw new Error('Please allow popups to open document preview');
    }
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  } catch (error) {
    showMessage(error.message, false);
  }
}

async function uploadTripDocument(tripId, sourceButton = null) {
  if (!canUploadTripDocuments()) {
    showMessage('Role cannot upload documents', false);
    return;
  }
  const fileInput = document.querySelector(`[data-doc-file][data-trip-id="${tripId}"]`);
  const typeInput = document.querySelector(`[data-doc-type][data-trip-id="${tripId}"]`);
  const file = fileInput?.files?.[0];
  if (!file) {
    showMessage('Select a file to upload', false);
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  if (typeInput?.value?.trim()) {
    formData.append('doc_type', typeInput.value.trim());
  }

  try {
    setButtonBusy(sourceButton, true, 'Uploading...');
    const response = await fetch(`/trip/${tripId}/documents`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders()
      },
      body: formData
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to upload document');
    }
    if (fileInput) fileInput.value = '';
    if (typeInput) typeInput.value = '';
    await fetchTripDocuments(tripId, true);
    showMessage('Document uploaded');
    applyFilters();
  } catch (error) {
    showMessage(error.message, false);
  } finally {
    setButtonBusy(sourceButton, false);
  }
}

async function deleteTripDocument(tripId, docId, sourceButton = null) {
  const confirmDelete = window.confirm('Delete this document?');
  if (!confirmDelete) return;
  try {
    setButtonBusy(sourceButton, true, 'Deleting...');
    const response = await fetch(`/trip/${tripId}/documents/${docId}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders()
      }
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to delete document');
    }
    await fetchTripDocuments(tripId, true);
    showMessage('Document deleted');
    applyFilters();
  } catch (error) {
    showMessage(error.message, false);
  } finally {
    setButtonBusy(sourceButton, false);
  }
}

function getWeightsView(trip) {
  return `
    <div class="weight-readonly">
      <span>Tare: ${formatWeightMT(trip.tare_weight)}</span>
      <span>Gross: ${formatWeightMT(trip.gross_weight)}</span>
      <span>Net: ${formatWeightMT(trip.net_weight)}</span>
    </div>
  `;
}

function getDispatchDetailsView(trip) {
  const role = getCurrentRole();
  if (role === 'Accounts') {
    const accountItems = [
      ['Material', trip.material_type],
      ['Grade', trip.grade],
      ['Condition', trip.condition],
      ['Packing', trip.packing],
      ['Net Weight', formatWeightMT(getCurrentWeightValue(trip, 'net_weight'))],
      ['Out Time', formatDateTime(trip.out_time)]
    ];

    return `
      <div class="workflow-details">
        ${accountItems.map(([label, value]) => `<div>${escapeHtml(label)}: ${escapeHtml(value || '-')}</div>`).join('')}
      </div>
    `;
  }

  const status = normalizeStatus(trip.status);
  const draft = getLoadingDraft(trip.id);
  const showLoadingDetailsHintStatuses = new Set([
    'READY_FOR_LOADING',
    'LOADING_IN_PROGRESS',
    'LOADING_COMPLETED',
    'GROSS_WEIGHT_PENDING',
    'LOAD_FIX_REQUIRED',
    'GROSS_WEIGHT_DONE',
    'BILLING_PENDING',
    'BILLING_COMPLETED',
    'COMPLETED',
    'EXITED'
  ]);
  const historyExpectedWeight = getLatestStatusDetailValue(trip, 'expected_weight');
  const items = [];
  const expectedWeightValue = (
    trip.expected_weight !== null && trip.expected_weight !== undefined && trip.expected_weight !== ''
      ? trip.expected_weight
      : (draft.expected_weight ?? historyExpectedWeight ?? '')
  );
  if (trip.material_type) items.push(`Material: ${escapeHtml(trip.material_type)}`);
  if (trip.grade) items.push(`Grade: ${escapeHtml(trip.grade)}`);
  if (trip.condition) items.push(`Condition: ${escapeHtml(trip.condition)}`);
  if (trip.packing) items.push(`Packing: ${escapeHtml(trip.packing)}`);
  if (trip.location) items.push(`Location: ${escapeHtml(trip.location)}`);
  if (trip.loading_point) items.push(`Loading: ${escapeHtml(trip.loading_point)}`);
  if (expectedWeightValue !== null && expectedWeightValue !== undefined && expectedWeightValue !== '') {
    items.push(`Expected: ${escapeHtml(formatWeightMT(expectedWeightValue))}`);
  }
  if (trip.labour_team) items.push(`Team: ${escapeHtml(trip.labour_team)}`);
  if (trip.dispatch_manager_name) items.push(`Dispatch Manager: ${escapeHtml(trip.dispatch_manager_name)}`);
  if (trip.loading_person_name) items.push(`Loading Manager: ${escapeHtml(trip.loading_person_name)}`);
  if (trip.weight_operator_name) items.push(`Weighbridge Operator: ${escapeHtml(trip.weight_operator_name)}`);
  if (trip.accounts_person_name) items.push(`Accounts Manager: ${escapeHtml(trip.accounts_person_name)}`);
  if (trip.dispatch_done_by) items.push(`Dispatch Done By: ${escapeHtml(trip.dispatch_done_by)}`);
  if (trip.tare_done_by) items.push(`Tare Done By: ${escapeHtml(trip.tare_done_by)}`);
  if (trip.gross_done_by) items.push(`Gross Done By: ${escapeHtml(trip.gross_done_by)}`);
  if (trip.loading_done_by) items.push(`Loading Done By: ${escapeHtml(trip.loading_done_by)}`);
  if (trip.billing_done_by) items.push(`Billing Done By: ${escapeHtml(trip.billing_done_by)}`);
  if (trip.eta) items.push(`ETA: ${formatDateTime(trip.eta)}`);
  if (trip.load_fix_reason) items.push(`Load Fix Reason: ${escapeHtml(trip.load_fix_reason)}`);
  if (trip.customer_notes) items.push(`Customer Note: ${escapeHtml(trip.customer_notes)}`);
  const grossAttempts = parseGrossWeightAttempts(trip);
  if (grossAttempts.length) {
    const lastAttempt = grossAttempts[grossAttempts.length - 1];
    const verdict = lastAttempt?.decision || '-';
    items.push(`Gross Attempts: ${grossAttempts.length} (Last: ${escapeHtml(verdict)})`);
  }
  if (!items.length) {
    if (!showLoadingDetailsHintStatuses.has(status)) return '';
    return '<div class="mini-muted">Loading details not added yet</div>';
  }
  return `<div class="workflow-details">${items.map((item) => `<div>${item}</div>`).join('')}</div>`;
}

function renderDispatchSelect(fieldName, tripId, savedValue) {
  const options = DISPATCH_DROPDOWNS[fieldName] || [];
  const isSavedOther = !!savedValue && !options.includes(savedValue);
  const selectedValue = isSavedOther ? 'Other' : (savedValue || '');
  const optionsHtml = [
    '<option value="">Select</option>',
    ...options.map((option) => (
      `<option value="${option}" ${selectedValue === option ? 'selected' : ''}>${option}</option>`
    ))
  ].join('');

  return `
    <div class="field-inline">
      <select data-trip-id="${tripId}" data-dispatch-field="${fieldName}" class="dispatch-input">
        ${optionsHtml}
      </select>
      <input
        type="text"
        data-trip-id="${tripId}"
        data-dispatch-other="${fieldName}"
        class="dispatch-other-input"
        placeholder="Enter ${fieldName.replace('_', ' ')}"
        value="${isSavedOther ? escapeHtml(savedValue) : ''}"
        style="${selectedValue === 'Other' ? 'display:block;' : 'display:none;'}"
      />
    </div>
  `;
}

function toLocalDateTimeValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('sv-SE', { timeZone: IST_TIMEZONE }).slice(0, 16);
}

const ADMIN_EDITABLE_FIELDS = [
  { key: 'truck_number', label: 'Truck No', type: 'text' },
  { key: 'customer_name', label: 'Customer', type: 'text' },
  { key: 'transporter', label: 'Transporter', type: 'text' },
  { key: 'driver_name', label: 'Driver', type: 'text' },
  { key: 'driver_phone', label: 'Driver Phone', type: 'text' },
  { key: 'gate_person_name', label: 'Gate Operator', type: 'text' },
  { key: 'dispatch_manager_name', label: 'Dispatch Manager', type: 'text' },
  { key: 'loading_person_name', label: 'Loading Manager', type: 'text' },
  { key: 'weight_operator_name', label: 'Weighbridge Operator', type: 'text' },
  { key: 'accounts_person_name', label: 'Accounts Manager', type: 'text' },
  { key: 'dispatch_done_by', label: 'Dispatch Done By', type: 'text' },
  { key: 'tare_done_by', label: 'Tare Done By', type: 'text' },
  { key: 'gross_done_by', label: 'Gross Done By', type: 'text' },
  { key: 'loading_done_by', label: 'Loading Done By', type: 'text' },
  { key: 'billing_done_by', label: 'Billing Done By', type: 'text' },
  { key: 'loading_point', label: 'Loading Point', type: 'text' },
  { key: 'labour_team', label: 'Loading Team', type: 'text' },
  { key: 'material_type', label: 'Material', type: 'text' },
  { key: 'grade', label: 'Grade', type: 'text' },
  { key: 'condition', label: 'Condition', type: 'text' },
  { key: 'packing', label: 'Packing', type: 'text' },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'eta', label: 'ETA', type: 'datetime-local' },
  { key: 'waiting_reason', label: 'Waiting Reason', type: 'text' },
  { key: 'load_fix_reason', label: 'Load Fix Reason', type: 'text' },
  { key: 'expected_weight', label: 'Expected Weight (MT)', type: 'number' },
  { key: 'customer_notes', label: 'Customer Note', type: 'text' },
  { key: 'tare_weight', label: 'Tare Weight (MT)', type: 'number' },
  { key: 'gross_weight', label: 'Gross Weight (MT)', type: 'number' },
  { key: 'cancel_reason', label: 'Cancel Reason', type: 'text' }
];

const ADMIN_DROPDOWN_FIELDS = new Set([
  'gate_person_name',
  'dispatch_manager_name',
  'loading_person_name',
  'weight_operator_name',
  'accounts_person_name',
  'dispatch_done_by',
  'tare_done_by',
  'gross_done_by',
  'loading_done_by',
  'billing_done_by',
  'loading_point',
  'labour_team',
  'material_type',
  'grade',
  'condition',
  'packing'
]);

function getAdminDropdownOptions(fieldKey) {
  if (fieldKey === 'gate_person_name') return PERSON_DROPDOWNS.Gate;
  if (PERSON_FIELD_BY_ROLE.Dispatch === fieldKey) return PERSON_DROPDOWNS.Dispatch;
  if (PERSON_FIELD_BY_ROLE.Loading === fieldKey) return PERSON_DROPDOWNS.Loading;
  if (PERSON_FIELD_BY_ROLE.Weighbridge === fieldKey) return PERSON_DROPDOWNS.Weighbridge;
  if (PERSON_FIELD_BY_ROLE.Accounts === fieldKey) return PERSON_DROPDOWNS.Accounts;
  if (fieldKey === 'dispatch_done_by') return PERSON_DROPDOWNS.Dispatch;
  if (fieldKey === 'tare_done_by') return PERSON_DROPDOWNS.Weighbridge;
  if (fieldKey === 'gross_done_by') return PERSON_DROPDOWNS.Weighbridge;
  if (fieldKey === 'loading_done_by') return PERSON_DROPDOWNS.Loading;
  if (fieldKey === 'billing_done_by') return PERSON_DROPDOWNS.Accounts;
  return DISPATCH_DROPDOWNS[fieldKey] || [];
}

function renderAdminFieldControl(field, trip) {
  if (ADMIN_DROPDOWN_FIELDS.has(field.key)) {
    const options = getAdminDropdownOptions(field.key);
    const currentValue = trip[field.key] || '';
    const isOtherValue = !!currentValue && !options.includes(currentValue);
    const selectedValue = isOtherValue ? 'Other' : currentValue;
    const optionsHtml = [
      '<option value="">Select</option>',
      ...options.map((option) => (
        `<option value="${option}" ${selectedValue === option ? 'selected' : ''}>${option}</option>`
      ))
    ].join('');

    return `
      <div class="field-inline">
        <select
          class="admin-edit-input admin-edit-select"
          data-trip-id="${trip.id}"
          data-admin-field="${field.key}"
          data-admin-select-field="${field.key}"
        >
          ${optionsHtml}
        </select>
        <input
          type="text"
          class="admin-edit-input"
          data-trip-id="${trip.id}"
          data-admin-other="${field.key}"
          placeholder="Enter ${field.label}"
          value="${isOtherValue ? escapeHtml(currentValue) : ''}"
          style="${selectedValue === 'Other' ? 'display:block;' : 'display:none;'}"
        />
      </div>
    `;
  }

  const rawValue = trip[field.key];
  const value = field.type === 'datetime-local'
    ? toLocalDateTimeValue(rawValue)
    : (rawValue ?? '');
  return `
    <input
      type="${field.type}"
      step="${field.type === 'number' ? '0.01' : ''}"
      class="admin-edit-input"
      data-trip-id="${trip.id}"
      data-admin-field="${field.key}"
      value="${escapeHtml(value)}"
    />
  `;
}

function renderAdminManualEditor(trip) {
  if (!hasRoleAccess(['Admin'])) return '';
  const fieldsHtml = ADMIN_EDITABLE_FIELDS.map((field) => {
    return `
      <label>
        ${field.label}
        ${renderAdminFieldControl(field, trip)}
      </label>
    `;
  }).join('');

  return `
    <div class="workflow-group admin-editor">
      <div class="mini-muted"><strong>Admin Manual Data Editor</strong></div>
      <div class="mini-muted"><strong>Net Weight:</strong> ${formatWeightMT(trip.net_weight)}</div>
      <div class="admin-editor-grid">
        ${fieldsHtml}
      </div>
      <div class="workflow-row">
        <button class="workflow-btn primary" data-action="admin-save" data-trip-id="${trip.id}" type="button">
          Save Manual Data
        </button>
        <button class="workflow-btn danger" data-action="admin-delete-trip" data-trip-id="${trip.id}" type="button">
          Delete Trip Entry
        </button>
      </div>
    </div>
  `;
}

function getDispatchEditor(trip) {
  if (!hasRoleAccess(['Dispatch', 'Admin'])) {
    return getDispatchDetailsView(trip);
  }
  const draft = getLoadingDraft(trip.id);
  const etaSource = draft.eta || trip.eta || null;
  const etaValue = etaSource ? new Date(etaSource).toLocaleString('sv-SE', { timeZone: IST_TIMEZONE }).slice(0, 16) : '';
  const materialValue = draft.material_type ?? trip.material_type ?? '';
  const gradeValue = draft.grade ?? trip.grade ?? '';
  const conditionValue = draft.condition ?? trip.condition ?? '';
  const packingValue = draft.packing ?? trip.packing ?? '';
  const locationValue = draft.location ?? trip.location ?? '';
  const loadingPointValue = draft.loading_point ?? trip.loading_point ?? '';
  const expectedWeightValue = draft.expected_weight ?? trip.expected_weight ?? '';
  return `
    <div class="dispatch-editor">
      <label>Material ${renderDispatchSelect('material_type', trip.id, materialValue)}</label>
      <label>Grade ${renderDispatchSelect('grade', trip.id, gradeValue)}</label>
      <label>Condition ${renderDispatchSelect('condition', trip.id, conditionValue)}</label>
      <label>Packing ${renderDispatchSelect('packing', trip.id, packingValue)}</label>
      <label>Location
        <input type="text" data-trip-id="${trip.id}" data-dispatch-field="location" class="dispatch-input" value="${escapeHtml(String(locationValue))}" placeholder="Enter location" />
      </label>
      <label>Loading Point ${renderDispatchSelect('loading_point', trip.id, loadingPointValue)}</label>
      <label>Expected Weight (MT)
        <input type="number" step="0.001" min="0" data-trip-id="${trip.id}" data-dispatch-field="expected_weight" class="dispatch-input" value="${escapeHtml(String(expectedWeightValue))}" />
      </label>
      <label>ETA
        <input type="datetime-local" data-trip-id="${trip.id}" data-dispatch-field="eta" class="dispatch-input" value="${etaValue}" />
      </label>
    </div>
  `;
}

function getLoadingStartEditor(trip) {
  if (!hasRoleAccess(['Loading', 'Admin'])) {
    return '';
  }
  const draft = getLoadingDraft(trip.id);
  const loadingTeamValue = draft.labour_team ?? trip.labour_team ?? '';
  const loadingPersonValue = draft.loading_person_name ?? trip.loading_person_name ?? '';
  const expectedWeightValue = draft.expected_weight ?? getCurrentExpectedWeightValue(trip) ?? '';
  const isLoadFixStage = normalizeStatus(trip.status) === 'LOAD_FIX_REQUIRED';

  return `
    <div class="dispatch-editor">
      <label>Expected Weight (MT)
        <input type="text" class="dispatch-input" value="${escapeHtml(formatWeightMT(expectedWeightValue))}" disabled />
      </label>
      ${isLoadFixStage ? `
      <label>Current Net Weight (MT)
        <input type="text" class="dispatch-input" value="${escapeHtml(formatWeightMT(trip.net_weight))}" disabled />
      </label>
      ` : ''}
      <label>Loading Team ${renderDispatchSelect('labour_team', trip.id, loadingTeamValue)}</label>
      <label>Loading Manager ${renderPersonSelect('Loading', trip.id, loadingPersonValue)}</label>
    </div>
  `;
}

function getBillingEditor(trip) {
  if (!hasRoleAccess(['Accounts', 'Admin'])) return '';
  const draft = getBillingDraft(trip.id);
  const gradeKey = String(trip.grade || '').trim().toLowerCase();
  const defaultRate = gradePricingMap.get(gradeKey);
  const defaultGst = pricingDefaults.default_gst_percent;
  const rateValue = draft.rate_used_per_mt ?? trip.rate_used_per_mt ?? defaultRate ?? '';
  const gstValue = draft.gst_percent_used ?? trip.gst_percent_used ?? defaultGst ?? '';
  const netWeight = toNumOrNull(trip.net_weight_snapshot_mt ?? trip.net_weight) ?? 0;
  const amounts = computeBillingAmounts(netWeight, rateValue, gstValue);

  return `
    <div class="dispatch-editor billing-editor">
      <label>Net Weight (MT)
        <input type="text" class="dispatch-input" value="${escapeHtml(formatWeightMT(netWeight))}" disabled />
      </label>
      <label>Rate (₹/MT)
        <input type="number" step="0.001" min="0" data-trip-id="${trip.id}" data-billing-field="rate_used_per_mt" class="dispatch-input" value="${escapeHtml(String(rateValue))}" />
      </label>
      <label>GST (%)
        <input type="number" step="0.001" min="0" data-trip-id="${trip.id}" data-billing-field="gst_percent_used" class="dispatch-input" value="${escapeHtml(String(gstValue))}" />
      </label>
      <label>Taxable Amount (₹)
        <input type="text" data-trip-id="${trip.id}" data-billing-field="taxable_amount_preview" class="dispatch-input" value="${escapeHtml(String(amounts.taxable.toFixed(2)))}" disabled />
      </label>
      <label>GST Amount (₹)
        <input type="text" data-trip-id="${trip.id}" data-billing-field="gst_amount_preview" class="dispatch-input" value="${escapeHtml(String(amounts.gstAmount.toFixed(2)))}" disabled />
      </label>
      <label>Total Amount (₹)
        <input type="text" data-trip-id="${trip.id}" data-billing-field="total_amount_preview" class="dispatch-input" value="${escapeHtml(String(amounts.total.toFixed(2)))}" disabled />
      </label>
    </div>
  `;
}

function getAllowedManualTargets(trip) {
  const role = getCurrentRole();
  const status = normalizeStatus(trip.status);
  const nextStrictTargets = STATUS_TRANSITIONS[status] || [];
  const filteredTargets = nextStrictTargets.filter((target) => {
    // Weighbridge stages already render explicit "Save" + "Mark Done" controls.
    if (status === 'SENT_FOR_TARE_WEIGHT' && target === 'TARE_WEIGHT_DONE') return false;
    if (status === 'GROSS_WEIGHT_PENDING' && target === 'GROSS_WEIGHT_DONE') return false;
    if (status === 'GROSS_WEIGHT_PENDING' && target === 'LOAD_FIX_REQUIRED') return false;
    if (target === 'EXITED') {
      return role === 'Gate';
    }
    return isRoleAllowedForStatus(role, target);
  });
  if (role !== 'Admin') {
    return filteredTargets;
  }

  const currentIndex = STATUS_FLOW.indexOf(status);
  const previousTargets = currentIndex > 0
    ? STATUS_FLOW.slice(0, currentIndex).reverse().filter((target) => target !== status)
    : [];
  const deduped = new Set([...filteredTargets, ...previousTargets]);
  return Array.from(deduped);
}

function buildWorkflowActionBlocks(trip, role, status, options = {}) {
  const includeDocuments = options.includeDocuments !== false;
  const includeAdminEditor = options.includeAdminEditor !== false;
  const actionBlocks = [];

  if ((role === 'Dispatch' || role === 'Admin') && status !== 'CANCELLED' && status !== 'COMPLETED' && status !== 'EXITED') {
    actionBlocks.push(`<button class="workflow-btn danger" data-action="cancel" data-trip-id="${trip.id}">Cancel Trip</button>`);
  }

  if ((role === 'Weighbridge' || role === 'Admin') && status === 'SENT_FOR_TARE_WEIGHT') {
    actionBlocks.push(`
      <div class="workflow-group">
        <label>Weighbridge Operator
          ${renderPersonSelect('Weighbridge', trip.id, trip.weight_operator_name || '')}
        </label>
        <label>Tare Weight (MT)
          <input type="number" step="0.001" data-trip-id="${trip.id}" data-weight-field="tare_weight" value="${trip.tare_weight ?? ''}" class="weight-input" />
        </label>
        <div class="workflow-row">
          <button class="workflow-btn" data-action="save-tare" data-trip-id="${trip.id}">Save Tare Weight</button>
          <button class="workflow-btn primary" data-action="mark-tare-done" data-trip-id="${trip.id}">Mark Tare Weight Done</button>
        </div>
      </div>
    `);
  }

  if ((role === 'Weighbridge' || role === 'Admin') && status === 'GROSS_WEIGHT_PENDING') {
    const expectedWeightValue = getCurrentExpectedWeightValue(trip);
    const previewNet = computeNetWeight(Number(trip.tare_weight), Number(trip.gross_weight));
    actionBlocks.push(`
      <div class="workflow-group">
        <label>Weighbridge Operator
          ${renderPersonSelect('Weighbridge', trip.id, trip.weight_operator_name || '')}
        </label>
        <label>Expected Weight (MT)
          <input type="text" class="weight-input" value="${escapeHtml(formatWeightMT(expectedWeightValue))}" disabled />
        </label>
        <label>Tare Weight (MT)
          <input type="number" step="0.001" data-trip-id="${trip.id}" data-weight-field="tare_weight" value="${trip.tare_weight ?? ''}" class="weight-input" />
        </label>
        <label>Gross Weight (MT)
          <input type="number" step="0.001" data-trip-id="${trip.id}" data-weight-field="gross_weight" value="${trip.gross_weight ?? ''}" class="weight-input" />
        </label>
        <label>Net Weight (MT)
          <input type="text" data-trip-id="${trip.id}" data-weight-field="net_weight_preview" value="${escapeHtml(previewNet === null ? '-' : formatWeightMT(previewNet))}" class="weight-input" disabled />
        </label>
        <div class="workflow-row">
          <button class="workflow-btn" data-action="save-gross" data-trip-id="${trip.id}">Save Gross Weight</button>
          <button class="workflow-btn danger" data-action="send-load-fix" data-trip-id="${trip.id}">Send For Load Fix</button>
          <button class="workflow-btn primary" data-action="mark-gross-done" data-trip-id="${trip.id}">Mark Gross Weight Done</button>
        </div>
      </div>
    `);
  }

  if (hasRoleAccess(['Dispatch', 'Admin']) && ['AT_DISPATCH', 'WAITING'].includes(status)) {
    actionBlocks.push(getDispatchEditor(trip));
  }

  if (status === 'READY_FOR_LOADING' || status === 'LOAD_FIX_REQUIRED') {
    actionBlocks.push(getLoadingStartEditor(trip));
  }

  if (hasRoleAccess(['Dispatch', 'Admin']) && ['AT_DISPATCH', 'WAITING', 'READY_FOR_LOADING'].includes(status)) {
    actionBlocks.push(`
      <div class="workflow-group">
        <label>Dispatch Manager
          ${renderPersonSelect('Dispatch', trip.id, trip.dispatch_manager_name || '')}
        </label>
      </div>
    `);
  }

  if (hasRoleAccess(['Accounts', 'Admin']) && ['BILLING_PENDING', 'BILLING_COMPLETED'].includes(status)) {
    actionBlocks.push(`
      <div class="workflow-group">
        <label>Accounts Manager
          ${renderPersonSelect('Accounts', trip.id, trip.accounts_person_name || '')}
        </label>
        ${status === 'BILLING_PENDING' ? getBillingEditor(trip) : ''}
      </div>
    `);
  }

  const allowedTargets = getAllowedManualTargets(trip);
  if (allowedTargets.length) {
    const buttons = allowedTargets.map((target) => {
      const label = target === 'EXITED' ? 'Mark Exit' : target.replaceAll('_', ' ');
      return `<button class="workflow-btn primary" data-action="status-change" data-target-status="${target}" data-trip-id="${trip.id}">${label}</button>`;
    }).join('');

    actionBlocks.push(`<div class="workflow-row">${buttons}</div>`);
  }

  const documentsSection = includeDocuments ? renderTripDocumentsSection(trip) : '';
  if (documentsSection) {
    actionBlocks.push(documentsSection);
  }

  if (role === 'Admin' && includeAdminEditor) {
    actionBlocks.push(renderAdminManualEditor(trip));
  }

  if (!actionBlocks.length) {
    return actionBlocks;
  }

  return actionBlocks;
}

function getWorkflowActions(trip) {
  const role = getCurrentRole();
  const status = normalizeStatus(trip.status);
  const actionBlocks = buildWorkflowActionBlocks(trip, role, status);

  if (role === 'Admin') {
    return `
      <div class="workflow-container">
        <div class="workflow-row">
          <button class="workflow-btn" data-action="admin-view-fields" data-admin-section="fields" data-trip-id="${trip.id}" type="button">View Fields</button>
          <button class="workflow-btn primary" data-action="admin-view-actions" data-admin-section="actions" data-trip-id="${trip.id}" type="button">View Actions</button>
          <button class="workflow-btn" data-action="admin-view-tools" data-admin-section="tools" data-trip-id="${trip.id}" type="button">Edit Fields</button>
        </div>
      </div>
    `;
  }

  if (!actionBlocks.length) {
    return '<span>-</span>';
  }

  return `
    <div class="workflow-container">
      ${getDispatchDetailsView(trip)}
      ${actionBlocks.join('')}
    </div>
  `;
}

function openAdminWorkflowModal(tripId, section = 'fields') {
  const trip = getTripById(tripId);
  if (!trip || !adminWorkflowModal || !adminWorkflowModalTitle || !adminWorkflowModalBody) return;

  const modalSection = ['actions', 'tools'].includes(section) ? section : 'fields';
  adminWorkflowModalTitle.textContent = modalSection === 'actions'
    ? `Actions - ${trip.truck_number || `#${trip.id}`}`
    : (modalSection === 'tools'
      ? `Admin Tools - ${trip.truck_number || `#${trip.id}`}`
      : `Fields - ${trip.truck_number || `#${trip.id}`}`);

  if (modalSection === 'fields') {
    adminWorkflowModalBody.innerHTML = `
      <div class="workflow-container">
        ${getDispatchDetailsView(trip)}
      </div>
    `;
  } else if (modalSection === 'actions') {
    const actionBlocks = buildWorkflowActionBlocks(trip, 'Admin', normalizeStatus(trip.status), {
      includeDocuments: false,
      includeAdminEditor: false
    });
    adminWorkflowModalBody.innerHTML = `
      <div class="workflow-container">
        ${actionBlocks.length ? actionBlocks.join('') : '<span>-</span>'}
      </div>
    `;
    bindRowActionHandlers(adminWorkflowModalBody);
  } else {
    const toolsBlocks = [];
    const documentsSection = renderTripDocumentsSection(trip);
    if (documentsSection) toolsBlocks.push(documentsSection);
    const adminEditor = renderAdminManualEditor(trip);
    if (adminEditor) toolsBlocks.push(adminEditor);
    adminWorkflowModalBody.innerHTML = `
      <div class="workflow-container">
        ${toolsBlocks.length ? toolsBlocks.join('') : '<span>-</span>'}
      </div>
    `;
    bindRowActionHandlers(adminWorkflowModalBody);
  }

  adminWorkflowModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function renderTripsTable(trips) {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  if (!isMobile) {
    tripsTable.innerHTML = trips.map((trip) => {
      const inTime = parseTripDate(trip.in_time);
      const statusTime = parseTripDate(trip.last_status_update_time || trip.in_time);
      const totalTime = calculateElapsedMinutes(inTime);
      const stageTime = calculateElapsedMinutes(statusTime);
      const delayClass = getDelayClass(totalTime);

      return `
        <tr class="${delayClass}" data-trip-row="${trip.id}">
          <td>${trip.id}</td>
          <td>${getTruckTimelineButton(trip)}</td>
          <td>${getStatusWithReasonDetails(trip)}</td>
          <td>${escapeHtml(trip.customer_name || '')}</td>
          <td>${formatDateTime(trip.in_time)}</td>
          <td>${getWorkflowActions(trip)}</td>
        </tr>
      `;
    }).join('');
    if (tripsMobileList) tripsMobileList.innerHTML = '';
  } else {
    tripsTable.innerHTML = '';
    renderTripsMobileList(trips);
  }

  wireRowEvents();
  document.querySelectorAll('[data-action="status-change"][data-target-status="LOADING_IN_PROGRESS"]')
    .forEach((button) => updateLoadingButtonState(button.dataset.tripId));
  document.querySelectorAll('[data-weight-field="net_weight_preview"]')
    .forEach((input) => updateGrossNetPreview(input.dataset.tripId));
  hydrateVisibleTripDocuments(trips);
}

function hydrateVisibleTripDocuments(trips) {
  if (!canViewTripDocuments()) return;
  const uniqueTripIds = Array.from(new Set((trips || []).map((trip) => String(trip.id))))
    .filter((tripId) => !tripDocumentsCache.has(String(tripId)) && !tripDocumentsLoading.has(String(tripId)));
  if (!uniqueTripIds.length) return;
  Promise.all(uniqueTripIds.map((tripId) => fetchTripDocuments(tripId)))
    .then(() => applyFilters())
    .catch((error) => {
      console.error('Failed to hydrate trip documents', error);
    });
}

function renderTripsMobileList(trips) {
  if (!tripsMobileList) return;
  tripsMobileList.innerHTML = trips.map((trip) => {
    const inTime = parseTripDate(trip.in_time);
    const statusTime = parseTripDate(trip.last_status_update_time || trip.in_time);
    const totalTime = calculateElapsedMinutes(inTime);
    const stageTime = calculateElapsedMinutes(statusTime);
    const delayClass = getDelayClass(totalTime);
    return `
      <article class="mobile-trip-card ${delayClass}" data-trip-row="${trip.id}">
        <div class="mobile-trip-head">
          <button class="truck-link-btn mobile" data-action="view-timeline" data-trip-id="${trip.id}" type="button">
            ${escapeHtml(trip.truck_number || '-')}
          </button>
          <div>${getStatusWithReasonDetails(trip)}</div>
        </div>
        <div class="mobile-trip-grid">
          <div><strong>Trp No.:</strong> ${trip.id}</div>
          <div><strong>Customer:</strong> ${escapeHtml(trip.customer_name || '-')}</div>
          ${renderMobileRoleNames(trip)}
          <div><strong>In Time:</strong> ${formatDateTime(trip.in_time)}</div>
        </div>
        <div class="mobile-trip-actions">
          ${getWorkflowActions(trip)}
        </div>
      </article>
    `;
  }).join('');
}

function applyFilters() {
  const searchTerm = String(document.getElementById('truck-search').value || '').toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;

  let filteredTrips = getVisibleTripsForRole(allTrips);

  if (searchTerm) {
    filteredTrips = filteredTrips.filter((trip) =>
      (trip.truck_number || '').toLowerCase().includes(searchTerm)
    );
  }

  if (statusFilter) {
    filteredTrips = filteredTrips.filter((trip) => normalizeStatus(trip.status) === statusFilter);
  }

  renderTripsTable(filteredTrips);
}

async function loadTrips() {
  try {
    const response = await fetch('/trips');
    allTrips = await response.json();
    refreshTransporterOptions();
    refreshLocationOptionsFromTrips();
    applyFilters();
  } catch (error) {
    console.error('Failed to load trips:', error);
    showMessage('Failed to load trips', false);
  }
}

function updateTimeMetrics() {
  if (isInputEditingActive()) return;
  const totalTimeElements = document.querySelectorAll('[data-time-scope="main"][data-time-kind="total"]');
  totalTimeElements.forEach((element) => {
    const tripId = element.dataset.tripId;
    const trip = allTrips.find((t) => String(t.id) === String(tripId));
    if (!trip) return;
    const inTime = parseTripDate(trip.in_time);
    const statusTime = parseTripDate(trip.last_status_update_time || trip.in_time);
    const totalTime = calculateElapsedMinutes(inTime);
    const stageTime = calculateElapsedMinutes(statusTime);
    element.textContent = formatMinutes(totalTime);
    document.querySelectorAll(`[data-time-scope="main"][data-time-kind="stage"][data-trip-id="${trip.id}"]`)
      .forEach((stageEl) => {
        stageEl.textContent = formatMinutes(stageTime);
      });
    const delayClass = getDelayClass(totalTime);
    document.querySelectorAll(`[data-trip-row="${trip.id}"]`).forEach((rowEl) => {
      rowEl.classList.remove('truck-delayed-warning', 'truck-delayed-critical');
      if (delayClass) rowEl.classList.add(delayClass);
    });
  });
}

function refreshStatusFilterOptions() {
  const statusFilter = document.getElementById('status-filter');
  const role = getCurrentRole();
  const statuses = role === 'Gate'
    ? STATUS_FLOW.filter((status) => !['CANCELLED', 'EXITED'].includes(status))
    : STATUS_FLOW;

  statusFilter.innerHTML = [
    '<option value="">All Statuses</option>',
    ...statuses.map((status) => `<option value="${status}">${status}</option>`)
  ].join('');
}

async function handleStatusTargetClick(button) {
  const tripId = button.dataset.tripId;
  const targetStatus = button.dataset.targetStatus;
  const trip = getTripById(tripId);
  if (!trip) return;
  const extraFields = {};

  if (targetStatus === 'WAITING') {
    const currentStatus = normalizeStatus(trip.status);
    const role = getCurrentRole();
    const isLoadingStageWait = currentStatus === 'READY_FOR_LOADING' && (role === 'Loading' || role === 'Admin');
    const reasonPrompt = isLoadingStageWait
      ? 'Enter waiting reason (e.g. loading point busy):'
      : 'Enter waiting reason:';
    const reason = window.prompt(reasonPrompt, isLoadingStageWait ? 'Loading point busy' : '');
    if (!reason || !reason.trim()) {
      showMessage('Waiting reason is mandatory', false);
      return;
    }
    const dispatchDetails = getMergedDispatchDetails(tripId);
    const waitingPayload = {
      waiting_reason: reason.trim(),
      location: dispatchDetails.location || null
    };
    if (isLoadingStageWait) {
      const loadingName = getPersonValueFromRow(tripId, 'Loading', trip.loading_person_name || '');
      if (!loadingName) {
        showMessage('Select loading manager name', false);
        return;
      }
      waitingPayload.loading_person_name = loadingName;
      waitingPayload.loading_done_by = loadingName;
    } else {
      const dispatchName = getPersonValueFromRow(tripId, 'Dispatch', trip.dispatch_manager_name || '');
      if (!dispatchName) {
        showMessage('Select dispatch manager name', false);
        return;
      }
      waitingPayload.dispatch_manager_name = dispatchName;
      waitingPayload.dispatch_done_by = dispatchName;
    }
    await applyStatusChange(tripId, 'WAITING', waitingPayload, button);
    return;
  }

  if (targetStatus === 'LOADING_IN_PROGRESS') {
    const draft = getLoadingDraft(tripId);
    const loadingPersonName = getPersonValueFromRow(tripId, 'Loading', draft.loading_person_name || trip.loading_person_name || '');
    if (!loadingPersonName) {
      showMessage('Select loading manager name', false);
      return;
    }
    const dispatchDetails = getMergedDispatchDetails(tripId);
    const loadingStartError = getLoadingStartValidationError(dispatchDetails);
    if (loadingStartError) {
      showMessage(loadingStartError, false);
      return;
    }
    const loadingPayload = {
      labour_team: dispatchDetails.labour_team,
      loading_person_name: loadingPersonName,
      loading_done_by: loadingPersonName,
      waiting_reason: trip.waiting_reason || null
    };
    const parsedExpectedWeight = Number.parseFloat(dispatchDetails.expected_weight);
    if (Number.isFinite(parsedExpectedWeight) && parsedExpectedWeight > 0) {
      loadingPayload.expected_weight = parsedExpectedWeight;
    }
    await applyStatusChange(tripId, 'LOADING_IN_PROGRESS', loadingPayload, button);
    clearLoadingDraft(tripId);
    return;
  }

  if (targetStatus === 'READY_FOR_LOADING') {
    const dispatchName = getPersonValueFromRow(tripId, 'Dispatch', trip.dispatch_manager_name || '');
    if (!dispatchName) {
      showMessage('Select dispatch manager name', false);
      return;
    }
    const dispatchDetails = getMergedDispatchDetails(tripId);
    const readyError = getReadyForLoadingValidationError(dispatchDetails);
    if (readyError) {
      showMessage(readyError, false);
      return;
    }
    extraFields.dispatch_manager_name = dispatchName;
    extraFields.dispatch_done_by = dispatchName;
    extraFields.material_type = dispatchDetails.material_type;
    extraFields.grade = dispatchDetails.grade;
    extraFields.condition = dispatchDetails.condition;
    extraFields.packing = dispatchDetails.packing;
    extraFields.location = dispatchDetails.location;
    extraFields.loading_point = dispatchDetails.loading_point;
    const parsedExpectedWeight = Number.parseFloat(dispatchDetails.expected_weight);
    if (!Number.isFinite(parsedExpectedWeight) || parsedExpectedWeight <= 0) {
      showMessage('Expected weight (MT) is required before moving to ready for loading', false);
      return;
    }
    extraFields.expected_weight = parsedExpectedWeight;
    extraFields.eta = dispatchDetails.eta;
  }

  if (targetStatus === 'LOADING_COMPLETED') {
    const loadingName = getPersonValueFromRow(tripId, 'Loading', trip.loading_person_name || '');
    if (!loadingName) {
      showMessage('Select loading manager name', false);
      return;
    }
    extraFields.loading_person_name = loadingName;
    extraFields.loading_done_by = loadingName;
  }

  if (targetStatus === 'BILLING_COMPLETED' || targetStatus === 'COMPLETED') {
    const accountsName = getPersonValueFromRow(tripId, 'Accounts', trip.accounts_person_name || '');
    if (!accountsName) {
      showMessage('Select accounts manager name', false);
      return;
    }
    const draft = getBillingDraft(tripId);
    const rateValue = toNumOrNull(draft.rate_used_per_mt ?? trip.rate_used_per_mt);
    const gstValue = toNumOrNull(draft.gst_percent_used ?? trip.gst_percent_used);
    const netWeight = toNumOrNull(trip.net_weight_snapshot_mt ?? trip.net_weight) ?? 0;
    const amounts = computeBillingAmounts(netWeight, rateValue, gstValue);
    extraFields.accounts_person_name = accountsName;
    extraFields.billing_done_by = accountsName;
    extraFields.rate_used_per_mt = amounts.safeRate;
    extraFields.gst_percent_used = amounts.safeGst;
    extraFields.taxable_amount = amounts.taxable;
    extraFields.gst_amount = amounts.gstAmount;
    extraFields.total_amount = amounts.total;
    extraFields.net_weight_snapshot_mt = round3(netWeight) || 0;
    extraFields.billing_calculated_at = new Date().toISOString();
    extraFields.billing_calculated_by = accountsName;
  }

  await applyStatusChange(tripId, targetStatus, extraFields, button);
}

function handleDispatchInputChange(selectEl) {
  const tripId = selectEl.dataset.tripId;
  const field = selectEl.dataset.dispatchField;
  if (!field || field === 'eta') return;

  const otherInput = document.querySelector(`[data-trip-id="${tripId}"][data-dispatch-other="${field}"]`);
  if (!otherInput) return;

  if (selectEl.value === 'Other') {
    otherInput.style.display = 'block';
    updateLoadingButtonState(tripId);
    return;
  }
  otherInput.style.display = 'none';
  otherInput.value = '';
  updateLoadingButtonState(tripId);
}

function persistDispatchDraft(inputEl) {
  const tripId = inputEl.dataset.tripId;
  if (!tripId) return;

  const field = inputEl.dataset.dispatchField;
  if (field) {
    if (field === 'eta') {
      setLoadingDraftField(tripId, 'eta', localInputToIstIso(inputEl.value.trim()));
      return;
    }
    if (inputEl.tagName === 'SELECT') {
      if (inputEl.value === 'Other') {
        const otherInput = document.querySelector(`[data-trip-id="${tripId}"][data-dispatch-other="${field}"]`);
        setLoadingDraftField(tripId, field, otherInput ? otherInput.value.trim() : '');
      } else {
        setLoadingDraftField(tripId, field, inputEl.value.trim());
      }
      return;
    }
    setLoadingDraftField(tripId, field, inputEl.value.trim());
    return;
  }

  const otherField = inputEl.dataset.dispatchOther;
  if (!otherField) return;
  const select = document.querySelector(`[data-trip-id="${tripId}"][data-dispatch-field="${otherField}"]`);
  if (select && select.value === 'Other') {
    setLoadingDraftField(tripId, otherField, inputEl.value.trim());
  }
}

function updateBillingPreview(tripId) {
  const trip = getTripById(tripId);
  if (!trip) return;
  const draft = getBillingDraft(tripId);
  const rateInput = document.querySelector(`[data-trip-id="${tripId}"][data-billing-field="rate_used_per_mt"]`);
  const gstInput = document.querySelector(`[data-trip-id="${tripId}"][data-billing-field="gst_percent_used"]`);
  const taxablePreview = document.querySelector(`[data-trip-id="${tripId}"][data-billing-field="taxable_amount_preview"]`);
  const gstPreview = document.querySelector(`[data-trip-id="${tripId}"][data-billing-field="gst_amount_preview"]`);
  const totalPreview = document.querySelector(`[data-trip-id="${tripId}"][data-billing-field="total_amount_preview"]`);
  if (!rateInput || !gstInput || !taxablePreview || !gstPreview || !totalPreview) return;

  const rateValue = draft.rate_used_per_mt ?? rateInput.value;
  const gstValue = draft.gst_percent_used ?? gstInput.value;
  const netWeight = toNumOrNull(trip.net_weight_snapshot_mt ?? trip.net_weight) ?? 0;
  const amounts = computeBillingAmounts(netWeight, rateValue, gstValue);
  taxablePreview.value = String(amounts.taxable.toFixed(2));
  gstPreview.value = String(amounts.gstAmount.toFixed(2));
  totalPreview.value = String(amounts.total.toFixed(2));
}

function persistBillingDraft(inputEl) {
  const tripId = inputEl.dataset.tripId;
  const field = inputEl.dataset.billingField;
  if (!tripId || !field || !['rate_used_per_mt', 'gst_percent_used'].includes(field)) return;
  setBillingDraftField(tripId, field, inputEl.value.trim());
  updateBillingPreview(tripId);
}

function updateLoadingButtonState(tripId) {
  const button = document.querySelector(
    `[data-action="status-change"][data-target-status="LOADING_IN_PROGRESS"][data-trip-id="${tripId}"]`
  );
  if (!button) return;

  const details = getMergedDispatchDetails(tripId);
  const trip = getTripById(tripId);
  const draft = getLoadingDraft(tripId);
  const loadingPerson = getPersonValueFromRow(tripId, 'Loading', draft.loading_person_name || trip?.loading_person_name || '');
  const loadingTeam = (details.labour_team || '').trim();
  const tare = Number(trip?.tare_weight);
  const hasTare = Number.isFinite(tare) && tare > 0;
  button.disabled = !hasTare || !loadingPerson || !loadingTeam;
}

function bindRowActionHandlers(root = document) {
  root.querySelectorAll('[data-action="view-timeline"]').forEach((button) => {
    button.addEventListener('click', () => openTimelineModal(button.dataset.tripId));
  });

  root.querySelectorAll('[data-action="admin-view-fields"], [data-action="admin-view-actions"], [data-action="admin-view-tools"]').forEach((button) => {
    button.addEventListener('click', () => openAdminWorkflowModal(button.dataset.tripId, button.dataset.adminSection));
  });

  root.querySelectorAll('[data-action="status-change"]').forEach((button) => {
    button.addEventListener('click', () => handleStatusTargetClick(button));
  });

  root.querySelectorAll('[data-action="cancel"]').forEach((button) => {
    button.addEventListener('click', () => cancelTrip(button.dataset.tripId, button));
  });

  root.querySelectorAll('[data-action="save-tare"]').forEach((button) => {
    button.addEventListener('click', () => saveTareWeight(button.dataset.tripId, button));
  });

  root.querySelectorAll('[data-action="mark-tare-done"]').forEach((button) => {
    button.addEventListener('click', () => markTareDone(button.dataset.tripId, button));
  });

  root.querySelectorAll('[data-action="save-gross"]').forEach((button) => {
    button.addEventListener('click', () => saveGrossWeight(button.dataset.tripId, button));
  });

  root.querySelectorAll('[data-action="send-load-fix"]').forEach((button) => {
    button.addEventListener('click', () => sendForLoadFix(button.dataset.tripId, button));
  });

  root.querySelectorAll('[data-action="mark-gross-done"]').forEach((button) => {
    button.addEventListener('click', () => markGrossDone(button.dataset.tripId, button));
  });

  root.querySelectorAll('.dispatch-input[data-dispatch-field]').forEach((input) => {
    input.addEventListener('change', () => handleDispatchInputChange(input));
    input.addEventListener('change', () => persistDispatchDraft(input));
    input.addEventListener('input', () => {
      persistDispatchDraft(input);
      updateLoadingButtonState(input.dataset.tripId);
    });
  });

  root.querySelectorAll('.dispatch-other-input').forEach((input) => {
    input.addEventListener('input', () => {
      persistDispatchDraft(input);
      updateLoadingButtonState(input.dataset.tripId);
    });
  });

  root.querySelectorAll('.dispatch-input[data-billing-field]').forEach((input) => {
    input.addEventListener('input', () => persistBillingDraft(input));
    input.addEventListener('change', () => persistBillingDraft(input));
  });

  root.querySelectorAll('.weight-input[data-weight-field="tare_weight"], .weight-input[data-weight-field="gross_weight"]').forEach((input) => {
    const tripId = input.dataset.tripId;
    if (!tripId) return;
    const syncPreview = () => updateGrossNetPreview(tripId);
    input.addEventListener('input', syncPreview);
    input.addEventListener('change', syncPreview);
  });

  root.querySelectorAll('.person-input[data-person-role]').forEach((selectEl) => {
    selectEl.addEventListener('change', () => {
      const tripId = selectEl.dataset.tripId;
      const roleName = selectEl.dataset.personRole;
      const otherInput = document.querySelector(`[data-trip-id="${tripId}"][data-person-other-role="${roleName}"]`);
      if (!otherInput) return;
      if (selectEl.value === 'Other') {
        otherInput.style.display = 'block';
      } else {
        otherInput.style.display = 'none';
        otherInput.value = '';
      }
      if (roleName === 'Loading') {
        setLoadingDraftField(tripId, 'loading_person_name', getPersonValueFromRow(tripId, 'Loading', ''));
        updateLoadingButtonState(tripId);
      }
    });
  });

  root.querySelectorAll('.person-other-input').forEach((input) => {
    input.addEventListener('input', () => {
      const roleName = input.dataset.personOtherRole;
      if (roleName === 'Loading') {
        setLoadingDraftField(input.dataset.tripId, 'loading_person_name', getPersonValueFromRow(input.dataset.tripId, 'Loading', ''));
        updateLoadingButtonState(input.dataset.tripId);
      }
    });
  });

  root.querySelectorAll('[data-admin-select-field]').forEach((selectEl) => {
    selectEl.addEventListener('change', () => {
      const tripId = selectEl.dataset.tripId;
      const field = selectEl.dataset.adminSelectField;
      const otherInput = document.querySelector(`[data-trip-id="${tripId}"][data-admin-other="${field}"]`);
      if (!otherInput) return;
      if (selectEl.value === 'Other') {
        otherInput.style.display = 'block';
      } else {
        otherInput.style.display = 'none';
        otherInput.value = '';
      }
    });
  });

  root.querySelectorAll('[data-action="admin-save"]').forEach((button) => {
    button.addEventListener('click', () => saveAdminManualData(button.dataset.tripId, button));
  });

  root.querySelectorAll('[data-action="admin-delete-trip"]').forEach((button) => {
    button.addEventListener('click', () => deleteAdminTrip(button.dataset.tripId, button));
  });

  root.querySelectorAll('[data-action="upload-doc"]').forEach((button) => {
    button.addEventListener('click', () => uploadTripDocument(button.dataset.tripId, button));
  });

  root.querySelectorAll('[data-action="delete-doc"]').forEach((button) => {
    button.addEventListener('click', () => deleteTripDocument(button.dataset.tripId, button.dataset.docId, button));
  });

  root.querySelectorAll('[data-action="download-doc"]').forEach((button) => {
    button.addEventListener('click', () => downloadTripDocument(button.dataset.docId, button.dataset.docName || 'document'));
  });
}

function wireRowEvents() {
  bindRowActionHandlers(document);
}

function valuesEquivalentForAdmin(field, newValue, oldValue) {
  if (field === 'eta') {
    const a = newValue ? new Date(newValue).getTime() : null;
    const b = oldValue ? new Date(oldValue).getTime() : null;
    return a === b;
  }
  if (['expected_weight', 'tare_weight', 'gross_weight', 'net_weight'].includes(field)) {
    const a = newValue === null ? null : Number(newValue);
    const b = oldValue === null || oldValue === undefined || oldValue === '' ? null : Number(oldValue);
    return (a === null && b === null) || (Number.isFinite(a) && Number.isFinite(b) && a === b);
  }
  return String(newValue ?? '') === String(oldValue ?? '');
}

function readAdminFieldValue(fieldKey, inputValue) {
  if (ADMIN_DROPDOWN_FIELDS.has(fieldKey)) {
    if (!inputValue || !inputValue.trim()) return null;
    if (inputValue === 'Other') return null;
    return inputValue.trim();
  }
  if (fieldKey === 'eta') {
    return inputValue ? localInputToIstIso(inputValue) : null;
  }
  if (['expected_weight', 'tare_weight', 'gross_weight'].includes(fieldKey)) {
    if (inputValue === '') return null;
    const parsed = Number.parseFloat(inputValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return inputValue.trim() === '' ? null : inputValue.trim();
}

async function saveAdminManualData(tripId, sourceButton = null) {
  if (!hasRoleAccess(['Admin'])) {
    showMessage('Only Admin can edit manual data', false);
    return;
  }
  const trip = getTripById(tripId);
  if (!trip) {
    showMessage('Trip not found', false);
    return;
  }

  const payload = {};
  ADMIN_EDITABLE_FIELDS.forEach((field) => {
    const input = document.querySelector(`[data-trip-id="${tripId}"][data-admin-field="${field.key}"]`);
    if (!input) return;
    let nextValue = readAdminFieldValue(field.key, input.value);
    if (ADMIN_DROPDOWN_FIELDS.has(field.key) && input.value === 'Other') {
      const otherInput = document.querySelector(`[data-trip-id="${tripId}"][data-admin-other="${field.key}"]`);
      nextValue = otherInput && otherInput.value.trim() ? otherInput.value.trim() : null;
    }
    if (!valuesEquivalentForAdmin(field.key, nextValue, trip[field.key])) {
      payload[field.key] = nextValue;
    }
  });

  if (!Object.keys(payload).length) {
    showMessage('No manual changes detected');
    return;
  }

  try {
    setButtonBusy(sourceButton, true, 'Saving...');
    await putTrip(tripId, payload);
    showMessage('Manual data updated successfully');
    await loadTrips();
  } catch (error) {
    showMessage(error.message, false);
    console.error(error);
  } finally {
    setButtonBusy(sourceButton, false);
  }
}

async function deleteAdminTrip(tripId, sourceButton = null) {
  if (!hasRoleAccess(['Admin'])) {
    showMessage('Only Admin can delete trips', false);
    return;
  }
  const trip = getTripById(tripId);
  if (!trip) {
    showMessage('Trip not found', false);
    return;
  }
  const confirmed = window.confirm(`Delete trip ${trip.truck_number || trip.id} permanently?`);
  if (!confirmed) return;

  try {
    setButtonBusy(sourceButton, true, 'Deleting...');
    const response = await fetch(`/trip/${tripId}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders()
      }
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to delete trip');
    }
    tripDocumentsCache.delete(String(tripId));
    loadingDetailsDrafts.delete(String(tripId));
    showMessage('Trip deleted');
    await loadTrips();
  } catch (error) {
    showMessage(error.message, false);
    console.error(error);
  } finally {
    setButtonBusy(sourceButton, false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-action="close-timeline"]')?.addEventListener('click', closeTimelineModal);
  document.querySelector('[data-action="close-admin-workflow"]')?.addEventListener('click', closeAdminWorkflowModal);
  document.querySelector('[data-action="close-tasks"]')?.addEventListener('click', closeTasksModal);
  document.querySelector('[data-action="close-task-detail"]')?.addEventListener('click', closeTaskDetailModal);
  timelineModal?.addEventListener('click', (event) => {
    if (event.target === timelineModal) {
      closeTimelineModal();
    }
  });
  adminWorkflowModal?.addEventListener('click', (event) => {
    if (event.target === adminWorkflowModal) {
      closeAdminWorkflowModal();
    }
  });
  tasksModal?.addEventListener('click', (event) => {
    if (event.target === tasksModal) {
      closeTasksModal();
    }
  });
  taskDetailModal?.addEventListener('click', (event) => {
    if (event.target === taskDetailModal) {
      closeTaskDetailModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    hasUserInteractedForSound = true;
    if (event.key === 'Escape') {
      closeTimelineModal();
      closeAdminWorkflowModal();
      closeTaskDetailModal();
      closeTasksModal();
    }
  });

  document.querySelectorAll('.role-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      showPINEntry(btn.getAttribute('data-role'));
    });
  });
  document.getElementById('show-legacy-login-btn')?.addEventListener('click', () => {
    const legacyWrap = document.getElementById('legacy-role-buttons');
    const toggleBtn = document.getElementById('show-legacy-login-btn');
    if (!legacyWrap || !toggleBtn) return;
    const isHidden = legacyWrap.style.display === 'none';
    legacyWrap.style.display = isHidden ? 'grid' : 'none';
    toggleBtn.textContent = isHidden ? 'Hide Legacy PIN Login' : 'Use Legacy PIN Login';
  });

  document.getElementById('pin-submit-btn').addEventListener('click', () => {
    const pin = document.getElementById('pin-input').value;
    const selectedRole = window.currentSelectedRole;

    if (!pin || pin.length !== 4) {
      document.getElementById('pin-error-message').textContent = 'PIN must be 4 characters';
      document.getElementById('pin-error-message').style.display = 'block';
      return;
    }

    if (validatePIN(selectedRole, pin)) {
      localStorage.removeItem('employeeAuth');
      localStorage.removeItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
      userRole = selectedRole;
      localStorage.setItem('userRole', userRole);
      window.location.reload();
      return;
    }

    document.getElementById('pin-error-message').textContent = 'Invalid PIN';
    document.getElementById('pin-error-message').style.display = 'block';
    document.getElementById('pin-input').value = '';
    document.getElementById('pin-input').focus();
  });

  document.getElementById('pin-cancel-btn').addEventListener('click', () => {
    window.currentSelectedRole = null;
    showRoleSelection();
  });

  document.getElementById('pin-input').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      document.getElementById('pin-submit-btn').click();
    }
  });

  document.getElementById('logout-link').addEventListener('click', (event) => {
    event.preventDefault();
    logout();
  });
  document.getElementById('expense-link')?.addEventListener('click', openExpenseWithSso);
  document.getElementById('employee-login-btn')?.addEventListener('click', loginEmployee);
  document.getElementById('employee-login-password')?.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loginEmployee();
    }
  });
  document.getElementById('role-switcher')?.addEventListener('change', (event) => {
    const selectedRole = event.target.value;
    const employeeAuth = getEmployeeAuthSession();
    const roles = Array.isArray(employeeAuth?.roles) ? employeeAuth.roles : [];
    if (!selectedRole || !roles.includes(selectedRole)) return;
    localStorage.setItem('userRole', selectedRole);
    window.location.reload();
  });

  tasksLink?.addEventListener('click', async (event) => {
    event.preventDefault();
    await Promise.all([loadTasks(), loadTaskNotifications()]);
    openTasksModal();
  });

  taskNotificationsBtn?.addEventListener('click', async () => {
    await Promise.all([loadTasks(), loadTaskNotifications()]);
    openTasksModal();
  });

  createTaskBtn?.addEventListener('click', () => {
    const isOpen = createTaskPanel?.style.display === 'block';
    if (createTaskPanel) createTaskPanel.style.display = isOpen ? 'none' : 'block';
  });

  createTaskForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const role = getCurrentRole();
    if (role !== 'Admin') {
      showTasksMessage('Only Admin can create tasks', false);
      return;
    }
    const formData = new FormData(createTaskForm);
    const etaLocal = String(formData.get('eta') || '').trim();
    const payload = {
      title: String(formData.get('title') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      team: String(formData.get('team') || '').trim(),
      assignee_name: String(formData.get('assignee_name') || '').trim(),
      eta: etaLocal ? `${etaLocal}:00${IST_OFFSET}` : '',
      comment: String(formData.get('comment') || '').trim()
    };
    try {
      const response = await fetch('/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to create task');
      }
      showTasksMessage('Task created');
      createTaskForm.reset();
      if (createTaskPanel) createTaskPanel.style.display = 'none';
      await Promise.all([loadTasks(), loadTaskNotifications()]);
    } catch (error) {
      showTasksMessage(error.message, false);
    }
  });

  taskMarkAllReadBtn?.addEventListener('click', async () => {
    await markAllTaskNotificationsRead();
  });

  initializeRole();
  syncTripsTableHeader();
  refreshStatusFilterOptions();
  Promise.all([loadMasterDropdownOptions(), loadRoleBasedPersonDropdowns(), loadPricingDefaults(), loadCustomerOptions()]).finally(() => {
    renderCustomerOptions();
    renderGateOperatorOptions();
    refreshTransporterOptions();
    loadTrips();
  });
  loadTaskAssignees();
  loadTaskNotifications();
  autoOpenTasksFromQuery();
  loadExpenseUnreadCount();

  if (tasksNotificationPoll) clearInterval(tasksNotificationPoll);
  if (expenseNotificationPoll) clearInterval(expenseNotificationPoll);
  tasksNotificationPoll = setInterval(() => {
    const role = getCurrentRole();
    if (!role) return;
    loadTaskNotifications();
  }, 15000);
  expenseNotificationPoll = setInterval(() => {
    const role = getCurrentRole();
    if (!role) return;
    loadExpenseUnreadCount();
  }, 15000);

  setInterval(updateTimeMetrics, 5000);
  window.addEventListener('resize', () => {
    if (isInputEditingActive()) return;
    applyFilters();
  });

  document.getElementById('truck-search').addEventListener('input', applyFilters);
  document.getElementById('status-filter').addEventListener('change', applyFilters);

  customerSelect.addEventListener('change', () => {
    toggleOtherInput(customerSelect, customerOther);
  });
  transporterInput?.addEventListener('input', () => {
    renderTransporterSuggestions(transporterInput.value);
  });
  transporterInput?.addEventListener('focus', () => {
    renderTransporterSuggestions(transporterInput.value);
  });
  transporterInput?.addEventListener('blur', () => {
    window.setTimeout(() => hideTransporterSuggestions(), 120);
  });
  gatePersonSelect.addEventListener('change', () => {
    toggleOtherInput(gatePersonSelect, gatePersonOther);
  });
  transporterSuggestions?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-transporter-option]');
    if (!target || !transporterInput) return;
    transporterInput.value = target.getAttribute('data-transporter-option') || '';
    hideTransporterSuggestions();
    transporterInput.focus();
  });
  document.addEventListener('click', (event) => {
    hasUserInteractedForSound = true;
    if (!transporterInput || !transporterSuggestions) return;
    const clickedInsideInput = transporterInput.contains(event.target);
    const clickedInsideList = transporterSuggestions.contains(event.target);
    if (!clickedInsideInput && !clickedInsideList) {
      hideTransporterSuggestions();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!hasRoleAccess(['Gate'])) {
      showMessage('Only Gate can create trips', false);
      return;
    }

    const payload = getFormData();
    const submitBtn = document.getElementById('save-button');
    try {
      setButtonBusy(submitBtn, true, 'Submitting...');
      const response = await fetch('/trip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to create trip');
      }

      await response.json();
      const transporterName = normalizeTransporterName(payload.transporter);
      if (transporterName) {
        const merged = Array.from(new Set([
          ...getStoredTransporterOptions(),
          transporterName
        ]));
        setStoredTransporterOptions(merged);
        refreshTransporterOptions();
      }
      showMessage('Gate entry recorded and moved to SENT_FOR_TARE_WEIGHT');
      resetForm();
      await loadTrips();
    } catch (error) {
      showMessage(error.message, false);
      console.error(error);
    } finally {
      setButtonBusy(submitBtn, false);
    }
  });

  clearButton.addEventListener('click', () => {
    resetForm();
    showMessage('Form cleared');
  });
});
