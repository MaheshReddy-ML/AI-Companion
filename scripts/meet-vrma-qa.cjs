const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 650, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'warning') console.log(m.text()); });
  await page.route('**/vrma-qa', r => r.fulfill({ contentType:'text/html', body: `<!doctype html><body style="margin:0;background:#252638"><div id="avatar" style="height:800px"></div><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/","@pixiv/three-vrm":"https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.5.5/lib/three-vrm.module.min.js","@pixiv/three-vrm-animation":"https://cdn.jsdelivr.net/npm/@pixiv/three-vrm-animation@3.5.5/lib/three-vrm-animation.module.min.js"}}</script><script type="module">import {createEmoraAvatarStage} from '/static/js/emora-avatar-stage.js';window.stage=createEmoraAvatarStage(document.querySelector('#avatar'),{vrma:true,greetingAction:false});</script>` }));
  await page.goto('http://127.0.0.1:8000/vrma-qa');
  await page.waitForFunction(() => !!window.stage);
  const reports=[];
  fs.mkdirSync('tmp/meet-qa',{recursive:true});
  for(const model of ['female-yuna','male-haru','rose','robert']) {
    await page.evaluate(async model => stage.setCharacter({id:model,model:`/static/images/companions/${model}.vrm`}), model);
    await page.waitForFunction(() => stage.getDiagnostics().runtime.vrma.loaded === 33, null, {timeout:30000});
    await page.waitForTimeout(2700);
    await page.screenshot({path:`tmp/meet-qa/vrma-${model}-standing.png`});
    await page.evaluate(() => stage.greet('wave'));
    await page.waitForTimeout(800);
    await page.screenshot({path:`tmp/meet-qa/vrma-${model}-wave.png`});
    const diagnostics = await page.evaluate(() => stage.getDiagnostics());
    assert.equal(diagnostics.runtime.vrma.active,'wave');
    reports.push({model, ...diagnostics.runtime});
    {
      for (const gesture of ['point', 'open_palm', 'think', 'shrug', 'overte-idle-talking', 'overte-idle-talking-4', 'overte-nod-3', 'overte-neutral', 'overte-idle-talking-6', 'overte-idle-talking-7', 'overte-idle-3', 'overte-relaxed-3']) {
        await page.evaluate(gesture => stage.greet(gesture), gesture);
        await page.waitForTimeout(900);
        await page.screenshot({path:`tmp/meet-qa/vrma-${model}-${gesture}.png`});
      }
    }
    await page.evaluate(() => {stage.setSpeaking(false);stage.setListening(true);});
    await page.waitForTimeout(250);
    assert.notEqual(await page.evaluate(() => stage.getDiagnostics().runtime.vrma.active),'wave');
  }
  const timing = await page.evaluate(async () => {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { VRMLoaderPlugin } = await import('@pixiv/three-vrm');
    const { createVRMAGestureController } = await import('/static/js/emora-vrma-controller.js?v=20260911-motion2');
    const loader = new GLTFLoader(); loader.register(parser => new VRMLoaderPlugin(parser));
    const { userData: { vrm } } = await loader.loadAsync('/static/images/companions/robert.vrm');
    const controller = await createVRMAGestureController(); controller.attach(vrm);
    const check = (condition, label) => { if (!condition) throw new Error(label); };
    check(controller.play('overte-idle-talking-6', {force:true, ambient:true}), 'ambient clip starts');
    check(controller.diagnostics().duration <= 6, 'long clips must be bounded');
    controller.beginFrame(); controller.update(1.2, {speaking:true});
    check(controller.play('wave', {duration:1.8}), 'meaningful gesture replaces ambient');
    controller.beginFrame(); controller.update(0.7, {speaking:true});
    controller.stop(0.14);
    controller.beginFrame(); controller.update(0.2, {listening:true});
    check(!controller.hasActiveGesture(), 'interruption fades promptly');
    controller.play('wave', {force:true,duration:1.8});
    controller.beginFrame(); controller.update(2, {speaking:true});
    check(!controller.hasActiveGesture(), 'elapsed time completes gesture even across dropped frames');
    // Forced replacement preserves the shown pose at the transition boundary.
    controller.play('open_palm', {force:true});
    controller.beginFrame(); controller.update(0.8, {});
    const hand = vrm.humanoid.getNormalizedBoneNode('rightHand');
    const before = hand.quaternion.clone();
    controller.play('wave', {force:true});
    controller.beginFrame(); controller.update(0, {});
    check(before.angleTo(hand.quaternion) < 0.001, 'replacement must not snap');
    controller.dispose();
    const reduced = await createVRMAGestureController({reducedMotion:true}); reduced.attach(vrm);
    check(!reduced.play('wave', {force:true}), 'reduced motion disables clips');
    reduced.dispose();
    return {boundedClips:true, ambientPreemption:true, interruption:true, elapsedTiming:true, continuousReplacement:true, reducedMotion:true};
  });
  reports.push({timing});
  await page.evaluate(() => stage.destroy());
  assert.equal(errors.length,0, errors.join('\n'));
  fs.writeFileSync('tmp/meet-qa/vrma-report.json',JSON.stringify(reports,null,2));
  console.log(reports.map(r=>r.timing || ({model:r.model,loaded:r.vrma.loaded,active:r.vrma.active,fps:r.fps})));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
