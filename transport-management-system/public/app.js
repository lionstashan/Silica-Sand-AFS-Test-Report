let userRole = null;
let allTrips = [];
const loadingDetailsDrafts = new Map();

const IST_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET = '+05:30';
const VALID_ROLES = ['Gate', 'Dispatch', 'Loading', 'Weighbridge', 'Accounts', 'Admin'];
const BILLING_VISIBLE_STATUSES = ['BILLING_PENDING', 'BILLING_COMPLETED', 'COMPLETED', 'EXITED'];

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
  TARE_WEIGHT_DONE: 'AT_DISPATCH',
  LOADING_COMPLETED: 'GROSS_WEIGHT_PENDING',
  GROSS_WEIGHT_DONE: 'BILLING_PENDING',
  BILLING_COMPLETED: 'COMPLETED'
};

const ROLE_PINS = {
  Gate: '1111',
  Dispatch: '2222',
  Loading: '5555',
  Weighbridge: '3333',
  Accounts: '4444',
  Admin: '9999'
};

const ROLE_ALLOWED_TARGETS = {
  Gate: ['EXITED'],
  Dispatch: ['AT_DISPATCH', 'WAITING', 'READY_FOR_LOADING', 'CANCELLED'],
  Loading: ['LOADING_IN_PROGRESS', 'LOADING_COMPLETED'],
  Weighbridge: ['TARE_WEIGHT_DONE', 'LOAD_FIX_REQUIRED', 'GROSS_WEIGHT_DONE'],
  Accounts: ['BILLING_COMPLETED'],
  Admin: STATUS_FLOW
};

const DISPATCH_DROPDOWNS = {
  loading_point: ['Office Front', 'Warehouse', 'Old Dry Plant', 'Near Crusher Plant', 'Glass Plant', 'Other'],
  labour_team: ['Dinesh', 'Shambhu', 'Chandan', 'JCB', 'Loader', 'Tractor', 'Other'],
  material_type: ['Silica Sand', 'Ball Clay', 'Other'],
  grade: ['Glass Grade', 'Foundry Grade', '30-150', '30-80', '18-30', '16-30', '14-16', '12-16', '14-12', 'Ball Clay', 'Raw', 'Other'],
  condition: ['Dry', 'Wet', 'Other'],
  packing: ['Loose', 'Old', '3G', '4G', 'Other']
};
const PERSON_DROPDOWNS = {
  Gate: ['X', 'Y', 'Z', 'Other'],
  Dispatch: ['Jitendra Yadav', 'Other'],
  Loading: ['Rajesh Kumar', 'Jai Bhagwan', 'Other'],
  Weighbridge: ['Anil Sharma', 'Ajay', 'Other'],
  Accounts: ['Pooja', 'Neha', 'Kiran', 'Other']
};
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

const customerSelect = document.getElementById('customer-select');
const customerOther = document.getElementById('customer-other');
const transporterSelect = document.getElementById('transporter-select');
const transporterOther = document.getElementById('transporter-other');
const gatePersonSelect = document.getElementById('gate-person-select');
const gatePersonOther = document.getElementById('gate-person-other');

const MAIN_TABLE_COLUMNS = [
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

function hasRoleAccess(allowedRoles) {
  const role = getCurrentRole();
  return !!role && allowedRoles.includes(role);
}

function getAuthHeaders() {
  const role = getCurrentRole();
  const pin = role ? ROLE_PINS[role] : null;
  if (!role || !pin) return {};
  return {
    'x-user-role': role,
    'x-user-pin': pin
  };
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

function statusToLabel(status) {
  return String(status || '').replaceAll('_', ' ');
}

function statusDetailLabel(key) {
  const labels = {
    waiting_reason: 'Waiting',
    load_fix_reason: 'Load Fix',
    cancel_reason: 'Cancel',
    loading_point: 'Loading Point',
    labour_team: 'Team',
    material_type: 'Material',
    grade: 'Grade',
    condition: 'Condition',
    packing: 'Packing',
    eta: 'ETA',
    tare_weight: 'Tare',
    gross_weight: 'Gross',
    net_weight: 'Net',
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
  if (['tare_weight', 'gross_weight', 'net_weight'].includes(key)) return `${value} kg`;
  return String(value);
}

function renderStatusDetails(entry) {
  const details = entry?.details && typeof entry.details === 'object' ? entry.details : null;
  if (!details) return '';
  const detailEntries = Object.entries(details)
    .map(([key, value]) => {
      const formatted = formatStatusDetailValue(key, value);
      if (!formatted) return '';
      return `<span class="timeline-detail-chip"><strong>${escapeHtml(statusDetailLabel(key))}:</strong> ${escapeHtml(formatted)}</span>`;
    })
    .filter(Boolean);
  if (!detailEntries.length) return '';
  return `<div class="timeline-item-details">${detailEntries.join('')}</div>`;
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
    const status = statusToLabel(entry?.status || '');
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

function renderStatusTimeline(trip) {
  const history = parseStatusHistory(trip);
  if (!history.length) {
    return '<div class="mini-muted">No status history available</div>';
  }

  return history.map((entry) => {
    const current = !entry.exit_time;
    return `
      <article class="timeline-item ${current ? 'timeline-item-current' : ''}">
        <div class="timeline-item-status">${escapeHtml(statusToLabel(entry.status))}</div>
        <div class="timeline-item-times">
          <span>${formatTimeOnly(entry.entry_time)} → ${entry.exit_time ? formatTimeOnly(entry.exit_time) : 'Now'}</span>
          <span>${formatMinutes(getStatusDurationMinutes(entry))}</span>
        </div>
        ${renderStatusDetails(entry)}
      </article>
    `;
  }).join('');
}

function openTimelineModal(tripId) {
  const trip = getTripById(tripId);
  if (!trip || !timelineModal || !timelineModalBody || !timelineModalTitle) return;
  timelineModalTitle.textContent = `Status Timeline - ${trip.truck_number || 'Truck'}`;
  timelineModalBody.innerHTML = `
    <div class="timeline-meta">
      <div><strong>Current:</strong> ${escapeHtml(statusToLabel(trip.status || '-'))}</div>
      <div><strong>In Time:</strong> ${formatDateTime(trip.in_time)}</div>
      <div><strong>Transporter:</strong> ${escapeHtml(trip.transporter || '-')}</div>
      <div><strong>Driver:</strong> ${escapeHtml(trip.driver_name || '-')}</div>
      <div><strong>Driver Phone:</strong> ${escapeHtml(trip.driver_phone || '-')}</div>
      <div><strong>Gate Operator:</strong> ${escapeHtml(trip.gate_person_name || '-')}</div>
      <div><strong>Dispatch Manager:</strong> ${escapeHtml(trip.dispatch_manager_name || '-')}</div>
      <div><strong>Loading Manager:</strong> ${escapeHtml(trip.loading_person_name || '-')}</div>
      <div><strong>Weighbridge Operator:</strong> ${escapeHtml(trip.weight_operator_name || '-')}</div>
      <div><strong>Accounts Manager:</strong> ${escapeHtml(trip.accounts_person_name || '-')}</div>
      <div><strong>Dispatch Done By:</strong> ${escapeHtml(trip.dispatch_done_by || '-')}</div>
      <div><strong>Tare Done By:</strong> ${escapeHtml(trip.tare_done_by || '-')}</div>
      <div><strong>Gross Done By:</strong> ${escapeHtml(trip.gross_done_by || '-')}</div>
      <div><strong>Loading Done By:</strong> ${escapeHtml(trip.loading_done_by || '-')}</div>
      <div><strong>Billing Done By:</strong> ${escapeHtml(trip.billing_done_by || '-')}</div>
      <div><strong>Load Fix Reason:</strong> ${escapeHtml(trip.load_fix_reason || '-')}</div>
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
}

function showRoleSelection() {
  document.getElementById('role-modal').style.display = 'flex';
  document.getElementById('pin-modal').style.display = 'none';
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
  document.body.style.overflow = 'auto';
}

function applyRoleUI() {
  const role = getCurrentRole();
  const canCreate = hasRoleAccess(['Gate', 'Admin']);
  const gatePanel = form?.closest('.panel');
  const dashboardLink = document.querySelector('a[href="/dashboard"]');

  if (gatePanel && !canCreate) {
    gatePanel.style.display = 'none';
  }

  if (dashboardLink) {
    dashboardLink.style.display = role === 'Gate' ? 'none' : 'inline-block';
  }

  if (roleIndicator && role) {
    roleIndicator.style.display = 'inline-block';
    roleIndicator.textContent = `Role: ${role}`;
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
  userRole = null;
  window.location.reload();
}

function initializeRole() {
  const storedRole = getStoredRole();
  if (storedRole) {
    userRole = storedRole;
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
    : trip.status;
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
  if (role === 'Accounts') {
    return trips.filter((trip) => BILLING_VISIBLE_STATUSES.includes(trip.status));
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

function getFormData() {
  const formData = new FormData(form);

  let customerName = formData.get('customer_name_select') || '';
  if (customerName === 'other') {
    customerName = formData.get('customer_name') || '';
  }

  let transporter = formData.get('transporter_select') || '';
  if (transporter === 'other') {
    transporter = formData.get('transporter') || '';
  }

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
  toggleOtherInput(transporterSelect, transporterOther);
  toggleOtherInput(gatePersonSelect, gatePersonOther);
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
    loading_point: trip.loading_point,
    labour_team: trip.labour_team,
    eta: trip.eta,
    waiting_reason: trip.waiting_reason,
    load_fix_reason: trip.load_fix_reason,
    tare_weight: trip.tare_weight,
    gross_weight: trip.gross_weight,
    net_weight: trip.net_weight,
    gross_weight_attempts: trip.gross_weight_attempts,
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
    loading_point: resolveDropdown('loading_point'),
    labour_team: resolveDropdown('labour_team'),
    eta: localInputToIstIso(readValue('eta'))
  };
}

function getMergedDispatchDetails(tripId) {
  const trip = getTripById(tripId);
  const rowDetails = getDispatchDetailsFromRow(tripId);
  const draft = getLoadingDraft(tripId);
  return {
    material_type: rowDetails.material_type || draft.material_type || trip?.material_type || '',
    grade: rowDetails.grade || draft.grade || trip?.grade || '',
    condition: rowDetails.condition || draft.condition || trip?.condition || '',
    packing: rowDetails.packing || draft.packing || trip?.packing || '',
    loading_point: rowDetails.loading_point || draft.loading_point || trip?.loading_point || '',
    labour_team: rowDetails.labour_team || draft.labour_team || trip?.labour_team || '',
    eta: rowDetails.eta || draft.eta || trip?.eta || null
  };
}

function getReadyForLoadingValidationError(details) {
  if (!details.material_type) return 'Material type is required before moving to ready for loading';
  if (!details.grade) return 'Grade is required before moving to ready for loading';
  if (!details.condition) return 'Condition is required before moving to ready for loading';
  if (!details.packing) return 'Packing is required before moving to ready for loading';
  if (!details.loading_point) return 'Loading point is required before moving to ready for loading';
  if (!details.eta) return 'ETA is required before moving to ready for loading';
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
  const response = await fetch(`/trip/${tripId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const received = error.received ? ` | Received: ${JSON.stringify(error.received)}` : '';
    throw new Error((error.error || 'Trip update failed') + received);
  }

  return response.json();
}

async function applyStatusChange(tripId, requestedStatus, extraFields = {}) {
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
      loading_point: extraFields.loading_point || draft.loading_point || existingTrip.loading_point,
      eta: extraFields.eta || draft.eta || existingTrip.eta
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
  }
}

async function cancelTrip(tripId) {
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
    await putTrip(tripId, payload);
    showMessage('Trip cancelled');
    await loadTrips();
  } catch (error) {
    showMessage(error.message, false);
    console.error(error);
  }
}

function computeNetWeight(tare, gross) {
  if (!Number.isFinite(tare) || !Number.isFinite(gross)) return null;
  return Number((gross - tare).toFixed(2));
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

async function saveTareWeight(tripId) {
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
    await putTrip(tripId, payload);
    showMessage('Tare weight saved');
    await loadTrips();
  } catch (error) {
    showMessage(error.message, false);
    console.error(error);
  }
}

async function markTareDone(tripId) {
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

  await applyStatusChange(tripId, 'TARE_WEIGHT_DONE', extraFields);
}

async function saveGrossWeight(tripId) {
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
    await putTrip(tripId, payload);
    showMessage('Gross weight saved');
    await loadTrips();
  } catch (error) {
    showMessage(error.message, false);
    console.error(error);
  }
}

async function markGrossDone(tripId) {
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
  await applyStatusChange(tripId, 'GROSS_WEIGHT_DONE', extraFields);
}

async function sendForLoadFix(tripId) {
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
  });
}

function getWeightsView(trip) {
  return `
    <div class="weight-readonly">
      <span>Tare: ${trip.tare_weight ?? '-'}</span>
      <span>Gross: ${trip.gross_weight ?? '-'}</span>
      <span>Net: ${trip.net_weight ?? '-'}</span>
    </div>
  `;
}

function getDispatchDetailsView(trip) {
  const status = normalizeStatus(trip.status);
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
  const items = [];
  if (trip.material_type) items.push(`Material: ${escapeHtml(trip.material_type)}`);
  if (trip.grade) items.push(`Grade: ${escapeHtml(trip.grade)}`);
  if (trip.condition) items.push(`Condition: ${escapeHtml(trip.condition)}`);
  if (trip.packing) items.push(`Packing: ${escapeHtml(trip.packing)}`);
  if (trip.loading_point) items.push(`Loading: ${escapeHtml(trip.loading_point)}`);
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
  { key: 'eta', label: 'ETA', type: 'datetime-local' },
  { key: 'waiting_reason', label: 'Waiting Reason', type: 'text' },
  { key: 'load_fix_reason', label: 'Load Fix Reason', type: 'text' },
  { key: 'tare_weight', label: 'Tare', type: 'number' },
  { key: 'gross_weight', label: 'Gross', type: 'number' },
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
      <div class="mini-muted"><strong>Net Weight:</strong> ${trip.net_weight ? `${escapeHtml(String(trip.net_weight))} kg` : '-'}</div>
      <div class="admin-editor-grid">
        ${fieldsHtml}
      </div>
      <div class="workflow-row">
        <button class="workflow-btn primary" data-action="admin-save" data-trip-id="${trip.id}" type="button">
          Save Manual Data
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
  const loadingPointValue = draft.loading_point ?? trip.loading_point ?? '';
  return `
    <div class="dispatch-editor">
      <label>Material ${renderDispatchSelect('material_type', trip.id, materialValue)}</label>
      <label>Grade ${renderDispatchSelect('grade', trip.id, gradeValue)}</label>
      <label>Condition ${renderDispatchSelect('condition', trip.id, conditionValue)}</label>
      <label>Packing ${renderDispatchSelect('packing', trip.id, packingValue)}</label>
      <label>Loading Point ${renderDispatchSelect('loading_point', trip.id, loadingPointValue)}</label>
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

  return `
    <div class="dispatch-editor">
      <label>Loading Team ${renderDispatchSelect('labour_team', trip.id, loadingTeamValue)}</label>
      <label>Loading Manager ${renderPersonSelect('Loading', trip.id, loadingPersonValue)}</label>
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

function getWorkflowActions(trip) {
  const role = getCurrentRole();
  const status = normalizeStatus(trip.status);
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
        <label>Tare Weight
          <input type="number" step="0.01" data-trip-id="${trip.id}" data-weight-field="tare_weight" value="${trip.tare_weight ?? ''}" class="weight-input" />
        </label>
        <div class="workflow-row">
          <button class="workflow-btn" data-action="save-tare" data-trip-id="${trip.id}">Save Tare Weight</button>
          <button class="workflow-btn primary" data-action="mark-tare-done" data-trip-id="${trip.id}">Mark Tare Weight Done</button>
        </div>
      </div>
    `);
  }

  if ((role === 'Weighbridge' || role === 'Admin') && status === 'GROSS_WEIGHT_PENDING') {
    actionBlocks.push(`
      <div class="workflow-group">
        <label>Weighbridge Operator
          ${renderPersonSelect('Weighbridge', trip.id, trip.weight_operator_name || '')}
        </label>
        <label>Tare Weight
          <input type="number" step="0.01" data-trip-id="${trip.id}" data-weight-field="tare_weight" value="${trip.tare_weight ?? ''}" class="weight-input" />
        </label>
        <label>Gross Weight
          <input type="number" step="0.01" data-trip-id="${trip.id}" data-weight-field="gross_weight" value="${trip.gross_weight ?? ''}" class="weight-input" />
        </label>
        <div class="workflow-row">
          <button class="workflow-btn" data-action="save-gross" data-trip-id="${trip.id}">Save Gross Weight</button>
          <button class="workflow-btn danger" data-action="send-load-fix" data-trip-id="${trip.id}">Send For Load Fix</button>
          <button class="workflow-btn primary" data-action="mark-gross-done" data-trip-id="${trip.id}">Mark Gross Weight Done</button>
        </div>
      </div>
    `);
  }

  if (['AT_DISPATCH', 'WAITING'].includes(status)) {
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

  if (role === 'Admin') {
    actionBlocks.push(renderAdminManualEditor(trip));
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
    applyFilters();
  } catch (error) {
    console.error('Failed to load trips:', error);
    showMessage('Failed to load trips', false);
  }
}

function updateTimeMetrics() {
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
  const statuses = role === 'Accounts' ? BILLING_VISIBLE_STATUSES : STATUS_FLOW;

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
    const dispatchName = getPersonValueFromRow(tripId, 'Dispatch', trip.dispatch_manager_name || '');
    if (!dispatchName) {
      showMessage('Select dispatch manager name', false);
      return;
    }
    const reason = window.prompt('Enter waiting reason:');
    if (!reason || !reason.trim()) {
      showMessage('Waiting reason is mandatory', false);
      return;
    }
    await applyStatusChange(tripId, 'WAITING', {
      waiting_reason: reason.trim(),
      dispatch_manager_name: dispatchName,
      dispatch_done_by: dispatchName
    });
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
    await applyStatusChange(tripId, 'LOADING_IN_PROGRESS', {
      labour_team: dispatchDetails.labour_team,
      loading_person_name: loadingPersonName,
      loading_done_by: loadingPersonName,
      waiting_reason: trip.waiting_reason || null
    });
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
    extraFields.loading_point = dispatchDetails.loading_point;
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
    extraFields.accounts_person_name = accountsName;
    extraFields.billing_done_by = accountsName;
  }

  await applyStatusChange(tripId, targetStatus, extraFields);
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

function wireRowEvents() {
  document.querySelectorAll('[data-action="view-timeline"]').forEach((button) => {
    button.addEventListener('click', () => openTimelineModal(button.dataset.tripId));
  });

  document.querySelectorAll('[data-action="status-change"]').forEach((button) => {
    button.addEventListener('click', () => handleStatusTargetClick(button));
  });

  document.querySelectorAll('[data-action="cancel"]').forEach((button) => {
    button.addEventListener('click', () => cancelTrip(button.dataset.tripId));
  });

  document.querySelectorAll('[data-action="save-tare"]').forEach((button) => {
    button.addEventListener('click', () => saveTareWeight(button.dataset.tripId));
  });

  document.querySelectorAll('[data-action="mark-tare-done"]').forEach((button) => {
    button.addEventListener('click', () => markTareDone(button.dataset.tripId));
  });

  document.querySelectorAll('[data-action="save-gross"]').forEach((button) => {
    button.addEventListener('click', () => saveGrossWeight(button.dataset.tripId));
  });

  document.querySelectorAll('[data-action="send-load-fix"]').forEach((button) => {
    button.addEventListener('click', () => sendForLoadFix(button.dataset.tripId));
  });

  document.querySelectorAll('[data-action="mark-gross-done"]').forEach((button) => {
    button.addEventListener('click', () => markGrossDone(button.dataset.tripId));
  });

  document.querySelectorAll('.dispatch-input[data-dispatch-field]').forEach((input) => {
    input.addEventListener('change', () => handleDispatchInputChange(input));
    input.addEventListener('change', () => persistDispatchDraft(input));
    input.addEventListener('input', () => {
      persistDispatchDraft(input);
      updateLoadingButtonState(input.dataset.tripId);
    });
  });

  document.querySelectorAll('.dispatch-other-input').forEach((input) => {
    input.addEventListener('input', () => {
      persistDispatchDraft(input);
      updateLoadingButtonState(input.dataset.tripId);
    });
  });

  document.querySelectorAll('.person-input[data-person-role]').forEach((selectEl) => {
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

  document.querySelectorAll('.person-other-input').forEach((input) => {
    input.addEventListener('input', () => {
      const roleName = input.dataset.personOtherRole;
      if (roleName === 'Loading') {
        setLoadingDraftField(input.dataset.tripId, 'loading_person_name', getPersonValueFromRow(input.dataset.tripId, 'Loading', ''));
        updateLoadingButtonState(input.dataset.tripId);
      }
    });
  });

  document.querySelectorAll('[data-admin-select-field]').forEach((selectEl) => {
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

  document.querySelectorAll('[data-action="admin-save"]').forEach((button) => {
    button.addEventListener('click', () => saveAdminManualData(button.dataset.tripId));
  });
}

function valuesEquivalentForAdmin(field, newValue, oldValue) {
  if (field === 'eta') {
    const a = newValue ? new Date(newValue).getTime() : null;
    const b = oldValue ? new Date(oldValue).getTime() : null;
    return a === b;
  }
  if (['tare_weight', 'gross_weight', 'net_weight'].includes(field)) {
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
  if (['tare_weight', 'gross_weight'].includes(fieldKey)) {
    if (inputValue === '') return null;
    const parsed = Number.parseFloat(inputValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return inputValue.trim() === '' ? null : inputValue.trim();
}

async function saveAdminManualData(tripId) {
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
    await putTrip(tripId, payload);
    showMessage('Manual data updated successfully');
    await loadTrips();
  } catch (error) {
    showMessage(error.message, false);
    console.error(error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-action="close-timeline"]')?.addEventListener('click', closeTimelineModal);
  timelineModal?.addEventListener('click', (event) => {
    if (event.target === timelineModal) {
      closeTimelineModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeTimelineModal();
    }
  });

  document.querySelectorAll('.role-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      showPINEntry(btn.getAttribute('data-role'));
    });
  });

  document.getElementById('pin-submit-btn').addEventListener('click', () => {
    const pin = document.getElementById('pin-input').value;
    const selectedRole = window.currentSelectedRole;

    if (!pin || pin.length !== 4) {
      document.getElementById('pin-error-message').textContent = 'PIN must be 4 digits';
      document.getElementById('pin-error-message').style.display = 'block';
      return;
    }

    if (validatePIN(selectedRole, pin)) {
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

  initializeRole();
  syncTripsTableHeader();
  refreshStatusFilterOptions();
  loadTrips();

  setInterval(updateTimeMetrics, 5000);
  window.addEventListener('resize', applyFilters);

  document.getElementById('truck-search').addEventListener('input', applyFilters);
  document.getElementById('status-filter').addEventListener('change', applyFilters);

  customerSelect.addEventListener('change', () => {
    toggleOtherInput(customerSelect, customerOther);
  });
  transporterSelect.addEventListener('change', () => {
    toggleOtherInput(transporterSelect, transporterOther);
  });
  gatePersonSelect.addEventListener('change', () => {
    toggleOtherInput(gatePersonSelect, gatePersonOther);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!hasRoleAccess(['Gate', 'Admin'])) {
      showMessage('Only Gate/Admin can create trips', false);
      return;
    }

    const payload = getFormData();
    try {
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
      showMessage('Gate entry recorded and moved to SENT_FOR_TARE_WEIGHT');
      resetForm();
      await loadTrips();
    } catch (error) {
      showMessage(error.message, false);
      console.error(error);
    }
  });

  clearButton.addEventListener('click', () => {
    resetForm();
    showMessage('Form cleared');
  });
});
