const ROLE_PINS = {
  Gate: 'G8P2',
  Weighbridge: 'W3K7',
  Dispatch: 'D9M4',
  Loading: 'L5Q8',
  LAB: 'L4B9',
  Accounts: 'A6R1',
  Manager: 'M2N6',
  Admin: '2802'
};

function getAuthHeaders() {
  const role = localStorage.getItem('userRole');
  const token = localStorage.getItem('employeeTransportToken');
  if (!role) return {};
  if (token) return { 'x-user-role': role, 'x-user-token': token };
  return { 'x-user-role': role, 'x-user-pin': ROLE_PINS[role] || '' };
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

function getReportId() {
  const match = window.location.pathname.match(/\/reports\/(\d+)\/view/);
  return match ? Number(match[1]) : null;
}

function hasBrandingValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
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
  const max = Math.max(...points.map((p) => p.weight), 1);
  chartEl.innerHTML = `
    <div class="rv-bars">
      ${points.map((p) => {
        const h = Math.max(8, Math.round((p.weight / max) * 140));
        return `
          <div class="rv-bar-col">
            <div class="rv-bar-value">${p.weight.toFixed(2)}</div>
            <div class="rv-bar-track">
              <div class="rv-bar-fill" style="height:${h}px"></div>
            </div>
            <div class="rv-bar-label">${escapeHtml(p.mesh)}</div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="rv-axis-note">X-axis: Mesh Size • Y-axis: Weight</div>
  `;
}

async function init() {
  const id = getReportId();
  if (!id) return;
  document.getElementById('rv-print-btn').addEventListener('click', () => window.print());
  const data = await api(`/api/reports/${id}`);
  const report = data.report;
  const snapshotBranding = report?.branding_snapshot_json && typeof report.branding_snapshot_json === 'object'
    ? report.branding_snapshot_json
    : {};
  const liveBranding = await api('/api/reports/branding').catch(() => ({}));
  const branding = Object.keys(snapshotBranding).length ? snapshotBranding : liveBranding;
  const fallbackBranding = {
    company_name: 'Indus Silica Sand',
    logo_url: '',
    gst_no: '08ABCDE1234F1Z5',
    cin: 'U14290RJ2020PTC000000',
    website: 'www.indussilicasand.in',
    contact_phones: '+91 90000 00000',
    email: 'ops@indussilicasand.in',
    address: 'Kishangarh, Rajasthan',
    footer_text: 'Quality report generated for internal QA reference.'
  };
  const mergedBranding = { ...fallbackBranding, ...(branding || {}) };
  document.getElementById('rv-title').textContent = `${report.report_number} (${report.status})`;
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
  document.getElementById('rv-meta').innerHTML = `
    <div><strong>Truck:</strong> ${escapeHtml(report.truck_number || '-')}</div>
    <div><strong>Customer:</strong> ${escapeHtml(report.customer_name || '-')}</div>
    <div><strong>Loading Point:</strong> ${escapeHtml(report.loading_point || '-')}</div>
    <div><strong>Sieve Size:</strong> ${escapeHtml(report.sieve_size || '-')}</div>
  `;
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
  const history = Array.isArray(data.history) ? data.history : [];
  document.getElementById('rv-history').innerHTML = history.map((h) => `
    <div>${new Date(h.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} • ${escapeHtml(h.actor_role)} • ${escapeHtml(h.action_type)} ${escapeHtml(h.remarks || '')}</div>
  `).join('');
  document.getElementById('rv-contact-footer').innerHTML = `
    <div>${hasBrandingValue(mergedBranding.contact_phones) ? `📞 ${escapeHtml(mergedBranding.contact_phones)}` : ''}</div>
    <div>${hasBrandingValue(mergedBranding.email) ? `✉️ ${escapeHtml(mergedBranding.email)}` : ''}</div>
    <div>${hasBrandingValue(mergedBranding.address) ? `📍 ${escapeHtml(mergedBranding.address)}` : ''}</div>
    <div class="rv-mini">${escapeHtml(mergedBranding.footer_text || '')}</div>
  `;
}

init().catch((error) => {
  document.body.innerHTML = `<section class="panel"><p style="color:#b91c1c;">${escapeHtml(error.message)}</p></section>`;
});
