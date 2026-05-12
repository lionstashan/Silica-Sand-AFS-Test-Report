let userRole = null;
const VALID_ROLES = ['Gate', 'Dispatch', 'Loading', 'Weighbridge', 'Accounts', 'Manager', 'Admin'];
const rolePINs = {
  Gate: 'G8P2',
  Weighbridge: 'W3K7',
  Dispatch: 'D9M4',
  Loading: 'L5Q8',
  Accounts: 'A6R1',
  Manager: 'M2N6',
  Admin: '2802'
};
const EMPLOYEE_TRANSPORT_TOKEN_KEY = 'employeeTransportToken';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStoredRole() {
  const storedRole = localStorage.getItem('userRole');
  return VALID_ROLES.includes(storedRole) ? storedRole : null;
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

function getCurrentRole() {
  const role = getStoredRole();
  userRole = role || null;
  return userRole;
}

function getAuthHeaders() {
  const role = getCurrentRole();
  if (!role) return {};
  const token = localStorage.getItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
  if (token) {
    return { 'x-user-role': role, 'x-user-token': token };
  }
  const pin = rolePINs[role];
  if (!pin) return {};
  return { 'x-user-role': role, 'x-user-pin': pin };
}

function logout() {
  localStorage.removeItem('userRole');
  localStorage.removeItem('employeeAuth');
  localStorage.removeItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
  window.location.href = '/';
}

function formatWeightMT(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function formatCurrencyINR(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderSalesKpis(summary = {}) {
  const cardsEl = document.getElementById('sales-kpi-cards');
  if (!cardsEl) return;
  const cards = [
    { label: 'Total Trips', value: Number(summary.total_trips || 0) },
    { label: 'Total Qty (MT)', value: formatWeightMT(summary.total_qty_mt || 0) },
    { label: 'Taxable (₹)', value: formatCurrencyINR(summary.total_taxable_amount || 0) },
    { label: 'GST (₹)', value: formatCurrencyINR(summary.total_gst_amount || 0) },
    { label: 'Total Sales (₹)', value: formatCurrencyINR(summary.total_sales_amount || 0) },
    { label: 'Avg Realization (₹/MT)', value: formatCurrencyINR(summary.avg_realization_per_mt || 0) }
  ];
  cardsEl.innerHTML = cards
    .map((card) => `<article class="summary-card card-light-blue"><h3>${escapeHtml(card.label)}</h3><p>${escapeHtml(String(card.value))}</p></article>`)
    .join('');
}

function renderSimpleAggregateTable(tableId, rows, nameKey) {
  const tableBody = document.getElementById(tableId);
  if (!tableBody) return;
  if (!Array.isArray(rows) || !rows.length) {
    tableBody.innerHTML = '<tr><td colspan="5">No data</td></tr>';
    return;
  }
  tableBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row[nameKey] || row.key || '-')}</td>
      <td>${Number(row.trips || 0)}</td>
      <td>${formatWeightMT(row.qty_mt || 0)}</td>
      <td>${formatCurrencyINR(row.total_amount || 0)}</td>
      <td>${formatCurrencyINR(row.avg_rate_per_mt || 0)}</td>
    </tr>
  `).join('');
}

function renderTrendTable(rows = []) {
  const tableBody = document.getElementById('sales-trend-table');
  if (!tableBody) return;
  if (!rows.length) {
    tableBody.innerHTML = '<tr><td colspan="4">No data</td></tr>';
    return;
  }
  tableBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.date || '-')}</td>
      <td>${Number(row.trips || 0)}</td>
      <td>${formatWeightMT(row.qty_mt || 0)}</td>
      <td>${formatCurrencyINR(row.total_amount || 0)}</td>
    </tr>
  `).join('');
}

function renderBarChart(containerId, rows = [], labelKey = 'key') {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!Array.isArray(rows) || !rows.length) {
    container.innerHTML = '<div class="sales-empty">No data</div>';
    return;
  }
  const topRows = rows.slice(0, 8);
  const maxValue = topRows.reduce((acc, row) => Math.max(acc, Number(row.total_amount || 0)), 0) || 1;
  container.innerHTML = topRows.map((row) => {
    const label = row[labelKey] || row.key || '-';
    const value = Number(row.total_amount || 0);
    const pct = Math.max(3, Math.round((value / maxValue) * 100));
    return `
      <div class="sales-bar-row">
        <div class="sales-bar-label" title="${escapeHtml(String(label))}">${escapeHtml(String(label))}</div>
        <div class="sales-bar-track"><div class="sales-bar-fill" style="width:${pct}%"></div></div>
        <div class="sales-bar-value">₹ ${escapeHtml(formatCurrencyINR(value))}</div>
      </div>
    `;
  }).join('');
}

async function loadSalesAnalytics() {
  const fromDate = document.getElementById('sales-from-date')?.value || '';
  const toDate = document.getElementById('sales-to-date')?.value || '';
  const customer = document.getElementById('sales-customer-filter')?.value.trim() || '';
  const grade = document.getElementById('sales-grade-filter')?.value.trim() || '';
  const material = document.getElementById('sales-material-filter')?.value.trim() || '';
  const statusScope = document.getElementById('sales-status-scope')?.value || 'BILLED_ONLY';
  const query = new URLSearchParams();
  if (fromDate) query.set('from_date', fromDate);
  if (toDate) query.set('to_date', toDate);
  if (customer) query.set('customer', customer);
  if (grade) query.set('grade', grade);
  if (material) query.set('material', material);
  if (statusScope) query.set('status_scope', statusScope);

  const loadBtn = document.getElementById('sales-load-btn');
  if (loadBtn) loadBtn.disabled = true;
  try {
    const response = await fetch(`/accounts/sales-analytics?${query.toString()}`, { headers: getAuthHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Failed to load sales analytics');
    renderSalesKpis(payload.summary || {});
    renderTrendTable(payload.trend || []);
    renderBarChart('sales-trend-chart', payload.trend || [], 'date');
    renderBarChart('sales-grade-chart', payload.grade_wise || [], 'key');
    renderBarChart('sales-customer-chart', payload.customer_wise || [], 'key');
    renderBarChart('sales-material-chart', payload.material_wise || [], 'key');
    renderSimpleAggregateTable('sales-grade-table', payload.grade_wise || [], 'key');
    renderSimpleAggregateTable('sales-customer-table', payload.customer_wise || [], 'key');
    renderSimpleAggregateTable('sales-material-table', payload.material_wise || [], 'key');
  } catch (error) {
    alert(error.message || 'Failed to load sales analytics');
    renderBarChart('sales-trend-chart', [], 'date');
    renderBarChart('sales-grade-chart', [], 'key');
    renderBarChart('sales-customer-chart', [], 'key');
    renderBarChart('sales-material-chart', [], 'key');
  } finally {
    if (loadBtn) loadBtn.disabled = false;
  }
}

function initializeAccess() {
  const employeeAuth = getEmployeeAuthSession();
  if (employeeAuth && Array.isArray(employeeAuth.roles) && employeeAuth.roles.length) {
    const storedRole = getStoredRole();
    if (!storedRole || !employeeAuth.roles.includes(storedRole)) {
      localStorage.setItem('userRole', employeeAuth.roles[0]);
    }
  }
  const role = getCurrentRole();
  if (!role) {
    window.location.href = '/';
    return false;
  }
  if (!['Accounts', 'Admin', 'Manager'].includes(role)) {
    window.location.href = '/dashboard';
    return false;
  }
  const roleIndicator = document.getElementById('role-indicator');
  if (roleIndicator) {
    roleIndicator.style.display = 'inline-block';
    roleIndicator.textContent = `Role: ${role}`;
  }
  const logoutLink = document.getElementById('logout-link');
  if (logoutLink) logoutLink.style.display = 'inline-block';

  const roleSwitcher = document.getElementById('role-switcher');
  const roles = Array.isArray(employeeAuth?.roles) ? employeeAuth.roles.filter((r) => VALID_ROLES.includes(r)) : [];
  if (roleSwitcher) {
    if (roles.length > 1) {
      roleSwitcher.innerHTML = roles.map((r) => `<option value="${r}">Switch: ${r}</option>`).join('');
      roleSwitcher.value = role;
      roleSwitcher.style.display = 'inline-block';
    } else {
      roleSwitcher.style.display = 'none';
    }
  }
  return true;
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!initializeAccess()) return;
  document.getElementById('logout-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    logout();
  });
  document.getElementById('role-switcher')?.addEventListener('change', (event) => {
    const selectedRole = event.target.value;
    const employeeAuth = getEmployeeAuthSession();
    const roles = Array.isArray(employeeAuth?.roles) ? employeeAuth.roles : [];
    if (!selectedRole || !roles.includes(selectedRole)) return;
    localStorage.setItem('userRole', selectedRole);
    if (['Accounts', 'Admin', 'Manager'].includes(selectedRole)) {
      window.location.reload();
    } else {
      window.location.href = '/dashboard';
    }
  });
  document.getElementById('sales-load-btn')?.addEventListener('click', loadSalesAnalytics);
  await loadSalesAnalytics();
});

