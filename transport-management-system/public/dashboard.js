// Role-based access control with PIN authentication
let userRole = null;
let refreshInterval;
const IST_TIMEZONE = 'Asia/Kolkata';
const VALID_ROLES = ['Gate', 'Dispatch', 'Weighbridge', 'Admin'];

// Hardcoded PINs for each role
const rolePINs = {
  'Gate': '1111',
  'Dispatch': '2222',
  'Weighbridge': '3333',
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

function getCurrentISTDate() {
  const nowIST = new Date().toLocaleString('en-US', {
    timeZone: IST_TIMEZONE
  });
  return new Date(nowIST);
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

function getStatusBadge(status) {
  const statusClass = status ? status.toLowerCase().replace('_', '_') : 'in_gate';
  return `<span class="status-badge status-${statusClass}">${status || 'IN_GATE'}</span>`;
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
  const statusBadge = getStatusBadge(trip.status);
  if (trip.status !== 'CANCELLED' || !trip.cancel_reason) {
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

function createSummaryCard(title, count, colorClass) {
  return `
    <div class="summary-card ${colorClass}">
      <div class="card-number">${count}</div>
      <div class="card-title">${title}</div>
    </div>
  `;
}

function getIstDateParts(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate()
  };
}

function parseWeight(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatTons(weightInKg) {
  return `${(weightInKg / 1000).toFixed(2)} tons`;
}

function calculateDispatchVolumes(trips) {
  const nowIst = getIstDateParts(getCurrentISTDate());
  let todayDispatchKg = 0;
  let monthDispatchKg = 0;

  trips.forEach((trip) => {
    if (trip.status !== 'COMPLETED') {
      return;
    }

    const tripDate = parseTripDate(trip.in_time);
    if (!tripDate) {
      return;
    }

    const tripIst = getIstDateParts(tripDate);
    const netWeight = parseWeight(trip.net_weight);

    if (tripIst.year === nowIst.year && tripIst.month === nowIst.month) {
      monthDispatchKg += netWeight;
      if (tripIst.day === nowIst.day) {
        todayDispatchKg += netWeight;
      }
    }
  });

  return { todayDispatchKg, monthDispatchKg };
}

function updateSummaryCards(trips) {
  const totalTrucks = trips.length;
  const inGate = trips.filter(t => t.status === 'IN_GATE').length;
  const loadingInProgress = trips.filter(t => t.status === 'LOADING_IN_PROGRESS').length;
  const grossWeightDone = trips.filter(t => t.status === 'GROSS_WEIGHT_DONE').length;
  const completed = trips.filter(t => t.status === 'COMPLETED').length;
  const cancelled = trips.filter(t => t.is_cancelled).length;
  const { todayDispatchKg, monthDispatchKg } = calculateDispatchVolumes(trips);

  const cardsHtml = `
    ${createSummaryCard('Total Trucks', totalTrucks, 'card-blue')}
    ${createSummaryCard('In Gate', inGate, 'card-gray')}
    ${createSummaryCard('Loading', loadingInProgress, 'card-orange')}
    ${createSummaryCard('Weight Done', grossWeightDone, 'card-green')}
    ${createSummaryCard('Completed', completed, 'card-green')}
    ${createSummaryCard('Cancelled', cancelled, 'card-red')}
    ${createSummaryCard("Today's Dispatch Volume", formatTons(todayDispatchKg), 'card-blue')}
    ${createSummaryCard('Current Month Dispatch Volume', formatTons(monthDispatchKg), 'card-orange')}
  `;

  document.getElementById('summary-cards').innerHTML = cardsHtml;
}

let allTrips = []; // Store all trips data

function applyFilters() {
  const searchTerm = document.getElementById('truck-search').value.toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;

  let filteredTrips = allTrips.filter(trip => trip.status === 'COMPLETED' || trip.is_cancelled);
  const totalCompletedCount = filteredTrips.length;

  // Apply search filter
  if (searchTerm) {
    filteredTrips = filteredTrips.filter(trip =>
      trip.truck_number && trip.truck_number.toLowerCase().includes(searchTerm)
    );
  }

  // Apply status filter
  if (statusFilter) {
    if (statusFilter === 'CANCELLED') {
      filteredTrips = filteredTrips.filter(trip => trip.is_cancelled);
    } else if (statusFilter === 'COMPLETED') {
      filteredTrips = filteredTrips.filter(trip => trip.status === 'COMPLETED' && !trip.is_cancelled);
    }
  }

  updateCompletedTripsTable(filteredTrips, totalCompletedCount);
}

function getDelayClass(timeSpent) {
  if (timeSpent === null) {
    return '';
  }
  if (timeSpent > 1440) { // 24 hours
    return 'truck-delayed-critical';
  } else if (timeSpent > 720) { // 12 hours
    return 'truck-delayed-warning';
  }
  return '';
}

function parseTripDate(value) {
  if (!value) return null;
  const rawDate = new Date(value);
  if (Number.isNaN(rawDate.getTime())) return null;
  const istString = rawDate.toLocaleString('en-US', { timeZone: IST_TIMEZONE });
  return new Date(istString);
}

function formatDateTime(value) {
  if (!value) return '-';
  const rawDate = new Date(value);
  if (Number.isNaN(rawDate.getTime())) return '-';
  return rawDate.toLocaleString('en-IN', { timeZone: IST_TIMEZONE });
}

function updateActiveTripsTable(trips) {
  const activeTrips = trips.filter(trip =>
    trip.status !== 'COMPLETED' && !trip.is_cancelled
  );

  // Update header with count
  const activeHeader = document.getElementById('active-trucks-header');
  activeHeader.textContent = `Active Trucks (${activeTrips.length})`;

  const tripsTable = document.getElementById('active-trips-table');
  tripsTable.innerHTML = activeTrips.slice(0, 20).map(trip => { // Show last 20 active trips
    const inTime = parseTripDate(trip.in_time);
    const timeSpent = calculateTimeSpent(inTime);
    const delayClass = getDelayClass(timeSpent);

    return `
      <tr class="${delayClass}">
        <td>${trip.truck_number || ''}</td>
        <td>${getStatusWithCancelReason(trip)}</td>
        <td>${trip.customer_name || ''}</td>
        <td>${trip.net_weight ? trip.net_weight + ' kg' : ''}</td>
        <td>${formatDateTime(trip.in_time)}</td>
        <td><span id="time-spent-${trip.id}">${formatTimeSpent(timeSpent)}</span></td>
      </tr>
    `;
  }).join('');
}

function updateCompletedTripsTable(trips, totalCount) {
  // Update header with total count (not filtered count)
  const completedHeader = document.getElementById('completed-trucks-header');
  completedHeader.textContent = `Completed / Cancelled Trucks (${totalCount})`;

  const tripsTable = document.getElementById('completed-trips-table');
  tripsTable.innerHTML = trips.slice(0, 20).map(trip => { // Show last 20 completed/cancelled trips
    const inTime = parseTripDate(trip.in_time);
    const timeSpent = calculateTimeSpent(inTime);
    const delayClass = getDelayClass(timeSpent);

    return `
      <tr class="${delayClass}">
        <td>${trip.truck_number || ''}</td>
        <td>${getStatusWithCancelReason(trip)}</td>
        <td>${trip.customer_name || ''}</td>
        <td>${trip.net_weight ? trip.net_weight + ' kg' : ''}</td>
        <td>${formatDateTime(trip.in_time)}</td>
        <td><span id="time-spent-${trip.id}">${formatTimeSpent(timeSpent)}</span></td>
      </tr>
    `;
  }).join('');
}

function calculateTimeSpent(inTime) {
  if (!inTime) return null;
  const diffMs = getCurrentISTDate().getTime() - inTime.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60));
}

function formatTimeSpent(totalMinutes) {
  if (totalMinutes === null) return '-';
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m`;
}

function updateTimeSpent() {
  const timeSpentElements = document.querySelectorAll('[id^="time-spent-"]');
  timeSpentElements.forEach(element => {
    const tripId = element.id.split('-')[2];
    const trip = allTrips.find(t => t.id == tripId);
    if (trip) {
      const inTime = parseTripDate(trip.in_time);
      const timeSpent = calculateTimeSpent(inTime);
      element.textContent = formatTimeSpent(timeSpent);

      // Update row highlighting
      const row = element.closest('tr');
      const delayClass = getDelayClass(timeSpent);
      row.className = delayClass;
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
    applyFilters(); // This will update the completed trips table
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
  }
}

function startAutoRefresh() {
  loadDashboardData(); // Initial load
  refreshInterval = setInterval(loadDashboardData, 5000); // Refresh every 5 seconds
  setInterval(updateTimeSpent, 5000); // Update time spent every 5 seconds
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
}

// Start the dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
  startAutoRefresh();

  // Add event listeners for filters
  document.getElementById('truck-search').addEventListener('input', applyFilters);
  document.getElementById('status-filter').addEventListener('change', applyFilters);
});

// Clean up when page unloads
window.addEventListener('beforeunload', stopAutoRefresh);
