// Focused page sections retain their native links and shareable fragment URLs.
const workspace = document.querySelector('[data-section-workspace]');
if (workspace) {
  const links = [...workspace.querySelectorAll('[data-section-link]')];
  const panels = [...workspace.querySelectorAll('[data-section-panel]')];
  const ids = links.map(link => link.hash.slice(1));
  function activate(hash, focus = false) {
    const target = document.getElementById(hash);
    const key = ids.includes(hash) ? hash : target?.closest('[data-section-panel]')?.dataset.sectionPanel || ids[0];
    panels.forEach(panel => { panel.hidden = panel.dataset.sectionPanel !== key; });
    links.forEach(link => {
      if (link.hash === '#' + key) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (focus) {
      const panel = panels.find(panel => panel.dataset.sectionPanel === key);
      panel?.setAttribute('tabindex', '-1');
      panel?.focus({ preventScroll: true });
      if (window.innerWidth < 700) panel?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }
  workspace.addEventListener('click', event => {
    const link = event.target.closest('[data-section-link]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState(null, '', link.hash);
    activate(link.hash.slice(1), true);
  });
  window.addEventListener('hashchange', () => activate(location.hash.slice(1)));
  window.addEventListener('popstate', () => activate(location.hash.slice(1)));
  activate(location.hash.slice(1));
}
document.getElementById('profile-upload-button')?.addEventListener('click', () => document.getElementById('avatar-upload-input')?.click());
