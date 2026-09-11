// Presentation-only behavior. Conversation data and requests remain in dashboard.js.
const layout = document.querySelector('.chat-route-layout');
const sidebar = document.getElementById('dashboard-sidebar');
const tools = document.getElementById('companion-tools');
const menu = document.querySelector('.chat-actions-menu');
const mobile = window.matchMedia('(max-width: 900px)');
const conversationButton = document.querySelector('button[data-chat-view="converse"]');
const historyButton = document.querySelector('button[data-chat-view="navigate"]');
const optionsButton = document.querySelector('button[data-chat-view="inspect"]');
const background = [...document.querySelectorAll('.chat-route-main, .mobile-app-nav, .workspace-command-trigger')];
const historyOpen = () => mobile.matches && layout?.dataset.chatView === 'navigate';
const visibleControls = (root) => [...root.querySelectorAll('a[href],button,input,summary,select,textarea,[tabindex="0"]')].filter(node => !node.disabled && node.getClientRects().length && !node.closest('[hidden]'));
function syncHistory() {
  const open = historyOpen();
  background.forEach(node => { node.inert = open; });
  sidebar?.setAttribute('aria-label', open ? 'Conversation history' : 'Emora workspace');
  if (open) {
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
  } else {
    sidebar?.removeAttribute('role');
    sidebar?.removeAttribute('aria-modal');
  }
}
function closeHistory() {
  conversationButton?.click();
  syncHistory();
  historyButton?.focus();
}
document.querySelector('[data-chat-history-close]')?.addEventListener('click', closeHistory);
if (layout) new MutationObserver(syncHistory).observe(layout, { attributes: true, attributeFilter: ['data-chat-view'] });
mobile.addEventListener('change', syncHistory);
syncHistory();
sidebar?.addEventListener('click', event => {
  if (historyOpen() && event.target.closest('[data-action="select"], #new-chat-button')) closeHistory();
});
menu?.addEventListener('click', event => {
  if (event.target.closest('button')) menu.open = false;
});
document.addEventListener('click', event => {
  if (menu?.open && !menu.contains(event.target)) menu.open = false;
});
if (tools) new MutationObserver(() => {
  if (!tools.hidden) {
    document.getElementById('companion-tools-close')?.focus();
  } else if (layout?.dataset.chatView === 'inspect') {
    conversationButton?.click();
    optionsButton?.focus();
  }
}).observe(tools, { attributes:true, attributeFilter:['hidden'] });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (historyOpen()) { event.preventDefault(); closeHistory(); }
    else if (menu?.open) { menu.open = false; menu.querySelector('summary').focus(); }
    else if (tools && !tools.hidden) document.getElementById('companion-tools-close')?.click();
  }
  if (event.key === 'Tab' && historyOpen() && sidebar) {
    const controls = visibleControls(sidebar);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
  }
});
