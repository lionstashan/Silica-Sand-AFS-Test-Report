const ALLOWED_ROLES = ['Gate', 'Dispatch', 'Manager', 'Admin'];
const IST_TIMEZONE = 'Asia/Kolkata';
const EMPLOYEE_TRANSPORT_TOKEN_KEY = 'employeeTransportToken';

let userRole = null;
let employeeSessionRoles = [];
let rows = [];
let refreshTimer = null;
let taskNotificationPoll = null;
let globalToastTimer = null;

const table = document.getElementById('expected-table');
const mobileList = document.getElementById('expected-mobile-list');
const statusFilter = document.getElementById('status-filter');
const truckSearch = document.getElementById('truck-search');
const messageEl = document.getElementById('message');
const taskNotificationsBtn = document.getElementById('task-notifications-btn');
const taskNotificationBadge = document.getElementById('task-notification-badge');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-IN', { timeZone: IST_TIMEZONE });
}

function getStoredRole() {
  const role = localStorage.getItem('userRole');
  return ALLOWED_ROLES.includes(role) ? role : null;
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

function getAuthHeaders() {
  const shared = window.AppPermissions?.getAuthHeaders?.();
  if (shared && typeof shared === 'object' && Object.keys(shared).length) return shared;
  const role = getStoredRole();
  const token = localStorage.getItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
  if (!role || !token) return {};
  return { 'x-user-role': role, 'x-user-token': token };
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
  if (globalToastTimer) clearTimeout(globalToastTimer);
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

function showAppContent() {
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.style.display = 'block';
  });
  const roleIndicator = document.getElementById('role-indicator');
  roleIndicator.style.display = 'inline-block';
  roleIndicator.textContent = `Role: ${userRole}`;
  document.getElementById('logout-link').style.display = 'inline-block';
  const switcher = document.getElementById('role-switcher');
  if (switcher) {
    const auth = getEmployeeAuthSession();
    employeeSessionRoles = Array.isArray(auth?.roles)
      ? auth.roles.filter((r) => ALLOWED_ROLES.includes(r))
      : [];
    if (employeeSessionRoles.length > 1) {
      switcher.innerHTML = employeeSessionRoles.map((r) => `<option value="${r}">Switch: ${r}</option>`).join('');
      switcher.value = userRole && employeeSessionRoles.includes(userRole) ? userRole : employeeSessionRoles[0];
      switcher.style.display = 'inline-block';
    } else {
      switcher.style.display = 'none';
      switcher.innerHTML = '';
    }
  }
  if (taskNotificationsBtn) taskNotificationsBtn.style.display = 'inline-block';
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
    renderTaskNotificationBadge(data.unread_count || 0);
  } catch (_error) {}
}

function initializeRole() {
  const auth = getEmployeeAuthSession();
  if (auth && Array.isArray(auth.roles) && auth.roles.length) {
    const storedRole = getStoredRole();
    const allowedAuthRoles = auth.roles.filter((r) => ALLOWED_ROLES.includes(r));
    if ((!storedRole || !allowedAuthRoles.includes(storedRole)) && allowedAuthRoles.length) {
      localStorage.setItem('userRole', allowedAuthRoles[0]);
    }
  }
  const role = getStoredRole();
  if (role) {
    userRole = role;
    showAppContent();
    return;
  }
  window.AppPermissions?.redirectToEmployeeLogin?.(window.location.pathname + (window.location.search || ''));
}

function logout() {
  const token = localStorage.getItem('employeeTransportToken');
  if (token) {
    fetch('/auth/logout', { method: 'POST', headers: { 'x-user-token': token } }).catch(() => {});
  }
  localStorage.removeItem('userRole');
  localStorage.removeItem('employeeAuth');
  localStorage.removeItem('employeeTransportToken');
  localStorage.removeItem('expenseToken');
  localStorage.removeItem('expenseUser');
  localStorage.removeItem('customerUsername');
  localStorage.removeItem('customerPassword');
  localStorage.removeItem('customerToken');
  localStorage.removeItem('adminSelectedCustomerUserId');
  userRole = null;
  if (taskNotificationPoll) clearInterval(taskNotificationPoll);
  window.location.href = '/';
}

function applyFilters() {
  const search = String(truckSearch.value || '').toLowerCase();
  const status = statusFilter.value;
  let filtered = rows.slice();
  if (status) filtered = filtered.filter((row) => row.status === status || row.current_status === status);
  if (search) filtered = filtered.filter((row) => String(row.truck_number || '').toLowerCase().includes(search));
  renderRows(filtered);
}

function renderActionButtons(row) {
  const actions = [];
  if ((userRole === 'Dispatch' || userRole === 'Admin') && !row.linked_trip_id && ['SUBMITTED', 'REVIEW_PENDING'].includes(row.status)) {
    actions.push(`<button class="workflow-btn" data-action="set-status" data-id="${row.id}" data-status="APPROVED">Approve</button>`);
    actions.push(`<button class="workflow-btn" data-action="set-status" data-id="${row.id}" data-status="REVIEW_PENDING">Review</button>`);
  }
  if ((userRole === 'Dispatch' || userRole === 'Admin') && !row.linked_trip_id && !['CANCELLED', 'EXPIRED', 'GATE_IN_DONE'].includes(row.status)) {
    actions.push(`<button class="workflow-btn danger" data-action="set-status" data-id="${row.id}" data-status="CANCELLED">Cancel</button>`);
  }
  if ((userRole === 'Gate' || userRole === 'Admin') && !row.linked_trip_id && row.status === 'APPROVED') {
    actions.push(`<button class="workflow-btn primary" data-action="gate-in" data-id="${row.id}">Mark Gate In</button>`);
  }
  if (!actions.length) return '-';
  return `<div class="workflow-row">${actions.join('')}</div>`;
}

function renderRows(data) {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) {
    table.innerHTML = data.map((row) => `
      <tr>
        <td>${escapeHtml(row.truck_number)}</td>
        <td>${escapeHtml(row.current_status || row.status)}</td>
        <td>${escapeHtml(row.customer_name || '-')}</td>
        <td>${escapeHtml(row.driver_name || '-')} / ${escapeHtml(row.driver_phone || '-')}</td>
        <td>${Number(row.expected_quantity_mt || 0).toFixed(3)}</td>
        <td>${escapeHtml([row.material_type, row.grade, row.condition, row.packing, row.location || row.trip_location].filter(Boolean).join(' / ') || '-')}</td>
        <td>${escapeHtml(row.submitted_by_username || row.submitted_by_name || '-')}</td>
        <td>${renderActionButtons(row)}</td>
      </tr>
    `).join('');
    mobileList.innerHTML = '';
  } else {
    table.innerHTML = '';
    mobileList.innerHTML = data.map((row) => `
      <article class="mobile-trip-card">
        <div class="mobile-trip-head">
          <div class="mobile-trip-truck">${escapeHtml(row.truck_number)}</div>
          <div>${escapeHtml(row.current_status || row.status)}</div>
        </div>
        <div class="mobile-trip-grid">
          <div><strong>Customer:</strong> ${escapeHtml(row.customer_name || '-')}</div>
          <div><strong>Driver:</strong> ${escapeHtml(row.driver_name || '-')}</div>
          <div><strong>Phone:</strong> ${escapeHtml(row.driver_phone || '-')}</div>
          <div><strong>Expected:</strong> ${Number(row.expected_quantity_mt || 0).toFixed(3)} MT</div>
          <div><strong>Material:</strong> ${escapeHtml(row.material_type || '-')}</div>
          <div><strong>Location:</strong> ${escapeHtml(row.location || row.trip_location || '-')}</div>
          <div><strong>ETA:</strong> ${formatDateTime(row.eta)}</div>
        </div>
        <div class="mobile-trip-actions">${renderActionButtons(row)}</div>
      </article>
    `).join('');
  }
  wireActionEvents();
}

async function loadExpectedTrucks() {
  try {
    const response = await fetch('/expected-trucks', {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to load expected trucks');
    }
    rows = await response.json();
    applyFilters();
  } catch (error) {
    showMessage(error.message, false);
  }
}

async function updateStatus(id, status) {
  try {
    const response = await fetch(`/expected-trucks/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ status })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to update status');
    }
    showMessage(`Expected truck marked ${status}`);
    await loadExpectedTrucks();
  } catch (error) {
    showMessage(error.message, false);
  }
}

async function markGateIn(id) {
  const gatePersonName = window.prompt('Enter Gate Operator Name (X/Y/Z):') || '';
  try {
    const response = await fetch(`/expected-trucks/${id}/mark-gate-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ gate_person_name: gatePersonName.trim() })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to mark gate in');
    }
    showMessage('Converted to live trip and moved to SENT_FOR_TARE_WEIGHT');
    await loadExpectedTrucks();
  } catch (error) {
    showMessage(error.message, false);
  }
}

function wireActionEvents() {
  document.querySelectorAll('[data-action="set-status"]').forEach((button) => {
    button.addEventListener('click', () => {
      updateStatus(button.dataset.id, button.dataset.status);
    });
  });
  document.querySelectorAll('[data-action="gate-in"]').forEach((button) => {
    button.addEventListener('click', () => {
      markGateIn(button.dataset.id);
    });
  });
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    const active = document.activeElement;
    const tag = (active?.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    loadExpectedTrucks();
  }, 10000);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('logout-link').addEventListener('click', (event) => {
    event.preventDefault();
    logout();
  });
  document.getElementById('role-switcher')?.addEventListener('change', (event) => {
    const selectedRole = event.target.value;
    const auth = getEmployeeAuthSession();
    const roles = Array.isArray(auth?.roles) ? auth.roles.filter((r) => ALLOWED_ROLES.includes(r)) : [];
    if (!selectedRole || !roles.includes(selectedRole)) return;
    localStorage.setItem('userRole', selectedRole);
    window.location.reload();
  });
  taskNotificationsBtn?.addEventListener('click', () => {
    window.location.href = '/';
  });
  document.getElementById('refresh-btn').addEventListener('click', loadExpectedTrucks);
  statusFilter.addEventListener('change', applyFilters);
  truckSearch.addEventListener('input', applyFilters);
  window.addEventListener('resize', applyFilters);

  initializeRole();
  loadTaskNotifications();
  if (taskNotificationPoll) clearInterval(taskNotificationPoll);
  taskNotificationPoll = setInterval(() => {
    if (!getStoredRole()) return;
    loadTaskNotifications();
  }, 15000);
  if (userRole) {
    loadExpectedTrucks();
    startAutoRefresh();
  }
});
