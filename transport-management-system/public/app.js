// Role-based access control with PIN authentication
let userRole = null;
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

function hasRoleAccess(allowedRoles) {
  const role = getCurrentRole();
  return !!role && allowedRoles.includes(role);
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
    hideMalodals();
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

function hideMalodals() {
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
  const dashboardLink = document.querySelector('a[href="/dashboard"]');
  if (dashboardLink) {
    dashboardLink.style.display = userRole === 'Gate' ? 'none' : 'inline-block';
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

const form = document.getElementById('trip-form');
const tripsTable = document.getElementById('trips-table');
const tripsHeaderRow = document.querySelector('.table-container table thead tr');
const messageEl = document.getElementById('message');
const saveButton = document.getElementById('save-button');
const clearButton = document.getElementById('clear-button');

// Dropdown elements
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
  'Weight Operator',
  'Time In',
  'Time Spent',
  'Actions'
];

function syncTripsTableHeader() {
  if (!tripsHeaderRow) return;
  tripsHeaderRow.innerHTML = MAIN_TABLE_COLUMNS.map((label) => `<th>${label}</th>`).join('');
}

function showMessage(text, success = true) {
  messageEl.textContent = text;
  messageEl.style.color = success ? '#047857' : '#b91c1c';
}

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

function getActionDropdown(trip) {
  const canEditStatus = hasRoleAccess(['Dispatch', 'Weighbridge', 'Admin']);
  if (!canEditStatus) {
    return '<span>-</span>';
  }
  const statuses = [
    'IN_GATE',
    'AT_DISPATCH',
    'TARE_WEIGHT_DONE',
    'LOADING_IN_PROGRESS',
    'LOADED',
    'GROSS_WEIGHT_DONE',
    'COMPLETED'
  ];
  const canCancelTrip = hasRoleAccess(['Dispatch', 'Admin']);
  if (canCancelTrip) {
    statuses.push('CANCELLED');
  }
  const currentStatus = trip.status || 'IN_GATE';

  const options = statuses.map((status) => {
    const selected = status === currentStatus ? 'selected' : '';
    return `<option value="${status}" ${selected}>${status.replaceAll('_', ' ')}</option>`;
  }).join('');

  return `
    <select class="status-action-select" data-trip-id="${trip.id}" ${trip.is_cancelled ? 'disabled' : ''}>
      ${options}
    </select>
  `;
}

function getWeightInputs(trip) {
  const canEditWeight = hasRoleAccess(['Weighbridge', 'Admin']);
  const tareWeight = trip.tare_weight || '';
  const grossWeight = trip.gross_weight || '';
  const netWeight = trip.net_weight || '';

  if (!canEditWeight) {
    return `
      <div class="weight-inputs">
        <span>Tare: ${tareWeight || '-'}</span>
        <span>Gross: ${grossWeight || '-'}</span>
        <span>Net: ${netWeight || '-'}</span>
      </div>
    `;
  }

  return `
    <div class="weight-inputs">
      <input type="number" step="0.01" class="weight-input" data-trip-id="${trip.id}" data-field="tare_weight" value="${tareWeight}" placeholder="Tare" />
      <input type="number" step="0.01" class="weight-input" data-trip-id="${trip.id}" data-field="gross_weight" value="${grossWeight}" placeholder="Gross" />
      <input type="number" step="0.01" class="weight-input net-weight" data-trip-id="${trip.id}" data-field="net_weight" value="${netWeight}" placeholder="Net" readonly />
      <button class="save-weight-btn" data-trip-id="${trip.id}">Save</button>
    </div>
  `;
}

function getWeightOperatorSelect(trip) {
  const canEditWeight = hasRoleAccess(['Weighbridge', 'Admin']);
  const selectedOperator = (trip.weight_operator_name || '').trim();
  if (!canEditWeight) {
    return `<span>${selectedOperator || '-'}</span>`;
  }
  const defaultOperators = ['Rajesh', 'Suresh', 'Mahesh'];
  const isCustom = selectedOperator && !defaultOperators.includes(selectedOperator);

  const options = [
    '<option value="">Select Operator</option>',
    ...defaultOperators.map((name) => (
      `<option value="${name}" ${selectedOperator === name ? 'selected' : ''}>${name}</option>`
    )),
    `<option value="Other" ${isCustom ? 'selected' : ''}>Other</option>`
  ].join('');

  return `
    <div class="weight-operator-inputs">
      <select class="weight-operator-select" data-trip-id="${trip.id}">
        ${options}
      </select>
      <input
        type="text"
        class="weight-operator-other"
        data-trip-id="${trip.id}"
        placeholder="Enter operator name"
        value="${isCustom ? escapeHtml(selectedOperator) : ''}"
        style="${isCustom ? 'display:block;' : 'display:none;'}"
      />
    </div>
  `;
}

function getSelectedWeightOperatorFromRow(tripId) {
  const operatorSelect = document.querySelector(`.weight-operator-select[data-trip-id="${tripId}"]`);
  if (!operatorSelect) return null;

  if (operatorSelect.value === 'Other') {
    const operatorOther = document.querySelector(`.weight-operator-other[data-trip-id="${tripId}"]`);
    const otherValue = operatorOther ? operatorOther.value.trim() : '';
    return otherValue || null;
  }

  return operatorSelect.value ? operatorSelect.value.trim() : null;
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
    tare_weight: trip.tare_weight,
    gross_weight: trip.gross_weight,
    net_weight: trip.net_weight,
    status: trip.status,
    is_cancelled: trip.is_cancelled,
    cancel_reason: trip.cancel_reason,
    in_time: trip.in_time,
    out_time: trip.out_time
  };
}

async function updateTripStatus(tripId, status, cancelReason = null) {
  if (!hasRoleAccess(['Dispatch', 'Weighbridge', 'Admin'])) {
    showMessage('Only Dispatch, Weighbridge and Admin can update status', false);
    return;
  }

  // Check permissions for cancel action
  if (status === 'CANCELLED') {
    if (!hasRoleAccess(['Dispatch', 'Admin'])) {
      showMessage('Only Dispatch and Admin can cancel trips', false);
      return;
    }

    // Step 1: Show confirmation dialog
    const confirmCancel = confirm('Are you sure you want to cancel this trip?');
    if (!confirmCancel) {
      return;
    }

    // Step 2: Prompt for cancel reason (only if not already provided)
    if (!cancelReason || cancelReason.trim() === '') {
      const reason = prompt('Enter cancel reason:');
      if (!reason || reason.trim() === '') {
        showMessage('Cancel reason is required', false);
        return;
      }
      cancelReason = reason.trim();
    }
  }

  const existingTrip = getTripById(tripId);
  const payload = {
    ...getBaseTripPayload(existingTrip),
    status
  };

  const selectedOperator = getSelectedWeightOperatorFromRow(tripId);
  if (selectedOperator) {
    payload.weight_operator_name = selectedOperator;
  }

  if (status === 'CANCELLED') {
    payload.is_cancelled = true;
    payload.cancel_reason = cancelReason;
    payload.out_time = getCurrentISTDate().toISOString();
  } else if (status === 'COMPLETED') {
    payload.is_cancelled = false;
    payload.cancel_reason = null;
    payload.out_time = getCurrentISTDate().toISOString();
  } else if (payload.is_cancelled && existingTrip && existingTrip.status !== 'CANCELLED') {
    payload.is_cancelled = false;
    payload.cancel_reason = null;
  }

  try {
    const response = await fetch(`/trip/${tripId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update status');
    }

    const updatedTrip = await response.json();
    showMessage(`Status updated to ${status}`);
    loadTrips(); // Reload data to reflect changes
  } catch (error) {
    showMessage(error.message, false);
    console.error(error);
  }
}

function calculateNetWeight(event) {
  if (!hasRoleAccess(['Weighbridge', 'Admin'])) {
    return;
  }
  const input = event.target;
  const tripId = input.dataset.tripId;
  const field = input.dataset.field;

  if (field === 'tare_weight' || field === 'gross_weight') {
    const row = input.closest('tr');
    const tareInput = row.querySelector(`[data-trip-id="${tripId}"][data-field="tare_weight"]`);
    const grossInput = row.querySelector(`[data-trip-id="${tripId}"][data-field="gross_weight"]`);
    const netInput = row.querySelector(`[data-trip-id="${tripId}"][data-field="net_weight"]`);

    const tareWeight = parseFloat(tareInput.value) || 0;
    const grossWeight = parseFloat(grossInput.value) || 0;

    if (tareWeight > 0 && grossWeight > 0) {
      const netWeight = grossWeight - tareWeight;
      netInput.value = netWeight.toFixed(2);
    } else {
      netInput.value = '';
    }
  }
}

function handleWeightOperatorChange(event) {
  if (!hasRoleAccess(['Weighbridge', 'Admin'])) {
    return;
  }
  const select = event.target;
  const tripId = select.dataset.tripId;
  const otherInput = document.querySelector(`.weight-operator-other[data-trip-id="${tripId}"]`);

  if (select.value === 'Other') {
    otherInput.style.display = 'block';
    otherInput.required = true;
    otherInput.focus();
  } else {
    otherInput.style.display = 'none';
    otherInput.required = false;
    otherInput.value = '';
  }
}

async function saveWeights(event) {
  if (!hasRoleAccess(['Weighbridge', 'Admin'])) {
    showMessage('Only Weighbridge and Admin can save weights', false);
    return;
  }

  const button = event.target;
  const tripId = button.dataset.tripId;
  const row = button.closest('tr');

  const tareInput = row.querySelector(`[data-trip-id="${tripId}"][data-field="tare_weight"]`);
  const grossInput = row.querySelector(`[data-trip-id="${tripId}"][data-field="gross_weight"]`);
  const netInput = row.querySelector(`[data-trip-id="${tripId}"][data-field="net_weight"]`);
  const operatorSelect = row.querySelector(`.weight-operator-select[data-trip-id="${tripId}"]`);
  const operatorOther = row.querySelector(`.weight-operator-other[data-trip-id="${tripId}"]`);

  const tareWeight = parseFloat(tareInput.value) || null;
  const grossWeight = parseFloat(grossInput.value) || null;
  const netWeight = parseFloat(netInput.value) || null;
  const existingTrip = getTripById(tripId);

  // Validation
  if (grossWeight && tareWeight && grossWeight <= tareWeight) {
    showMessage('Gross weight must be greater than tare weight', false);
    return;
  }

  let weightOperatorName = operatorSelect.value ? operatorSelect.value.trim() : '';
  if (weightOperatorName === 'Other') {
    weightOperatorName = operatorOther.value.trim();
    if (!weightOperatorName) {
      showMessage('Please enter weight operator name', false);
      return;
    }
  } else if (!weightOperatorName && existingTrip?.weight_operator_name) {
    weightOperatorName = existingTrip.weight_operator_name;
  }

  const payload = {
    ...getBaseTripPayload(existingTrip),
    tare_weight: tareWeight,
    gross_weight: grossWeight,
    net_weight: netWeight,
    weight_operator_name: weightOperatorName
  };

  try {
    const response = await fetch(`/trip/${tripId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save weights');
    }

    const updatedTrip = await response.json();
    showMessage('Weights saved successfully');
    loadTrips(); // Reload data to reflect changes
  } catch (error) {
    showMessage(error.message, false);
    console.error(error);
  }
}

function toggleOtherInput(selectElement, inputElement) {
  if (selectElement.value === 'other') {
    inputElement.style.display = 'block';
    inputElement.required = true;
    inputElement.focus();
  } else {
    inputElement.style.display = 'none';
    inputElement.required = false;
    inputElement.value = '';
  }
}

function getFormData() {
  const formData = new FormData(form);

  // Handle customer name
  let customerName = customerSelect.value;
  if (customerName === 'other') {
    customerName = formData.get('customer_name') || '';
  }

  // Handle transporter
  let transporter = transporterSelect.value;
  if (transporter === 'other') {
    transporter = formData.get('transporter') || '';
  }

  // Handle gate person
  let gatePerson = gatePersonSelect.value;
  if (gatePerson === 'other') {
    gatePerson = formData.get('gate_person_name') || '';
  }

  return {
    truck_number: formData.get('truck_number') || '',
    customer_name: customerName,
    transporter: transporter,
    driver_name: formData.get('driver_name') || '',
    driver_phone: formData.get('driver_phone') || '',
    gate_person_name: gatePerson,
    status: 'IN_GATE', // Default status for gate entry
    in_time: getCurrentISTDate().toISOString()
  };
}

function resetForm() {
  form.reset();
  // Reset dropdown states
  toggleOtherInput(customerSelect, customerOther);
  toggleOtherInput(transporterSelect, transporterOther);
  toggleOtherInput(gatePersonSelect, gatePersonOther);
}

async function loadTrips() {
  try {
    const response = await fetch('/trips');
    allTrips = await response.json();
    applyFilters();
  } catch (error) {
    console.error('Failed to load trips:', error);
  }
}

let allTrips = []; // Store all trips data

function applyFilters() {
  const searchTerm = document.getElementById('truck-search').value.toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;

  let filteredTrips = allTrips;

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
    } else {
      filteredTrips = filteredTrips.filter(trip => trip.status === statusFilter && !trip.is_cancelled);
    }
  }

  renderTripsTable(filteredTrips);
}

function getDelayClass(timeSpent) {
  if (timeSpent > 1440) { // 24 hours
    return 'truck-delayed-critical';
  } else if (timeSpent > 720) { // 12 hours
    return 'truck-delayed-warning';
  }
  return '';
}

function renderTripsTable(trips) {
  tripsTable.innerHTML = trips.map(trip => {
    const inTime = parseTripDate(trip.in_time);
    const timeSpent = calculateTimeSpent(inTime);
    const delayClass = getDelayClass(timeSpent);

    return `
      <tr class="${delayClass}">
        <td>${trip.truck_number || ''}</td>
        <td>${getStatusWithCancelReason(trip)}</td>
        <td>${trip.customer_name || ''}</td>
        <td>${trip.transporter || ''}</td>
        <td>${trip.driver_name || ''}</td>
        <td>${trip.driver_phone || ''}</td>
        <td>${trip.gate_person_name || ''}</td>
        <td>${getWeightInputs(trip)}</td>
        <td>${getWeightOperatorSelect(trip)}</td>
        <td>${formatDateTime(trip.in_time)}</td>
        <td><span id="time-spent-${trip.id}">${formatTimeSpent(timeSpent)}</span></td>
        <td>${getActionDropdown(trip)}</td>
      </tr>
    `;
  }).join('');

  // Add event listeners to action dropdowns
  document.querySelectorAll('.status-action-select').forEach(select => {
    select.addEventListener('change', async () => {
      const tripId = select.dataset.tripId;
      const status = select.value;
      await updateTripStatus(tripId, status);
    });
  });

  // Add event listeners for weight inputs
  document.querySelectorAll('.weight-input').forEach(input => {
    input.addEventListener('input', calculateNetWeight);
  });

  // Add event listeners for weight operator selects
  document.querySelectorAll('.weight-operator-select').forEach(select => {
    select.addEventListener('change', handleWeightOperatorChange);
  });

  // Add save weight buttons
  document.querySelectorAll('.save-weight-btn').forEach(button => {
    button.addEventListener('click', saveWeights);
  });
}

// Event listeners for dropdown changes
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
  const payload = getFormData();

  try {
    const response = await fetch('/trip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    const trip = await response.json();
    showMessage('Gate entry recorded successfully!');
    resetForm();
    loadTrips();
  } catch (error) {
    showMessage(error.message, false);
    console.error(error);
  }
});

clearButton.addEventListener('click', () => {
  resetForm();
  showMessage('Form cleared.');
});

// Initialize
syncTripsTableHeader();
loadTrips();

// Set up time spent update interval
setInterval(updateTimeSpent, 5000);

// Add event listeners for filters
document.getElementById('truck-search').addEventListener('input', applyFilters);
document.getElementById('status-filter').addEventListener('change', applyFilters);
