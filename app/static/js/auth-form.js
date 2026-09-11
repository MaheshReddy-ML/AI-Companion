// Shared interaction primitives; endpoint and session contracts stay in each page.
export function initAuthFields(form, toggle, password) {
  const fields = [...form.querySelectorAll('input')];
  const errors = new Map();
  for (const field of fields) {
    const error = document.createElement('span');
    error.id = `${field.id}-error`;
    error.className = 'doorway-error';
    field.closest('.doorway-field').append(error);
    field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
    errors.set(field, error);
    field.addEventListener('input', () => {
      field.removeAttribute('aria-invalid');
      error.textContent = '';
    });
  }
  toggle.setAttribute('aria-controls', password.id);
  toggle.setAttribute('aria-pressed', 'false');
  toggle.addEventListener('click', () => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    toggle.textContent = visible ? 'Hide' : 'Show';
    toggle.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} password`);
    toggle.setAttribute('aria-pressed', String(visible));
  });
  return (rules) => {
    let first = null;
    for (const [field, message] of rules) {
      errors.get(field).textContent = message || '';
      field.setAttribute('aria-invalid', String(Boolean(message)));
      if (message && !first) first = field;
    }
    first?.focus();
    return !first;
  };
}

export function initializeGoogleSignIn(slot, callback, text) {
  if (!slot || !window.APP_CONFIG?.googleClientId) return;
  if (!window.google?.accounts?.id) {
    slot.textContent = 'Google sign-in is unavailable. Please use the form above.';
    slot.classList.add('muted');
    return;
  }
  window.google.accounts.id.initialize({client_id: window.APP_CONFIG.googleClientId, callback});
  // Reserve the slot and measure the actual mobile container, including after rotation.
  let lastWidth = 0;
  const render = () => {
    const width = Math.max(200, Math.min(400, Math.floor(slot.getBoundingClientRect().width)));
    if (width === lastWidth) return;
    lastWidth = width;
    slot.replaceChildren();
    window.google.accounts.id.renderButton(slot, {theme: 'outline', size: 'large', shape: 'rectangular', text, width});
  };
  render();
  const observer = new ResizeObserver(render);
  observer.observe(slot);
  window.addEventListener('pagehide', () => observer.disconnect(), {once: true});
}
