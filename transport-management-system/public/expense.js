const TOKEN_KEY = 'expenseToken';
const USER_KEY = 'expenseUser';

let me = null;
let queue = [];
let queueIndex = -1;
let activeClaim = null;
let expenseNotifications = [];
let expenseNotifPoll = null;

const $ = (id) => document.getElementById(id);

function setMessage(msg, isError = false) {
  const el = $('global-msg');
  el.textContent = msg || '';
  el.style.color = isError ? '#b00020' : '#666';
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function getHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'x-expense-token': getToken(),
    ...extra
  };
}

function renderExpenseNotifBadge(unreadCount) {
  const btn = $('expense-notifications-btn');
  const badge = $('expense-notification-badge');
  if (!btn || !badge) return;
  if (!me) {
    btn.style.display = 'none';
    badge.style.display = 'none';
    return;
  }
  btn.style.display = 'inline-block';
  const count = Number(unreadCount || 0);
  if (count <= 0) {
    badge.style.display = 'none';
    badge.textContent = '0';
    return;
  }
  badge.style.display = 'inline-block';
  badge.textContent = String(count);
}

function renderExpenseNotifList() {
  const list = $('expense-notification-list');
  if (!list) return;
  if (!expenseNotifications.length) {
    list.innerHTML = '<div class="mini">No notifications.</div>';
    return;
  }
  list.innerHTML = expenseNotifications.map((n) => {
    const when = fmt(n.created_at);
    const unread = n.is_read ? '' : 'font-weight:700;';
    return `<div style="padding:8px 0;border-bottom:1px solid #e2e8f0;${unread}">
      <div>${n.title || n.event_type || 'Notification'}</div>
      <div class="mini">${n.message || '-'}</div>
      <div class="mini">${when}</div>
    </div>`;
  }).join('');
}

async function loadExpenseNotifications() {
  try {
    const rows = await api('/expenses/notifications', { headers: getHeaders() });
    expenseNotifications = Array.isArray(rows) ? rows : [];
    const unread = expenseNotifications.filter((r) => !r.is_read).length;
    renderExpenseNotifBadge(unread);
    renderExpenseNotifList();
  } catch (_error) {}
}

async function markExpenseNotificationsRead() {
  try {
    await api('/expenses/notifications/mark-read', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({})
    });
    await loadExpenseNotifications();
  } catch (error) {
    setMessage(error.message, true);
  }
}

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function loadSession() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    me = raw ? JSON.parse(raw) : null;
  } catch (_err) {
    me = null;
  }
}

function fmt(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function badge(status) {
  const color = status === 'REJECTED' ? '#b00020'
    : status === 'PAYMENT_COMPLETED' ? '#0a7a2f'
      : status.includes('REVIEW') || status.includes('PENDING') || status.includes('INITIATED') ? '#0a4fa3'
        : '#555';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${color};color:#fff;font-size:11px;">${status}</span>`;
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

async function login() {
  const username = $('login-username').value.trim();
  const password = $('login-password').value.trim();
  if (!username || !password) {
    $('login-msg').textContent = 'Username and password are required';
    return;
  }
  try {
    const data = await api('/expense/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    saveSession(data.token, data.user);
    me = data.user;
    $('login-panel').style.display = 'none';
    $('app-panel').style.display = '';
    if ($('logout-btn')) $('logout-btn').style.display = 'inline-block';
    if ($('me-label')) $('me-label').style.display = 'inline-block';
    initApp();
    if (expenseNotifPoll) clearInterval(expenseNotifPoll);
    loadExpenseNotifications();
    expenseNotifPoll = setInterval(() => {
      if (!me || !getToken()) return;
      loadExpenseNotifications();
    }, 15000);
  } catch (error) {
    $('login-msg').textContent = error.message;
  }
}

async function loadCategories() {
  const rows = await api('/expense-categories', { headers: getHeaders() });
  const select = $('f-category');
  if (!Array.isArray(rows) || rows.length === 0) {
    select.innerHTML = '<option value="">No categories available</option>';
    return;
  }
  select.innerHTML = rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
}

function claimCard(claim) {
  return `<button data-id="${claim.id}" class="expense-item">
    <strong>${claim.claim_number}</strong><br>
    <span>${badge(claim.status)}</span> | <span>${claim.amount}</span><br>
    <span class="mini">${claim.voucher_no} • ${claim.claim_date || '-'}</span>
  </button>`;
}

async function loadMyClaims() {
  const rows = await api('/expenses/my', { headers: getHeaders() });
  $('my-claims-list').innerHTML = rows.map(claimCard).join('') || '<div class="mini">No claims yet.</div>';
  $('my-claims-list').querySelectorAll('button[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => viewClaim(Number(btn.getAttribute('data-id'))));
  });
}

async function createAndSubmitClaim() {
  try {
    const claim = await api('/expenses', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        pay_to: $('f-pay-to').value.trim(),
        voucher_no: $('f-voucher').value.trim(),
        claim_date: $('f-date').value,
        amount: Number($('f-amount').value),
        category_id: Number($('f-category').value),
        purpose: $('f-purpose').value.trim()
      })
    });
    setMessage(`Draft created: ${claim.claim_number}`);
    if ($('f-bill').files[0]) await uploadDoc(claim.id, $('f-bill').files[0], 'BILL');
    if ($('f-supporting').files[0]) await uploadDoc(claim.id, $('f-supporting').files[0], 'SUPPORTING');
    await api(`/expenses/${claim.id}/submit`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ remarks: 'Submitted from employee portal', version: claim.version })
    });
    setMessage(`Claim submitted: ${claim.claim_number}`);
    $('f-pay-to').value = '';
    $('f-voucher').value = '';
    $('f-date').value = '';
    $('f-amount').value = '';
    $('f-purpose').value = '';
    $('f-bill').value = '';
    $('f-supporting').value = '';
    await loadMyClaims();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function viewClaim(id) {
  const data = await api(`/expenses/${id}`, { headers: getHeaders() });
  const claim = data.claim;
  activeClaim = claim;
  const canSubmit = me.role === 'Employee' && (claim.status === 'DRAFT' || claim.status === 'NEED_MORE_INFO');
  const docs = (data.documents || []).map((d) => `<a href="#" data-doc="${d.id}">${d.doc_type} - ${d.file_name}</a>`).join('') || '<div class="mini">No documents</div>';
  const history = (data.history || []).map((h) => `<div class="mini">${fmt(h.created_at)} • ${h.actor_role} • ${h.action_type} ${h.to_status ? `→ ${h.to_status}` : ''} ${h.remarks ? `• ${h.remarks}` : ''}</div>`).join('');
  $('my-claims-list').innerHTML = `
    <div class="expense-panel">
      <strong>${claim.claim_number}</strong> | ${claim.status}<br>
      ${claim.pay_to} • ${claim.amount} • ${claim.voucher_no}<br>
      <div style="margin-top:6px;">${docs}</div>
      <div style="margin-top:6px;">${history || '<div class="mini">No history</div>'}</div>
      ${canSubmit ? '<button id="submit-claim-btn">Submit/Resubmit</button>' : ''}
      <button id="back-my-claims-btn">Back</button>
    </div>
  `;
  $('my-claims-list').querySelectorAll('[data-doc]').forEach((a) => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      await downloadDoc(Number(a.getAttribute('data-doc')));
    });
  });
  const submitBtn = $('submit-claim-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      try {
        await api(`/expenses/${id}/submit`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ remarks: 'Submitted from employee portal', version: activeClaim.version })
        });
        setMessage('Claim submitted');
        await loadMyClaims();
      } catch (error) {
        setMessage(error.message, true);
      }
    });
  }
  $('back-my-claims-btn').addEventListener('click', loadMyClaims);
}

async function loadQueue() {
  const data = await api('/expenses/pending', { headers: getHeaders() });
  queue = data.rows || [];
  queueIndex = queue.length ? 0 : -1;
  $('queue-list').innerHTML = queue.map((q, i) =>
    `<button data-idx="${i}"><strong>${q.claim_number}</strong><br>${q.employee_name} • ${q.status}<br><span class="mini">${q.amount}</span></button>`
  ).join('') || `
    <div class="mini">
      No claims pending for your role.
      <div style="margin-top:8px;">
        <button type="button" id="queue-refresh-btn">Refresh Queue</button>
      </div>
    </div>
  `;
  $('queue-list').querySelectorAll('button[data-idx]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      queueIndex = Number(btn.getAttribute('data-idx'));
      await renderActiveClaim();
    });
  });
  const queueRefreshBtn = $('queue-refresh-btn');
  if (queueRefreshBtn) {
    queueRefreshBtn.addEventListener('click', async () => {
      try {
        await loadQueue();
      } catch (error) {
        setMessage(error.message || 'Failed to refresh queue', true);
      }
    });
  }
  await renderActiveClaim();
}

async function downloadDoc(docId) {
  const response = await fetch(`/expenses/documents/${docId}/download`, { headers: { 'x-expense-token': getToken() } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Download failed');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}

async function renderActiveClaim() {
  if (queueIndex < 0 || queueIndex >= queue.length) {
    $('claim-detail').innerHTML = `
      <div class="mini">
        No claim selected. When a claim is available in your review queue, details will appear here.
      </div>
    `;
    updateActionButtons(null);
    return;
  }
  const row = queue[queueIndex];
  const data = await api(`/expenses/${row.id}`, { headers: getHeaders() });
  const claim = data.claim;
  activeClaim = claim;
  const docs = (data.documents || []).map((d) => `<a href="#" data-doc="${d.id}">${d.doc_type} - ${d.file_name}</a>`).join('') || '<div class="mini">No documents.</div>';
  $('claim-detail').innerHTML = `
    <div><strong>${claim.claim_number}</strong> (${queueIndex + 1}/${queue.length})</div>
    <div>Status: ${badge(claim.status)} (v${claim.version})</div>
    <div>Employee: ${claim.employee_name} (${claim.employee_code || '-'})</div>
    <div>Pay To: ${claim.pay_to}</div>
    <div>Voucher: ${claim.voucher_no}</div>
    <div>Date: ${claim.claim_date}</div>
    <div>Amount: ${claim.amount}</div>
    <div>Category: ${claim.category_name || '-'}</div>
    <div>Purpose: ${claim.purpose}</div>
    <div class="doc-list" style="margin-top:8px;"><strong>Attachments</strong><br>${docs}</div>
  `;
  updateActionButtons(claim);

  $('claim-detail').querySelectorAll('[data-doc]').forEach((a) => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await downloadDoc(Number(a.getAttribute('data-doc')));
      } catch (error) {
        setMessage(error.message, true);
      }
    });
  });
}

function updateActionButtons(claim) {
  const status = claim?.status || null;
  const role = me?.role || null;
  const enable = (id, ok) => { $(id).disabled = !ok; };
  const show = (id, ok) => {
    const el = $(id);
    if (!el) return;
    el.style.display = ok ? '' : 'none';
  };

  // Default visibility for common navigation/actions
  show('claim-refresh-btn', true);
  show('prev-btn', true);
  show('next-btn', true);
  show('upload-doc-btn', true);

  if (!claim || !status || !role) {
    enable('approve-btn', false);
    enable('need-info-btn', false);
    enable('reject-btn', false);
    enable('payment-init-btn', false);
    enable('payment-complete-btn', false);
    enable('upload-doc-btn', false);
    enable('prev-btn', false);
    enable('next-btn', false);
    show('approve-btn', true);
    show('need-info-btn', true);
    show('reject-btn', true);
    show('payment-init-btn', true);
    show('payment-complete-btn', true);
    return;
  }

  const isReviewStage = status === 'ACCOUNTS_REVIEW' || status === 'MANAGER_REVIEW' || status === 'ADMIN_REVIEW';
  const isPaymentStage = status === 'PAYMENT_PENDING' || status === 'PAYMENT_INITIATED';

  // Role/stage-specific visibility to avoid workflow confusion.
  if (role === 'Accounts') {
    show('approve-btn', status === 'ACCOUNTS_REVIEW');
    show('need-info-btn', status === 'ACCOUNTS_REVIEW');
    show('reject-btn', status === 'ACCOUNTS_REVIEW');
    show('payment-init-btn', status === 'PAYMENT_PENDING');
    show('payment-complete-btn', status === 'PAYMENT_INITIATED');
  } else if (role === 'Manager') {
    show('approve-btn', status === 'MANAGER_REVIEW');
    show('need-info-btn', status === 'MANAGER_REVIEW');
    show('reject-btn', status === 'MANAGER_REVIEW');
    show('payment-init-btn', false);
    show('payment-complete-btn', false);
  } else if (role === 'Admin') {
    show('approve-btn', status === 'ADMIN_REVIEW');
    show('need-info-btn', status === 'ADMIN_REVIEW');
    show('reject-btn', status === 'ADMIN_REVIEW');
    show('payment-init-btn', false);
    show('payment-complete-btn', false);
  } else {
    show('approve-btn', isReviewStage);
    show('need-info-btn', isReviewStage);
    show('reject-btn', isReviewStage);
    show('payment-init-btn', isPaymentStage);
    show('payment-complete-btn', isPaymentStage);
  }

  enable('prev-btn', queueIndex > 0);
  enable('next-btn', queueIndex >= 0 && queueIndex < (queue.length - 1));
  enable('approve-btn', (role === 'Accounts' && status === 'ACCOUNTS_REVIEW') || (role === 'Manager' && status === 'MANAGER_REVIEW') || (role === 'Admin' && status === 'ADMIN_REVIEW'));
  enable('need-info-btn', (role === 'Accounts' && status === 'ACCOUNTS_REVIEW') || (role === 'Manager' && status === 'MANAGER_REVIEW') || (role === 'Admin' && status === 'ADMIN_REVIEW'));
  enable('reject-btn', (role === 'Accounts' && status === 'ACCOUNTS_REVIEW') || (role === 'Manager' && status === 'MANAGER_REVIEW') || (role === 'Admin' && status === 'ADMIN_REVIEW'));
  enable('payment-init-btn', role === 'Accounts' && status === 'PAYMENT_PENDING');
  enable('payment-complete-btn', role === 'Accounts' && status === 'PAYMENT_INITIATED');
  enable('upload-doc-btn', true);
}

async function runReviewAction(kind) {
  if (queueIndex < 0 || queueIndex >= queue.length) return;
  const claim = queue[queueIndex];
  if (!claim || !claim.id) {
    setMessage('Invalid claim selection. Please refresh queue.', true);
    return;
  }
  const version = activeClaim?.version || claim.version;
  const remarks = $('review-remarks').value.trim();
  try {
    if (kind === 'reject' && !confirm('Are you sure you want to reject this claim?')) return;
    if (kind === 'payment-complete' && !confirm('Confirm payment completed? Payment proof and remarks are required.')) return;
    if (kind === 'payment-init') {
      await api(`/expenses/${claim.id}/payment-initiated`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ remarks, version })
      });
    } else if (kind === 'payment-complete') {
      if (!remarks) throw new Error('Enter payment completion remarks');
      await api(`/expenses/${claim.id}/payment-completed`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ remarks, version })
      });
    } else {
      const action = kind === 'approve' ? 'approve' : kind === 'reject' ? 'reject' : 'need_info';
      const endpoint = me.role === 'Accounts'
        ? `/expenses/${claim.id}/accounts-review`
        : me.role === 'Manager'
          ? `/expenses/${claim.id}/manager-review`
          : `/expenses/${claim.id}/admin-review`;
      await api(endpoint, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ action, remarks, version })
      });
    }
    setMessage(`Action applied on ${claim.claim_number}`);
    queue.splice(queueIndex, 1);
    if (queueIndex >= queue.length) queueIndex = queue.length - 1;
    await loadQueue();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function uploadDoc(claimId, file, docType) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('doc_type', docType);
  const response = await fetch(`/expenses/${claimId}/documents`, {
    method: 'POST',
    headers: { 'x-expense-token': getToken() },
    body: formData
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

async function uploadReviewDoc() {
  if (queueIndex < 0 || queueIndex >= queue.length) return;
  const claim = queue[queueIndex];
  if (!claim || !claim.id) {
    setMessage('Invalid claim selection. Please refresh queue.', true);
    return;
  }
  const file = $('review-doc-file').files[0];
  if (!file) return;
  try {
    await uploadDoc(claim.id, file, $('review-doc-type').value);
    setMessage('Document uploaded');
    await renderActiveClaim();
  } catch (error) {
    setMessage(error.message, true);
  }
}

function bindReviewerActions() {
  $('prev-btn').addEventListener('click', async () => {
    if (queueIndex > 0) {
      queueIndex -= 1;
      await renderActiveClaim();
    }
  });
  $('next-btn').addEventListener('click', async () => {
    if (queueIndex < queue.length - 1) {
      queueIndex += 1;
      await renderActiveClaim();
    }
  });
  $('approve-btn').addEventListener('click', () => runReviewAction('approve'));
  $('need-info-btn').addEventListener('click', () => runReviewAction('need-info'));
  $('reject-btn').addEventListener('click', () => runReviewAction('reject'));
  $('payment-init-btn').addEventListener('click', () => runReviewAction('payment-init'));
  $('payment-complete-btn').addEventListener('click', () => runReviewAction('payment-complete'));
  $('upload-doc-btn').addEventListener('click', uploadReviewDoc);
  $('claim-refresh-btn').addEventListener('click', renderActiveClaim);
  $('refresh-queue-btn').addEventListener('click', loadQueue);
}

function getDashboardQuery() {
  const params = new URLSearchParams();
  const add = (key, val) => { if (val !== '' && val != null) params.set(key, val); };
  add('from_date', $('d-from').value);
  add('to_date', $('d-to').value);
  add('employee_id', $('d-employee').value);
  add('category_id', $('d-category').value);
  add('status', $('d-status').value.trim());
  add('min_amount', $('d-min').value);
  add('max_amount', $('d-max').value);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function renderSimpleTable(elId, rows, cols) {
  const el = $(elId);
  if (!rows.length) {
    el.innerHTML = '<div class="mini">No data</div>';
    return;
  }
  const head = `<tr>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr>`;
  const body = rows.slice(0, 25).map((r) => `<tr>${cols.map((c) => `<td>${r[c.key] ?? '-'}</td>`).join('')}</tr>`).join('');
  el.innerHTML = `<div class="table-scroll"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

async function loadDashboard() {
  try {
    const data = await api(`/expenses/dashboard${getDashboardQuery()}`, { headers: getHeaders() });
    const s = data.summary || {};
    $('dashboard-cards').innerHTML = `
      <div>Total Submitted: ${s.total_submitted || 0}</div>
      <div>Total Approved: ${s.total_approved || 0}</div>
      <div>Total Paid: ${s.total_paid || 0}</div>
      <div>Pending Accounts: ${s.pending_accounts || 0}</div>
      <div>Pending Manager: ${s.pending_manager || 0}</div>
      <div>Pending Admin: ${s.pending_admin || 0}</div>
      <div>Rejected: ${s.rejected || 0}</div>
      <div>Payment Pending: ${s.payment_pending || 0}</div>
      <div>Payment Initiated: ${s.payment_initiated || 0}</div>
      <div>Total Amount Claimed: ${Number(s.total_amount_claimed || 0).toFixed(2)}</div>
      <div>Total Amount Paid: ${Number(s.total_amount_paid || 0).toFixed(2)}</div>
    `;
    renderSimpleTable('table-pending', data.pendingQueue || [], [
      { key: 'claim_number', label: 'Claim' }, { key: 'employee_name', label: 'Employee' }, { key: 'status', label: 'Status' }, { key: 'amount', label: 'Amount' }
    ]);
    renderSimpleTable('table-payment', data.paymentQueue || [], [
      { key: 'claim_number', label: 'Claim' }, { key: 'employee_name', label: 'Employee' }, { key: 'status', label: 'Status' }, { key: 'amount', label: 'Amount' }
    ]);
    renderSimpleTable('table-category', data.categoryTotals || [], [
      { key: 'category', label: 'Category' }, { key: 'count', label: 'Count' }, { key: 'amount', label: 'Amount' }
    ]);
    renderSimpleTable('table-employee', data.employeeTotals || [], [
      { key: 'employee', label: 'Employee' }, { key: 'count', label: 'Count' }, { key: 'amount', label: 'Amount' }
    ]);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function exportCsv() {
  try {
    const response = await fetch(`/expenses/export${getDashboardQuery()}`, { headers: { 'x-expense-token': getToken() } });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Export failed');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function initApp() {
  $('me-label').textContent = `Role: ${String(me.role || '').toLowerCase()}`;
  const dashboardLink = $('expense-dashboard-link');
  const transportLink = $('manager-transport-link');
  if (dashboardLink) {
    dashboardLink.style.display = ['Employee', 'Accounts', 'Manager', 'Admin'].includes(me.role) ? 'inline-block' : 'none';
  }
  if (transportLink) {
    transportLink.style.display = ['Accounts', 'Manager', 'Admin'].includes(me.role) ? 'inline-block' : 'none';
  }
  if (me.role === 'Employee') {
    $('employee-panel').style.display = '';
    $('reviewer-panel').style.display = 'none';
    await loadCategories();
    await loadMyClaims();
  } else {
    $('employee-panel').style.display = 'none';
    $('reviewer-panel').style.display = '';
    await loadQueue();
  }
}

function setup() {
  $('login-btn').addEventListener('click', login);
  $('logout-btn').addEventListener('click', () => {
    clearSession();
    window.location.reload();
  });
  $('create-claim-btn').addEventListener('click', createAndSubmitClaim);
  const loadDashboardBtn = $('load-dashboard-btn');
  if (loadDashboardBtn) loadDashboardBtn.addEventListener('click', loadDashboard);
  const exportCsvBtn = $('export-csv-btn');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCsv);
  bindReviewerActions();
  $('expense-notifications-btn')?.addEventListener('click', async () => {
    $('expense-notification-modal').style.display = 'flex';
    await loadExpenseNotifications();
  });
  $('expense-notification-close-btn')?.addEventListener('click', () => {
    $('expense-notification-modal').style.display = 'none';
  });
  $('expense-mark-read-btn')?.addEventListener('click', markExpenseNotificationsRead);

  loadSession();
  if (me && getToken()) {
    $('login-panel').style.display = 'none';
    $('app-panel').style.display = '';
    if ($('logout-btn')) $('logout-btn').style.display = 'inline-block';
    if ($('me-label')) $('me-label').style.display = 'inline-block';
    initApp().catch((error) => {
      clearSession();
      $('app-panel').style.display = 'none';
      $('login-panel').style.display = '';
      if ($('logout-btn')) $('logout-btn').style.display = 'none';
      if ($('me-label')) $('me-label').style.display = 'none';
      $('login-msg').textContent = error.message;
    });
    if (expenseNotifPoll) clearInterval(expenseNotifPoll);
    loadExpenseNotifications();
    expenseNotifPoll = setInterval(() => {
      if (!me || !getToken()) return;
      loadExpenseNotifications();
    }, 15000);
  } else {
    if ($('logout-btn')) $('logout-btn').style.display = 'none';
    if ($('me-label')) $('me-label').style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', setup);
