const TOKEN_KEY = 'expenseToken';
const USER_KEY = 'expenseUser';
let expenseNotifications = [];
let notifPoll = null;
let globalToastTimer = null;

const $ = (id) => document.getElementById(id);

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function setMsg(msg, isError = false) {
  const el = $('msg');
  el.textContent = msg || '';
  el.style.color = isError ? '#b00020' : '#64748b';
  if (msg) showGlobalToast(msg, !isError);
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
  if (globalToastTimer) clearTimeout(globalToastTimer);
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

function setButtonBusy(button, busy, busyText = 'Processing...') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent || '';
    button.disabled = true;
    button.textContent = busyText;
    button.classList.add('is-busy');
  } else {
    button.disabled = false;
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    button.classList.remove('is-busy');
  }
}

function fmt(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function getHeaders() {
  return { 'x-expense-token': getToken() };
}

async function api(path) {
  const res = await fetch(path, { headers: getHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function renderExpenseNotifBadge(unreadCount) {
  const badge = $('expense-notification-badge');
  if (!badge) return;
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
    const rows = await api('/expenses/notifications');
    expenseNotifications = Array.isArray(rows) ? rows : [];
    const unread = expenseNotifications.filter((r) => !r.is_read).length;
    renderExpenseNotifBadge(unread);
    renderExpenseNotifList();
  } catch (_error) {}
}

async function markExpenseNotificationsRead() {
  try {
    await fetch('/expenses/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getHeaders() },
      body: JSON.stringify({})
    });
    await loadExpenseNotifications();
  } catch (_error) {}
}

function qs() {
  const params = new URLSearchParams();
  const add = (k, v) => { if (v !== '' && v != null) params.set(k, v); };
  add('from_date', $('f-from').value);
  add('to_date', $('f-to').value);
  add('status', $('f-status').value.trim());
  add('category_id', $('f-category').value);
  add('min_amount', $('f-min').value);
  add('max_amount', $('f-max').value);
  const q = params.toString();
  return q ? `?${q}` : '';
}

function rowStatusOpen(status) {
  return !['PAYMENT_COMPLETED', 'REJECTED'].includes(status);
}

function renderTable(elId, rows) {
  const el = $(elId);
  if (!rows.length) {
    el.innerHTML = '<div class="mini">No data</div>';
    return;
  }
  const head = `<tr>
    <th>Claim</th><th>Employee</th><th>Pay To</th><th>Voucher</th><th>Date</th><th>Amount</th><th>Category</th><th>Status</th>
  </tr>`;
  const body = rows.map((r) => `<tr>
    <td>${r.claim_number || '-'}</td>
    <td>${r.employee_name || '-'}</td>
    <td>${r.pay_to || '-'}</td>
    <td>${r.voucher_no || '-'}</td>
    <td>${r.claim_date || '-'}</td>
    <td>${r.amount ?? '-'}</td>
    <td>${r.category_name || '-'}</td>
    <td>${r.status || '-'}</td>
  </tr>`).join('');
  el.innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function renderCards(summary) {
  const cards = [
    ['Total Submitted', summary.total_submitted || 0],
    ['Total Approved', summary.total_approved || 0],
    ['Total Paid', summary.total_paid || 0],
    ['Pending Accounts', summary.pending_accounts || 0],
    ['Pending Manager', summary.pending_manager || 0],
    ['Pending Admin', summary.pending_admin || 0],
    ['Payment Pending', summary.payment_pending || 0],
    ['Payment Initiated', summary.payment_initiated || 0],
    ['Rejected', summary.rejected || 0],
    ['Total Claimed', Number(summary.total_amount_claimed || 0).toFixed(2)],
    ['Total Paid Amount', Number(summary.total_amount_paid || 0).toFixed(2)]
  ];
  $('cards').innerHTML = cards.map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
}

async function loadDashboard() {
  const loadBtn = $('load-btn');
  try {
    setButtonBusy(loadBtn, true, 'Loading...');
    setMsg('Loading...');
    const data = await api(`/expenses/dashboard${qs()}`);
    renderCards(data.summary || {});
    const rows = Array.isArray(data.rows) ? data.rows : [];
    renderTable('open-table', rows.filter((r) => rowStatusOpen(r.status)));
    renderTable('completed-table', rows.filter((r) => !rowStatusOpen(r.status)));
    setMsg('');
  } catch (error) {
    setMsg(error.message, true);
  } finally {
    setButtonBusy(loadBtn, false);
  }
}

async function exportCsv() {
  const exportBtn = $('export-btn');
  try {
    setButtonBusy(exportBtn, true, 'Exporting...');
    const response = await fetch(`/expenses/export${qs()}`, { headers: getHeaders() });
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
    setMsg('Export downloaded');
  } catch (error) {
    setMsg(error.message, true);
  } finally {
    setButtonBusy(exportBtn, false);
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('userRole');
  localStorage.removeItem('employeeAuth');
  localStorage.removeItem('employeeTransportToken');
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
  const me = getUser();
  const token = getToken();
  if (!me || !token) {
    window.location.href = '/expense';
    return;
  }
  $('me-label').textContent = window.AppPermissions?.getEmployeeIdentityLabel?.() || `Role: ${String(me.role || '').toLowerCase()}`;
  window.AppPermissions?.renderRoleSwitcher?.('role-switcher', {
    Gate: '/',
    Dispatch: '/dashboard',
    Loading: '/dashboard',
    Weighbridge: '/dashboard',
    LAB: '/reports',
    Expense: '/expense-dashboard',
    Accounts: '/expense-dashboard',
    Manager: '/expense-dashboard',
    Admin: '/expense-dashboard'
  });
  $('transport-link').style.display = ['Accounts', 'Manager', 'Admin'].includes(me.role) ? 'inline-block' : 'none';
  $('load-btn').addEventListener('click', loadDashboard);
  $('export-btn').addEventListener('click', exportCsv);
  $('logout-btn').addEventListener('click', logout);
  $('expense-notifications-btn')?.addEventListener('click', async () => {
    $('expense-notification-modal').style.display = 'flex';
    await loadExpenseNotifications();
  });
  $('expense-notification-close-btn')?.addEventListener('click', () => {
    $('expense-notification-modal').style.display = 'none';
  });
  $('expense-mark-read-btn')?.addEventListener('click', markExpenseNotificationsRead);
  if (notifPoll) clearInterval(notifPoll);
  await loadExpenseNotifications();
  notifPoll = setInterval(() => {
    if (!getToken()) return;
    loadExpenseNotifications();
  }, 15000);
  await loadDashboard();
}

document.addEventListener('DOMContentLoaded', init);
