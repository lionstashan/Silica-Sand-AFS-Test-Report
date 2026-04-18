const IST_TIMEZONE = 'Asia/Kolkata';
const STORAGE_USERNAME_KEY = 'customerUsername';
const STORAGE_PASSWORD_KEY = 'customerPassword';
const TRANSPORTER_STORAGE_KEY = 'transporterOptions';
const TRANSPORTER_STORAGE_VERSION_KEY = 'transporterOptionsVersion';
const TRANSPORTER_STORAGE_VERSION = '2026-04-17-list-1';
const LOCATION_STORAGE_KEY = 'locationOptions';

const BASE_TRANSPORTER_OPTIONS = [
  'Shree Ram Roadlines',
  'Kuber Roadlines',
  'Ganesh Road Lines',
  'Amardeep Transport',
  'Shree Syam Transport',
  'Jambeshwar Road Lines',
  'Ravi Road Lines'
];

const DISPATCH_DROPDOWNS = {
  material_type: ['Silica Sand', 'Ball Clay', 'Other'],
  grade: ['Glass Grade', 'Foundry Grade', '30-150', '30-80', '18-30', '16-30', '14-16', '12-16', '14-12', 'Ball Clay', 'Raw', 'Other'],
  condition: ['Dry', 'Wet', 'Other'],
  packing: ['Loose', 'Old', '3G', '4G', 'Other']
};

const CUSTOMER_DROPDOWN_CONFIG = [
  { field: 'material_type', selectId: 'customer-material-type', otherId: 'customer-material-type-other' },
  { field: 'grade', selectId: 'customer-grade', otherId: 'customer-grade-other' },
  { field: 'condition', selectId: 'customer-condition', otherId: 'customer-condition-other' }
];

let customerUser = null;
let expectedRows = [];
let transporterOptions = [];
let tripDocumentsByTripId = new Map();

const loginPanel = document.getElementById('login-panel');
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

function showMessage(text, success = true) {
  messageEl.textContent = text;
  messageEl.style.color = success ? '#047857' : '#b91c1c';
}

function showLoginMessage(text, success = false) {
  if (!loginMessageEl) return;
  loginMessageEl.textContent = text;
  loginMessageEl.style.color = success ? '#047857' : '#b91c1c';
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
  const username = localStorage.getItem(STORAGE_USERNAME_KEY) || '';
  const password = localStorage.getItem(STORAGE_PASSWORD_KEY) || '';
  if (!username || !password) return {};
  return {
    'x-customer-username': username,
    'x-customer-password': password
  };
}

function setAuthCredentials(username, password) {
  localStorage.setItem(STORAGE_USERNAME_KEY, username);
  localStorage.setItem(STORAGE_PASSWORD_KEY, password);
}

function clearAuthCredentials() {
  localStorage.removeItem(STORAGE_USERNAME_KEY);
  localStorage.removeItem(STORAGE_PASSWORD_KEY);
}

function applyAuthedUI() {
  loginPanel.style.display = 'none';
  appPanel.style.display = 'block';
  summaryPanel.style.display = 'block';
  listPanel.style.display = 'block';
  const indicator = document.getElementById('customer-indicator');
  indicator.style.display = 'inline-block';
  indicator.textContent = `Customer: ${customerUser?.username || customerUser?.customer_name || customerUser?.display_name || '-'}`;
  document.getElementById('logout-link').style.display = 'inline-block';
  if (customerNameInput) {
    const defaultCustomerName = String(customerUser?.customer_name || '').trim();
    customerNameInput.value = defaultCustomerName;
    customerNameInput.readOnly = true;
  }
  showLoginMessage('', true);
}

function applyLoggedOutUI() {
  loginPanel.style.display = 'block';
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
  setAuthCredentials(username, password);
}

async function loadMe() {
  const response = await fetch('/customer/me', { headers: getCustomerAuthHeaders() });
  if (!response.ok) throw new Error('Not logged in');
  customerUser = await response.json();
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
  const qs = customerFilter ? `?customer_name=${encodeURIComponent(customerFilter)}` : '';
  const response = await fetch(`/customer/dashboard-summary${qs}`, {
    headers: getCustomerAuthHeaders()
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load summary');
  }
  const data = await response.json();
  renderSummary(data.summary || {});
}

function renderExpectedRows(data) {
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
    expectedTable.innerHTML = data.map((row) => `
      <tr>
        <td>${escapeHtml(row.truck_number)}</td>
        <td>${escapeHtml(row.current_status || row.status)}</td>
        <td>${escapeHtml(row.customer_name || '-')}</td>
        <td>${formatWeight(row.expected_quantity_mt)}</td>
        <td>${escapeHtml([row.material_type, row.grade, row.condition, row.location].filter(Boolean).join(' / ') || '-')}</td>
        <td>${getDocLinks(row)}</td>
        <td>${formatDateTime(row.submitted_at)}</td>
        <td>${row.linked_trip_id ? `#${row.linked_trip_id}` : '-'}</td>
      </tr>
    `).join('');
    expectedMobileList.innerHTML = '';
  } else {
    expectedTable.innerHTML = '';
    expectedMobileList.innerHTML = data.map((row) => `
      <article class="mobile-trip-card">
        <div class="mobile-trip-head">
          <div class="mobile-trip-truck">${escapeHtml(row.truck_number)}</div>
          <div>${escapeHtml(row.current_status || row.status)}</div>
        </div>
        <div class="mobile-trip-grid">
          <div><strong>Customer:</strong> ${escapeHtml(row.customer_name || '-')}</div>
          <div><strong>Expected:</strong> ${formatWeight(row.expected_quantity_mt)}</div>
          <div><strong>Material:</strong> ${escapeHtml(row.material_type || '-')}</div>
          <div><strong>Grade:</strong> ${escapeHtml(row.grade || '-')}</div>
          <div><strong>Location:</strong> ${escapeHtml(row.location || '-')}</div>
          <div><strong>Docs:</strong> ${getDocLinks(row)}</div>
          <div><strong>Submitted:</strong> ${formatDateTime(row.submitted_at)}</div>
          <div><strong>Trip:</strong> ${row.linked_trip_id ? `#${row.linked_trip_id}` : '-'}</div>
        </div>
      </article>
    `).join('');
  }
  wireCustomerDocumentEvents();
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
    const response = await fetch(`/customer/documents/${docId}/download`, {
      headers: getCustomerAuthHeaders()
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to download document');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  } catch (error) {
    showMessage(error.message, false);
  }
}

async function fetchCustomerTripDocuments(tripId) {
  const response = await fetch(`/customer/trip-documents?trip_id=${encodeURIComponent(tripId)}`, {
    headers: getCustomerAuthHeaders()
  });
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
  const response = await fetch('/customer/expected-trucks', {
    headers: getCustomerAuthHeaders()
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load expected trucks');
  }
  expectedRows = await response.json();
  await refreshTripDocumentsForRows(expectedRows);
  refreshLocationOptions(expectedRows);
  renderExpectedRows(expectedRows);
}

async function bootstrapAuthenticated() {
  await loadMe();
  applyAuthedUI();
  await Promise.all([loadSummary(), loadExpectedTrucks()]);
}

document.addEventListener('DOMContentLoaded', async () => {
  initTransporterTypeahead();
  initCustomerDropdowns();
  refreshLocationOptions();

  document.getElementById('customer-login-form').addEventListener('submit', async (event) => {
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
    event.preventDefault();
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
      packing: '',
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
      showMessage('Summary refreshed');
    } catch (error) {
      showMessage(error.message, false);
    }
  });

  document.getElementById('logout-link').addEventListener('click', (event) => {
    event.preventDefault();
    clearAuthCredentials();
    customerUser = null;
    applyLoggedOutUI();
    showMessage('Logged out');
  });

  window.addEventListener('resize', () => renderExpectedRows(expectedRows));

  try {
    await bootstrapAuthenticated();
  } catch (_error) {
    applyLoggedOutUI();
  }
});
