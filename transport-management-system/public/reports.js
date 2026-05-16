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
const TABLE_SIEVE_MESHES = ['10', '20', '30', '40', '50', '70', '100', '140', '200', '270'];
let reportSampleOptions = {
  sample_types: ['Production', 'Inhouse', 'Supply'],
  sample_points: {
    Production: ['Screw1', 'Screw2', 'Screw3', 'Glass Plant', 'Dry Plant New', 'Dry Plant Old', 'Raw Material', 'Other'],
    Inhouse: ['Floor1', 'Floor2', 'Floor3', 'Floor4', 'Dry Plant New', 'Dry Plant Old', 'Glass Plant'],
    Supply: ['Floor1', 'Floor2', 'Floor3', 'Floor4', 'Dry Plant New', 'Dry Plant Old', 'Glass Plant']
  }
};

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

function setSelectValueWithFallback(selectEl, value) {
  if (!selectEl) return;
  const normalized = String(value || '').trim();
  if (!normalized) {
    selectEl.value = '';
    return;
  }
  const hasOption = Array.from(selectEl.options || []).some((opt) => opt.value === normalized);
  if (!hasOption) {
    const option = document.createElement('option');
    option.value = normalized;
    option.textContent = normalized;
    selectEl.appendChild(option);
  }
  selectEl.value = normalized;
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

function toAfsBlock(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Missing';
  if (n < 30) return '<30';
  if (n > 85) return '>85';
  const bands = ['30-35', '35-40', '40-45', '45-50', '50-55', '55-60', '60-65', '65-70', '70-75', '75-80', '80-85'];
  for (const band of bands) {
    const [min, max] = band.split('-').map(Number);
    if (n >= min && (band === '80-85' ? n <= max : n < max)) return band;
  }
  return 'Missing';
}

function groupByMetric(items, keyFn, metric = 'count') {
  const map = new Map();
  (items || []).forEach((item) => {
    const key = keyFn(item);
    if (!key) return;
    if (!map.has(key)) map.set(key, { count: 0, afsSum: 0, afsCount: 0 });
    const bucket = map.get(key);
    bucket.count += 1;
    const afs = Number(item?.exact_afs ?? item?.total_afs);
    if (Number.isFinite(afs)) {
      bucket.afsSum += afs;
      bucket.afsCount += 1;
    }
  });
  return Array.from(map.entries()).map(([label, stats]) => ({
    label,
    value: metric === 'avg_afs'
      ? (stats.afsCount ? (stats.afsSum / stats.afsCount) : 0)
      : stats.count
  }));
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

function renderBarChart(targetId, rows = [], decimals = 2, yLabel = 'Value') {
  const el = document.getElementById(targetId);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<p class="empty-state">No data</p>';
    return;
  }
  const points = rows.map((row) => ({
    label: String(row.label || '').trim(),
    value: Number(row.value || 0)
  })).filter((row) => row.label);
  if (!points.length) {
    el.innerHTML = '<p class="empty-state">No data</p>';
    return;
  }
  const width = 860;
  const height = 280;
  const padding = { top: 18, right: 16, bottom: 66, left: 52 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const max = Math.max(...points.map((p) => p.value), 1);
  const gap = 8;
  const barW = Math.max(14, Math.floor((innerW - (gap * (points.length - 1))) / points.length));
  const totalBarWidth = points.length * barW + (points.length - 1) * gap;
  const xStart = padding.left + Math.max(0, Math.floor((innerW - totalBarWidth) / 2));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    y: padding.top + innerH - (innerH * r),
    v: (max * r).toFixed(decimals)
  }));

  const bars = points.map((p, i) => {
    const h = Math.max(0, (p.value / max) * innerH);
    const x = xStart + (i * (barW + gap));
    const y = padding.top + innerH - h;
    const label = p.label.length > 14 ? `${p.label.slice(0, 14)}…` : p.label;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="#0ea5e9"></rect>
      <text x="${x + (barW / 2)}" y="${padding.top + innerH + 14}" text-anchor="middle" class="rv-axis-text" transform="rotate(-30 ${x + (barW / 2)},${padding.top + innerH + 14})">${escapeHtml(label)}</text>
      <text x="${x + (barW / 2)}" y="${Math.max(12, y - 4)}" text-anchor="middle" class="rv-axis-text">${p.value.toFixed(decimals)}</text>
    `;
  }).join('');

  el.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="rv-line-chart" role="img" aria-label="${escapeHtml(yLabel)} bar chart">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>
      ${ticks.map((t) => `
        <line x1="${padding.left}" y1="${t.y}" x2="${width - padding.right}" y2="${t.y}" stroke="#e2e8f0" stroke-width="1"></line>
        <text x="${padding.left - 6}" y="${t.y + 4}" text-anchor="end" class="rv-axis-text">${t.v}</text>
      `).join('')}
      <line x1="${padding.left}" y1="${padding.top + innerH}" x2="${width - padding.right}" y2="${padding.top + innerH}" stroke="#94a3b8" stroke-width="1.5"></line>
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerH}" stroke="#94a3b8" stroke-width="1.5"></line>
      ${bars}
      <text x="14" y="${height / 2}" transform="rotate(-90 14,${height / 2})" text-anchor="middle" class="rv-axis-label">${escapeHtml(yLabel)}</text>
    </svg>
  `;
}

function renderReportCharts(rows) {
  const metric = String(document.getElementById('trend-metric')?.value || 'count');
  const decimals = metric === 'avg_afs' ? 2 : 0;
  const afsBlockRows = groupByMetric(
    rows,
    (r) => String(r.afs_block || toAfsBlock(r.exact_afs ?? r.total_afs)).trim(),
    metric
  ).sort((a, b) => b.value - a.value);
  const samplePointRows = groupByMetric(
    rows,
    (r) => String(r.sample_point || '').trim() || '-',
    metric
  ).sort((a, b) => b.value - a.value).slice(0, 10);
  const yLabel = metric === 'avg_afs' ? 'Avg AFS' : 'Count';
  renderBarChart('afs-block-chart', afsBlockRows, decimals, yLabel);
  renderBarChart('sample-point-chart', samplePointRows, decimals, yLabel);
}

function fmtNullableNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toFixed(digits);
}

function getSelectedTableView() {
  const mode = String(document.getElementById('f-table-view')?.value || 'auto').toLowerCase();
  if (['production', 'inhouse', 'supply'].includes(mode)) return mode;
  const sampleType = String(document.getElementById('f-sample-type')?.value || '').toLowerCase();
  if (['production', 'inhouse', 'supply'].includes(sampleType)) return sampleType;
  return 'default';
}

function renderReportsHeader() {
  const head = document.getElementById('reports-head-row');
  if (!head) return 15;
  const mode = getSelectedTableView();
  let dynamicCols = ['Truck', 'Customer'];
  if (mode === 'production') {
    dynamicCols = ['Sample Point', 'Material', 'Grade'];
  } else if (mode === 'inhouse' || mode === 'supply') {
    dynamicCols = ['Truck', 'Customer', 'Sample Point'];
  }
  const columns = ['ID', ...dynamicCols, 'AFS (Exact)', ...TABLE_SIEVE_MESHES, 'Action'];
  head.innerHTML = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('');
  return columns.length;
}

function getLineItemWeight(lineItems, meshLabel) {
  const target = String(meshLabel || '').trim().toLowerCase();
  if (!target) return null;
  const rows = Array.isArray(lineItems) ? lineItems : [];
  const found = rows.find((row) => String(row?.mesh_size || '').trim().toLowerCase() === target);
  if (!found) return null;
  const value = Number(found.weight);
  return Number.isFinite(value) ? value : null;
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
  setSelectValueWithFallback(document.getElementById('r-material'), truck.material_type || '');
  setSelectValueWithFallback(document.getElementById('r-grade'), truck.grade || '');
}

async function loadMeta() {
  const [labUsers, loadingPoints, trucks, sampleOptions, masterOptions] = await Promise.all([
    api('/api/reports/lab-users'),
    api('/api/reports/loading-points'),
    api('/api/reports/truck-suggestions'),
    api('/api/reports/sample-options'),
    api('/masters/options?types=materials,grades')
  ]);
  truckSuggestions = Array.isArray(trucks) ? trucks : [];
  if (sampleOptions && typeof sampleOptions === 'object') {
    reportSampleOptions = {
      sample_types: Array.isArray(sampleOptions.sample_types) ? sampleOptions.sample_types : ['Production', 'Inhouse', 'Supply'],
      sample_points: sampleOptions.sample_points || { Production: [], Inhouse: [], Supply: [] }
    };
  }
  const labSelect = document.getElementById('r-lab-user');
  labSelect.innerHTML = (labUsers || []).map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  const lpSelect = document.getElementById('r-loading-point');
  lpSelect.innerHTML = ['<option value="">Select</option>', ...(loadingPoints || []).map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)].join('');
  const materialSelect = document.getElementById('r-material');
  const gradeSelect = document.getElementById('r-grade');
  const materials = Array.isArray(masterOptions?.materials)
    ? masterOptions.materials.map((item) => (item && typeof item === 'object' ? item.value : item)).map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  const grades = Array.isArray(masterOptions?.grades)
    ? masterOptions.grades.map((item) => (item && typeof item === 'object' ? item.value : item)).map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  if (materialSelect) {
    materialSelect.innerHTML = ['<option value="">Select</option>', ...materials.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)].join('');
  }
  if (gradeSelect) {
    gradeSelect.innerHTML = ['<option value="">Select</option>', ...grades.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)].join('');
  }
  const dl = document.getElementById('truck-options');
  dl.innerHTML = truckSuggestions.map((t) => `<option value="${escapeHtml(t.truck_number)}"></option>`).join('');
  renderSampleTypeOptions();
  refreshSamplePointOptions();
  refreshSamplePointFilterOptions();
}

function renderSampleTypeOptions() {
  const sampleTypeEl = document.getElementById('r-sample-type');
  if (!sampleTypeEl) return;
  const types = Array.isArray(reportSampleOptions.sample_types) ? reportSampleOptions.sample_types : ['Production', 'Inhouse', 'Supply'];
  const current = sampleTypeEl.value;
  sampleTypeEl.innerHTML = ['<option value="">Select</option>', ...types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)].join('');
  if (current && types.includes(current)) sampleTypeEl.value = current;
}

function refreshSamplePointOptions() {
  const sampleType = document.getElementById('r-sample-type')?.value || '';
  const pointEl = document.getElementById('r-sample-point');
  const otherWrap = document.getElementById('r-sample-point-other-wrap');
  const otherInput = document.getElementById('r-sample-point-other');
  if (!pointEl) return;
  const points = Array.isArray(reportSampleOptions.sample_points?.[sampleType]) ? reportSampleOptions.sample_points[sampleType] : [];
  const current = pointEl.value;
  pointEl.innerHTML = ['<option value="">Select</option>', ...points.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)].join('');
  if (current && points.includes(current)) {
    pointEl.value = current;
  } else {
    pointEl.value = '';
  }
  const isOther = sampleType === 'Production' && pointEl.value === 'Other';
  if (otherWrap) otherWrap.style.display = isOther ? '' : 'none';
  if (otherInput) otherInput.required = isOther;
  if (!isOther && otherInput) otherInput.value = '';
  toggleLinkedFieldsForSampleType(sampleType);
}

function refreshSamplePointFilterOptions() {
  const type = document.getElementById('f-sample-type')?.value || '';
  const samplePointFilter = document.getElementById('f-sample-point');
  if (!samplePointFilter) return;
  const points = type
    ? (Array.isArray(reportSampleOptions.sample_points?.[type]) ? reportSampleOptions.sample_points[type] : [])
    : Array.from(new Set([
      ...(reportSampleOptions.sample_points?.Production || []),
      ...(reportSampleOptions.sample_points?.Inhouse || []),
      ...(reportSampleOptions.sample_points?.Supply || [])
    ]));
  const current = samplePointFilter.value;
  samplePointFilter.innerHTML = ['<option value="">All</option>', ...points.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)].join('');
  if (current && points.includes(current)) samplePointFilter.value = current;
}

function toggleLinkedFieldsForSampleType(sampleType) {
  const isProduction = sampleType === 'Production';
  const linkedFieldIds = ['r-truck-wrap', 'r-trip-id-wrap', 'r-customer-wrap', 'r-loading-point-wrap'];
  linkedFieldIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = isProduction ? 'none' : '';
  });
  if (isProduction) {
    document.getElementById('r-truck').value = '';
    document.getElementById('r-trip-id').value = '';
    document.getElementById('r-customer').value = '';
    document.getElementById('r-loading-point').value = '';
  }
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
    customer_name: document.getElementById('r-customer').value.trim(),
    loading_point: document.getElementById('r-loading-point').value,
    material_type: document.getElementById('r-material').value.trim(),
    grade: document.getElementById('r-grade').value.trim(),
    sample_type: document.getElementById('r-sample-type').value || null,
    sample_point: document.getElementById('r-sample-point').value || null,
    sample_point_other: document.getElementById('r-sample-point-other').value.trim() || null,
    afs_multiplier: Number(document.getElementById('r-afs-mult').value || 1),
    lab_user_name: document.getElementById('r-lab-user').value,
    notes: document.getElementById('r-notes').value.trim(),
    version: editingReportId ? Number(document.getElementById('save-report-btn').dataset.reportVersion || '1') : null,
    line_items: collectLineItems()
  };
  if (!payload.sample_type) throw new Error('Sample Type is required');
  if (!payload.sample_point) throw new Error('Sample Point is required');
  const submitBtn = document.getElementById('save-report-btn');
  setButtonBusy(submitBtn, true, 'Submitting...');
  try {
    const data = await api(editingReportId ? `/api/reports/${editingReportId}` : '/api/reports', {
      method: editingReportId ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    showMessage(`Saved report ${data.report_number}`);
    editingReportId = null;
    if (submitBtn) {
      submitBtn.dataset.defaultText = 'Submit Report';
      submitBtn.textContent = 'Submit Report';
      submitBtn.dataset.reportVersion = '';
    }
    await loadReports();
  } finally {
    setButtonBusy(submitBtn, false);
  }
}

async function loadReportForEdit(id) {
  const data = await api(`/api/reports/${id}`);
  const r = data.report;
  editingReportId = r.id;
  document.getElementById('save-report-btn').textContent = `Submit ${r.report_number}`;
  document.getElementById('save-report-btn').dataset.reportVersion = String(r.version || 1);
  document.getElementById('r-date').value = normalizeDateInputValue(r.report_date);
  document.getElementById('r-truck').value = r.truck_number || '';
  document.getElementById('r-trip-id').value = r.trip_id || '';
  document.getElementById('r-customer').value = r.customer_name || '';
  document.getElementById('r-loading-point').value = r.loading_point || '';
  setSelectValueWithFallback(document.getElementById('r-material'), r.material_type || '');
  setSelectValueWithFallback(document.getElementById('r-grade'), r.grade || '');
  document.getElementById('r-sample-type').value = r.sample_type || '';
  refreshSamplePointOptions();
  document.getElementById('r-sample-point').value = r.sample_point || '';
  refreshSamplePointOptions();
  document.getElementById('r-sample-point-other').value = r.sample_point_other || '';
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
  const customer = document.getElementById('f-customer').value.trim();
  const afsBlock = document.getElementById('f-afs-block').value;
  const sampleType = document.getElementById('f-sample-type').value;
  const samplePoint = document.getElementById('f-sample-point').value;
  if (from) q.set('from_date', from);
  if (to) q.set('to_date', to);
  if (truck) q.set('truck_number', truck);
  if (customer) q.set('customer', customer);
  if (afsBlock) q.set('afs_block', afsBlock);
  if (sampleType) q.set('sample_type', sampleType);
  if (samplePoint) q.set('sample_point', samplePoint);
  const limit = Number(document.getElementById('f-limit')?.value || 10);
  const safeLimit = [10, 20, 50].includes(limit) ? limit : 10;
  q.set('page', String(currentPage));
  q.set('limit', String(safeLimit));
  const payload = await api(`/api/reports?${q.toString()}`);
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  currentReportRows = rows;
  const tableMode = getSelectedTableView();
  const pageInfo = payload.pagination || {};
  currentTotalPages = Number(pageInfo.totalPages || 1);
  const tbody = document.getElementById('reports-table');
  const columnCount = renderReportsHeader();
  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td><a href="/reports/${row.id}/view" target="_blank" rel="noopener" title="${escapeHtml(row.report_number || '')}">${escapeHtml(row.id)}</a></td>
      ${tableMode === 'production'
        ? `
          <td>${escapeHtml(row.sample_point || '-')}</td>
          <td>${escapeHtml(row.material_type || '-')}</td>
          <td>${escapeHtml(row.grade || '-')}</td>
        `
        : (tableMode === 'inhouse' || tableMode === 'supply')
          ? `
            <td>${escapeHtml(row.truck_number)}</td>
            <td>${escapeHtml(row.customer_name || '-')}</td>
            <td>${escapeHtml(row.sample_point || '-')}</td>
          `
          : `
          <td>${escapeHtml(row.truck_number)}</td>
          <td>${escapeHtml(row.customer_name || '-')}</td>
          `
      }
      <td>${fmtNullableNumber(row.exact_afs, 2)}</td>
      ${TABLE_SIEVE_MESHES.map((mesh) => `<td>${fmtNullableNumber(getLineItemWeight(row.line_items_json, mesh), 2)}</td>`).join('')}
      <td>
        ${EDIT_ROLES.includes(currentRole) ? `<button data-edit="${row.id}">Edit</button>` : ''}
        ${currentRole === 'Admin' ? `<button data-delete="${row.id}">Delete</button>` : ''}
      </td>
    </tr>
  `).join('') || `<tr><td colspan="${columnCount}">No reports found</td></tr>`;
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
        const formPanel = document.querySelector('section.panel.wide-panel');
        if (formPanel) {
          formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch (error) {
        showMessage(error.message, false);
      }
    });
  });
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-delete'));
      if (!Number.isFinite(id) || id <= 0) return;
      if (!window.confirm(`Delete report #${id}?`)) return;
      try {
        await api(`/api/reports/${id}`, { method: 'DELETE' });
        showMessage(`Deleted report #${id}`);
        await loadReports();
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
  const roleIndicator = document.getElementById('role-indicator');
  if (roleIndicator) {
    roleIndicator.style.display = 'inline-block';
    roleIndicator.textContent = window.AppPermissions?.getEmployeeIdentityLabel?.() || `Role: ${role}`;
  }
  window.AppPermissions?.renderRoleSwitcher?.('role-switcher', {
    Gate: '/',
    Dispatch: '/dashboard',
    Loading: '/dashboard',
    Weighbridge: '/dashboard',
    LAB: '/reports',
    Expense: '/expense',
    Accounts: '/reports',
    Manager: '/reports',
    Admin: '/reports'
  });
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
      currentPage = 1;
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
  document.getElementById('r-sample-type')?.addEventListener('change', refreshSamplePointOptions);
  document.getElementById('r-sample-point')?.addEventListener('change', refreshSamplePointOptions);
  document.getElementById('f-sample-type')?.addEventListener('change', refreshSamplePointFilterOptions);
  document.getElementById('f-table-view')?.addEventListener('change', async () => {
    currentPage = 1;
    await loadReports();
  });
  document.getElementById('trend-metric')?.addEventListener('change', () => {
    renderReportCharts(currentReportRows);
  });
  document.getElementById('f-limit')?.addEventListener('change', async () => {
    currentPage = 1;
    await loadReports();
  });
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
