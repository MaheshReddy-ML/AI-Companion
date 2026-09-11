// Isolated browser fixtures exercise the real page, avatar and controller.
// Requires Playwright (NODE_PATH may point to an external installation).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const output = 'tmp/meet-qa'; fs.mkdirSync(output, { recursive: true });
  const reports = [];
  for (const width of [390, 320, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    await context.addInitScript(() => {
      localStorage.setItem('token', 'isolated-ui-fixture');
      window.SpeechRecognition = class extends EventTarget {
        constructor() { super(); window.qaRecognition = this; }
        start() {}
        abort() { this.dispatchEvent(new Event('end')); }
        emit(text, final = true) {
          const event = new Event('result');
          const result = [{ transcript: text, confidence: 0.95 }]; result.isFinal = final;
          event.resultIndex = 0; event.results = [result]; this.dispatchEvent(event);
        }
      };
    });
    const page = await context.newPage(); const errors = []; let chatCalls = 0; let pcmPlayback = false;
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (message.type() === 'warning') console.log(message.text()); });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body = {};
      if (path === '/api/auth/verify') body = { verified: true, user: { id: 'fixture', name: 'Voice QA', access: { entitlements: ['voice'] } } };
      if (path === '/api/chat/stream') {
        chatCalls++;
        return route.fulfill({contentType: 'application/x-ndjson', body: [
          {event:'sentence',text:'This is a browser test response.'},
          {event:'complete',response:{aiMessage:{content:'This is a browser test response.'}}},
        ].map(item=>JSON.stringify(item)).join('\n')+'\n'});
      }
      if (path === '/api/voices/speak' && pcmPlayback) {
        const pcm = Buffer.alloc(24000 * 2 * 3);
        for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / 24000) * 3000), i * 2);
        return route.fulfill({ contentType: 'audio/L16;rate=24000;channels=1', body: pcm });
      }
      if (path === '/api/voices/speak') return route.fulfill({ status: 503, body: 'Intentional TTS failure fixture' });
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('http://127.0.0.1:8000/your-emora');
    await page.locator('#emora-listen-button').click();
    await page.waitForFunction(() => Boolean(window.qaRecognition));
    await page.waitForFunction(() => document.querySelector('#emora-live-stage').dataset.voiceDetector === 'silero-v5', null, {timeout:20000});
    await page.evaluate(() => window.qaRecognition.emit('I am still thinking', false));
    await page.waitForTimeout(1000);
    assert.equal(chatCalls, 0, 'interim must not submit');
    await page.evaluate(() => window.qaRecognition.emit('I am still thinking about the timing', true));
    await page.waitForFunction(() => document.querySelector('.emora-message.assistant')?.textContent.includes('browser test response'));
    await page.waitForTimeout(500);
    assert.equal(chatCalls, 1);
    assert.equal(await page.locator('#emora-message-input').isEnabled(), true);
    await page.locator('#emora-listen-button').click();
    assert.equal(await page.locator('#emora-listen-button').getAttribute('aria-pressed'), 'false');
    pcmPlayback = true;
    for (let turn = 0; turn < 2; turn++) {
      await page.locator('#emora-message-input').fill(`Playback interruption ${turn}`);
      await page.locator('#emora-message-input').press('Enter');
      await page.waitForFunction(() => document.querySelector('#emora-live-stage').dataset.companionState === 'EMORA_SPEAKING', null, { timeout: 5000 }).catch(async e => { console.error(await page.locator('#emora-status').textContent(), errors); throw e; });
      await page.locator('#emora-interrupt-button').click();
      await page.waitForFunction(() => document.querySelector('#emora-live-stage').dataset.speaking === 'false');
    }
    const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, canvas: !!document.querySelector('canvas'), geometry: ['.emora-live-stage', '.mobile-app-nav', '.emora-composer-dock'].map(s => { const e = document.querySelector(s); return [s, e?.getBoundingClientRect().toJSON()]; }), dock: (() => { const b = document.querySelector('.emora-composer-dock').getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; })() }));
    await page.screenshot({ path: `${output}/meet-${width}.png`, fullPage: true });
    reports.push({ width, chatCalls, errors, ...layout });
    const nav = layout.geometry.find(([selector]) => selector === '.mobile-app-nav')[1];
    if (nav.height) assert(layout.dock.bottom <= nav.top, `navigation covers composer at ${width}`);
    assert(!layout.overflow, `horizontal overflow at ${width}`);
    assert(layout.dock.bottom <= 800, `composer below viewport at ${width}`);
    assert.equal(errors.length, 0);
    await context.close();
  }
  await browser.close(); fs.writeFileSync(`${output}/report.json`, JSON.stringify(reports, null, 2)); console.log(JSON.stringify(reports, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
