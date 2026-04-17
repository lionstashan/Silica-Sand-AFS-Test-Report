// Role-based access control with PIN authentication
let userRole = null;
let refreshInterval;
const timelineModal = document.getElementById('timeline-modal');
const timelineModalTitle = document.getElementById('timeline-modal-title');
const timelineModalBody = document.getElementById('timeline-modal-body');
const IST_TIMEZONE = 'Asia/Kolkata';
const VALID_ROLES = ['Gate', 'Dispatch', 'Loading', 'Weighbridge', 'Accounts', 'Admin'];
const BILLING_VISIBLE_STATUSES = ['BILLING_PENDING', 'BILLING_COMPLETED', 'COMPLETED', 'EXITED'];
const DISPATCH_ZONE_STATUSES = [
  'AT_DISPATCH',
  'WAITING'
];
const LOADING_ZONE_STATUSES = [
  'READY_FOR_LOADING',
  'LOAD_FIX_REQUIRED',
  'LOADING_IN_PROGRESS',
  'LOADING_COMPLETED'
];
const WEIGHBRIDGE_ZONE_STATUSES = [
  'SENT_FOR_TARE_WEIGHT',
  'TARE_WEIGHT_DONE',
  'GROSS_WEIGHT_PENDING',
  'GROSS_WEIGHT_DONE'
];
const ACCOUNTS_ZONE_STATUSES = ['BILLING_PENDING', 'BILLING_COMPLETED'];
const STATUS_ASSIGNEE_RULES = [
  { statuses: ['AT_DISPATCH', 'WAITING', 'READY_FOR_LOADING'], roleLabel: 'Dispatch Manager', field: 'dispatch_done_by' },
  { statuses: ['SENT_FOR_TARE_WEIGHT', 'TARE_WEIGHT_DONE'], roleLabel: 'WB Operator (Tare)', field: 'tare_done_by' },
  { statuses: ['LOAD_FIX_REQUIRED', 'LOADING_IN_PROGRESS', 'LOADING_COMPLETED'], roleLabel: 'Loading Manager', field: 'loading_done_by' },
  { statuses: ['GROSS_WEIGHT_PENDING', 'GROSS_WEIGHT_DONE'], roleLabel: 'WB Operator (Gross)', field: 'gross_done_by' },
  { statuses: ['BILLING_PENDING', 'BILLING_COMPLETED', 'COMPLETED'], roleLabel: 'Accounts Manager', field: 'billing_done_by' }
];
const istDatePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

// Hardcoded PINs for each role
const rolePINs = {
  'Gate': '1111',
  'Weighbridge': '2222',
  'Dispatch': '3333',
  'Loading': '4444',
  'Accounts': '5555',
  'Admin': '9999'
};

function getStoredRole() {
  const storedRole = localStorage.getItem('userRole');
  return VALID_ROLES.includes(storedRole) ? storedRole : null;
}

function getCurrentRole() {
  const role = getStoredRole();
  if (!role) {
    userRole = null;
  } else {
    userRole = role;
  }
  return userRole;
}

// Initialize role from localStorage
function initializeRole() {
  const storedRole = getStoredRole();
  if (storedRole) {
    userRole = storedRole;
    if (userRole === 'Gate') {
      window.location.replace('/');
      return;
    }
    hideModals();
    showAppContent();
  } else {
    showRoleSelection();
  }
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

function showAppContent() {
  const panels = document.querySelectorAll('.panel');
  panels.forEach(panel => {
    panel.style.display = 'block';
  });
  document.getElementById('logout-link').style.display = 'inline-block';
  const roleIndicator = document.getElementById('role-indicator');
  if (roleIndicator && userRole) {
    roleIndicator.style.display = 'inline-block';
    roleIndicator.textContent = `Role: ${userRole}`;
  }
}

function validatePIN(role, pin) {
  return rolePINs[role] === pin;
}

function logout() {
  localStorage.removeItem('userRole');
  userRole = null;
  window.location.reload();
}

// Setup event listeners for role selection
document.addEventListener('DOMContentLoaded', () => {
  // Role selection buttons
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showPINEntry(btn.getAttribute('data-role'));
    });
  });

  // PIN submission
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
    } else {
      document.getElementById('pin-error-message').textContent = 'Invalid PIN';
      document.getElementById('pin-error-message').style.display = 'block';
      document.getElementById('pin-input').value = '';
      document.getElementById('pin-input').focus();
    }
  });

  // PIN cancel button
  document.getElementById('pin-cancel-btn').addEventListener('click', () => {
    window.currentSelectedRole = null;
    showRoleSelection();
  });

  // PIN input enter key
  document.getElementById('pin-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('pin-submit-btn').click();
    }
  });

  // Logout link
  document.getElementById('logout-link').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  // Initialize role on page load
  initializeRole();
});

function getStatusBadge(status, labelOverride = null) {
  const rawStatus = status || 'IN_GATE';
  const statusClass = rawStatus.toLowerCase().replace(/_/g, '-');
  const displayStatus = labelOverride || rawStatus;
  return `<span class="status-badge status-${statusClass}">${displayStatus}</span>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAssignedPersonByStatus(trip) {
  const match = STATUS_ASSIGNEE_RULES.find((rule) => rule.statuses.includes(trip?.status));
  if (!match) return { roleLabel: '-', name: '' };
  return { roleLabel: match.roleLabel, name: trip?.[match.field] || '' };
}

function getAssignedPersonCell(trip) {
  const assigned = getAssignedPersonByStatus(trip);
  if (!assigned.name) return `<div class="mini-muted">${escapeHtml(assigned.roleLabel)}: -</div>`;
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

function getStatusWithCancelReason(trip) {
  const exitedOutcome = getExitedOutcome(trip);
  const displayStatus = trip.status === 'EXITED'
    ? (exitedOutcome === 'CANCELLED' ? 'CANCELLED / EXITED' : 'COMPLETED / EXITED')
    : trip.status;
  const statusBadge = getStatusBadge(trip.status, displayStatus);
  const parts = [statusBadge];
  if (trip.status === 'WAITING' && trip.waiting_reason) {
    parts.push(`<div class="reason-chip">Waiting: ${escapeHtml(trip.waiting_reason)}</div>`);
  }
  if (trip.status === 'LOAD_FIX_REQUIRED' && trip.load_fix_reason) {
    parts.push(`<div class="reason-chip reason-chip-error">Load Fix: ${escapeHtml(trip.load_fix_reason)}</div>`);
  }
  if ((trip.status === 'CANCELLED' || (trip.status === 'EXITED' && exitedOutcome === 'CANCELLED')) && trip.cancel_reason) {
    const fullReason = escapeHtml(trip.cancel_reason.trim());
    parts.push(`<div class="cancel-reason-text" title="${fullReason}">${fullReason}</div>`);
  }
  return `
    <div class="status-cell">
      ${parts.join('')}
    </div>
  `;
}

function createSummaryCard(title, count, colorClass) {
  return `
    <div class="summary-card ${colorClass}">
      <div class="card-number">${count}</div>
      <div class="card-title">${title}</div>
    </div>
  `;
}

function getIstDateParts(date) {
  const parts = istDatePartsFormatter.formatToParts(date);
  const mapped = {};
  parts.forEach((part) => {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      mapped[part.type] = part.value;
    }
  });
  return mapped;
}

function parseWeight(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatWeightMT(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string' && !value.trim()) return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${numeric.toFixed(3)} MT`;
}

function getTruckNumbers(trips) {
  const unique = new Set();
  trips.forEach((trip) => {
    const truck = (trip?.truck_number || '').trim();
    if (truck) unique.add(truck);
  });
  return Array.from(unique);
}

function updateSummaryCards(trips) {
  const visibleTrips = getCurrentRole() === 'Accounts'
    ? trips.filter((trip) => BILLING_VISIBLE_STATUSES.includes(trip.status))
    : trips;
  const nowIst = getIstDateParts(new Date());
  const inPlantTrips = visibleTrips.filter((trip) => trip.status !== 'EXITED');
  const completedToday = visibleTrips.filter((trip) => {
    if (!(trip.status === 'EXITED' && getExitedOutcome(trip) === 'COMPLETED')) return false;
    const completedDate = parseTripDate(trip.out_time || trip.in_time);
    if (!completedDate) return false;
    const completedIst = getIstDateParts(completedDate);
    return completedIst.year === nowIst.year && completedIst.month === nowIst.month && completedIst.day === nowIst.day;
  }).length;
  const completedMonth = visibleTrips.filter((trip) => {
    if (!(trip.status === 'EXITED' && getExitedOutcome(trip) === 'COMPLETED')) return false;
    const tripDate = parseTripDate(trip.in_time);
    if (!tripDate) return false;
    const tripIst = getIstDateParts(tripDate);
    return tripIst.year === nowIst.year && tripIst.month === nowIst.month;
  }).length;
  const quantityTodayMt = visibleTrips.reduce((total, trip) => {
    if (!(trip.status === 'EXITED' && getExitedOutcome(trip) === 'COMPLETED')) return total;
    const completedDate = parseTripDate(trip.out_time || trip.in_time);
    if (!completedDate) return total;
    const completedIst = getIstDateParts(completedDate);
    if (completedIst.year !== nowIst.year || completedIst.month !== nowIst.month || completedIst.day !== nowIst.day) return total;
    return total + parseWeight(trip.net_weight);
  }, 0);
  const completedYear = visibleTrips.filter((trip) => {
    if (!(trip.status === 'EXITED' && getExitedOutcome(trip) === 'COMPLETED')) return false;
    const tripDate = parseTripDate(trip.in_time);
    if (!tripDate) return false;
    const tripIst = getIstDateParts(tripDate);
    return tripIst.year === nowIst.year;
  }).length;
  const quantityMonthMt = visibleTrips.reduce((total, trip) => {
    if (!(trip.status === 'EXITED' && getExitedOutcome(trip) === 'COMPLETED')) return total;
    const tripDate = parseTripDate(trip.in_time);
    if (!tripDate) return total;
    const tripIst = getIstDateParts(tripDate);
    if (tripIst.year !== nowIst.year || tripIst.month !== nowIst.month) return total;
    return total + parseWeight(trip.net_weight);
  }, 0);
  const quantityYearMt = visibleTrips.reduce((total, trip) => {
    if (!(trip.status === 'EXITED' && getExitedOutcome(trip) === 'COMPLETED')) return total;
    const tripDate = parseTripDate(trip.in_time);
    if (!tripDate) return total;
    const tripIst = getIstDateParts(tripDate);
    if (tripIst.year !== nowIst.year) return total;
    return total + parseWeight(trip.net_weight);
  }, 0);
  const cancelledExited = visibleTrips.filter((trip) => (
    trip.status === 'EXITED' && getExitedOutcome(trip) === 'CANCELLED'
  )).length;

  const dispatchTrips = inPlantTrips.filter((trip) => DISPATCH_ZONE_STATUSES.includes(trip.status));
  const loadingTrips = inPlantTrips.filter((trip) => LOADING_ZONE_STATUSES.includes(trip.status));
  const weighbridgeTrips = inPlantTrips.filter((trip) => WEIGHBRIDGE_ZONE_STATUSES.includes(trip.status));
  const accountsTrips = inPlantTrips.filter((trip) => ACCOUNTS_ZONE_STATUSES.includes(trip.status));
  const dispatchCount = dispatchTrips.length;
  const loadingCount = loadingTrips.length;
  const weighbridgeCount = weighbridgeTrips.length;
  const accountsCount = accountsTrips.length;

  const over12HourTrips = inPlantTrips.filter((trip) => {
    const inTime = parseTripDate(trip.in_time);
    if (!inTime) return false;
    return calculateElapsedMinutes(inTime) > 720;
  });
  const over24HourTrips = inPlantTrips.filter((trip) => {
    const inTime = parseTripDate(trip.in_time);
    if (!inTime) return false;
    return calculateElapsedMinutes(inTime) > 1440;
  });
  const over12Hours = over12HourTrips.length;
  const over24Hours = over24HourTrips.length;

  const dispatchTruckNumbers = getTruckNumbers(dispatchTrips);
  const loadingTruckNumbers = getTruckNumbers(loadingTrips);
  const weighbridgeTruckNumbers = getTruckNumbers(weighbridgeTrips);
  const accountsTruckNumbers = getTruckNumbers(accountsTrips);
  const over12TruckNumbers = getTruckNumbers(over12HourTrips);
  const over24TruckNumbers = getTruckNumbers(over24HourTrips);

  const cardsHtml = `
    ${createSummaryCard('Completed (Today)', completedToday, 'card-green')}
    ${createSummaryCard('Completed (Month)', completedMonth, 'card-green', [], false)}
    ${createSummaryCard('Completed (Year)', completedYear, 'card-green', [], false)}
    ${createSummaryCard('Quantity (Today)', formatWeightMT(quantityTodayMt), 'card-light-blue')}
    ${createSummaryCard('Quantity (Month)', formatWeightMT(quantityMonthMt), 'card-light-blue', [], false)}
    ${createSummaryCard('Quantity (Year)', formatWeightMT(quantityYearMt), 'card-purple', [], false)}
    ${createSummaryCard('Cancelled (Exited)', cancelledExited, 'card-red', [], false)}
    ${createSummaryCard('In Plant', inPlantTrips.length, 'card-blue', [], false)}
    ${createSummaryCard('Dispatch', dispatchCount, 'card-light-blue', dispatchTruckNumbers)}
    ${createSummaryCard('Loading', loadingCount, 'card-blue', loadingTruckNumbers)}
    ${createSummaryCard('Weighbridge', weighbridgeCount, 'card-orange', weighbridgeTruckNumbers)}
    ${createSummaryCard('Accounts', accountsCount, 'card-purple', accountsTruckNumbers)}
    ${createSummaryCard('>12 Hours', over12Hours, 'card-yellow', over12TruckNumbers)}
    ${createSummaryCard('>24 Hours', over24Hours, 'card-red', over24TruckNumbers)}
  `;

  document.getElementById('summary-cards').innerHTML = cardsHtml;
}

let allTrips = []; // live dashboard data
let reportTrips = []; // finalized trips for reports
let filteredReportTrips = [];

function isCancelledTrip(trip) {
  if (!trip) return false;
  if (trip.status === 'EXITED') return getExitedOutcome(trip) === 'CANCELLED';
  return trip.status === 'CANCELLED';
}

function isCompletedTrip(trip) {
  if (!trip) return false;
  if (trip.status === 'EXITED') return getExitedOutcome(trip) === 'COMPLETED';
  return trip.status === 'COMPLETED';
}

function getExitedOutcome(trip) {
  if (!trip || trip.status !== 'EXITED') return null;
  if (trip.final_status === 'COMPLETED' || trip.final_status === 'CANCELLED') {
    return trip.final_status;
  }
  if (trip.is_cancelled) return 'CANCELLED';
  return 'COMPLETED';
}

function isFinalizedTrip(trip) {
  return isCompletedTrip(trip) || isCancelledTrip(trip) || trip?.status === 'EXITED';
}

function getIstDateKey(value) {
  const date = parseTripDate(value);
  if (!date) return '';
  const parts = getIstDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getDelayClass(totalMinutes) {
  if (totalMinutes === null) {
    return '';
  }
  if (totalMinutes > 1440) { // 24 hours
    return 'truck-delayed-critical';
  } else if (totalMinutes > 720) { // 12 hours
    return 'truck-delayed-warning';
  }
  return '';
}

function parseTripDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  if (!value) return '-';
  const rawDate = new Date(value);
  if (Number.isNaN(rawDate.getTime())) return '-';
  return rawDate.toLocaleString('en-IN', { timeZone: IST_TIMEZONE });
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

function getStatusDurationMinutes(entry) {
  const entryTime = parseTripDate(entry?.entry_time);
  if (!entryTime) return null;
  const exitTime = parseTripDate(entry?.exit_time) || new Date();
  const diffMs = exitTime.getTime() - entryTime.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60));
}

function statusToLabel(status) {
  return String(status || '').replaceAll('_', ' ');
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
    expected_weight: 'Expected',
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
  if (['expected_weight', 'tare_weight', 'gross_weight', 'net_weight'].includes(key)) return formatWeightMT(value);
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

function renderStatusTimeline(trip) {
  const history = parseStatusHistory(trip);
  if (!history.length) {
    return '<div class="mini-muted">No status history available</div>';
  }
  return history.map((entry) => {
    const isCurrent = !entry.exit_time;
    return `
      <article class="timeline-item ${isCurrent ? 'timeline-item-current' : ''}">
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
  const trip = allTrips.find((item) => String(item.id) === String(tripId));
  if (!trip || !timelineModal || !timelineModalTitle || !timelineModalBody) return;
  const expected = Number(trip.expected_weight);
  const net = Number(trip.net_weight);
  const variance = Number.isFinite(expected) && Number.isFinite(net) ? (net - expected) : null;
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
      <div><strong>Expected Weight:</strong> ${formatWeightMT(trip.expected_weight)}</div>
      <div><strong>Final Net Weight:</strong> ${formatWeightMT(trip.net_weight)}</div>
      <div><strong>Variance:</strong> ${variance === null ? '-' : formatWeightMT(variance)}</div>
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

function closeTimelineModal() {
  if (!timelineModal) return;
  timelineModal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

function wireTruckTimelineEvents() {
  document.querySelectorAll('[data-action="view-timeline"]').forEach((button) => {
    button.addEventListener('click', () => openTimelineModal(button.dataset.tripId));
  });
}

function getTruckDetailLink(trip) {
  const label = escapeHtml(trip?.truck_number || '-');
  return `
    <button type="button" class="truck-link-btn" data-action="view-timeline" data-trip-id="${trip?.id}">
      ${label}
    </button>
  `;
}

function updateActiveTripsTable(trips) {
  const sourceTrips = getCurrentRole() === 'Accounts'
    ? trips.filter((trip) => BILLING_VISIBLE_STATUSES.includes(trip.status))
    : trips;

  const activeTrips = sourceTrips.filter(trip =>
    trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED' && trip.status !== 'EXITED' && !trip.is_cancelled
  );

  // Update header with count
  const activeHeader = document.getElementById('active-trucks-header');
  activeHeader.textContent = `Active Trucks (${activeTrips.length})`;

  const tripsTable = document.getElementById('active-trips-table');
  const activeMobileList = document.getElementById('active-mobile-list');
  tripsTable.innerHTML = activeTrips.slice(0, 20).map(trip => { // Show last 20 active trips
    const inTime = parseTripDate(trip.in_time);
    const totalTime = calculateElapsedMinutes(inTime);
    const delayClass = getDelayClass(totalTime);

    return `
      <tr class="${delayClass}" data-active-trip-row="${trip.id}">
        <td>${getTruckDetailLink(trip)}</td>
        <td>${getStatusWithCancelReason(trip)}</td>
        <td>${trip.customer_name || ''}</td>
        <td>${escapeHtml(trip.transporter || '')}</td>
        <td>${formatWeightMT(trip.expected_weight)}</td>
        <td>${formatWeightMT(trip.net_weight)}</td>
        <td>${formatDateTime(trip.in_time)}</td>
        <td><span data-time-scope="active" data-time-kind="total" data-trip-id="${trip.id}">${formatMinutes(totalTime)}</span></td>
      </tr>
    `;
  }).join('');

  if (activeMobileList) {
    activeMobileList.innerHTML = activeTrips.slice(0, 20).map((trip) => {
      const inTime = parseTripDate(trip.in_time);
      const statusTime = parseTripDate(trip.last_status_update_time || trip.in_time);
      const totalTime = calculateElapsedMinutes(inTime);
      const stageTime = calculateElapsedMinutes(statusTime);
      const delayClass = getDelayClass(totalTime);
      return `
        <article class="mobile-trip-card ${delayClass}" data-active-trip-row="${trip.id}">
          <div class="mobile-trip-head">
            <div class="mobile-trip-truck">${getTruckDetailLink(trip)}</div>
            <div>${getStatusWithCancelReason(trip)}</div>
          </div>
          <div class="mobile-trip-grid">
            <div><strong>Customer:</strong> ${escapeHtml(trip.customer_name || '-')}</div>
            ${renderMobileRoleNames(trip)}
            <div><strong>Expected:</strong> ${formatWeightMT(trip.expected_weight)}</div>
            <div><strong>Net:</strong> ${formatWeightMT(trip.net_weight)}</div>
            <div><strong>Time In:</strong> ${formatDateTime(trip.in_time)}</div>
            <div><strong>Total:</strong> <span data-time-scope="active" data-time-kind="total" data-trip-id="${trip.id}">${formatMinutes(totalTime)}</span></div>
            <div><strong>Stage:</strong> <span data-time-scope="active" data-time-kind="stage" data-trip-id="${trip.id}">${formatMinutes(stageTime)}</span></div>
          </div>
        </article>
      `;
    }).join('');
  }

  wireTruckTimelineEvents();
}

function getFinalizedTotalMinutes(trip) {
  const inTime = parseTripDate(trip.in_time);
  if (!inTime) return null;
  const outTime = parseTripDate(trip.out_time);
  const endTime = outTime || new Date();
  const diffMs = endTime.getTime() - inTime.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60));
}

function updateReportRecordCount() {
  const countEl = document.getElementById('report-record-count');
  if (!countEl) return;
  countEl.textContent = `Total Records: ${filteredReportTrips.length}`;
}

function renderReportTable(trips) {
  const reportTable = document.getElementById('report-trips-table');
  const reportMobileList = document.getElementById('report-mobile-list');
  if (!reportTable) return;

  reportTable.innerHTML = trips.map((trip) => {
    const totalMinutes = getFinalizedTotalMinutes(trip);
    const cancelReason = isCancelledTrip(trip) ? (trip.cancel_reason || '-') : '-';
    const exitedOutcome = getExitedOutcome(trip);
    const expected = Number(trip.expected_weight);
    const net = Number(trip.net_weight);
    const variance = Number.isFinite(expected) && Number.isFinite(net) ? (net - expected) : null;
    const statusLabel = trip.status === 'EXITED'
      ? (exitedOutcome === 'CANCELLED' ? 'CANCELLED / EXITED' : 'COMPLETED / EXITED')
      : (isCancelledTrip(trip) ? 'CANCELLED' : 'COMPLETED');
    return `
      <tr>
        <td>${getTruckDetailLink(trip)}</td>
        <td>${trip.customer_name || ''}</td>
        <td>${statusLabel}</td>
        <td>${formatWeightMT(trip.expected_weight)}</td>
        <td>${formatWeightMT(trip.net_weight)}</td>
        <td>${variance === null ? '-' : formatWeightMT(variance)}</td>
        <td>${formatDateTime(trip.in_time)}</td>
        <td>${formatDateTime(trip.out_time)}</td>
        <td>${formatMinutes(totalMinutes)}</td>
        <td>${escapeHtml(cancelReason)}</td>
      </tr>
    `;
  }).join('');

  if (reportMobileList) {
    reportMobileList.innerHTML = trips.map((trip) => {
      const totalMinutes = getFinalizedTotalMinutes(trip);
      const cancelReason = isCancelledTrip(trip) ? (trip.cancel_reason || '-') : '-';
      const exitedOutcome = getExitedOutcome(trip);
      const expected = Number(trip.expected_weight);
      const net = Number(trip.net_weight);
      const variance = Number.isFinite(expected) && Number.isFinite(net) ? (net - expected) : null;
      const statusLabel = trip.status === 'EXITED'
        ? (exitedOutcome === 'CANCELLED' ? 'CANCELLED / EXITED' : 'COMPLETED / EXITED')
        : (isCancelledTrip(trip) ? 'CANCELLED' : 'COMPLETED');
      return `
        <article class="mobile-trip-card">
          <div class="mobile-trip-head">
            <div class="mobile-trip-truck">${getTruckDetailLink(trip)}</div>
            <div>${getStatusBadge(trip.status, statusLabel)}</div>
          </div>
          <div class="mobile-trip-grid">
            <div><strong>Customer:</strong> ${escapeHtml(trip.customer_name || '-')}</div>
            <div><strong>Expected:</strong> ${formatWeightMT(trip.expected_weight)}</div>
            <div><strong>Net:</strong> ${formatWeightMT(trip.net_weight)}</div>
            <div><strong>Variance:</strong> ${variance === null ? '-' : formatWeightMT(variance)}</div>
            <div><strong>In:</strong> ${formatDateTime(trip.in_time)}</div>
            <div><strong>Out:</strong> ${formatDateTime(trip.out_time)}</div>
            <div><strong>Total:</strong> ${formatMinutes(totalMinutes)}</div>
            <div><strong>Cancel:</strong> ${escapeHtml(cancelReason)}</div>
          </div>
        </article>
      `;
    }).join('');
  }

  updateReportRecordCount();
  wireTruckTimelineEvents();
}

function applyReportFilters() {
  const fromDate = document.getElementById('report-from-date').value;
  const toDate = document.getElementById('report-to-date').value;
  const statusFilter = document.getElementById('report-status-filter').value;
  const searchTerm = document.getElementById('report-search').value.trim().toLowerCase();

  let filtered = reportTrips;

  if (fromDate) {
    filtered = filtered.filter((trip) => getIstDateKey(trip.in_time) >= fromDate);
  }
  if (toDate) {
    filtered = filtered.filter((trip) => getIstDateKey(trip.in_time) <= toDate);
  }

  if (statusFilter === 'COMPLETED') {
    filtered = filtered.filter((trip) => isCompletedTrip(trip));
  } else if (statusFilter === 'CANCELLED') {
    filtered = filtered.filter((trip) => isCancelledTrip(trip));
  }

  if (searchTerm) {
    filtered = filtered.filter((trip) => {
      const truck = (trip.truck_number || '').toLowerCase();
      const customer = (trip.customer_name || '').toLowerCase();
      return truck.includes(searchTerm) || customer.includes(searchTerm);
    });
  }

  filteredReportTrips = filtered;
  renderReportTable(filteredReportTrips);
}

function csvEscape(value) {
  const str = String(value ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

function exportReportCsv() {
  const headers = [
    'ID',
    'Sequence Number',
    'Truck Number',
    'Customer',
    'Transporter',
    'Driver Name',
    'Driver Phone',
    'Gate Operator',
    'Dispatch Manager',
    'Loading Manager',
    'Weighbridge Operator',
    'Accounts Manager',
    'Dispatch Done By',
    'Tare Done By',
    'Gross Done By',
    'Loading Done By',
    'Billing Done By',
    'Status (Display)',
    'Status (Raw)',
    'Final Status',
    'Is Cancelled',
    'Material Type',
    'Grade',
    'Condition',
    'Packing',
    'Loading Point',
    'Labour Team',
    'ETA',
    'Expected Weight (MT)',
    'Waiting Reason',
    'Load Fix Reason',
    'Tare Weight (MT)',
    'Gross Weight (MT)',
    'Net Weight (MT)',
    'Variance (MT)',
    'Gross Attempts Count',
    'In Time',
    'Out Time',
    'Last Status Update',
    'Total Time',
    'Cancel Reason'
  ];

  const rows = filteredReportTrips.map((trip) => {
    const exitedOutcome = getExitedOutcome(trip);
    const status = trip.status === 'EXITED'
      ? (exitedOutcome === 'CANCELLED' ? 'CANCELLED / EXITED' : 'COMPLETED / EXITED')
      : (isCancelledTrip(trip) ? 'CANCELLED' : 'COMPLETED');
    const expected = Number(trip.expected_weight);
    const net = Number(trip.net_weight);
    const variance = Number.isFinite(expected) && Number.isFinite(net) ? (net - expected) : null;
    const totalTime = formatMinutes(getFinalizedTotalMinutes(trip));
    const row = [
      trip.id || '',
      trip.sequence_number || '',
      trip.truck_number || '',
      trip.customer_name || '',
      trip.transporter || '',
      trip.driver_name || '',
      trip.driver_phone || '',
      trip.gate_person_name || '',
      trip.dispatch_manager_name || '',
      trip.loading_person_name || '',
      trip.weight_operator_name || '',
      trip.accounts_person_name || '',
      trip.dispatch_done_by || '',
      trip.tare_done_by || '',
      trip.gross_done_by || '',
      trip.loading_done_by || '',
      trip.billing_done_by || '',
      status,
      trip.status || '',
      trip.final_status || '',
      trip.is_cancelled ? 'true' : 'false',
      trip.material_type || '',
      trip.grade || '',
      trip.condition || '',
      trip.packing || '',
      trip.loading_point || '',
      trip.labour_team || '',
      formatDateTime(trip.eta),
      trip.expected_weight || '',
      trip.waiting_reason || '',
      trip.load_fix_reason || '',
      trip.tare_weight || '',
      trip.gross_weight || '',
      trip.net_weight || '',
      variance === null ? '' : variance.toFixed(3),
      Array.isArray(trip.gross_weight_attempts)
        ? trip.gross_weight_attempts.length
        : ((typeof trip.gross_weight_attempts === 'string' && trip.gross_weight_attempts)
          ? (() => {
            try {
              const parsed = JSON.parse(trip.gross_weight_attempts);
              return Array.isArray(parsed) ? parsed.length : 0;
            } catch (_error) {
              return 0;
            }
          })()
          : 0),
      formatDateTime(trip.in_time),
      formatDateTime(trip.out_time),
      formatDateTime(trip.last_status_update_time),
      totalTime,
      (isCancelledTrip(trip)) ? (trip.cancel_reason || '') : ''
    ];
    return row.map(csvEscape).join(',');
  });

  const csv = [headers.map(csvEscape).join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `trip_report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

async function loadReportData() {
  try {
    const response = await fetch('/trips');
    const trips = await response.json();
    reportTrips = trips.filter((trip) => isFinalizedTrip(trip));
    applyReportFilters();
  } catch (error) {
    console.error('Failed to load report data:', error);
  }
}
function updateTimeMetrics() {
  const totalTimeElements = document.querySelectorAll('[data-time-scope="active"][data-time-kind="total"]');
  totalTimeElements.forEach(element => {
    const tripId = element.dataset.tripId;
    const trip = allTrips.find(t => t.id == tripId);
    if (trip) {
      const inTime = parseTripDate(trip.in_time);
      const totalTime = calculateElapsedMinutes(inTime);
      element.textContent = formatMinutes(totalTime);

      // Update row highlighting
      const delayClass = getDelayClass(totalTime);
      document.querySelectorAll(`[data-active-trip-row="${trip.id}"]`).forEach((rowEl) => {
        rowEl.classList.remove('truck-delayed-warning', 'truck-delayed-critical');
        if (delayClass) rowEl.classList.add(delayClass);
      });
    }
  });
}

async function loadDashboardData() {
  if (getCurrentRole() === 'Gate') {
    window.location.replace('/');
    return;
  }
  try {
    const response = await fetch('/trips');
    allTrips = await response.json();

    updateSummaryCards(allTrips);
    updateActiveTripsTable(allTrips);
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
  }
}

function startAutoRefresh() {
  loadDashboardData(); // Initial load
  refreshInterval = setInterval(() => {
    if (isInputEditingActive()) return;
    loadDashboardData();
  }, 5000); // Refresh every 5 seconds unless user is typing
  setInterval(updateTimeMetrics, 5000); // Update time metrics every 5 seconds
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
}

function isInputEditingActive() {
  const activeEl = document.activeElement;
  if (!activeEl) return false;
  if (activeEl.isContentEditable) return true;
  const tag = (activeEl.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

// Start the dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('[data-action="close-timeline"]')?.addEventListener('click', closeTimelineModal);
  timelineModal?.addEventListener('click', (event) => {
    if (event.target === timelineModal) closeTimelineModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeTimelineModal();
  });

  startAutoRefresh();
  loadReportData();

  // Report-only filters and actions (manual refresh, no 5s auto refresh).
  document.getElementById('report-from-date').addEventListener('change', applyReportFilters);
  document.getElementById('report-to-date').addEventListener('change', applyReportFilters);
  document.getElementById('report-status-filter').addEventListener('change', applyReportFilters);
  document.getElementById('report-search').addEventListener('input', applyReportFilters);
  document.getElementById('report-refresh-btn').addEventListener('click', loadReportData);
  document.getElementById('report-export-btn').addEventListener('click', exportReportCsv);
});

// Clean up when page unloads
window.addEventListener('beforeunload', stopAutoRefresh);
