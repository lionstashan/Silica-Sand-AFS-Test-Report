(function initPermissions(global) {
  const EMPLOYEE_TOKEN_KEY = 'employeeTransportToken';
  const VALID_EMPLOYEE_ROLES = ['Gate', 'Dispatch', 'Loading', 'Weighbridge', 'LAB', 'Expense', 'Accounts', 'Manager', 'Admin'];
  const EXPENSE_ACCESS_ROLES = ['Expense', 'Accounts', 'Manager', 'Admin'];

  function getEmployeeSession() {
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
    const role = String(localStorage.getItem('userRole') || '').trim();
    return VALID_EMPLOYEE_ROLES.includes(role) ? role : null;
  }

  function getEmployeeToken() {
    return String(localStorage.getItem(EMPLOYEE_TOKEN_KEY) || '').trim();
  }

  function hasAnyRole(roles = []) {
    const role = getCurrentRole();
    return !!role && roles.includes(role);
  }

  function hasExpenseAccess() {
    return hasAnyRole(EXPENSE_ACCESS_ROLES);
  }

  function getAuthHeaders() {
    const role = getCurrentRole();
    const token = getEmployeeToken();
    if (!role || !token) return {};
    return {
      'x-user-role': role,
      'x-user-token': token
    };
  }

  function getNextParam(pathname) {
    const target = String(pathname || `${window.location.pathname || '/'}${window.location.search || ''}`);
    return encodeURIComponent(target);
  }

  function redirectToEmployeeLogin(pathname) {
    const next = getNextParam(pathname);
    window.location.replace(`/?next=${next}`);
  }

  function requireEmployeeSession(pathname) {
    const role = getCurrentRole();
    const token = getEmployeeToken();
    if (!role || !token) {
      redirectToEmployeeLogin(pathname);
      return false;
    }
    return true;
  }

  function showNoAccess(message = 'You do not have access to this section. Contact Admin.') {
    showModal('Access Required', message);
  }

  function ensureToastWrap() {
    let wrap = document.getElementById('global-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'global-toast-wrap';
      wrap.className = 'global-toast-wrap';
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  function showToast(message, type = 'success') {
    if (!message) return;
    const wrap = ensureToastWrap();
    wrap.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = `global-toast ${type === 'error' ? 'error' : 'success'}`;
    toast.textContent = String(message);
    wrap.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (wrap.contains(toast)) wrap.removeChild(toast);
      }, 200);
    }, type === 'error' ? 5000 : 2600);
  }

  function ensureModal() {
    let modal = document.getElementById('global-feedback-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'global-feedback-modal';
    modal.className = 'global-feedback-modal';
    modal.innerHTML = `
      <div class="global-feedback-modal-card">
        <h3 id="global-feedback-title">Action Required</h3>
        <p id="global-feedback-text"></p>
        <div class="global-feedback-actions">
          <button type="button" id="global-feedback-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#global-feedback-ok')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.style.display = 'none';
    });
    return modal;
  }

  function showModal(title, message) {
    const modal = ensureModal();
    const titleEl = modal.querySelector('#global-feedback-title');
    const textEl = modal.querySelector('#global-feedback-text');
    if (titleEl) titleEl.textContent = title || 'Action Required';
    if (textEl) textEl.textContent = message || '';
    modal.style.display = 'flex';
  }

  function setBusy(button, busy, busyText = 'Processing...') {
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

  function setPageLoading(isLoading, text = 'Loading...') {
    let overlay = document.getElementById('global-page-loading');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'global-page-loading';
      overlay.className = 'global-page-loading';
      overlay.innerHTML = `<div class="global-page-loading-card"><span class="spinner"></span><span id="global-page-loading-text">${text}</span></div>`;
      document.body.appendChild(overlay);
    }
    const textEl = overlay.querySelector('#global-page-loading-text');
    if (textEl) textEl.textContent = text;
    overlay.style.display = isLoading ? 'flex' : 'none';
  }

  async function parseApiError(response, fallback = 'Request failed') {
    const requestId = response.headers.get('x-request-id') || '';
    const data = await response.json().catch(() => ({}));
    const message = data.error || fallback;
    return requestId ? `${message} (Ref: ${requestId})` : message;
  }

  global.AppPermissions = {
    VALID_EMPLOYEE_ROLES,
    EXPENSE_ACCESS_ROLES,
    getEmployeeSession,
    getCurrentRole,
    getEmployeeToken,
    hasAnyRole,
    hasExpenseAccess,
    getAuthHeaders,
    redirectToEmployeeLogin,
    requireEmployeeSession,
    showNoAccess,
    showToast,
    showModal,
    setBusy,
    setPageLoading,
    parseApiError
  };
}(window));
