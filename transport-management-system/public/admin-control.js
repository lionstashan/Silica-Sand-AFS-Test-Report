const VALID_ROLES = Array.isArray(window.AppPermissions?.VALID_EMPLOYEE_ROLES)
  ? window.AppPermissions.VALID_EMPLOYEE_ROLES
  : ['Gate', 'Dispatch', 'Loading', 'Weighbridge', 'LAB', 'Expense', 'Accounts', 'Manager', 'Admin'];
const EMPLOYEE_TRANSPORT_TOKEN_KEY = 'employeeTransportToken';
let globalToastTimer = null;

function getAuthHeaders() {
  const role = localStorage.getItem('userRole');
  const token = localStorage.getItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    'x-user-role': role || '',
    'x-user-token': token || ''
  };
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

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_e) {}
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function showMessage(msg, ok = true) {
  const el = document.getElementById('admin-control-message');
  el.textContent = msg;
  el.style.color = ok ? '#047857' : '#b91c1c';
  showGlobalToast(msg, ok);
}

function showCustomerMessage(msg, ok = true) {
  const el = document.getElementById('customer-user-message');
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? '#047857' : '#b91c1c';
  showGlobalToast(msg, ok);
}

function showEmployeeModalMessage(msg, ok = true) {
  const el = document.getElementById('employee-modal-message');
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? '#047857' : '#b91c1c';
  showGlobalToast(msg, ok);
}

function showSettingsMessage(msg, ok = true) {
  const el = document.getElementById('settings-message');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = ok ? '#047857' : '#b91c1c';
  showGlobalToast(msg, ok);
}

function showReportBrandingMessage(msg, ok = true) {
  const el = document.getElementById('report-branding-message');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = ok ? '#047857' : '#b91c1c';
  showGlobalToast(msg, ok);
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

function setButtonBusy(button, busy, busyText = 'Processing...') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent || '';
    button.disabled = true;
    button.textContent = busyText;
    button.classList.add('is-busy');
  } else {
    button.disabled = false;
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    button.classList.remove('is-busy');
  }
}

function fmt(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

async function loadOverview() {
  const data = await api('/admin/control/overview');
  const cards = document.getElementById('overview-cards');
  cards.innerHTML = `
    <div class="summary-card"><h3>Active Transport Users</h3><p>${data.counts.users_active || 0}</p></div>
    <div class="summary-card"><h3>Active Expense Users</h3><p>${data.counts.expense_users_active || 0}</p></div>
    <div class="summary-card"><h3>Active Customer Users</h3><p>${data.counts.customer_users_active || 0}</p></div>
  `;
  document.getElementById('overview-flags').textContent =
    `Flags: ENABLE_USER_AUTH_V2=${data.flags.enableUserAuthV2} | ENABLE_ADMIN_PANEL_V2=${data.flags.enableAdminPanelV2} | ENABLE_LEGACY_PIN_AUTH=${data.flags.enableLegacyPinAuth}`;
  document.getElementById('overview-pins').textContent =
    `Current Role PINs: ${Object.entries(data.role_pins || {}).map(([k, v]) => `${k}=${v}`).join(' | ')}`;
}

let employeesCache = [];
let customerUsersCache = [];
let masterValuesCache = [];
let employeeAutoSeedAttempted = false;
let customerEditUsername = null;

async function loadEmployees() {
  try {
    const rows = await api('/admin/control/employees');
    employeesCache = Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (!String(error.message || '').includes('404')) throw error;
    const fallback = await api('/admin/control/users');
    employeesCache = (Array.isArray(fallback) ? fallback : []).map((r) => ({
      username: r.username,
      full_name: r.full_name,
      is_active: r.is_active,
      updated_at: r.updated_at,
      transport_roles: Array.isArray(r.roles) ? r.roles : [],
      expense_role: null
    }));
    showMessage('Using fallback users list. Restart server to enable full employee endpoint.', false);
  }

  // Ensure all non-customer operational users are visible as employees,
  // even when transport users table is empty.
  try {
    const expenseRows = await api('/admin/control/expense-users');
    const byUsername = new Map(
      (Array.isArray(employeesCache) ? employeesCache : []).map((r) => [String(r.username || '').toLowerCase(), r])
    );
    (Array.isArray(expenseRows) ? expenseRows : []).forEach((r) => {
      const key = String(r.username || '').toLowerCase();
      if (!key) return;
      if (byUsername.has(key)) {
        const existing = byUsername.get(key);
        existing.expense_role = r.role || existing.expense_role || null;
        existing.is_active = Boolean(existing.is_active) && Boolean(r.is_active);
        existing.updated_at = (new Date(existing.updated_at).getTime() >= new Date(r.updated_at).getTime())
          ? existing.updated_at
          : r.updated_at;
      } else {
        byUsername.set(key, {
          username: r.username,
          full_name: r.full_name,
          is_active: r.is_active,
          updated_at: r.updated_at,
          transport_roles: [],
          expense_role: r.role || null
        });
      }
    });
    employeesCache = Array.from(byUsername.values()).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  } catch (_e) {
    // If expense endpoint fails, keep whatever employee data we already have.
  }

  if (!employeesCache.length && !employeeAutoSeedAttempted) {
    employeeAutoSeedAttempted = true;
    try {
      await api('/admin/control/seed-current-data', { method: 'POST' });
      const retryRows = await api('/admin/control/employees');
      employeesCache = Array.isArray(retryRows) ? retryRows : [];
      showMessage('Employees were empty. Seeded current data and refreshed.', false);
    } catch (_seedErr) {
      // no-op; keep empty state and render gracefully
    }
  }

  document.getElementById('employees-table').innerHTML = employeesCache.map((r) => `
    <tr>
      <td>${r.username || '-'}</td>
      <td>${r.full_name || '-'}</td>
      <td title="${Array.isArray(r.transport_roles) ? r.transport_roles.join(', ') : '-'}">
        <div style="white-space: normal; word-break: break-word; max-width: 280px;">
          ${Array.isArray(r.transport_roles) && r.transport_roles.length ? r.transport_roles.join(', ') : '-'}
        </div>
      </td>
      <td>${r.expense_role || '-'}</td>
      <td>${r.is_active ? 'Active' : 'Inactive'}</td>
      <td>${fmt(r.updated_at)}</td>
      <td><button type="button" data-edit-employee="${r.username}">Edit</button></td>
    </tr>
  `).join('') || '<tr><td colspan="7">No employees found. Click "Seed Current Data Into Control Panel" and refresh.</td></tr>';

  document.querySelectorAll('[data-edit-employee]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const username = btn.getAttribute('data-edit-employee');
      const row = employeesCache.find((r) => r.username === username);
      openEmployeeModal(row || null);
    });
  });
}

async function loadCustomerUsers() {
  const rows = await api('/admin/control/customer-users');
  customerUsersCache = Array.isArray(rows) ? rows : [];
  document.getElementById('customer-users-table').innerHTML = customerUsersCache.map((r) => `
    <tr>
      <td>${r.customer_name || '-'}</td>
      <td>${r.display_name || '-'}</td>
      <td>${r.username || '-'}</td>
      <td>${r.is_active ? 'Active' : 'Inactive'}</td>
      <td><button type="button" data-edit-customer-user="${r.username}">Edit</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5">No customer users</td></tr>';

  document.querySelectorAll('[data-edit-customer-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const username = btn.getAttribute('data-edit-customer-user');
      const row = customerUsersCache.find((r) => r.username === username);
      if (!row) return;
      customerEditUsername = row.username;
      document.getElementById('cu-customer').value = row.customer_name || '';
      document.getElementById('cu-display').value = row.display_name || '';
      document.getElementById('cu-username').value = row.username || '';
      document.getElementById('cu-username').readOnly = true;
      document.getElementById('cu-password').value = '';
      document.getElementById('cu-active').value = row.is_active ? 'true' : 'false';
      showMessage(`Editing customer user: ${row.username}`);
      showCustomerMessage(`Editing customer user: ${row.username}`);
      window.scrollTo({ top: document.getElementById('customer-user-form').offsetTop - 80, behavior: 'smooth' });
    });
  });
}

async function loadMasterValues() {
  const type = document.getElementById('m-type').value;
  const priceWrap = document.getElementById('m-price-wrap');
  if (priceWrap) priceWrap.style.display = type === 'grades' ? '' : 'none';
  let rows = [];
  try {
    rows = await api(`/admin/control/masters/${encodeURIComponent(type)}`);
  } catch (error) {
    showMessage(`Master load failed for "${type}": ${error.message}`, false);
    document.getElementById('master-table').innerHTML = '<tr><td colspan="6">Failed to load values</td></tr>';
    return;
  }
  masterValuesCache = Array.isArray(rows) ? rows : [];
  document.getElementById('master-table').innerHTML = masterValuesCache.map((r) => `
    <tr>
      <td>${r.master_type}</td>
      <td>${r.value}</td>
      <td>${r.master_type === 'grades' ? (r.metadata_json?.price_per_mt ?? '-') : '-'}</td>
      <td>${r.is_active ? 'Active' : 'Inactive'}</td>
      <td>${fmt(r.updated_at)}</td>
      <td><button type="button" data-edit-master-value="${encodeURIComponent(r.value)}">Edit</button></td>
    </tr>
  `).join('') || `<tr><td colspan="6">No values for "${type}". Click "Seed Current Data Into Control Panel" once, then refresh.</td></tr>`;

  document.querySelectorAll('[data-edit-master-value]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = decodeURIComponent(btn.getAttribute('data-edit-master-value'));
      const row = masterValuesCache.find((r) => r.value === value);
      if (!row) return;
      document.getElementById('m-type').value = row.master_type;
      document.getElementById('m-value').value = row.value;
      document.getElementById('m-price').value = row.master_type === 'grades' ? (row.metadata_json?.price_per_mt ?? '') : '';
      document.getElementById('m-active').value = row.is_active ? 'true' : 'false';
      showMessage(`Editing master value: ${row.value}`);
      window.scrollTo({ top: document.getElementById('master-form').offsetTop - 80, behavior: 'smooth' });
    });
  });
}

async function refreshAll() {
  await Promise.all([
    loadOverview(),
    loadEmployees(),
    loadCustomerUsers(),
    loadMasterValues(),
    loadSettings(),
    loadReportBranding()
  ]);
}

async function loadSettings() {
  try {
    const data = await api('/admin/control/settings');
    document.getElementById('s-gst').value = data.default_gst_percent ?? '';
    showSettingsMessage('');
  } catch (error) {
    showSettingsMessage(error.message, false);
  }
}

async function loadReportBranding() {
  try {
    const data = await api('/admin/control/report-branding');
    document.getElementById('rb-company-name').value = data.company_name || '';
    document.getElementById('rb-logo-url').value = data.logo_url || '';
    document.getElementById('rb-address').value = data.address || '';
    document.getElementById('rb-phones').value = data.contact_phones || '';
    document.getElementById('rb-email').value = data.email || '';
    document.getElementById('rb-website').value = data.website || '';
    document.getElementById('rb-gst').value = data.gst_no || '';
    document.getElementById('rb-cin').value = data.cin || '';
    document.getElementById('rb-footer').value = data.footer_text || '';
    document.getElementById('rb-sign-lab').value = data.signature_lab || '';
    document.getElementById('rb-sign-qa').value = data.signature_qa || '';
    showReportBrandingMessage('');
  } catch (error) {
    showReportBrandingMessage(error.message || 'Failed to load report branding', false);
  }
}

function setSelectedTransportRoles(roles) {
  const container = document.getElementById('e-transport-roles');
  if (!container) return;
  const wanted = new Set(Array.isArray(roles) ? roles : []);
  Array.from(container.querySelectorAll('input[type="checkbox"]')).forEach((checkbox) => {
    checkbox.checked = wanted.has(checkbox.value);
  });
}

function getSelectedTransportRoles() {
  const container = document.getElementById('e-transport-roles');
  if (!container) return [];
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((checkbox) => checkbox.value);
}

function openEmployeeModal(row) {
  document.getElementById('employee-modal').style.display = 'flex';
  document.getElementById('employee-modal-title').textContent = row ? `Edit: ${row.username}` : 'Add Employee';
  document.getElementById('e-username').value = row?.username || '';
  document.getElementById('e-username').readOnly = !!row;
  document.getElementById('e-full-name').value = row?.full_name || '';
  document.getElementById('e-password').value = '';
  setSelectedTransportRoles(Array.isArray(row?.transport_roles) ? row.transport_roles : []);
  document.getElementById('e-expense-role').value = row?.expense_role || '';
  document.getElementById('e-active').value = row?.is_active === false ? 'false' : 'true';
  showEmployeeModalMessage('');
  setTimeout(() => {
    document.getElementById('e-full-name')?.focus();
  }, 0);
}

function closeEmployeeModal() {
  document.getElementById('employee-modal').style.display = 'none';
}

async function init() {
  if (!window.AppPermissions?.requireEmployeeSession?.(window.location.pathname + (window.location.search || ''))) {
    return;
  }
  const role = localStorage.getItem('userRole');
  document.getElementById('role-indicator').textContent = `Role: ${role || '-'}`;
  const roleSwitcher = document.getElementById('role-switcher');
  const auth = getEmployeeAuthSession();
  const roles = Array.isArray(auth?.roles) ? auth.roles.filter((r) => VALID_ROLES.includes(r)) : [];
  if (roleSwitcher) {
    if (roles.length > 1) {
      roleSwitcher.innerHTML = roles.map((r) => `<option value="${r}">Switch: ${r}</option>`).join('');
      roleSwitcher.value = role && roles.includes(role) ? role : roles[0];
      roleSwitcher.style.display = 'inline-block';
    } else {
      roleSwitcher.style.display = 'none';
      roleSwitcher.innerHTML = '';
    }
    roleSwitcher.addEventListener('change', (event) => {
      const selectedRole = event.target.value;
      if (!selectedRole || !roles.includes(selectedRole)) return;
      localStorage.setItem('userRole', selectedRole);
      if (selectedRole !== 'Admin') {
        window.location.href = '/';
        return;
      }
      window.location.reload();
    });
  }
  if (role !== 'Admin') {
    window.AppPermissions?.showNoAccess?.('You do not have access to Control Panel.');
    showMessage('Admin login required. Please login from main page as Admin first.', false);
    return;
  }

  document.getElementById('employee-add-btn').addEventListener('click', () => openEmployeeModal(null));
  document.getElementById('employee-refresh-btn').addEventListener('click', async () => {
    const btn = document.getElementById('employee-refresh-btn');
    try {
      setButtonBusy(btn, true, 'Refreshing...');
      await loadEmployees();
      showMessage('Employees refreshed');
    } catch (error) {
      showMessage(error.message, false);
    } finally {
      setButtonBusy(btn, false);
    }
  });
  document.getElementById('employee-modal-close').addEventListener('click', closeEmployeeModal);
  document.getElementById('employee-modal').addEventListener('click', (event) => {
    if (event.target.id === 'employee-modal') closeEmployeeModal();
  });

  document.getElementById('employee-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('employee-save-btn');
    if (saveBtn) saveBtn.disabled = true;
    try {
      const roles = getSelectedTransportRoles();
      const expenseRole = document.getElementById('e-expense-role').value || null;
      if (!roles.length && !expenseRole) {
        throw new Error('Select at least one Transport role or one Expense role');
      }
      await api('/admin/control/employees', {
        method: 'POST',
        body: JSON.stringify({
          username: document.getElementById('e-username').value.trim(),
          full_name: document.getElementById('e-full-name').value.trim(),
          password: document.getElementById('e-password').value.trim() || null,
          transport_roles: roles,
          expense_role: expenseRole,
          is_active: document.getElementById('e-active').value === 'true'
        })
      });
      showEmployeeModalMessage('Saved successfully');
      closeEmployeeModal();
      showMessage('Employee saved');
      try {
        await refreshAll();
      } catch (refreshError) {
        showMessage(`Employee saved, but refresh failed: ${refreshError.message}`, false);
      }
    } catch (error) {
      showEmployeeModalMessage(error.message, false);
      showMessage(error.message, false);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  document.getElementById('customer-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formBtn = e.target.querySelector('button[type="submit"]');
    if (formBtn) formBtn.disabled = true;
    try {
      const usernameInput = document.getElementById('cu-username');
      const payloadUsername = customerEditUsername || usernameInput.value.trim();
      await api('/admin/control/customer-users', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: document.getElementById('cu-customer').value.trim(),
          display_name: document.getElementById('cu-display').value.trim() || null,
          username: payloadUsername,
          password: document.getElementById('cu-password').value.trim() || null,
          is_active: document.getElementById('cu-active').value === 'true'
        })
      });
      customerEditUsername = null;
      usernameInput.readOnly = false;
      document.getElementById('customer-user-form').reset();
      document.getElementById('cu-active').value = 'true';
      showCustomerMessage('Customer user saved');
      showMessage('Customer user saved');
      await refreshAll();
    } catch (error) {
      showCustomerMessage(error.message, false);
      showMessage(error.message, false);
    } finally {
      if (formBtn) formBtn.disabled = false;
    }
  });

  document.getElementById('master-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const type = document.getElementById('m-type').value;
      const priceRaw = document.getElementById('m-price').value;
      await api(`/admin/control/masters/${encodeURIComponent(document.getElementById('m-type').value)}`, {
        method: 'POST',
        body: JSON.stringify({
          value: document.getElementById('m-value').value.trim(),
          is_active: document.getElementById('m-active').value === 'true',
          price_per_mt: type === 'grades' ? (priceRaw === '' ? null : Number(priceRaw)) : null
        })
      });
      showMessage('Master value saved');
      document.getElementById('m-price').value = '';
      await loadMasterValues();
      await loadOverview();
    } catch (error) {
      showMessage(error.message, false);
    }
  });

  document.getElementById('m-type').addEventListener('change', async () => {
    await loadMasterValues();
  });

  document.getElementById('master-refresh-btn').addEventListener('click', async () => {
    const btn = document.getElementById('master-refresh-btn');
    try {
      setButtonBusy(btn, true, 'Refreshing...');
      await loadMasterValues();
      showMessage('Master values refreshed');
    } catch (error) {
      showMessage(error.message, false);
    } finally {
      setButtonBusy(btn, false);
    }
  });

  document.getElementById('seed-sync-btn').addEventListener('click', async () => {
    const btn = document.getElementById('seed-sync-btn');
    try {
      setButtonBusy(btn, true, 'Syncing...');
      await api('/admin/control/seed-current-data', { method: 'POST' });
      showMessage('Current data seeded into control panel');
      await refreshAll();
    } catch (error) {
      showMessage(error.message, false);
    } finally {
      setButtonBusy(btn, false);
    }
  });

  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const gstRaw = document.getElementById('s-gst').value;
      await api('/admin/control/settings', {
        method: 'POST',
        body: JSON.stringify({
          default_gst_percent: gstRaw === '' ? null : Number(gstRaw)
        })
      });
      showSettingsMessage('Settings saved');
      showMessage('Settings saved');
    } catch (error) {
      showSettingsMessage(error.message, false);
      showMessage(error.message, false);
    }
  });

  document.getElementById('report-branding-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/admin/control/report-branding', {
        method: 'POST',
        body: JSON.stringify({
          company_name: document.getElementById('rb-company-name').value.trim(),
          logo_url: document.getElementById('rb-logo-url').value.trim(),
          address: document.getElementById('rb-address').value.trim(),
          contact_phones: document.getElementById('rb-phones').value.trim(),
          email: document.getElementById('rb-email').value.trim(),
          website: document.getElementById('rb-website').value.trim(),
          gst_no: document.getElementById('rb-gst').value.trim(),
          cin: document.getElementById('rb-cin').value.trim(),
          footer_text: document.getElementById('rb-footer').value.trim(),
          signature_lab: document.getElementById('rb-sign-lab').value.trim(),
          signature_qa: document.getElementById('rb-sign-qa').value.trim()
        })
      });
      showReportBrandingMessage('Report branding saved');
      showMessage('Report branding saved');
    } catch (error) {
      showReportBrandingMessage(error.message, false);
      showMessage(error.message, false);
    }
  });

  try {
    await refreshAll();
    showMessage('Control panel loaded');
  } catch (error) {
    showMessage(error.message, false);
  }
}

init();
