// Role-based access control with PIN authentication
let userRole = null;
let refreshInterval;
const IST_TIMEZONE = 'Asia/Kolkata';
const VALID_ROLES = ['Gate', 'Dispatch', 'Weighbridge', 'Finance', 'Admin'];
const BILLING_VISIBLE_STATUSES = ['BILLING_PENDING', 'BILLING_COMPLETED', 'COMPLETED', 'EXITED'];
const DISPATCH_ZONE_STATUSES = [
  'IN_GATE',
  'AT_DISPATCH',
  'WAITING',
  'READY_FOR_LOADING',
  'LOADING_IN_PROGRESS',
  'LOADING_COMPLETED'
];
const WEIGHBRIDGE_ZONE_STATUSES = [
  'SENT_FOR_TARE_WEIGHT',
  'TARE_WEIGHT_DONE',
  'GROSS_WEIGHT_PENDING',
  'GROSS_WEIGHT_DONE'
];
const FINANCE_ZONE_STATUSES = ['BILLING_PENDING', 'BILLING_COMPLETED'];
const istDatePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

// Hardcoded PINs for each role
const rolePINs = {
  'Gate': '1111',
  'Dispatch': '2222',
  'Weighbridge': '3333',
  'Finance': '4444',
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

function getStatusWithCancelReason(trip) {
  const exitedOutcome = getExitedOutcome(trip);
  const displayStatus = trip.status === 'EXITED'
    ? (exitedOutcome === 'CANCELLED' ? 'CANCELLED / EXITED' : 'COMPLETED / EXITED')
    : trip.status;
  const statusBadge = getStatusBadge(trip.status, displayStatus);
  if ((trip.status !== 'CANCELLED' && !(trip.status === 'EXITED' && exitedOutcome === 'CANCELLED')) || !trip.cancel_reason) {
    return statusBadge;
  }

  const fullReason = escapeHtml(trip.cancel_reason.trim());
  return `
    <div class="status-cell">
      ${statusBadge}
      <div class="cancel-reason-text" title="${fullReason}">${fullReason}</div>
    </div>
  `;
}

function createSummaryCard(title, count, colorClass, truckNumbers = []) {
  const trucksText = truckNumbers.length ? truckNumbers.join(', ') : '-';
  return `
    <div class="summary-card ${colorClass}">
      <div class="card-number">${count}</div>
      <div class="card-title">${title}</div>
      <div class="card-trucks" title="${escapeHtml(trucksText)}">Trucks: ${escapeHtml(trucksText)}</div>
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

function formatTons(weightInKg) {
  return `${(weightInKg / 1000).toFixed(2)} tons`;
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
  const visibleTrips = getCurrentRole() === 'Finance'
    ? trips.filter((trip) => BILLING_VISIBLE_STATUSES.includes(trip.status))
    : trips;
  const nowIst = getIstDateParts(new Date());
  const inPlantTrips = visibleTrips.filter((trip) => trip.status !== 'EXITED');
  const completedMonth = visibleTrips.filter((trip) => {
    if (!(trip.status === 'EXITED' && getExitedOutcome(trip) === 'COMPLETED')) return false;
    const tripDate = parseTripDate(trip.in_time);
    if (!tripDate) return false;
    const tripIst = getIstDateParts(tripDate);
    return tripIst.year === nowIst.year && tripIst.month === nowIst.month;
  }).length;
  const completedYear = visibleTrips.filter((trip) => {
    if (!(trip.status === 'EXITED' && getExitedOutcome(trip) === 'COMPLETED')) return false;
    const tripDate = parseTripDate(trip.in_time);
    if (!tripDate) return false;
    const tripIst = getIstDateParts(tripDate);
    return tripIst.year === nowIst.year;
  }).length;
  const quantityMonthKg = visibleTrips.reduce((total, trip) => {
    if (!(trip.status === 'EXITED' && getExitedOutcome(trip) === 'COMPLETED')) return total;
    const tripDate = parseTripDate(trip.in_time);
    if (!tripDate) return total;
    const tripIst = getIstDateParts(tripDate);
    if (tripIst.year !== nowIst.year || tripIst.month !== nowIst.month) return total;
    return total + parseWeight(trip.net_weight);
  }, 0);
  const quantityYearKg = visibleTrips.reduce((total, trip) => {
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

  const dispatchCount = inPlantTrips.filter((trip) => DISPATCH_ZONE_STATUSES.includes(trip.status)).length;
  const dispatchTrips = inPlantTrips.filter((trip) => DISPATCH_ZONE_STATUSES.includes(trip.status));
  const weighbridgeTrips = inPlantTrips.filter((trip) => WEIGHBRIDGE_ZONE_STATUSES.includes(trip.status));
  const financeTrips = inPlantTrips.filter((trip) => FINANCE_ZONE_STATUSES.includes(trip.status));
  const weighbridgeCount = weighbridgeTrips.length;
  const financeCount = financeTrips.length;

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
  const weighbridgeTruckNumbers = getTruckNumbers(weighbridgeTrips);
  const financeTruckNumbers = getTruckNumbers(financeTrips);
  const over12TruckNumbers = getTruckNumbers(over12HourTrips);
  const over24TruckNumbers = getTruckNumbers(over24HourTrips);

  const cardsHtml = `
    ${createSummaryCard('Completed (Month)', completedMonth, 'card-green')}
    ${createSummaryCard('Completed (Year)', completedYear, 'card-green')}
    ${createSummaryCard('Quantity (Month)', formatTons(quantityMonthKg), 'card-light-blue')}
    ${createSummaryCard('Quantity (Year)', formatTons(quantityYearKg), 'card-purple')}
    ${createSummaryCard('Cancelled (Exited)', cancelledExited, 'card-red')}
    ${createSummaryCard('In Plant', inPlantTrips.length, 'card-blue')}
    ${createSummaryCard('Dispatch', dispatchCount, 'card-light-blue', dispatchTruckNumbers)}
    ${createSummaryCard('Weighbridge', weighbridgeCount, 'card-orange', weighbridgeTruckNumbers)}
    ${createSummaryCard('Finance', financeCount, 'card-purple', financeTruckNumbers)}
    ${createSummaryCard('>12 Hours', over12Hours, 'card-yellow', over12TruckNumbers)}
    ${createSummaryCard('>24 Hours', over24Hours, 'card-red', over24TruckNumbers)}
  `;

  document.getElementById('summary-cards').innerHTML = cardsHtml;
}

let allTrips = []; // live dashboard data
let reportTrips = []; // finalized trips for reports
let filteredReportTrips = [];

function isCancelledTrip(trip) {
  return trip?.status === 'CANCELLED' || trip?.final_status === 'CANCELLED' || getExitedOutcome(trip) === 'CANCELLED';
}

function isCompletedTrip(trip) {
  return trip?.status === 'COMPLETED' || trip?.final_status === 'COMPLETED' || getExitedOutcome(trip) === 'COMPLETED';
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

function updateActiveTripsTable(trips) {
  const sourceTrips = getCurrentRole() === 'Finance'
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
    const statusTime = parseTripDate(trip.last_status_update_time || trip.in_time);
    const totalTime = calculateElapsedMinutes(inTime);
    const stageTime = calculateElapsedMinutes(statusTime);
    const delayClass = getDelayClass(totalTime);

    return `
      <tr class="${delayClass}" data-active-trip-row="${trip.id}">
        <td>${trip.truck_number || ''}</td>
        <td>${getStatusWithCancelReason(trip)}</td>
        <td>${trip.customer_name || ''}</td>
        <td>${trip.net_weight ? trip.net_weight + ' kg' : ''}</td>
        <td>${formatDateTime(trip.in_time)}</td>
        <td><span data-time-scope="active" data-time-kind="total" data-trip-id="${trip.id}">${formatMinutes(totalTime)}</span></td>
        <td><span data-time-scope="active" data-time-kind="stage" data-trip-id="${trip.id}">${formatMinutes(stageTime)}</span></td>
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
            <div class="mobile-trip-truck">${escapeHtml(trip.truck_number || '-')}</div>
            <div>${getStatusWithCancelReason(trip)}</div>
          </div>
          <div class="mobile-trip-grid">
            <div><strong>Customer:</strong> ${escapeHtml(trip.customer_name || '-')}</div>
            <div><strong>Net:</strong> ${trip.net_weight ? `${trip.net_weight} kg` : '-'}</div>
            <div><strong>Time In:</strong> ${formatDateTime(trip.in_time)}</div>
            <div><strong>Total:</strong> <span data-time-scope="active" data-time-kind="total" data-trip-id="${trip.id}">${formatMinutes(totalTime)}</span></div>
            <div><strong>Stage:</strong> <span data-time-scope="active" data-time-kind="stage" data-trip-id="${trip.id}">${formatMinutes(stageTime)}</span></div>
          </div>
        </article>
      `;
    }).join('');
  }
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
    const statusLabel = trip.status === 'EXITED'
      ? (exitedOutcome === 'CANCELLED' ? 'CANCELLED / EXITED' : 'COMPLETED / EXITED')
      : (isCancelledTrip(trip) ? 'CANCELLED' : 'COMPLETED');
    return `
      <tr>
        <td>${trip.truck_number || ''}</td>
        <td>${trip.customer_name || ''}</td>
        <td>${statusLabel}</td>
        <td>${trip.net_weight ? `${trip.net_weight} kg` : ''}</td>
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
      const statusLabel = trip.status === 'EXITED'
        ? (exitedOutcome === 'CANCELLED' ? 'CANCELLED / EXITED' : 'COMPLETED / EXITED')
        : (isCancelledTrip(trip) ? 'CANCELLED' : 'COMPLETED');
      return `
        <article class="mobile-trip-card">
          <div class="mobile-trip-head">
            <div class="mobile-trip-truck">${escapeHtml(trip.truck_number || '-')}</div>
            <div>${getStatusBadge(trip.status, statusLabel)}</div>
          </div>
          <div class="mobile-trip-grid">
            <div><strong>Customer:</strong> ${escapeHtml(trip.customer_name || '-')}</div>
            <div><strong>Net:</strong> ${trip.net_weight ? `${trip.net_weight} kg` : '-'}</div>
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
    'Truck Number',
    'Customer',
    'Status',
    'Net Weight',
    'In Time',
    'Out Time',
    'Total Time',
    'Cancel Reason'
  ];

  const rows = filteredReportTrips.map((trip) => {
    const exitedOutcome = getExitedOutcome(trip);
    const status = trip.status === 'EXITED'
      ? (exitedOutcome === 'CANCELLED' ? 'CANCELLED / EXITED' : 'COMPLETED / EXITED')
      : (isCancelledTrip(trip) ? 'CANCELLED' : 'COMPLETED');
    const totalTime = formatMinutes(getFinalizedTotalMinutes(trip));
    const row = [
      trip.truck_number || '',
      trip.customer_name || '',
      status,
      trip.net_weight || '',
      formatDateTime(trip.in_time),
      formatDateTime(trip.out_time),
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
      const statusTime = parseTripDate(trip.last_status_update_time || trip.in_time);
      const totalTime = calculateElapsedMinutes(inTime);
      const stageTime = calculateElapsedMinutes(statusTime);
      element.textContent = formatMinutes(totalTime);
      document.querySelectorAll(`[data-time-scope="active"][data-time-kind="stage"][data-trip-id="${trip.id}"]`)
        .forEach((stageElement) => {
          stageElement.textContent = formatMinutes(stageTime);
        });

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
  refreshInterval = setInterval(loadDashboardData, 5000); // Refresh every 5 seconds
  setInterval(updateTimeMetrics, 5000); // Update time metrics every 5 seconds
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
}

// Start the dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
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
