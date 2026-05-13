const VIEW_ROLES = ['LAB', 'Dispatch', 'Weighbridge', 'Accounts', 'Manager', 'Admin'];
const EDIT_ROLES = ['LAB', 'Admin'];
const EMPLOYEE_TRANSPORT_TOKEN_KEY = 'employeeTransportToken';
const SIEVE_DEFAULTS = [
  [1, '10', '1700', 0, 5],
  [2, '20', '850', 0, 10],
  [3, '30', '600', 0, 20],
  [4, '40', '425', 0, 30],
  [5, '50', '300', 0, 40],
  [6, '70', '212', 0, 50],
  [7, '100', '150', 0, 70],
  [8, '140', '106', 0, 100],
  [9, '200', '75', 0, 140],
  [10, '270', '53', 0, 200],
  [11, '350', 'Sieve', 0, 300]
];

let currentRole = null;
let truckSuggestions = [];
let editingReportId = null;
let currentPage = 1;
let currentTotalPages = 1;
let currentReportRows = [];

function setButtonBusy(button, busy, busyText = 'Working...') {
  if (!button) return;
  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent;
  }
  button.disabled = busy;
  button.classList.toggle('is-busy', busy);
  button.textContent = busy ? busyText : button.dataset.defaultText;
}

function getAuthHeaders() {
  const role = localStorage.getItem('userRole');
  currentRole = role;
  const token = localStorage.getItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
  if (!role) return {};
  if (!token) return {};
  return { 'x-user-role': role, 'x-user-token': token };
}

function showMessage(msg, ok = true) {
  const el = document.getElementById('reports-message');
  el.textContent = msg;
  el.style.color = ok ? '#047857' : '#b91c1c';
}

function showErrorModal(message) {
  const modal = document.getElementById('reports-error-modal');
  const text = document.getElementById('reports-error-modal-text');
  if (!modal || !text) return;
  text.textContent = message || 'Something went wrong';
  modal.style.display = 'flex';
}

function closeErrorModal() {
  const modal = document.getElementById('reports-error-modal');
  if (modal) modal.style.display = 'none';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeDateInputValue(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function groupBy(items, keyFn, valueFn) {
  const map = new Map();
  (items || []).forEach((item) => {
    const key = keyFn(item);
    if (!key) return;
    const prev = map.get(key) || 0;
    map.set(key, prev + Number(valueFn(item) || 0));
  });
  return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
}

function renderMiniBars(targetId, rows = [], decimals = 2) {
  const el = document.getElementById(targetId);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<p class="empty-state">No data</p>';
    return;
  }
  const max = Math.max(...rows.map((r) => Number(r.value || 0)), 1);
  el.innerHTML = `<div class="mini-bars">${rows.map((row) => {
    const value = Number(row.value || 0);
    const width = Math.max(2, Math.round((value / max) * 100));
    return `
      <div class="mini-bar-row">
        <span class="mini-bar-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
        <span class="mini-bar-track"><span class="mini-bar-fill" style="width:${width}%"></span></span>
        <span class="mini-bar-value">${value.toFixed(decimals)}</span>
      </div>
    `;
  }).join('')}</div>`;
}

function renderReportCharts(rows) {
  const afsByDate = groupBy(
    rows,
    (r) => String(r.report_date || '').trim(),
    (r) => Number(r.total_afs || 0)
  ).sort((a, b) => a.label.localeCompare(b.label)).slice(-10);
  const sieveCount = groupBy(
    rows,
    (r) => String(r.sieve_size || '').trim() || '-',
    () => 1
  ).sort((a, b) => b.value - a.value).slice(0, 10);
  renderMiniBars('afs-trend-chart', afsByDate, 2);
  renderMiniBars('sieve-size-chart', sieveCount, 0);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function renderLineItems(rows = SIEVE_DEFAULTS) {
  const tbody = document.getElementById('line-items-body');
  tbody.innerHTML = rows.map((row, index) => {
    const item = Array.isArray(row)
      ? { sr: row[0], mesh_size: row[1], aperture: row[2], weight: row[3], multiplying_factor: row[4], product: (Number(row[3] || 0) * Number(row[4] || 0)) }
      : row;
    return `
      <tr>
        <td>${item.sr || index + 1}</td>
        <td><input data-key="mesh_size" data-idx="${index}" value="${escapeHtml(item.mesh_size)}" /></td>
        <td><input data-key="aperture" data-idx="${index}" value="${escapeHtml(item.aperture)}" /></td>
        <td><input data-key="weight" data-idx="${index}" type="number" step="0.01" value="${Number(item.weight || 0)}" /></td>
        <td><input data-key="multiplying_factor" data-idx="${index}" type="number" step="0.01" value="${Number(item.multiplying_factor || 0)}" /></td>
        <td data-product="${index}">${Number(item.product || 0).toFixed(2)}</td>
      </tr>
    `;
  }).join('');
  tbody.querySelectorAll('input').forEach((input) => input.addEventListener('input', computeTotals));
  computeTotals();
}

function collectLineItems() {
  const rows = [];
  const rowEls = document.querySelectorAll('#line-items-body tr');
  rowEls.forEach((tr) => {
    const item = {};
    tr.querySelectorAll('input').forEach((input) => {
      item[input.getAttribute('data-key')] = input.value;
    });
    rows.push(item);
  });
  return rows;
}

function computeTotals() {
  const multiplier = Number(document.getElementById('r-afs-mult').value || 1) || 1;
  const items = collectLineItems();
  let totalQty = 0;
  let totalProduct = 0;
  items.forEach((item, idx) => {
    const w = Number(item.weight || 0);
    const f = Number(item.multiplying_factor || 0);
    const p = w * f;
    totalQty += w;
    totalProduct += p;
    const productCell = document.querySelector(`[data-product="${idx}"]`);
    if (productCell) productCell.textContent = p.toFixed(2);
  });
  const afs = totalQty > 0 ? (totalProduct / totalQty) * multiplier : 0;
  document.getElementById('total-qty').textContent = totalQty.toFixed(2);
  document.getElementById('total-product').textContent = totalProduct.toFixed(2);
  document.getElementById('total-afs').textContent = afs.toFixed(2);
}

function applyTruckSuggestion(truck) {
  if (!truck) {
    document.getElementById('r-trip-id').value = '';
    document.getElementById('r-customer').value = '';
    document.getElementById('r-loading-point').value = '';
    document.getElementById('r-material').value = '';
    document.getElementById('r-grade').value = '';
    return;
  }
  document.getElementById('r-trip-id').value = truck.id || '';
  document.getElementById('r-customer').value = truck.customer_name || '';
  document.getElementById('r-loading-point').value = truck.loading_point || '';
  document.getElementById('r-material').value = truck.material_type || '';
  document.getElementById('r-grade').value = truck.grade || '';
}

async function loadMeta() {
  const [labUsers, loadingPoints, trucks] = await Promise.all([
    api('/api/reports/lab-users'),
    api('/api/reports/loading-points'),
    api('/api/reports/truck-suggestions')
  ]);
  truckSuggestions = Array.isArray(trucks) ? trucks : [];
  const labSelect = document.getElementById('r-lab-user');
  labSelect.innerHTML = (labUsers || []).map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  const lpSelect = document.getElementById('r-loading-point');
  lpSelect.innerHTML = ['<option value="">Select</option>', ...(loadingPoints || []).map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)].join('');
  const dl = document.getElementById('truck-options');
  dl.innerHTML = truckSuggestions.map((t) => `<option value="${escapeHtml(t.truck_number)}"></option>`).join('');
}

async function submitReport() {
  if (!EDIT_ROLES.includes(currentRole)) {
    showMessage('Only LAB/Admin can create reports', false);
    return;
  }
  const payload = {
    report_date: normalizeDateInputValue(document.getElementById('r-date').value) || new Date().toISOString().slice(0, 10),
    truck_number: document.getElementById('r-truck').value.trim(),
    trip_id: document.getElementById('r-trip-id').value ? Number(document.getElementById('r-trip-id').value) : null,
    is_generic: document.getElementById('r-generic').value === 'true',
    customer_name: document.getElementById('r-customer').value.trim(),
    loading_point: document.getElementById('r-loading-point').value,
    material_type: document.getElementById('r-material').value.trim(),
    grade: document.getElementById('r-grade').value.trim(),
    sieve_size: document.getElementById('r-sieve-size').value.trim(),
    afs_reference: document.getElementById('r-afs-ref').value.trim(),
    afs_multiplier: Number(document.getElementById('r-afs-mult').value || 1),
    lab_user_name: document.getElementById('r-lab-user').value,
    notes: document.getElementById('r-notes').value.trim(),
    line_items: collectLineItems()
  };
  const submitBtn = document.getElementById('save-report-btn');
  setButtonBusy(submitBtn, true, 'Submitting...');
  try {
    const data = await api(editingReportId ? `/api/reports/${editingReportId}` : '/api/reports', {
      method: editingReportId ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    await api(`/api/reports/${data.id}/finalize`, { method: 'POST' });
    showMessage(`Submitted report ${data.report_number}`);
    editingReportId = null;
    if (submitBtn) {
      submitBtn.dataset.defaultText = 'Submit Report';
      submitBtn.textContent = 'Submit Report';
    }
    await loadReports();
  } finally {
    setButtonBusy(submitBtn, false);
  }
}

async function finalizeReport(id) {
  await api(`/api/reports/${id}/finalize`, { method: 'POST' });
  showMessage(`Finalized report #${id}`);
  await loadReports();
}

async function loadReportForEdit(id) {
  const data = await api(`/api/reports/${id}`);
  const r = data.report;
  editingReportId = r.id;
  document.getElementById('save-report-btn').textContent = `Submit ${r.report_number}`;
  document.getElementById('r-date').value = normalizeDateInputValue(r.report_date);
  document.getElementById('r-truck').value = r.truck_number || '';
  document.getElementById('r-trip-id').value = r.trip_id || '';
  document.getElementById('r-generic').value = r.is_generic ? 'true' : 'false';
  document.getElementById('r-customer').value = r.customer_name || '';
  document.getElementById('r-loading-point').value = r.loading_point || '';
  document.getElementById('r-material').value = r.material_type || '';
  document.getElementById('r-grade').value = r.grade || '';
  document.getElementById('r-sieve-size').value = r.sieve_size || '';
  document.getElementById('r-afs-ref').value = r.afs_reference || '';
  document.getElementById('r-afs-mult').value = Number(r.afs_multiplier || 1);
  document.getElementById('r-notes').value = r.notes || '';
  renderLineItems(Array.isArray(r.line_items_json) && r.line_items_json.length ? r.line_items_json : SIEVE_DEFAULTS);
}

async function loadReports() {
  const loadBtn = document.getElementById('load-reports-btn');
  setButtonBusy(loadBtn, true, 'Loading...');
  showMessage('Loading reports...');
  try {
  const q = new URLSearchParams();
  const from = document.getElementById('f-from').value;
  const to = document.getElementById('f-to').value;
  const truck = document.getElementById('f-truck').value.trim();
  const status = document.getElementById('f-status').value;
  if (from) q.set('from_date', from);
  if (to) q.set('to_date', to);
  if (truck) q.set('truck_number', truck);
  if (status) q.set('status', status);
  q.set('page', String(currentPage));
  q.set('limit', '25');
  const payload = await api(`/api/reports?${q.toString()}`);
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  currentReportRows = rows;
  const pageInfo = payload.pagination || {};
  currentTotalPages = Number(pageInfo.totalPages || 1);
  const tbody = document.getElementById('reports-table');
  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td><a href="/reports/${row.id}/view" target="_blank" rel="noopener">${escapeHtml(row.report_number)}</a></td>
      <td>${escapeHtml(row.report_date)}</td>
      <td>${escapeHtml(row.truck_number)}</td>
      <td>${escapeHtml(row.customer_name || '-')}</td>
      <td>${escapeHtml(row.loading_point || '-')}</td>
      <td>${escapeHtml(row.sieve_size || '-')}</td>
      <td>${Number(row.total_afs || 0).toFixed(2)}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>
        ${row.status !== 'FINALIZED' && EDIT_ROLES.includes(currentRole) ? `<button data-edit="${row.id}">Edit</button>` : ''}
        ${row.status !== 'FINALIZED' && EDIT_ROLES.includes(currentRole) ? `<button data-finalize="${row.id}">Finalize</button>` : '-'}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="9">No reports found</td></tr>';
  const pager = document.getElementById('reports-pagination');
  if (pager) {
    pager.innerHTML = `Page ${pageInfo.page || 1} / ${currentTotalPages}`;
  }
  document.getElementById('prev-page-btn').disabled = currentPage <= 1;
  document.getElementById('next-page-btn').disabled = currentPage >= currentTotalPages;
  renderReportCharts(currentReportRows);
  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await loadReportForEdit(Number(btn.getAttribute('data-edit')));
        showMessage('Draft loaded for edit');
      } catch (error) {
        showMessage(error.message, false);
      }
    });
  });
  tbody.querySelectorAll('[data-finalize]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await finalizeReport(Number(btn.getAttribute('data-finalize')));
      } catch (error) {
        showMessage(error.message, false);
      }
    });
  });
  showMessage('Reports loaded');
  } catch (error) {
    showMessage(error.message || 'Failed to load reports', false);
    throw error;
  } finally {
    setButtonBusy(loadBtn, false);
  }
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
  window.location.href = '/';
}

async function init() {
  if (!window.AppPermissions?.requireEmployeeSession?.(window.location.pathname + (window.location.search || ''))) {
    return;
  }
  const role = localStorage.getItem('userRole');
  currentRole = role;
  if (!role || !VIEW_ROLES.includes(role)) {
    window.AppPermissions?.showNoAccess?.('You do not have access to Reports Portal.');
    window.location.href = '/';
    return;
  }
  document.getElementById('role-indicator').style.display = 'inline-block';
  document.getElementById('role-indicator').textContent = `Role: ${role}`;
  document.getElementById('logout-link').style.display = 'inline-block';
  document.getElementById('logout-link').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });
  document.getElementById('r-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('save-report-btn').addEventListener('click', async () => {
    try {
      await submitReport();
    } catch (error) {
      showMessage(error.message, false);
      showErrorModal(error.message);
    }
  });
  document.getElementById('load-reports-btn').addEventListener('click', async () => {
    try {
      await loadReports();
    } catch {}
  });
  document.getElementById('prev-page-btn').addEventListener('click', async () => {
    if (currentPage <= 1) return;
    const prevBtn = document.getElementById('prev-page-btn');
    setButtonBusy(prevBtn, true, 'Loading...');
    currentPage -= 1;
    try {
      await loadReports();
    } finally {
      setButtonBusy(prevBtn, false);
    }
  });
  document.getElementById('next-page-btn').addEventListener('click', async () => {
    if (currentPage >= currentTotalPages) return;
    const nextBtn = document.getElementById('next-page-btn');
    setButtonBusy(nextBtn, true, 'Loading...');
    currentPage += 1;
    try {
      await loadReports();
    } finally {
      setButtonBusy(nextBtn, false);
    }
  });
  document.getElementById('r-truck').addEventListener('change', () => {
    const truck = truckSuggestions.find((t) => String(t.truck_number).toLowerCase() === String(document.getElementById('r-truck').value).toLowerCase());
    applyTruckSuggestion(truck);
  });
  document.getElementById('r-truck').addEventListener('input', () => {
    if (!document.getElementById('r-truck').value.trim()) {
      applyTruckSuggestion(null);
    }
  });
  document.getElementById('r-afs-mult').addEventListener('input', computeTotals);
  document.getElementById('reports-error-ok-btn')?.addEventListener('click', closeErrorModal);
  document.getElementById('reports-error-modal')?.addEventListener('click', (e) => {
    if (e.target?.id === 'reports-error-modal') closeErrorModal();
  });
  renderLineItems();
  try {
    await loadMeta();
    await loadReports();
  } catch (error) {
    showMessage(error.message, false);
    showErrorModal(error.message);
  }
}

document.addEventListener('DOMContentLoaded', init);
