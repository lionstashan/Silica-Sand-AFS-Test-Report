let userRole = null;
let allTrips = [];

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

const AUTO_STATUS_TRANSITIONS = {
  TARE_WEIGHT_DONE: 'AT_DISPATCH',
  LOADING_COMPLETED: 'GROSS_WEIGHT_PENDING',
  GROSS_WEIGHT_DONE: 'BILLING_PENDING'
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
  Weighbridge: ['TARE_WEIGHT_DONE', 'GROSS_WEIGHT_DONE'],
  Accounts: ['BILLING_COMPLETED', 'COMPLETED'],
  Admin: STATUS_FLOW
};

const DISPATCH_DROPDOWNS = {
  loading_point: ['L1', 'L2', 'L3', 'Other'],
  labour_team: ['T1', 'T2', 'T3', 'Other'],
  material_type: ['Silica A', 'Silica B', 'Other'],
  grade: ['Grade 1', 'Grade 2', 'Other']
};

const form = document.getElementById('trip-form');
const tripsTable = document.getElementById('trips-table');
const tripsMobileList = document.getElementById('trips-mobile-list');
const tripsHeaderRow = document.querySelector('.table-container table thead tr');
const messageEl = document.getElementById('message');
const clearButton = document.getElementById('clear-button');
const roleIndicator = document.getElementById('role-indicator');

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
  'Transporter',
  'Driver',
  'Driver Phone',
  'Gate Person',
  'Weights',
  'Time In',
  'Total Time',
  'Stage Time',
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

function getStatusWithReasonDetails(trip) {
  const statusLabel = trip.status === 'EXITED'
    ? (trip.final_status === 'CANCELLED' ? 'CANCELLED / EXITED' : 'COMPLETED / EXITED')
    : trip.status;
  const parts = [getStatusBadge(trip.status, statusLabel)];
  if (trip.waiting_reason) {
    parts.push(`<div class="reason-chip">Waiting: ${escapeHtml(trip.waiting_reason)}</div>`);
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
    material_type: trip.material_type,
    grade: trip.grade,
    loading_point: trip.loading_point,
    labour_team: trip.labour_team,
    eta: trip.eta,
    waiting_reason: trip.waiting_reason,
    tare_weight: trip.tare_weight,
    gross_weight: trip.gross_weight,
    net_weight: trip.net_weight,
    status: normalizeStatus(trip.status),
    final_status: trip.final_status,
    is_cancelled: trip.is_cancelled,
    cancel_reason: trip.cancel_reason,
    in_time: trip.in_time,
    out_time: trip.out_time,
    last_status_update_time: trip.last_status_update_time
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
    loading_point: resolveDropdown('loading_point'),
    labour_team: resolveDropdown('labour_team'),
    material_type: resolveDropdown('material_type'),
    grade: resolveDropdown('grade'),
    eta: localInputToIstIso(readValue('eta'))
  };
}

function getMergedDispatchDetails(tripId) {
  const trip = getTripById(tripId);
  const rowDetails = getDispatchDetailsFromRow(tripId);
  return {
    loading_point: rowDetails.loading_point || trip?.loading_point || '',
    labour_team: rowDetails.labour_team || trip?.labour_team || '',
    material_type: rowDetails.material_type || trip?.material_type || '',
    grade: rowDetails.grade || trip?.grade || '',
    eta: rowDetails.eta || trip?.eta || null
  };
}

function getDispatchValidationError(details) {
  if (!details.loading_point) return 'Loading point is required before starting loading';
  if (!details.labour_team) return 'Loading team is required before starting loading';
  if (!details.material_type) return 'Material type is required before starting loading';
  if (!details.grade) return 'Grade is required before starting loading';
  if (!details.eta) return 'ETA is required before starting loading';
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
    throw new Error(error.error || 'Trip update failed');
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
    showMessage(`Invalid transition: ${currentStatus} -> ${requestedStatus}`, false);
    return;
  }

  if (requestedStatus === 'LOADING_IN_PROGRESS') {
    const pendingDetails = {
      loading_point: extraFields.loading_point || existingTrip.loading_point,
      labour_team: extraFields.labour_team || existingTrip.labour_team,
      material_type: extraFields.material_type || existingTrip.material_type,
      grade: extraFields.grade || existingTrip.grade,
      eta: extraFields.eta || existingTrip.eta
    };
    const dispatchError = getDispatchValidationError(pendingDetails);
    if (dispatchError) {
      showMessage(dispatchError, false);
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

  const payload = {
    ...getBaseTripPayload(trip),
    tare_weight: tare
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

  const extraFields = {};
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
  const tare = Number(trip.tare_weight);

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

  const net = computeNetWeight(tare, gross);
  const payload = {
    ...getBaseTripPayload(trip),
    gross_weight: gross,
    net_weight: net
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
  const tare = Number(trip.tare_weight);

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

  const net = computeNetWeight(tare, gross);
  const extraFields = { gross_weight: gross, net_weight: net };
  await applyStatusChange(tripId, 'GROSS_WEIGHT_DONE', extraFields);
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
    'GROSS_WEIGHT_DONE',
    'BILLING_PENDING',
    'BILLING_COMPLETED',
    'COMPLETED',
    'EXITED'
  ]);
  const items = [];
  if (trip.loading_point) items.push(`Loading: ${escapeHtml(trip.loading_point)}`);
  if (trip.labour_team) items.push(`Team: ${escapeHtml(trip.labour_team)}`);
  if (trip.material_type) items.push(`Material: ${escapeHtml(trip.material_type)}`);
  if (trip.grade) items.push(`Grade: ${escapeHtml(trip.grade)}`);
  if (trip.eta) items.push(`ETA: ${formatDateTime(trip.eta)}`);
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

function getDispatchEditor(trip) {
  if (!hasRoleAccess(['Loading', 'Admin'])) {
    return getDispatchDetailsView(trip);
  }
  const etaValue = trip.eta ? new Date(trip.eta).toLocaleString('sv-SE', { timeZone: IST_TIMEZONE }).slice(0, 16) : '';

  return `
    <div class="dispatch-editor">
      <label>Loading Point ${renderDispatchSelect('loading_point', trip.id, trip.loading_point || '')}</label>
      <label>Loading Team ${renderDispatchSelect('labour_team', trip.id, trip.labour_team || '')}</label>
      <label>Material ${renderDispatchSelect('material_type', trip.id, trip.material_type || '')}</label>
      <label>Grade ${renderDispatchSelect('grade', trip.id, trip.grade || '')}</label>
      <label>ETA
        <input type="datetime-local" data-trip-id="${trip.id}" data-dispatch-field="eta" class="dispatch-input" value="${etaValue}" />
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
    if (target === 'EXITED') {
      return role === 'Gate';
    }
    return isRoleAllowedForStatus(role, target);
  });
  return filteredTargets;
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
        <label>Gross Weight
          <input type="number" step="0.01" data-trip-id="${trip.id}" data-weight-field="gross_weight" value="${trip.gross_weight ?? ''}" class="weight-input" />
        </label>
        <div class="workflow-row">
          <button class="workflow-btn" data-action="save-gross" data-trip-id="${trip.id}">Save Gross Weight</button>
          <button class="workflow-btn primary" data-action="mark-gross-done" data-trip-id="${trip.id}">Mark Gross Weight Done</button>
        </div>
      </div>
    `);
  }

  if (status === 'READY_FOR_LOADING' && hasRoleAccess(['Loading', 'Admin'])) {
    actionBlocks.push(getDispatchEditor(trip));
  }

  const allowedTargets = getAllowedManualTargets(trip);
  if (allowedTargets.length) {
    const buttons = allowedTargets.map((target) => {
      const label = target === 'EXITED' ? 'Mark Exit' : target.replaceAll('_', ' ');
      return `<button class="workflow-btn primary" data-action="status-change" data-target-status="${target}" data-trip-id="${trip.id}">${label}</button>`;
    }).join('');

    actionBlocks.push(`<div class="workflow-row">${buttons}</div>`);
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
          <td>${escapeHtml(trip.truck_number || '')}</td>
          <td>${getStatusWithReasonDetails(trip)}</td>
          <td>${escapeHtml(trip.customer_name || '')}</td>
          <td>${escapeHtml(trip.transporter || '')}</td>
          <td>${escapeHtml(trip.driver_name || '')}</td>
          <td>${escapeHtml(trip.driver_phone || '')}</td>
          <td>${escapeHtml(trip.gate_person_name || '')}</td>
          <td>${getWeightsView(trip)}</td>
          <td>${formatDateTime(trip.in_time)}</td>
          <td><span data-time-scope="main" data-time-kind="total" data-trip-id="${trip.id}">${formatMinutes(totalTime)}</span></td>
          <td><span data-time-scope="main" data-time-kind="stage" data-trip-id="${trip.id}">${formatMinutes(stageTime)}</span></td>
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
          <div class="mobile-trip-truck">${escapeHtml(trip.truck_number || '-')}</div>
          <div>${getStatusWithReasonDetails(trip)}</div>
        </div>
        <div class="mobile-trip-grid">
          <div><strong>Customer:</strong> ${escapeHtml(trip.customer_name || '-')}</div>
          <div><strong>Transporter:</strong> ${escapeHtml(trip.transporter || '-')}</div>
          <div><strong>Driver:</strong> ${escapeHtml(trip.driver_name || '-')}</div>
          <div><strong>Phone:</strong> ${escapeHtml(trip.driver_phone || '-')}</div>
          <div><strong>Gate:</strong> ${escapeHtml(trip.gate_person_name || '-')}</div>
          <div><strong>Weights:</strong> ${escapeHtml(`${trip.tare_weight ?? '-'} / ${trip.gross_weight ?? '-'} / ${trip.net_weight ?? '-'}`)}</div>
          <div><strong>Time In:</strong> ${formatDateTime(trip.in_time)}</div>
          <div><strong>Total:</strong> <span data-time-scope="main" data-time-kind="total" data-trip-id="${trip.id}">${formatMinutes(totalTime)}</span></div>
          <div><strong>Stage:</strong> <span data-time-scope="main" data-time-kind="stage" data-trip-id="${trip.id}">${formatMinutes(stageTime)}</span></div>
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

  if (targetStatus === 'WAITING') {
    const reason = window.prompt('Enter waiting reason:');
    if (!reason || !reason.trim()) {
      showMessage('Waiting reason is mandatory', false);
      return;
    }
    await applyStatusChange(tripId, 'WAITING', { waiting_reason: reason.trim() });
    return;
  }

  if (targetStatus === 'LOADING_IN_PROGRESS') {
    const dispatchDetails = getMergedDispatchDetails(tripId);
    const validationError = getDispatchValidationError(dispatchDetails);
    if (validationError) {
      showMessage(validationError, false);
      return;
    }
    await applyStatusChange(tripId, 'LOADING_IN_PROGRESS', {
      ...dispatchDetails,
      dispatch_manager_name: trip.dispatch_manager_name || 'Loading Team',
      waiting_reason: trip.waiting_reason || null
    });
    return;
  }

  await applyStatusChange(tripId, targetStatus);
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

function updateLoadingButtonState(tripId) {
  const button = document.querySelector(
    `[data-action="status-change"][data-target-status="LOADING_IN_PROGRESS"][data-trip-id="${tripId}"]`
  );
  if (!button) return;

  const details = getMergedDispatchDetails(tripId);
  const trip = getTripById(tripId);
  const dispatchError = getDispatchValidationError(details);
  const tare = Number(trip?.tare_weight);
  const hasTare = Number.isFinite(tare) && tare > 0;
  button.disabled = !!dispatchError || !hasTare;
}

function wireRowEvents() {
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

  document.querySelectorAll('[data-action="mark-gross-done"]').forEach((button) => {
    button.addEventListener('click', () => markGrossDone(button.dataset.tripId));
  });

  document.querySelectorAll('.dispatch-input[data-dispatch-field]').forEach((input) => {
    input.addEventListener('change', () => handleDispatchInputChange(input));
    input.addEventListener('input', () => updateLoadingButtonState(input.dataset.tripId));
  });

  document.querySelectorAll('.dispatch-other-input').forEach((input) => {
    input.addEventListener('input', () => updateLoadingButtonState(input.dataset.tripId));
  });
}

document.addEventListener('DOMContentLoaded', () => {
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
