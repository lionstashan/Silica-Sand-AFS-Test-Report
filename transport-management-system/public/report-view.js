const EMPLOYEE_TRANSPORT_TOKEN_KEY = 'employeeTransportToken';
const REPORT_VIEW_ROLES = ['LAB', 'Dispatch', 'Weighbridge', 'Accounts', 'Manager', 'Admin'];

function getAuthHeaders() {
  const shared = window.AppPermissions?.getAuthHeaders?.();
  if (shared && Object.keys(shared).length) return shared;
  const role = localStorage.getItem('userRole');
  const token = localStorage.getItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
  if (!token) return {};
  return role ? { 'x-user-role': role, 'x-user-token': token } : { 'x-user-token': token };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function api(path) {
  const response = await fetch(path, { headers: getAuthHeaders() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function reportExists(id) {
  try {
    await api(`/api/reports/${id}`);
    return true;
  } catch (error) {
    if (String(error.message || '').includes('404') || String(error.message || '').toLowerCase().includes('not found')) {
      return false;
    }
    throw error;
  }
}

async function findNeighborReportId(currentId, direction) {
  const step = direction === 'next' ? 1 : -1;
  let candidate = currentId + step;
  let attempts = 0;
  while (candidate > 0 && attempts < 200) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await reportExists(candidate);
    if (exists) return candidate;
    candidate += step;
    attempts += 1;
  }
  return null;
}

function getReportId() {
  const match = window.location.pathname.match(/\/reports\/(\d+)\/view/);
  return match ? Number(match[1]) : null;
}

function hasBrandingValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function mergeBrandingWithFallback(fallback, ...sources) {
  const out = { ...(fallback || {}) };
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const [key, value] of Object.entries(src)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) continue;
        out[key] = trimmed;
      } else if (value !== null && value !== undefined) {
        out[key] = value;
      }
    }
  }
  return out;
}

function renderSieveChart(items) {
  const chartEl = document.getElementById('rv-sieve-chart');
  if (!chartEl) return;
  const points = (Array.isArray(items) ? items : [])
    .map((row) => ({
      mesh: String(row.mesh_size || '').trim(),
      weight: Number(row.weight || 0)
    }))
    .filter((row) => row.mesh && Number.isFinite(row.weight) && row.weight >= 0);
  if (!points.length) {
    chartEl.innerHTML = '<p class="mini">No sieve data</p>';
    return;
  }
  const width = 760;
  const height = 220;
  const padding = { top: 20, right: 20, bottom: 44, left: 52 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxY = Math.max(...points.map((p) => p.weight), 1);
  const xStep = points.length > 1 ? innerW / (points.length - 1) : 0;

  const linePoints = points.map((p, idx) => {
    const x = padding.left + (xStep * idx);
    const y = padding.top + innerH - ((p.weight / maxY) * innerH);
    return { ...p, x, y };
  });

  const polyline = linePoints.map((p) => `${p.x},${p.y}`).join(' ');
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding.top + innerH - (ratio * innerH);
    const value = (maxY * ratio).toFixed(2);
    return { y, value };
  });

  chartEl.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="rv-line-chart" role="img" aria-label="Sieve mesh vs weight line chart">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>
      ${yTicks.map((t) => `
        <line x1="${padding.left}" y1="${t.y}" x2="${width - padding.right}" y2="${t.y}" stroke="#e2e8f0" stroke-width="1"></line>
        <text x="${padding.left - 6}" y="${t.y + 4}" text-anchor="end" class="rv-axis-text">${t.value}</text>
      `).join('')}
      <line x1="${padding.left}" y1="${padding.top + innerH}" x2="${width - padding.right}" y2="${padding.top + innerH}" stroke="#94a3b8" stroke-width="1.5"></line>
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerH}" stroke="#94a3b8" stroke-width="1.5"></line>
      <polyline points="${polyline}" fill="none" stroke="#2563eb" stroke-width="2.5"></polyline>
      ${linePoints.map((p) => `
        <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#0ea5e9"></circle>
        <text x="${p.x}" y="${padding.top + innerH + 16}" text-anchor="middle" class="rv-axis-text">${escapeHtml(p.mesh)}</text>
      `).join('')}
      <text x="${width / 2}" y="${height - 6}" text-anchor="middle" class="rv-axis-label">Mesh Size (X)</text>
      <text x="14" y="${height / 2}" transform="rotate(-90 14,${height / 2})" text-anchor="middle" class="rv-axis-label">Weight (Y)</text>
    </svg>
  `;
}

function buildMetaItems(report) {
  const sampleType = String(report?.sample_type || '').trim();
  const samplePoint = String(report?.sample_point || '').trim();
  const samplePointOther = String(report?.sample_point_other || '').trim();
  const truckNumber = String(report?.truck_number || '').trim();
  const customerName = String(report?.customer_name || '').trim();
  const loadingPoint = String(report?.loading_point || '').trim();
  const tripId = report?.trip_id ? String(report.trip_id) : '';
  const reportNo = String(report?.report_number || '').trim();

  const items = [];
  if (reportNo) items.push({ label: 'Report No', value: reportNo });
  if (sampleType) items.push({ label: 'Sample Type', value: sampleType });
  if (samplePoint) items.push({ label: 'Sample Point', value: samplePoint });
  if (samplePoint === 'Other' && samplePointOther) items.push({ label: 'Sample Point Detail', value: samplePointOther });

  const isProduction = sampleType === 'Production';
  if (!isProduction) {
    if (truckNumber) items.push({ label: 'Truck', value: truckNumber });
    if (customerName) items.push({ label: 'Customer', value: customerName });
    if (loadingPoint) items.push({ label: 'Loading Point', value: loadingPoint });
    if (tripId) items.push({ label: 'Trip ID', value: tripId });
  }

  return items;
}

async function init() {
  if (!window.AppPermissions?.requireEmployeeSession?.(window.location.pathname + (window.location.search || ''))) {
    return;
  }
  const currentRole = window.AppPermissions?.getCurrentRole?.() || '';
  if (!REPORT_VIEW_ROLES.includes(currentRole)) {
    window.AppPermissions?.showNoAccess?.('You do not have access to Report Viewer.');
    window.location.href = '/';
    return;
  }
  const roleIndicator = document.getElementById('role-indicator');
  if (roleIndicator) {
    roleIndicator.style.display = 'inline-block';
    roleIndicator.textContent = window.AppPermissions?.getEmployeeIdentityLabel?.() || `Role: ${currentRole}`;
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
  const logoutLink = document.getElementById('rv-logout-link');
  if (logoutLink) {
    logoutLink.style.display = 'inline-block';
    logoutLink.addEventListener('click', (event) => {
      event.preventDefault();
      const token = localStorage.getItem(EMPLOYEE_TRANSPORT_TOKEN_KEY);
      if (token) fetch('/auth/logout', { method: 'POST', headers: { 'x-user-token': token } }).catch(() => {});
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
    });
  }
  const id = getReportId();
  if (!id) return;
  document.getElementById('rv-print-btn').addEventListener('click', () => window.print());
  document.getElementById('rv-prev-btn').addEventListener('click', async () => {
    const btn = document.getElementById('rv-prev-btn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Loading...';
    try {
      const prevId = await findNeighborReportId(id, 'prev');
      if (!prevId) return;
      window.location.href = `/reports/${prevId}/view`;
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
  document.getElementById('rv-next-btn').addEventListener('click', async () => {
    const btn = document.getElementById('rv-next-btn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Loading...';
    try {
      const nextId = await findNeighborReportId(id, 'next');
      if (!nextId) return;
      window.location.href = `/reports/${nextId}/view`;
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  // Render current report first so view is never blocked by neighbor probing.
  const data = await api(`/api/reports/${id}`);
  const report = data.report;
  const snapshotBranding = report?.branding_snapshot_json && typeof report.branding_snapshot_json === 'object'
    ? report.branding_snapshot_json
    : {};
  const liveBranding = await api('/api/reports/branding').catch(() => ({}));
  const fallbackBranding = {
    company_name: 'Indus Silica Sand',
    logo_url: '/assets/brand/logo-primary.png',
    gst_no: '08ABCDE1234F1Z5',
    cin: 'U14290RJ2020PTC000000',
    website: 'www.indussilicasand.in',
    contact_phones: '+91 90000 00000',
    email: 'ops@indussilicasand.in',
    address: 'Kishangarh, Rajasthan',
    footer_text: 'Quality report generated for internal QA reference.'
  };
  const mergedBranding = mergeBrandingWithFallback(fallbackBranding, liveBranding, snapshotBranding);
  const logoUrl = String(mergedBranding.logo_url || '').trim();
  if (!logoUrl || /atomic|test|logo-mark/i.test(logoUrl)) {
    mergedBranding.logo_url = '/assets/brand/logo-primary.png';
  }
  document.getElementById('rv-title').textContent = `Lab Report (${report.status})`;
  document.getElementById('rv-branding').innerHTML = `
    <div class="rv-brand-head">
      <div class="rv-brand-left">
        <div class="rv-company-name">${escapeHtml(mergedBranding.company_name)}</div>
        <div class="rv-mini">Mode: ${report.is_generic ? 'Generic' : 'Linked'} ${report.trip_id ? `(Trip #${escapeHtml(String(report.trip_id))})` : ''}</div>
      </div>
      <div class="rv-brand-right">
        ${hasBrandingValue(mergedBranding.logo_url) ? `<img src="${escapeHtml(mergedBranding.logo_url)}" alt="Company Logo" class="rv-logo" />` : '<div class="rv-logo rv-logo-fallback">INDUS</div>'}
        <div class="rv-brand-legal">
          <div><strong>GST:</strong> ${escapeHtml(mergedBranding.gst_no || '-')}</div>
          <div><strong>CIN:</strong> ${escapeHtml(mergedBranding.cin || '-')}</div>
          <div><strong>Site:</strong> ${escapeHtml(mergedBranding.website || '-')}</div>
        </div>
      </div>
    </div>
  `;
  const metaItems = buildMetaItems(report);
  document.getElementById('rv-meta').innerHTML = metaItems.map((item) => `
    <div><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value || '-')}</div>
  `).join('');
  document.getElementById('rv-date').textContent = escapeHtml(report.report_date || '-');
  document.getElementById('rv-material').textContent = escapeHtml(report.material_type || '-');
  document.getElementById('rv-grade').textContent = escapeHtml(report.grade || '-');
  document.getElementById('rv-afs-val').textContent = Number(report.total_afs || 0).toFixed(2);
  const items = Array.isArray(report.line_items_json) ? report.line_items_json : [];
  document.getElementById('rv-lines').innerHTML = items.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(row.mesh_size || '')}</td>
      <td>${escapeHtml(row.aperture || '')}</td>
      <td>${Number(row.weight || 0).toFixed(2)}</td>
      <td>${Number(row.multiplying_factor || 0).toFixed(2)}</td>
      <td>${Number(row.product || 0).toFixed(2)}</td>
    </tr>
  `).join('');
  document.getElementById('rv-total-qty').textContent = Number(report.total_quantity || 0).toFixed(2);
  document.getElementById('rv-total-product').textContent = Number(report.total_product || 0).toFixed(2);
  document.getElementById('rv-total-afs').textContent = Number(report.total_afs || 0).toFixed(2);
  renderSieveChart(items);
  document.getElementById('rv-contact-footer').innerHTML = `
    ${hasBrandingValue(mergedBranding.contact_phones) ? `<span>📞 ${escapeHtml(mergedBranding.contact_phones)}</span>` : ''}
    ${hasBrandingValue(mergedBranding.email) ? `<span>✉️ ${escapeHtml(mergedBranding.email)}</span>` : ''}
    ${hasBrandingValue(mergedBranding.address) ? `<span>📍 ${escapeHtml(mergedBranding.address)}</span>` : ''}
  `;

  // Check previous/next availability after main report render.
  const [hasPrev, hasNext] = await Promise.all([
    findNeighborReportId(id, 'prev').then(Boolean).catch(() => false),
    findNeighborReportId(id, 'next').then(Boolean).catch(() => false)
  ]);
  document.getElementById('rv-prev-btn').disabled = !hasPrev;
  document.getElementById('rv-next-btn').disabled = !hasNext;
}

init().catch((error) => {
  document.body.innerHTML = `
    <section class="panel" style="max-width:760px;margin:24px auto;">
      <h2 style="margin:0 0 12px;">Unable to Load Report</h2>
      <p style="color:#b91c1c;margin:0 0 8px;">${escapeHtml(error.message || 'Unknown error')}</p>
      <p style="margin:0;color:#475569;">Try switching role to LAB/Accounts/Manager/Admin and refresh.</p>
    </section>`;
});
