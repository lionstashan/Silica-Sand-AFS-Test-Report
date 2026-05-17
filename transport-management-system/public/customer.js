const IST_TIMEZONE = 'Asia/Kolkata';
const STORAGE_USERNAME_KEY = 'customerUsername';
const STORAGE_PASSWORD_KEY = 'customerPassword';
const STORAGE_TOKEN_KEY = 'customerToken';
const STORAGE_ADMIN_SELECTED_CUSTOMER_ID_KEY = 'adminSelectedCustomerUserId';
const TRANSPORTER_STORAGE_KEY = 'transporterOptions';
const TRANSPORTER_STORAGE_VERSION_KEY = 'transporterOptionsVersion';
const TRANSPORTER_STORAGE_VERSION = '2026-05-12-master-source';
const LOCATION_STORAGE_KEY = 'locationOptions';
const EMPLOYEE_TRANSPORT_TOKEN_KEY = 'employeeTransportToken';

const BASE_TRANSPORTER_OPTIONS = [];

const DEFAULT_DISPATCH_DROPDOWNS = {
  material_type: ['Other'],
  grade: ['Other'],
  condition: ['Other'],
  packing: ['Other']
};
let DISPATCH_DROPDOWNS = { ...DEFAULT_DISPATCH_DROPDOWNS };

const CUSTOMER_DROPDOWN_CONFIG = [
  { field: 'material_type', selectId: 'customer-material-type', otherId: 'customer-material-type-other' },
  { field: 'grade', selectId: 'customer-grade', otherId: 'customer-grade-other' },
  { field: 'condition', selectId: 'customer-condition', otherId: 'customer-condition-other' },
  { field: 'packing', selectId: 'customer-packing', otherId: 'customer-packing-other' }
];

let customerUser = null;
let adminViewMode = false;
let adminCustomerUsers = [];
let selectedAdminCustomerId = null;
let expectedRows = [];
let transporterOptions = [];
let tripDocumentsByTripId = new Map();
let tripTimelineByTripId = new Map();
let customerMastersLoaded = false;

const loginPanel = document.getElementById('login-panel');
const adminCustomerPanel = document.getElementById('admin-customer-panel');
const adminCustomerSelect = document.getElementById('admin-customer-select');
const adminCustomerRefreshBtn = document.getElementById('admin-customer-refresh-btn');
const adminCustomerMessageEl = document.getElementById('admin-customer-message');
const appPanel = document.getElementById('app-panel');
const summaryPanel = document.getElementById('summary-panel');
const listPanel = document.getElementById('list-panel');
const expectedTable = document.getElementById('expected-table');
const expectedMobileList = document.getElementById('expected-mobile-list');
const summaryCards = document.getElementById('summary-cards');
const messageEl = document.getElementById('message');
const loginMessageEl = document.getElementById('login-message');
const customerNameInput = document.querySelector('#expected-form input[name="customer_name"]');
const transporterInput = document.getElementById('customer-transporter-input');
const transporterList = document.getElementById('customer-transporter-list');
const locationInput = document.getElementById('customer-location-input');
const locationOptionsDatalist = document.getElementById('customer-location-options');
const timelineModal = document.getElementById('timeline-modal');
const timelineModalTitle = document.getElementById('timeline-modal-title');
const timelineModalBody = document.getElementById('timeline-modal-body');
let globalToastTimer = null;
let timelineRequestSeq = 0;

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

function formatWeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(3)} MT`;
}

function parseTripDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mapCustomerTripRow(row = {}) {
  const mapped = {
    ...row,
    linked_trip_id: row.linked_trip_id ?? row.trip_id ?? null,
    truck_number: row.truck_number ?? '',
    current_status: row.current_status ?? row.trip_status ?? row.status ?? '-',
    customer_name: row.customer_name ?? row.display_name ?? '',
    expected_quantity_mt: row.expected_quantity_mt ?? row.expected_weight ?? null,
    trip_net_weight: row.trip_net_weight ?? row.net_weight ?? null,
    material_type: row.material_type ?? '',
    grade: row.grade ?? '',
    condition: row.condition ?? '',
    packing: row.packing ?? '',
    location: row.location ?? '',
    submitted_at: row.submitted_at ?? row.created_at ?? null,
    trip_in_time: row.trip_in_time ?? row.in_time ?? null,
    trip_out_time: row.trip_out_time ?? row.out_time ?? null,
    status_history: parseStatusHistory(row)
  };
  return mapped;
}

function formatTimeOnly(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('en-IN', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function formatMinutes(totalMinutes) {
  if (totalMinutes === null || Number.isNaN(totalMinutes)) return '-';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function parseStatusHistory(row) {
  const raw = row?.status_history ?? row?.trip_status_history;
  if (Array.isArray(raw) && raw.length) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (_error) {
      // Fall through to synthesized fallback.
    }
  }
  const fallbackStatus = row?.trip_status || row?.current_status || row?.status;
  const fallbackEntryTime = row?.trip_in_time || row?.submitted_at;
  if (!fallbackStatus || !fallbackEntryTime) return [];
  return [{
    status: fallbackStatus,
    entry_time: fallbackEntryTime,
    exit_time: row?.trip_out_time || null,
    details: {}
  }];
}

function statusToLabel(status) {
  return String(status || '').replaceAll('_', ' ');
}

function getStatusDurationMinutes(entry) {
  const start = parseTripDate(entry?.entry_time);
  if (!start) return null;
  const end = parseTripDate(entry?.exit_time) || new Date();
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60));
}

function getStageDurationSummary(row) {
  const history = parseStatusHistory(row);
  const totals = new Map();
  history.forEach((entry) => {
    const status = statusToLabel(entry?.status || '');
    const minutes = getStatusDurationMinutes(entry);
    if (!status || minutes === null || Number.isNaN(minutes)) return;
    totals.set(status, (totals.get(status) || 0) + minutes);
  });
  return Array.from(totals.entries()).map(([status, minutes]) => ({ status, minutes }));
}

function renderStageSummary(row) {
  const summary = getStageDurationSummary(row);
  if (!summary.length) return '<div class="mini-muted">No stage timing available</div>';
  const chips = summary
    .map((item) => `<span class="timeline-summary-chip"><strong>${escapeHtml(item.status)}:</strong> ${formatMinutes(item.minutes)}</span>`)
    .join('');
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
    material_type: 'Material',
    grade: 'Grade',
    condition: 'Condition',
    packing: 'Packing',
    location: 'Location',
    eta: 'ETA',
    expected_weight: 'Expected',
    tare_weight: 'Tare',
    gross_weight: 'Gross',
    net_weight: 'Net'
  };
  return labels[key] || key.replaceAll('_', ' ');
}

function formatStatusDetailValue(key, value) {
  if (value === null || value === undefined || value === '') return null;
  if (key === 'eta') return formatDateTime(value);
  if (['expected_weight', 'tare_weight', 'gross_weight', 'net_weight'].includes(key)) return formatWeight(value);
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

function renderStatusTimeline(row) {
  const history = parseStatusHistory(row);
  if (!history.length) return '<div class="mini-muted">No status history available</div>';
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

function getTruckTimelineLink(row) {
  const label = escapeHtml(row?.truck_number || '-');
  if (!row?.linked_trip_id) return label;
  return `
    <button type="button" class="truck-link-btn" data-action="view-timeline" data-trip-id="${row.linked_trip_id}">
      ${label}
    </button>
  `;
}

async function fetchCustomerTripTimeline(tripId) {
  const cacheKey = String(tripId);
  if (tripTimelineByTripId.has(cacheKey)) {
    return tripTimelineByTripId.get(cacheKey);
  }
  const endpoint = adminViewMode
    ? withAdminCustomerQuery(buildPortalEndpoint(`/trips/${encodeURIComponent(tripId)}/timeline`))
    : buildPortalEndpoint(`/trips/${encodeURIComponent(tripId)}/timeline`);
  const response = await fetch(endpoint, { headers: getPortalAuthHeaders() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load trip timeline');
  }
  const data = await response.json();
  tripTimelineByTripId.set(cacheKey, data);
  return data;
}

async function openTimelineModal(tripId) {
  if (!timelineModal || !timelineModalBody || !timelineModalTitle) return;
  const row = expectedRows.find((item) => String(item.linked_trip_id) === String(tripId));
  if (!row) return;
  timelineModalTitle.textContent = `Status Timeline - ${row.truck_number || 'Truck'} (#${tripId})`;
  timelineModalBody.innerHTML = '<div class="mini-muted">Loading timeline...</div>';
  timelineModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  const requestSeq = ++timelineRequestSeq;

  let timelineRow = null;
  try {
    timelineRow = await fetchCustomerTripTimeline(tripId);
  } catch (error) {
    if (requestSeq !== timelineRequestSeq) return;
    timelineModalBody.innerHTML = `<div class="mini-muted">${escapeHtml(error.message || 'Failed to load timeline')}</div>`;
    return;
  }
  if (requestSeq !== timelineRequestSeq) return;

  const effective = mapCustomerTripRow({
    ...row,
    ...timelineRow,
    trip_status: timelineRow?.status ?? row?.trip_status,
    trip_in_time: timelineRow?.in_time ?? row?.trip_in_time,
    trip_out_time: timelineRow?.out_time ?? row?.trip_out_time,
    trip_net_weight: timelineRow?.net_weight ?? row?.trip_net_weight
  });

  timelineModalBody.innerHTML = `
    <div class="timeline-meta">
      <div><strong>Current:</strong> ${escapeHtml(statusToLabel(effective.current_status || '-'))}</div>
      <div><strong>Customer:</strong> ${escapeHtml(effective.customer_name || '-')}</div>
      <div><strong>In Time:</strong> ${formatDateTime(effective.trip_in_time)}</div>
      <div><strong>Out Time:</strong> ${formatDateTime(effective.trip_out_time)}</div>
      <div><strong>Expected Weight:</strong> ${formatWeight(effective.expected_weight ?? effective.expected_quantity_mt)}</div>
      <div><strong>Net Weight:</strong> ${formatWeight(effective.trip_net_weight)}</div>
      <div><strong>Material:</strong> ${escapeHtml(effective.material_type || '-')}</div>
      <div><strong>Grade:</strong> ${escapeHtml(effective.grade || '-')}</div>
      <div><strong>Condition:</strong> ${escapeHtml(effective.condition || '-')}</div>
      <div><strong>Packing:</strong> ${escapeHtml(effective.packing || '-')}</div>
      <div><strong>Location:</strong> ${escapeHtml(effective.location || '-')}</div>
    </div>
    ${renderStageSummary(effective)}
    <div class="timeline-list">
      ${renderStatusTimeline(effective)}
    </div>
  `;
}

function closeTimelineModal() {
  if (!timelineModal) return;
  timelineRequestSeq += 1;
  timelineModal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

function wireTruckTimelineEvents() {
  document.querySelectorAll('[data-action="view-timeline"]').forEach((button) => {
    button.addEventListener('click', async () => {
      await openTimelineModal(button.dataset.tripId);
    });
  });
}

function showMessage(text, success = true) {
  messageEl.textContent = text;
  messageEl.style.color = success ? '#047857' : '#b91c1c';
  showGlobalToast(text, success);
}

function setExpectedSubmitEnabled(enabled, reason = '') {
  const submitBtn = document.querySelector('#expected-form button[type="submit"]');
  if (!submitBtn) return;
  submitBtn.disabled = !enabled;
  submitBtn.title = enabled ? '' : reason;
}

function showLoginMessage(text, success = false) {
  if (!loginMessageEl) return;
  loginMessageEl.textContent = text;
  loginMessageEl.style.color = success ? '#047857' : '#b91c1c';
  showGlobalToast(text, success);
}

function showAdminCustomerMessage(text, success = true) {
  if (!adminCustomerMessageEl) return;
  adminCustomerMessageEl.textContent = text;
  adminCustomerMessageEl.style.color = success ? '#047857' : '#b91c1c';
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
  if (globalToastTimer) {
    clearTimeout(globalToastTimer);
    globalToastTimer = null;
  }
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

function isAdminSession() {
  return String(localStorage.getItem('userRole') || '').trim() === 'Admin';
}

function hasAssignedAdminRole() {
  try {
    const raw = localStorage.getItem('employeeAuth');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const roles = Array.isArray(parsed?.roles) ? parsed.roles : [];
    return roles.includes('Admin');
  } catch (_error) {
    return false;
  }
}

function getAdminAuthHeaders() {
  if (!isAdminSession()) return {};
  const token = localStorage.getItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
  if (!token) return {};
  return {
    'x-user-role': 'Admin',
    'x-user-token': token
  };
}

function getPortalAuthHeaders() {
  return adminViewMode ? getAdminAuthHeaders() : getCustomerAuthHeaders();
}

function getSelectedAdminCustomerId() {
  const parsed = Number(selectedAdminCustomerId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getSelectedAdminCustomerIdOrThrow() {
  const selectedId = getSelectedAdminCustomerId();
  if (!selectedId) {
    throw new Error('Select a customer to load portal data');
  }
  return selectedId;
}

function buildPortalEndpoint(path) {
  return adminViewMode ? `/admin/customer-portal${path}` : `/customer${path}`;
}

function withAdminCustomerQuery(path, params = {}) {
  if (!adminViewMode) return path;
  const selectedId = getSelectedAdminCustomerIdOrThrow();
  const searchParams = new URLSearchParams({
    customer_user_id: String(selectedId)
  });
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    searchParams.set(key, String(value));
  });
  return `${path}?${searchParams.toString()}`;
}

function normalizeListValue(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function getStoredTransporterOptions() {
  try {
    const raw = localStorage.getItem(TRANSPORTER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeListValue(item))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function setStoredTransporterOptions(options) {
  const unique = Array.from(new Set(
    (options || []).map((item) => normalizeListValue(item)).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
  localStorage.setItem(TRANSPORTER_STORAGE_KEY, JSON.stringify(unique));
}

function bootstrapTransporterStorage() {
  const version = localStorage.getItem(TRANSPORTER_STORAGE_VERSION_KEY);
  if (version === TRANSPORTER_STORAGE_VERSION) return;
  setStoredTransporterOptions(BASE_TRANSPORTER_OPTIONS);
  localStorage.setItem(TRANSPORTER_STORAGE_VERSION_KEY, TRANSPORTER_STORAGE_VERSION);
}

function syncTransporterOptions() {
  const storedOptions = getStoredTransporterOptions();
  transporterOptions = Array.from(new Set([...BASE_TRANSPORTER_OPTIONS, ...storedOptions]))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function renderTransporterSuggestions(query = '') {
  if (!transporterList) return;
  const filter = normalizeListValue(query).toLowerCase();
  const filtered = transporterOptions
    .filter((name) => !filter || name.toLowerCase().includes(filter))
    .slice(0, 8);

  if (!filtered.length) {
    transporterList.style.display = 'none';
    transporterList.innerHTML = '';
    return;
  }

  transporterList.innerHTML = filtered
    .map((name) => `<button type="button" class="typeahead-option" data-transporter-option="${escapeHtml(name)}">${escapeHtml(name)}</button>`)
    .join('');
  transporterList.style.display = 'block';
}

function hideTransporterSuggestions() {
  if (!transporterList) return;
  transporterList.style.display = 'none';
}

function addTransporterOption(value) {
  const normalized = normalizeListValue(value);
  if (!normalized) return;
  if (transporterOptions.includes(normalized)) return;
  transporterOptions = [...transporterOptions, normalized].sort((a, b) => a.localeCompare(b));
  setStoredTransporterOptions(transporterOptions);
}

function getStoredLocationOptions() {
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeListValue(item)).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function setStoredLocationOptions(options) {
  const unique = Array.from(new Set((options || []).map((item) => normalizeListValue(item)).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(unique));
}

function refreshLocationOptions(extraRows = []) {
  const stored = getStoredLocationOptions();
  const fromRows = (extraRows || []).map((row) => normalizeListValue(row?.location)).filter(Boolean);
  const merged = Array.from(new Set([...stored, ...fromRows])).sort((a, b) => a.localeCompare(b));
  setStoredLocationOptions(merged);
  if (!locationOptionsDatalist) return;
  locationOptionsDatalist.innerHTML = merged
    .map((value) => `<option value="${escapeHtml(value)}"></option>`)
    .join('');
}

function addLocationOption(value) {
  const normalized = normalizeListValue(value);
  if (!normalized) return;
  const existing = getStoredLocationOptions();
  if (existing.includes(normalized)) return;
  setStoredLocationOptions([...existing, normalized]);
  refreshLocationOptions();
}

function initTransporterTypeahead() {
  if (!transporterInput || !transporterList) return;
  bootstrapTransporterStorage();
  syncTransporterOptions();

  transporterInput.addEventListener('input', () => {
    renderTransporterSuggestions(transporterInput.value);
  });

  transporterInput.addEventListener('focus', () => {
    renderTransporterSuggestions(transporterInput.value);
  });

  transporterInput.addEventListener('blur', () => {
    window.setTimeout(hideTransporterSuggestions, 120);
  });

  transporterList.addEventListener('click', (event) => {
    const option = event.target.closest('[data-transporter-option]');
    if (!option) return;
    transporterInput.value = option.dataset.transporterOption || '';
    hideTransporterSuggestions();
  });

  document.addEventListener('click', (event) => {
    if (event.target === transporterInput || transporterList.contains(event.target)) return;
    hideTransporterSuggestions();
  });
}

function toggleOtherInput(selectElement, inputElement) {
  if (!selectElement || !inputElement) return;
  const show = selectElement.value === 'Other';
  inputElement.style.display = show ? 'block' : 'none';
  if (!show) inputElement.value = '';
}

function initCustomerDropdowns() {
  CUSTOMER_DROPDOWN_CONFIG.forEach(({ field, selectId, otherId }) => {
    const selectEl = document.getElementById(selectId);
    const otherEl = document.getElementById(otherId);
    if (!selectEl || !otherEl) return;
    const options = DISPATCH_DROPDOWNS[field] || [];
    selectEl.innerHTML = ['<option value="">Select</option>', ...options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)].join('');
    selectEl.addEventListener('change', () => toggleOtherInput(selectEl, otherEl));
    toggleOtherInput(selectEl, otherEl);
  });
}

function normalizeMasterList(values = [], fallback = []) {
  const fromApi = Array.isArray(values)
    ? values.map((v) => (typeof v === 'object' ? v.value : v)).map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  const merged = [...new Set([...fromApi, ...fallback.filter((v) => v && v !== 'Other')])];
  return [...merged, 'Other'];
}

async function loadCustomerMasterOptions() {
  const types = ['materials', 'grades', 'conditions', 'packing', 'transporters', 'locations'];
  try {
    const response = await fetch(`/customer/masters/options?types=${encodeURIComponent(types.join(','))}`, {
      headers: getCustomerAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to load master options');
    const data = await response.json();
    DISPATCH_DROPDOWNS.material_type = normalizeMasterList(data.materials, DEFAULT_DISPATCH_DROPDOWNS.material_type);
    DISPATCH_DROPDOWNS.grade = normalizeMasterList(data.grades, DEFAULT_DISPATCH_DROPDOWNS.grade);
    DISPATCH_DROPDOWNS.condition = normalizeMasterList(data.conditions, DEFAULT_DISPATCH_DROPDOWNS.condition);
    DISPATCH_DROPDOWNS.packing = normalizeMasterList(data.packing, DEFAULT_DISPATCH_DROPDOWNS.packing);
    transporterOptions = normalizeMasterList(data.transporters, BASE_TRANSPORTER_OPTIONS);
    locationOptions = normalizeMasterList(data.locations, []);
    const hasCoreMasters = ['materials', 'grades', 'conditions', 'packing']
      .every((key) => Array.isArray(data[key]) && data[key].length > 0);
    customerMastersLoaded = hasCoreMasters;
    setExpectedSubmitEnabled(hasCoreMasters, 'Master data not loaded from Control Panel.');
  } catch (_error) {
    DISPATCH_DROPDOWNS = { ...DEFAULT_DISPATCH_DROPDOWNS };
    customerMastersLoaded = false;
    setExpectedSubmitEnabled(false, 'Master data not loaded from Control Panel.');
  }
}

function getDropdownValue(field) {
  const config = CUSTOMER_DROPDOWN_CONFIG.find((item) => item.field === field);
  if (!config) return '';
  const selectEl = document.getElementById(config.selectId);
  const otherEl = document.getElementById(config.otherId);
  if (!selectEl) return '';
  if (selectEl.value !== 'Other') return normalizeListValue(selectEl.value);
  return normalizeListValue(otherEl?.value || '');
}

function resetCustomerFormEnhancements() {
  if (transporterInput) transporterInput.value = '';
  if (locationInput) locationInput.value = '';
  hideTransporterSuggestions();
  CUSTOMER_DROPDOWN_CONFIG.forEach(({ selectId, otherId }) => {
    const selectEl = document.getElementById(selectId);
    const otherEl = document.getElementById(otherId);
    if (!selectEl || !otherEl) return;
    selectEl.value = '';
    toggleOtherInput(selectEl, otherEl);
  });
}

function getCustomerAuthHeaders() {
  const token = localStorage.getItem(STORAGE_TOKEN_KEY) || '';
  if (token) {
    return {
      'x-customer-token': token
    };
  }
  const username = localStorage.getItem(STORAGE_USERNAME_KEY) || '';
  const password = localStorage.getItem(STORAGE_PASSWORD_KEY) || '';
  if (!username || !password) return {};
  return {
    'x-customer-username': username,
    'x-customer-password': password
  };
}

function setAuthCredentials(username, token = '', password = '') {
  localStorage.setItem(STORAGE_USERNAME_KEY, username);
  if (token) {
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
    localStorage.removeItem(STORAGE_PASSWORD_KEY);
  } else if (password) {
    localStorage.setItem(STORAGE_PASSWORD_KEY, password);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
  } else {
    localStorage.removeItem(STORAGE_PASSWORD_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
  }
}

function clearAuthCredentials() {
  localStorage.removeItem(STORAGE_USERNAME_KEY);
  localStorage.removeItem(STORAGE_PASSWORD_KEY);
  localStorage.removeItem(STORAGE_TOKEN_KEY);
}

function clearAllPortalSessions() {
  clearAuthCredentials();
  localStorage.removeItem('userRole');
  localStorage.removeItem('employeeAuth');
  localStorage.removeItem('employeeTransportToken');
  localStorage.removeItem('expenseToken');
  localStorage.removeItem('expenseUser');
  localStorage.removeItem(STORAGE_ADMIN_SELECTED_CUSTOMER_ID_KEY);
}

function applyAuthedUI() {
  loginPanel.style.display = 'none';
  appPanel.style.display = adminViewMode ? 'none' : 'block';
  if (adminCustomerPanel) adminCustomerPanel.style.display = adminViewMode ? 'block' : 'none';
  summaryPanel.style.display = 'block';
  listPanel.style.display = 'block';
  const indicator = document.getElementById('customer-indicator');
  indicator.style.display = 'inline-block';
  if (adminViewMode) {
    const selected = adminCustomerUsers.find((row) => String(row.id) === String(selectedAdminCustomerId));
    const selectedLabel = selected
      ? `${selected.customer_name || '-'} (${selected.username || '-'})`
      : 'Select customer';
    indicator.textContent = `Role: Admin | Customer View: ${selectedLabel}`;
  } else {
    indicator.textContent = `Customer: ${customerUser?.username || customerUser?.customer_name || customerUser?.display_name || '-'}`;
  }
  document.getElementById('logout-link').style.display = 'inline-block';
  if (customerNameInput) {
    const defaultCustomerName = adminViewMode
      ? ''
      : String(customerUser?.customer_name || '').trim();
    customerNameInput.value = defaultCustomerName;
    customerNameInput.readOnly = !adminViewMode;
  }
  showLoginMessage('', true);
  if (!customerMastersLoaded && !adminViewMode) {
    showMessage('Master data not loaded from Control Panel. Submission is disabled.', false);
  }
}

function applyLoggedOutUI() {
  loginPanel.style.display = 'block';
  if (adminCustomerPanel) adminCustomerPanel.style.display = 'none';
  appPanel.style.display = 'none';
  summaryPanel.style.display = 'none';
  listPanel.style.display = 'none';
  document.getElementById('customer-indicator').style.display = 'none';
  document.getElementById('logout-link').style.display = 'none';
  if (customerNameInput) {
    customerNameInput.value = '';
    customerNameInput.readOnly = false;
  }
}

async function login(username, password) {
  const response = await fetch('/customer/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Invalid login');
  }
  const data = await response.json();
  customerUser = data.user;
  setAuthCredentials(username, data.token || '', data.token ? '' : password);
}

async function loadMe() {
  const response = await fetch('/customer/me', { headers: getCustomerAuthHeaders() });
  if (!response.ok) throw new Error('Not logged in');
  customerUser = await response.json();
}

function renderAdminCustomerOptions() {
  if (!adminCustomerSelect) return;
  const optionsHtml = [
    '<option value="">Select customer</option>',
    ...adminCustomerUsers.map((row) => {
      const labelName = row.customer_name || '-';
      const labelUser = row.username || '-';
      const display = row.display_name ? ` | ${row.display_name}` : '';
      return `<option value="${escapeHtml(String(row.id))}">${escapeHtml(`${labelName} (${labelUser})${display}`)}</option>`;
    })
  ].join('');
  adminCustomerSelect.innerHTML = optionsHtml;
  if (selectedAdminCustomerId) {
    adminCustomerSelect.value = String(selectedAdminCustomerId);
  }
}

async function loadAdminCustomerUsers() {
  const response = await fetch('/admin/customer-portal/customers', {
    headers: getAdminAuthHeaders()
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load customers');
  }
  adminCustomerUsers = await response.json();
  const hasSelection = adminCustomerUsers.some((row) => String(row.id) === String(selectedAdminCustomerId));
  if (!hasSelection) {
    selectedAdminCustomerId = adminCustomerUsers.length ? Number(adminCustomerUsers[0].id) : null;
  }
  if (selectedAdminCustomerId) {
    localStorage.setItem(STORAGE_ADMIN_SELECTED_CUSTOMER_ID_KEY, String(selectedAdminCustomerId));
  } else {
    localStorage.removeItem(STORAGE_ADMIN_SELECTED_CUSTOMER_ID_KEY);
  }
  renderAdminCustomerOptions();
}

function renderSummary(summary) {
  const card = (title, value, cls) => `
    <div class="summary-card ${cls}">
      <div class="card-number">${value}</div>
      <div class="card-title">${title}</div>
    </div>
  `;
  summaryCards.innerHTML = `
    ${card('Trucks (Today)', summary.trucks_today || 0, 'card-green')}
    ${card('Trucks (Month)', summary.trucks_month || 0, 'card-blue')}
    ${card('Trucks (Year)', summary.trucks_year || 0, 'card-purple')}
    ${card('Qty (Today)', formatWeight(summary.quantity_today_mt), 'card-light-blue')}
    ${card('Qty (Month)', formatWeight(summary.quantity_month_mt), 'card-orange')}
    ${card('Qty (Year)', formatWeight(summary.quantity_year_mt), 'card-yellow')}
  `;
}

async function loadSummary() {
  const customerFilter = String(document.getElementById('customer-filter').value || '').trim();
  const endpoint = adminViewMode
    ? withAdminCustomerQuery(buildPortalEndpoint('/dashboard-summary'), { customer_name: customerFilter })
    : `${buildPortalEndpoint('/dashboard-summary')}${customerFilter ? `?customer_name=${encodeURIComponent(customerFilter)}` : ''}`;
  const response = await fetch(endpoint, { headers: getPortalAuthHeaders() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load summary');
  }
  const data = await response.json();
  renderSummary(data.summary || {});
}

function renderExpectedRows(data) {
  const rows = Array.isArray(data) ? data.map(mapCustomerTripRow) : [];
  const getDocLinks = (row) => {
    const tripId = row.linked_trip_id;
    if (!tripId) return '-';
    const docs = tripDocumentsByTripId.get(String(tripId)) || [];
    if (!docs.length) return 'No docs';
    return docs.map((doc) => (
      `<button type="button" class="truck-link-btn" data-action="customer-download-doc" data-doc-id="${doc.id}" data-doc-name="${escapeHtml(doc.file_name)}">${escapeHtml(doc.file_name)}</button>`
    )).join('<br>');
  };

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) {
    expectedTable.innerHTML = rows.map((row) => `
      <tr>
        <td>${row.linked_trip_id ? `#${row.linked_trip_id}` : '-'}</td>
        <td>${getTruckTimelineLink(row)}</td>
        <td>${escapeHtml(row.current_status)}</td>
        <td>${escapeHtml(row.customer_name || '-')}</td>
        <td>${formatWeight(row.expected_quantity_mt)}</td>
        <td>${formatWeight(row.trip_net_weight)}</td>
        <td>${escapeHtml([row.material_type, row.grade, row.condition, row.packing, row.location].filter(Boolean).join(' / ') || '-')}</td>
        <td>${getDocLinks(row)}</td>
        <td>${formatDateTime(row.submitted_at)}</td>
      </tr>
    `).join('');
    expectedMobileList.innerHTML = '';
  } else {
    expectedTable.innerHTML = '';
    expectedMobileList.innerHTML = rows.map((row) => `
      <article class="mobile-trip-card">
        <div class="mobile-trip-head">
          <div class="mobile-trip-truck">${getTruckTimelineLink(row)}</div>
          <div>${escapeHtml(row.current_status)}</div>
        </div>
        <div class="mobile-trip-grid">
          <div><strong>Trp No.:</strong> ${row.linked_trip_id ? `#${row.linked_trip_id}` : '-'}</div>
          <div><strong>Customer:</strong> ${escapeHtml(row.customer_name || '-')}</div>
          <div><strong>Expected:</strong> ${formatWeight(row.expected_quantity_mt)}</div>
          <div><strong>Net Weight:</strong> ${formatWeight(row.trip_net_weight)}</div>
          <div><strong>Material:</strong> ${escapeHtml(row.material_type || '-')}</div>
          <div><strong>Grade:</strong> ${escapeHtml(row.grade || '-')}</div>
          <div><strong>Condition:</strong> ${escapeHtml(row.condition || '-')}</div>
          <div><strong>Packing:</strong> ${escapeHtml(row.packing || '-')}</div>
          <div><strong>Location:</strong> ${escapeHtml(row.location || '-')}</div>
          <div><strong>Docs:</strong> ${getDocLinks(row)}</div>
          <div><strong>Submitted:</strong> ${formatDateTime(row.submitted_at)}</div>
        </div>
      </article>
    `).join('');
  }
  wireCustomerDocumentEvents();
  wireTruckTimelineEvents();
}

function wireCustomerDocumentEvents() {
  document.querySelectorAll('[data-action="customer-download-doc"]').forEach((button) => {
    button.addEventListener('click', () => {
      downloadCustomerDocument(button.dataset.docId, button.dataset.docName || 'document');
    });
  });
}

async function downloadCustomerDocument(docId, fileName = 'document') {
  try {
    const endpoint = adminViewMode
      ? withAdminCustomerQuery(buildPortalEndpoint(`/documents/${docId}/download`))
      : buildPortalEndpoint(`/documents/${docId}/download`);
    const response = await fetch(endpoint, { headers: getPortalAuthHeaders() });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to download document');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      URL.revokeObjectURL(url);
      throw new Error('Please allow popups to open document preview');
    }
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  } catch (error) {
    showMessage(error.message, false);
  }
}

async function fetchCustomerTripDocuments(tripId) {
  const endpoint = adminViewMode
    ? withAdminCustomerQuery(buildPortalEndpoint('/trip-documents'), { trip_id: tripId })
    : `${buildPortalEndpoint('/trip-documents')}?trip_id=${encodeURIComponent(tripId)}`;
  const response = await fetch(endpoint, { headers: getPortalAuthHeaders() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load trip documents');
  }
  return response.json();
}

async function refreshTripDocumentsForRows(rows) {
  const linkedTripIds = Array.from(new Set((rows || [])
    .map((row) => row.linked_trip_id)
    .filter((id) => Number.isFinite(Number(id)))))
    .map(String);

  const nextMap = new Map();
  await Promise.all(linkedTripIds.map(async (tripId) => {
    try {
      const docs = await fetchCustomerTripDocuments(tripId);
      nextMap.set(String(tripId), docs);
    } catch (_error) {
      nextMap.set(String(tripId), []);
    }
  }));
  tripDocumentsByTripId = nextMap;
}

async function loadExpectedTrucks() {
  const endpoint = adminViewMode
    ? withAdminCustomerQuery(buildPortalEndpoint('/expected-trucks'))
    : buildPortalEndpoint('/expected-trucks');
  const response = await fetch(endpoint, { headers: getPortalAuthHeaders() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load expected trucks');
  }
  expectedRows = (await response.json()).map(mapCustomerTripRow);
  tripTimelineByTripId = new Map();
  await refreshTripDocumentsForRows(expectedRows);
  refreshLocationOptions(expectedRows);
  renderExpectedRows(expectedRows);
}

async function bootstrapAuthenticated() {
  await loadMe();
  applyAuthedUI();
  await Promise.all([loadSummary(), loadExpectedTrucks()]);
}

async function bootstrapAdminView() {
  await loadAdminCustomerUsers();
  applyAuthedUI();
  if (!getSelectedAdminCustomerId()) {
    renderSummary({});
    expectedRows = [];
    renderExpectedRows(expectedRows);
    showAdminCustomerMessage('No active customers found', false);
    return;
  }
  showAdminCustomerMessage('', true);
  await Promise.all([loadSummary(), loadExpectedTrucks()]);
}

document.addEventListener('DOMContentLoaded', async () => {
  adminViewMode = isAdminSession();
  selectedAdminCustomerId = Number(localStorage.getItem(STORAGE_ADMIN_SELECTED_CUSTOMER_ID_KEY) || 0) || null;

  document.querySelector('[data-action="close-timeline"]')?.addEventListener('click', closeTimelineModal);
  timelineModal?.addEventListener('click', (event) => {
    if (event.target === timelineModal) closeTimelineModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeTimelineModal();
  });

  initTransporterTypeahead();
  setExpectedSubmitEnabled(false, 'Loading master data...');
  await loadCustomerMasterOptions();
  initCustomerDropdowns();
  refreshLocationOptions();

  document.getElementById('customer-login-form').addEventListener('submit', async (event) => {
    if (adminViewMode) return;
    event.preventDefault();
    const formData = new FormData(event.target);
    const username = String(formData.get('username') || '').trim();
    const password = String(formData.get('password') || '').trim();
    try {
      await login(username, password);
      showLoginMessage('', true);
      showMessage('Login successful');
      await bootstrapAuthenticated();
    } catch (error) {
      showLoginMessage(error.message, false);
    }
  });

  document.getElementById('expected-form').addEventListener('submit', async (event) => {
    if (adminViewMode) {
      event.preventDefault();
      showMessage('Submission is disabled in Admin Customer View mode', false);
      return;
    }
    event.preventDefault();
    if (!customerMastersLoaded) {
      showMessage('Master data is not loaded. Please refresh or contact Admin.', false);
      return;
    }
    const formData = new FormData(event.target);
    const payload = {
      customer_name: String(customerUser?.customer_name || formData.get('customer_name') || '').trim(),
      truck_number: String(formData.get('truck_number') || '').trim(),
      driver_name: String(formData.get('driver_name') || '').trim(),
      driver_phone: String(formData.get('driver_phone') || '').trim(),
      transporter: String(formData.get('transporter') || '').trim(),
      expected_quantity_mt: Number(formData.get('expected_quantity_mt') || 0),
      material_type: getDropdownValue('material_type'),
      grade: getDropdownValue('grade'),
      condition: getDropdownValue('condition'),
      location: String(formData.get('location') || '').trim(),
      packing: getDropdownValue('packing'),
      eta: String(formData.get('eta') || '').trim() ? `${String(formData.get('eta')).trim()}:00+05:30` : null,
      notes: String(formData.get('notes') || '').trim()
    };

    try {
      const response = await fetch('/customer/expected-trucks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getCustomerAuthHeaders()
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to submit expected truck');
      }
      showMessage('Expected truck submitted');
      addTransporterOption(payload.transporter);
      addLocationOption(payload.location);
      event.target.reset();
      resetCustomerFormEnhancements();
      await Promise.all([loadSummary(), loadExpectedTrucks()]);
    } catch (error) {
      showMessage(error.message, false);
    }
  });

  document.getElementById('summary-refresh-btn').addEventListener('click', async () => {
    try {
      await loadSummary();
      if (adminViewMode) {
        showAdminCustomerMessage('Summary refreshed');
      } else {
        showMessage('Summary refreshed');
      }
    } catch (error) {
      if (adminViewMode) {
        showAdminCustomerMessage(error.message, false);
      } else {
        showMessage(error.message, false);
      }
    }
  });

  document.getElementById('logout-link').addEventListener('click', (event) => {
    event.preventDefault();
    clearAllPortalSessions();
    customerUser = null;
    window.location.href = '/';
  });

  adminCustomerRefreshBtn?.addEventListener('click', async () => {
    if (!adminViewMode) return;
    try {
      await loadAdminCustomerUsers();
      applyAuthedUI();
      if (getSelectedAdminCustomerId()) {
        await Promise.all([loadSummary(), loadExpectedTrucks()]);
      }
      showAdminCustomerMessage('Customer list refreshed');
    } catch (error) {
      showAdminCustomerMessage(error.message, false);
    }
  });

  adminCustomerSelect?.addEventListener('change', async () => {
    if (!adminViewMode) return;
    const selectedValue = Number(adminCustomerSelect.value || 0);
    selectedAdminCustomerId = Number.isInteger(selectedValue) && selectedValue > 0 ? selectedValue : null;
    if (selectedAdminCustomerId) {
      localStorage.setItem(STORAGE_ADMIN_SELECTED_CUSTOMER_ID_KEY, String(selectedAdminCustomerId));
    } else {
      localStorage.removeItem(STORAGE_ADMIN_SELECTED_CUSTOMER_ID_KEY);
    }
    applyAuthedUI();
    if (!selectedAdminCustomerId) {
      renderSummary({});
      expectedRows = [];
      renderExpectedRows(expectedRows);
      return;
    }
    try {
      await Promise.all([loadSummary(), loadExpectedTrucks()]);
      showAdminCustomerMessage('Customer data loaded');
    } catch (error) {
      showAdminCustomerMessage(error.message, false);
    }
  });

  window.addEventListener('resize', () => renderExpectedRows(expectedRows));

  try {
    if (adminViewMode) {
      await bootstrapAdminView();
    } else {
      await bootstrapAuthenticated();
      if (hasAssignedAdminRole()) {
        showLoginMessage('Tip: Switch role to Admin to use customer selection dropdown view.', true);
      }
    }
  } catch (error) {
    if (adminViewMode) {
      loginPanel.style.display = 'none';
      if (adminCustomerPanel) adminCustomerPanel.style.display = 'block';
      appPanel.style.display = 'none';
      summaryPanel.style.display = 'none';
      listPanel.style.display = 'none';
      document.getElementById('logout-link').style.display = 'inline-block';
      const indicator = document.getElementById('customer-indicator');
      indicator.style.display = 'inline-block';
      indicator.textContent = 'Role: Admin | Customer View: Unavailable';
      showAdminCustomerMessage(
        error?.message || 'Admin customer portal is unavailable. Ensure latest server code is running.',
        false
      );
    } else {
      applyLoggedOutUI();
    }
  }
});
