const header = document.querySelector('[data-header]');
const toggle = document.querySelector('[data-nav-toggle]');
const nav = document.querySelector('[data-nav]');

const updateHeader = () => {
  header?.classList.toggle('scrolled', window.scrollY > 24);
};

const closeNav = () => {
  nav?.classList.remove('open');
  nav?.querySelectorAll('details[open]').forEach((menu) => menu.removeAttribute('open'));
  document.body.classList.remove('nav-open');
  toggle?.setAttribute('aria-expanded', 'false');
};

toggle?.addEventListener('click', () => {
  const open = !nav?.classList.contains('open');
  nav?.classList.toggle('open', open);
  document.body.classList.toggle('nav-open', open);
  toggle.setAttribute('aria-expanded', String(open));
});

nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeNav));
window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 },
  );
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
} else {
  document.querySelectorAll('.reveal').forEach((element) => element.classList.add('visible'));
}

const getSessionId = () => {
  const key = 'silica_contact_visitor';
  const now = Date.now();
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    localStorage.removeItem(key);
  }
  if (saved?.id && saved.expires > now) {
    return saved.id;
  }
  const sessionId = crypto.randomUUID?.() || `${now}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, JSON.stringify({ id: sessionId, expires: now + (30 * 24 * 60 * 60 * 1000) }));
  return sessionId;
};

document.querySelectorAll('[data-contact-event]').forEach((link) => {
  link.addEventListener('click', () => {
    const body = JSON.stringify({
      event: link.dataset.contactEvent,
      page: window.location.pathname,
      session_id: getSessionId(),
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/contact-events', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/contact-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    }
  });
});
