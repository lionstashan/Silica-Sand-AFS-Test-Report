let userRole = null;
const VALID_ROLES = Array.isArray(window.AppPermissions?.VALID_EMPLOYEE_ROLES)
  ? window.AppPermissions.VALID_EMPLOYEE_ROLES
  : ['Gate', 'Dispatch', 'Loading', 'Weighbridge', 'LAB', 'Expense', 'Accounts', 'Manager', 'Admin'];
const EMPLOYEE_TRANSPORT_TOKEN_KEY = 'employeeTransportToken';
const ANALYTICS_LAYOUT_KEY = 'accountsAnalyticsLayoutV1';
const ANALYTICS_FILTERS_KEY = 'accountsAnalyticsFiltersV1';
const ANALYTICS_SAVED_VIEWS_KEY = 'accountsAnalyticsSavedViewsV1';
let activeAnalyticsTab = 'overview';
let analyticsLayout = { hidden: {}, order: {} };
let lastAnalyticsPayload = null;

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
  if (!token) return {};
  return { 'x-user-role': role, 'x-user-token': token };
}

function logout() {
  const token = localStorage.getItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
  if (token) {
    fetch('/auth/logout', { method: 'POST', headers: { 'x-user-token': token } }).catch(() => {});
  }
  localStorage.removeItem('userRole');
  localStorage.removeItem('employeeAuth');
  localStorage.removeItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
  localStorage.removeItem('expenseToken');
  localStorage.removeItem('expenseUser');
  localStorage.removeItem('customerUsername');
  localStorage.removeItem('customerPassword');
  localStorage.removeItem('customerToken');
  localStorage.removeItem('adminSelectedCustomerUserId');
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

function getCurrentFilterState() {
  return {
    from_date: document.getElementById('sales-from-date')?.value || '',
    to_date: document.getElementById('sales-to-date')?.value || '',
    customer: document.getElementById('sales-customer-filter')?.value.trim() || '',
    grade: document.getElementById('sales-grade-filter')?.value.trim() || '',
    material: document.getElementById('sales-material-filter')?.value.trim() || '',
    afs_min: document.getElementById('sales-afs-min-filter')?.value.trim() || '',
    afs_max: document.getElementById('sales-afs-max-filter')?.value.trim() || '',
    afs_band: document.getElementById('sales-afs-band-filter')?.value || '',
    status_scope: document.getElementById('sales-status-scope')?.value || 'BILLED_ONLY'
  };
}

function applyFilterState(filters = {}) {
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
  };
  setValue('sales-from-date', filters.from_date);
  setValue('sales-to-date', filters.to_date);
  setValue('sales-customer-filter', filters.customer);
  setValue('sales-grade-filter', filters.grade);
  setValue('sales-material-filter', filters.material);
  setValue('sales-afs-min-filter', filters.afs_min);
  setValue('sales-afs-max-filter', filters.afs_max);
  setValue('sales-afs-band-filter', filters.afs_band);
  setValue('sales-status-scope', filters.status_scope || 'BILLED_ONLY');
}

function saveCurrentFilters() {
  localStorage.setItem(ANALYTICS_FILTERS_KEY, JSON.stringify(getCurrentFilterState()));
}

function loadSavedFilters() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ANALYTICS_FILTERS_KEY) || '{}');
    if (parsed && typeof parsed === 'object') applyFilterState(parsed);
  } catch (_e) {
    // ignore parse failures
  }
}

function getSavedViews() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ANALYTICS_SAVED_VIEWS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.name === 'string' && item.filters);
  } catch (_e) {
    return [];
  }
}

function persistSavedViews(views) {
  localStorage.setItem(ANALYTICS_SAVED_VIEWS_KEY, JSON.stringify(views));
}

function refreshSavedViewsDropdown() {
  const select = document.getElementById('analytics-view-select');
  if (!select) return;
  const views = getSavedViews();
  const options = ['<option value="">Saved Views</option>']
    .concat(views.map((view, index) => `<option value="${index}">${escapeHtml(view.name)}</option>`));
  select.innerHTML = options.join('');
}

function loadAnalyticsLayout() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ANALYTICS_LAYOUT_KEY) || '{}');
    analyticsLayout = {
      hidden: parsed && parsed.hidden && typeof parsed.hidden === 'object' ? parsed.hidden : {},
      order: parsed && parsed.order && typeof parsed.order === 'object' ? parsed.order : {}
    };
  } catch (_e) {
    analyticsLayout = { hidden: {}, order: {} };
  }
}

function saveAnalyticsLayout() {
  localStorage.setItem(ANALYTICS_LAYOUT_KEY, JSON.stringify(analyticsLayout));
}

function getAnalyticsModules() {
  return Array.from(document.querySelectorAll('#analytics-modules .analytics-module'));
}

function getModuleMeta(moduleEl) {
  return {
    id: moduleEl.getAttribute('data-module') || '',
    tab: moduleEl.getAttribute('data-tab') || 'overview',
    title: moduleEl.querySelector('h3')?.textContent?.trim() || 'Module'
  };
}

function applyAnalyticsModuleOrder() {
  const container = document.getElementById('analytics-modules');
  if (!container) return;
  const modules = getAnalyticsModules();
  const byTab = modules.reduce((acc, moduleEl) => {
    const meta = getModuleMeta(moduleEl);
    if (!acc[meta.tab]) acc[meta.tab] = [];
    acc[meta.tab].push({ meta, moduleEl });
    return acc;
  }, {});
  Object.entries(byTab).forEach(([tab, entries]) => {
    const preferred = Array.isArray(analyticsLayout.order[tab]) ? analyticsLayout.order[tab] : [];
    entries.sort((a, b) => {
      const ai = preferred.indexOf(a.meta.id);
      const bi = preferred.indexOf(b.meta.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    entries.forEach(({ moduleEl }) => container.appendChild(moduleEl));
    analyticsLayout.order[tab] = entries.map((entry) => entry.meta.id);
  });
  saveAnalyticsLayout();
}

function renderAnalyticsModuleControls() {
  const controlsWrap = document.getElementById('analytics-module-controls');
  if (!controlsWrap) return;
  const modules = getAnalyticsModules().filter((moduleEl) => getModuleMeta(moduleEl).tab === activeAnalyticsTab);
  if (!modules.length) {
    controlsWrap.innerHTML = '';
    return;
  }
  controlsWrap.innerHTML = modules.map((moduleEl) => {
    const meta = getModuleMeta(moduleEl);
    const checked = analyticsLayout.hidden[meta.id] ? '' : 'checked';
    return `<label class="analytics-module-toggle">
      <input type="checkbox" data-module-toggle="${escapeHtml(meta.id)}" ${checked} />
      ${escapeHtml(meta.title)}
    </label>`;
  }).join('');

  controlsWrap.querySelectorAll('input[data-module-toggle]').forEach((inputEl) => {
    inputEl.addEventListener('change', (event) => {
      const moduleId = event.target.getAttribute('data-module-toggle');
      analyticsLayout.hidden[moduleId] = !event.target.checked;
      saveAnalyticsLayout();
      applyAnalyticsTabVisibility();
    });
  });
}

function applyAnalyticsTabVisibility() {
  const modules = getAnalyticsModules();
  modules.forEach((moduleEl) => {
    const meta = getModuleMeta(moduleEl);
    const isTabActive = meta.tab === activeAnalyticsTab;
    const isHidden = !!analyticsLayout.hidden[meta.id];
    moduleEl.style.display = isTabActive && !isHidden ? '' : 'none';
  });
  renderAnalyticsModuleControls();
}

function moveAnalyticsModule(moduleEl, direction) {
  const meta = getModuleMeta(moduleEl);
  const tab = meta.tab;
  const currentOrder = Array.isArray(analyticsLayout.order[tab]) ? [...analyticsLayout.order[tab]] : [];
  if (!currentOrder.length) return;
  const index = currentOrder.indexOf(meta.id);
  if (index === -1) return;
  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= currentOrder.length) return;
  const swap = currentOrder[nextIndex];
  currentOrder[nextIndex] = currentOrder[index];
  currentOrder[index] = swap;
  analyticsLayout.order[tab] = currentOrder;
  saveAnalyticsLayout();
  applyAnalyticsModuleOrder();
  applyAnalyticsTabVisibility();
}

function bindAnalyticsModuleActions() {
  getAnalyticsModules().forEach((moduleEl) => {
    const upBtn = moduleEl.querySelector('.analytics-move-up');
    const downBtn = moduleEl.querySelector('.analytics-move-down');
    upBtn?.addEventListener('click', () => moveAnalyticsModule(moduleEl, 'up'));
    downBtn?.addEventListener('click', () => moveAnalyticsModule(moduleEl, 'down'));
  });
}

function activateAnalyticsTab(tab) {
  activeAnalyticsTab = tab;
  document.querySelectorAll('.analytics-tab').forEach((tabEl) => {
    tabEl.classList.toggle('active', tabEl.getAttribute('data-tab') === tab);
  });
  applyAnalyticsTabVisibility();
}

function bindAnalyticsTabs() {
  document.querySelectorAll('.analytics-tab').forEach((tabEl) => {
    tabEl.addEventListener('click', () => {
      const tab = tabEl.getAttribute('data-tab') || 'overview';
      activateAnalyticsTab(tab);
    });
  });
  document.getElementById('analytics-layout-reset')?.addEventListener('click', () => {
    analyticsLayout = { hidden: {}, order: {} };
    saveAnalyticsLayout();
    applyAnalyticsModuleOrder();
    applyAnalyticsTabVisibility();
  });
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
  const afsMin = document.getElementById('sales-afs-min-filter')?.value.trim() || '';
  const afsMax = document.getElementById('sales-afs-max-filter')?.value.trim() || '';
  const afsBand = document.getElementById('sales-afs-band-filter')?.value || '';
  const statusScope = document.getElementById('sales-status-scope')?.value || 'BILLED_ONLY';
  saveCurrentFilters();
  const query = new URLSearchParams();
  if (fromDate) query.set('from_date', fromDate);
  if (toDate) query.set('to_date', toDate);
  if (customer) query.set('customer', customer);
  if (grade) query.set('grade', grade);
  if (material) query.set('material', material);
  if (afsMin) query.set('afs_min', afsMin);
  if (afsMax) query.set('afs_max', afsMax);
  if (afsBand) query.set('afs_band', afsBand);
  if (statusScope) query.set('status_scope', statusScope);

  const loadBtn = document.getElementById('sales-load-btn');
  if (loadBtn) loadBtn.disabled = true;
  try {
    const response = await fetch(`/accounts/sales-analytics?${query.toString()}`, { headers: getAuthHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Failed to load sales analytics');
    lastAnalyticsPayload = payload;
    renderSalesKpis(payload.summary || {});
    renderTrendTable(payload.trend || []);
    renderBarChart('sales-trend-chart', payload.trend || [], 'date');
    renderBarChart('sales-grade-chart', payload.grade_wise || [], 'key');
    renderBarChart('sales-customer-chart', payload.customer_wise || [], 'key');
    renderBarChart('sales-material-chart', payload.material_wise || [], 'key');
    renderBarChart('sales-afs-band-chart', payload.afs_band_wise || [], 'key');
    renderSimpleAggregateTable('sales-grade-table', payload.grade_wise || [], 'key');
    renderSimpleAggregateTable('sales-customer-table', payload.customer_wise || [], 'key');
    renderSimpleAggregateTable('sales-material-table', payload.material_wise || [], 'key');
    renderSimpleAggregateTable('sales-afs-band-table', payload.afs_band_wise || [], 'key');
  } catch (error) {
    lastAnalyticsPayload = null;
    window.AppPermissions?.showModal?.('Action Required', error.message || 'Failed to load sales analytics');
    renderBarChart('sales-trend-chart', [], 'date');
    renderBarChart('sales-grade-chart', [], 'key');
    renderBarChart('sales-customer-chart', [], 'key');
    renderBarChart('sales-material-chart', [], 'key');
    renderBarChart('sales-afs-band-chart', [], 'key');
    renderSimpleAggregateTable('sales-afs-band-table', [], 'key');
  } finally {
    if (loadBtn) loadBtn.disabled = false;
  }
}

function csvEscape(value) {
  const input = String(value ?? '');
  const hardened = /^[=+\-@]/.test(input) ? `'${input}` : input;
  return `"${hardened.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows) {
  const csvContent = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportCurrentViewCsv() {
  if (!lastAnalyticsPayload) {
    window.AppPermissions?.showModal?.('Action Required', 'Load analytics data first, then export.');
    return;
  }
  const summary = lastAnalyticsPayload.summary || {};
  const trend = Array.isArray(lastAnalyticsPayload.trend) ? lastAnalyticsPayload.trend : [];
  const gradeWise = Array.isArray(lastAnalyticsPayload.grade_wise) ? lastAnalyticsPayload.grade_wise : [];
  const customerWise = Array.isArray(lastAnalyticsPayload.customer_wise) ? lastAnalyticsPayload.customer_wise : [];
  const materialWise = Array.isArray(lastAnalyticsPayload.material_wise) ? lastAnalyticsPayload.material_wise : [];
  const afsWise = Array.isArray(lastAnalyticsPayload.afs_band_wise) ? lastAnalyticsPayload.afs_band_wise : [];
  const filters = getCurrentFilterState();

  const rows = [
    ['Report', 'Accounts Sales Analytics Export'],
    ['Generated At (IST)', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
    [],
    ['Filters'],
    ['From Date', filters.from_date || ''],
    ['To Date', filters.to_date || ''],
    ['Customer', filters.customer || ''],
    ['Grade', filters.grade || ''],
    ['Material', filters.material || ''],
    ['AFS Min', filters.afs_min || ''],
    ['AFS Max', filters.afs_max || ''],
    ['AFS Band', filters.afs_band || ''],
    ['Status Scope', filters.status_scope || ''],
    [],
    ['Executive Summary'],
    ['Total Trips', summary.total_trips || 0],
    ['Total Qty (MT)', summary.total_qty_mt || 0],
    ['Taxable (INR)', summary.total_taxable_amount || 0],
    ['GST (INR)', summary.total_gst_amount || 0],
    ['Total Sales (INR)', summary.total_sales_amount || 0],
    ['Avg Realization (INR/MT)', summary.avg_realization_per_mt || 0],
    [],
    ['Trend'],
    ['Date', 'Trips', 'Qty (MT)', 'Amount (INR)'],
    ...trend.map((row) => [row.date || '', row.trips || 0, row.qty_mt || 0, row.total_amount || 0]),
    [],
    ['Grade-wise'],
    ['Grade', 'Trips', 'Qty (MT)', 'Amount (INR)', 'Avg Rate (INR/MT)'],
    ...gradeWise.map((row) => [row.key || '', row.trips || 0, row.qty_mt || 0, row.total_amount || 0, row.avg_rate_per_mt || 0]),
    [],
    ['Customer-wise'],
    ['Customer', 'Trips', 'Qty (MT)', 'Amount (INR)', 'Avg Rate (INR/MT)'],
    ...customerWise.map((row) => [row.key || '', row.trips || 0, row.qty_mt || 0, row.total_amount || 0, row.avg_rate_per_mt || 0]),
    [],
    ['Material-wise'],
    ['Material', 'Trips', 'Qty (MT)', 'Amount (INR)', 'Avg Rate (INR/MT)'],
    ...materialWise.map((row) => [row.key || '', row.trips || 0, row.qty_mt || 0, row.total_amount || 0, row.avg_rate_per_mt || 0]),
    [],
    ['AFS Band-wise'],
    ['AFS Band', 'Trips', 'Qty (MT)', 'Amount (INR)', 'Avg Rate (INR/MT)'],
    ...afsWise.map((row) => [row.key || '', row.trips || 0, row.qty_mt || 0, row.total_amount || 0, row.avg_rate_per_mt || 0])
  ];

  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadCsv(`accounts-sales-analytics-${dateStamp}.csv`, rows);
}

function initializeAccess() {
  if (!window.AppPermissions?.requireEmployeeSession?.(window.location.pathname + (window.location.search || ''))) {
    return false;
  }
  const employeeAuth = getEmployeeAuthSession();
  if (employeeAuth && Array.isArray(employeeAuth.roles) && employeeAuth.roles.length) {
    const storedRole = getStoredRole();
    if (!storedRole || !employeeAuth.roles.includes(storedRole)) {
      localStorage.setItem('userRole', employeeAuth.roles[0]);
    }
  }
  const role = getCurrentRole();
  if (!role) {
    window.AppPermissions?.redirectToEmployeeLogin?.(window.location.pathname + (window.location.search || ''));
    return false;
  }
  if (!['Accounts', 'Admin', 'Manager'].includes(role)) {
    window.AppPermissions?.showNoAccess?.('You do not have access to Sales Analytics.');
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
  loadSavedFilters();
  loadAnalyticsLayout();
  refreshSavedViewsDropdown();
  bindAnalyticsTabs();
  bindAnalyticsModuleActions();
  applyAnalyticsModuleOrder();
  activateAnalyticsTab('overview');
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
  document.getElementById('analytics-export-current')?.addEventListener('click', exportCurrentViewCsv);
  document.getElementById('analytics-save-view')?.addEventListener('click', () => {
    const name = window.prompt('Saved view name');
    if (!name || !name.trim()) return;
    const cleanName = name.trim().slice(0, 60);
    const views = getSavedViews();
    const existingIndex = views.findIndex((view) => view.name.toLowerCase() === cleanName.toLowerCase());
    const payload = { name: cleanName, filters: getCurrentFilterState(), updated_at: new Date().toISOString() };
    if (existingIndex >= 0) {
      views[existingIndex] = payload;
    } else {
      views.unshift(payload);
    }
    persistSavedViews(views.slice(0, 20));
    refreshSavedViewsDropdown();
    window.AppPermissions?.showToast?.(`Saved view: ${cleanName}`, 'success');
  });
  document.getElementById('analytics-view-select')?.addEventListener('change', async (event) => {
    const value = event.target.value;
    if (value === '') return;
    const views = getSavedViews();
    const picked = views[Number(value)];
    if (!picked) return;
    applyFilterState(picked.filters);
    saveCurrentFilters();
    await loadSalesAnalytics();
  });
  [
    'sales-from-date',
    'sales-to-date',
    'sales-customer-filter',
    'sales-grade-filter',
    'sales-material-filter',
    'sales-afs-min-filter',
    'sales-afs-max-filter',
    'sales-afs-band-filter',
    'sales-status-scope'
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', saveCurrentFilters);
    document.getElementById(id)?.addEventListener('blur', saveCurrentFilters);
  });
  await loadSalesAnalytics();
});
