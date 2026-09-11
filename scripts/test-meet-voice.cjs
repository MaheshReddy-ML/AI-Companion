// Run actual browser controller functions with deterministic network and clock seams.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('app/static/js/your-emora.js', 'utf8');
function functionSource(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  const end = source.indexOf('\n}', start) + 2;
  assert(start >= 0 && end > start, name);
  return source.slice(start, end);
}
function harness() {
  const timers = new Map(); let id = 0;
  const state = { messages: [], voiceSessionActive: true, characterId: 'Yuna', streamGeneration: 0, streamSources: new Set(), speechGestureTimers: [], debug: {} };
  const requests = [];
  const context = vm.createContext({
    state, console, document: { documentElement: { lang: "en" } }, navigator: { language: "en-US" }, AbortController, crypto: require('node:crypto').webcrypto,
    performance: { now: () => 5000 },
    window: { setTimeout: (fn) => { timers.set(++id, fn); return id; }, clearTimeout: n => timers.delete(n) },
    elements: { messageInput: { value: '', focus() {} }, stage: { dataset: {} } },
    audioPlayer: { paused: true }, URL: { revokeObjectURL() {} },
    renderMessages() {}, updateSignals() {}, stopLipSync() {}, setStatus() {},
    primeVoicePlayback() {}, currentCharacter: () => ({ name: 'Emora' }),
    updateDebugTelemetry() {}, speakReply: async () => {}, resumeContinuousListening() {},
    localStorage: { removeItem() {}, setItem() {} }, getConversationStorageKey: () => 'test', ENTRY_SESSION_ID: '',
    apiRequest: async (url) => { requests.push(url); return {}; },
    SpeechRecognition: class { constructor() { this.events = {}; } addEventListener(k, fn) { this.events[k] = fn; } },
  });
  vm.runInContext(source.slice(source.indexOf('let turnGeneration ='), source.indexOf('function interruptTurn')), context);
  for (const name of ['interruptTurn', 'cancelSpeechPlayback', 'scheduleEndpoint', 'createRecognition', 'sendMessage']) vm.runInContext(functionSource(name), context);
  return { context, state, timers, requests, run: code => vm.runInContext(code, context) };
}
(async () => {
  {
    const h = harness();
    const recognition = h.run('createRecognition()');
    function result(text, final) { const r = [{ transcript: text }]; r.isFinal = final; return r; }
    recognition.events.result({ resultIndex: 0, results: [result('I think', true)] });
    assert.equal(h.state.messages.length, 0, 'a browser final is not an immediate turn endpoint');
    recognition.events.result({ resultIndex: 1, results: [result('I think', true), result('the problem', false)] });
    assert.equal(h.timers.size, 0, 'interim speech blocks submission');
    recognition.events.result({ resultIndex: 1, results: [result('I think', true), result('the problem is timing', true)] });
    assert.equal(h.run('pendingFinal'), 'I think the problem is timing');
    assert.equal(h.context.elements.messageInput.value, 'I think the problem is timing');
    assert.equal(h.timers.size, 1);
    h.state.voiceSessionActive = false;
    [...h.timers.values()][0]();
    assert.equal(h.state.messages.length, 0, 'ending session invalidates endpoint');
  }
  {
    const h = harness();
    const recognition = h.run('createRecognition()');
    const result = [{ transcript: 'Wait, I already know that' }]; result.isFinal = true;
    h.state.speaking = true;
    recognition.events.result({ resultIndex: 0, results: [result] });
    assert.equal(h.run('pendingFinal'), '', 'output echo without mic evidence is ignored');
    h.run('userSpeechUntil = 6000');
    recognition.events.result({ resultIndex: 0, results: [result] });
    assert.equal(h.state.speaking, false);
    assert.equal(h.run('pendingFinal'), 'Wait, I already know that', 'barge-in retains opening words');
  }
  {
    const h = harness(); let finishOld;
    h.context.requestCompanionReply = (text) => text === 'old' ? new Promise(r => finishOld = r) : Promise.resolve({ aiMessage: { content: 'new response' } });
    const old = h.run('sendMessage("old")');
    await new Promise(setImmediate);
    await h.run('sendMessage("new")');
    finishOld({ aiMessage: { content: 'stale response' }, conversation: { id: 'old-id' } });
    await old;
    assert.equal(h.state.messages.at(-1).content, 'new response');
    assert.equal(h.state.conversationId, undefined, 'stale reply cannot change conversation');
    assert.equal(h.state.messages[1].content, 'Response interrupted.');
    assert(h.requests.some(url => url.endsWith('/cancel')));
  }
  {
    const h = harness(); let failOld;
    h.context.requestCompanionReply = (text) => text === 'old' ? new Promise((_, r) => failOld = r) : Promise.resolve({ aiMessage: { content: 'new response' } });
    const old = h.run('sendMessage("old")'); await new Promise(setImmediate);
    await h.run('sendMessage("new")');
    failOld(new Error('late failure')); await old;
    assert.equal(h.state.messages.at(-1).content, 'new response', 'stale failure cannot remove current response');
    assert.equal(h.state.thinking, false);
  }
  {
    const h = harness();
    h.state.speaking = true;
    let stopped = 0;
    h.state.streamSources.add({ stop() { stopped++; } });
    h.run('interruptTurn()');
    assert.equal(stopped, 1);
    assert.equal(h.state.streamSources.size, 0);
    assert.equal(h.state.speaking, false);
    assert.equal(h.state.streamGeneration, 1);
  }
  {
    const h = harness(); const spoken = []; const finish = [];
    h.context.speakReply = text => { spoken.push(text); return new Promise(resolve => finish.push(resolve)); };
    h.context.requestCompanionReply = async (text, signal, id, onEvent) => {
      onEvent({event:'sentence',text:'First sentence.'});
      onEvent({event:'sentence',text:'Second sentence.'});
      return {aiMessage:{content:'First sentence. Second sentence.'}};
    };
    await h.run('sendMessage("hello")');
    assert.deepEqual(spoken, ['First sentence.'], 'second segment waits for first playback');
    finish[0](); await new Promise(setImmediate);
    assert.deepEqual(spoken, ['First sentence.', 'Second sentence.'], 'final reply is not spoken twice');
    finish[1]();
  }
  {
    const h = harness(); const spoken = []; let finish;
    h.context.speakReply = text => { spoken.push(text); return new Promise(resolve => finish = resolve); };
    h.context.requestCompanionReply = async (text, signal, id, onEvent) => {
      onEvent({event:'sentence',text:'First sentence.'});
      onEvent({event:'sentence',text:'Stale queued sentence.'});
      return {aiMessage:{content:'First sentence. Stale queued sentence.'}};
    };
    await h.run('sendMessage("hello")');
    h.run('interruptTurn()'); finish(); await new Promise(setImmediate);
    assert.deepEqual(spoken,['First sentence.'], 'interruption invalidates queued sentences');
  }
  console.log('Meet voice: endpointing, final/interim accumulation, stale success, stale failure, server cancellation and playback interruption passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
