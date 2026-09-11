import { apiRequest, getToken } from './common.js';
let enabled = false, analytics = false, audioContext = null;
function update(preferences) { enabled = preferences?.sensoryFeedback === true; analytics = preferences?.productAnalytics === true; document.querySelectorAll('[data-test-state-cue]').forEach(button => { button.disabled = !enabled; }); }
async function sync() { if (!getToken()) { update({}); return; } try { update((await apiRequest('/api/personal/preferences', {auth:true})).preferences); } catch { update({}); } }
async function unlock() {
  if (!enabled) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try { audioContext ||= new Audio(); if (audioContext.state === 'suspended') await audioContext.resume(); } catch { /* Text confirmation is always available. */ }
}
window.addEventListener('pointerdown', unlock, {passive:true});
window.addEventListener('keydown', unlock);
window.addEventListener('emora:preferences-changed', event => update(event.detail));
window.addEventListener('storage', sync);
window.addEventListener('emora:sensory-cue', async event => {
  if (!enabled || document.hidden) return;
  const pattern = {saved:[620,.09],complete:[720,.12],accepted:[520,.09],joined:[680,.1],interrupted:[330,.1],error:[240,.12]}[event.detail?.cue];
  if (!pattern) return;
  await unlock();
  if (!enabled) return;
  try {
    if (audioContext?.state === 'running') {
      const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),now=audioContext.currentTime;
      oscillator.frequency.value=pattern[0];gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.05,now+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+pattern[1]);oscillator.connect(gain).connect(audioContext.destination);oscillator.start();oscillator.stop(now+pattern[1]+.02);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }
    const vibration=navigator.vibrate?.(event.detail.cue==='error'?[18,20,18]:18);
    if(event.detail.preview){const status=document.getElementById('cue-test-status');if(status)status.textContent=(audioContext?.state==='running'?'Sound played. ':'Sound is unavailable in this browser. ')+(vibration?'Vibration sent.':'Vibration is not supported or enabled on this device.');}
  } catch { /* Device support varies; no essential information depends on cues. */ }
});
document.querySelector('[data-test-state-cue]')?.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('emora:sensory-cue',{detail:{cue:'saved',preview:true}}));
  const status=document.getElementById('cue-test-status');if(status)status.textContent='Trying a short cue…';
});
void sync();

window.addEventListener('emora:operation-complete', event => {
  if (!analytics || !getToken() || event.detail?.method !== 'POST') return;
  const path=event.detail.path;
  const action=path==='/api/workspace/research-shelf' ? ['source_saved','/research'] : path==='/api/personal/goals' ? ['first_goal_created','/goals'] : /^\/api\/premium\/sessions\/[^/]+\/complete$/.test(path) ? ['session_completed','/sessions'] : null;
  if (action) void apiRequest('/api/product/events',{auth:true,method:'POST',body:{name:action[0],properties:{route:action[1],result:'success'}}}).catch(()=>{});
});
