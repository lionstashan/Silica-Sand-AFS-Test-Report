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
  document.getElementById('rv-title').textContent = `${report.report_number} (${report.status})`;
  document.getElementById('rv-branding').innerHTML = `
    <strong>${escapeHtml(branding.company_name || 'Indus Silica Sand')}</strong><br>
    ${escapeHtml(branding.address || '')}<br>
    ${escapeHtml(branding.contact_phones || '')} ${escapeHtml(branding.email || '')}
  `;
  document.getElementById('rv-meta').innerHTML = `
    <div><strong>Date:</strong> ${escapeHtml(report.report_date)}</div>
    <div><strong>Mode:</strong> ${report.is_generic ? 'Generic' : 'Linked'} ${report.trip_id ? `(Trip #${escapeHtml(String(report.trip_id))})` : ''}</div>
    <div><strong>Truck:</strong> ${escapeHtml(report.truck_number)}</div>
    <div><strong>Customer:</strong> ${escapeHtml(report.customer_name || '-')}</div>
    <div><strong>Loading Point:</strong> ${escapeHtml(report.loading_point || '-')}</div>
    <div><strong>Material:</strong> ${escapeHtml(report.material_type || '-')}</div>
    <div><strong>Grade:</strong> ${escapeHtml(report.grade || '-')}</div>
    <div><strong>Sieve Size:</strong> ${escapeHtml(report.sieve_size || '-')}</div>
  `;
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
  const history = Array.isArray(data.history) ? data.history : [];
  document.getElementById('rv-history').innerHTML = history.map((h) => `
    <div>${new Date(h.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} • ${escapeHtml(h.actor_role)} • ${escapeHtml(h.action_type)} ${escapeHtml(h.remarks || '')}</div>
  `).join('');
}

init().catch((error) => {
  document.body.innerHTML = `<section class="panel"><p style="color:#b91c1c;">${escapeHtml(error.message)}</p></section>`;
});
