const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.env.EMORA_QA_BASE || 'http://127.0.0.1:8000';
const output = process.env.EMORA_QA_OUTPUT || 'tmp/launch-qa';
fs.mkdirSync(output, { recursive: true });
(async () => {
 const browser = await chromium.launch({channel:'chrome',headless:true});
 const context = await browser.newContext({serviceWorkers:"block"});
 const page = await context.newPage();
 const errors=[],layouts=[],accessibility=[],requests=new Set();
 page.on('pageerror',e=>errors.push({route:page.url(),error:e.message}));
 page.on('request',r=>{if(!r.url().startsWith(base))requests.add(r.url());});
 let token;
 try {
  const email=`qa-completion-${Date.now()}@example.com`,password='Emora-QA-Only-963!';
  const seed=await context.request.post(base+'/api/auth/register',{data:{name:'Completion QA',email,password}});
  assert.equal(seed.ok(),true,await seed.text()); token=(await seed.json()).token;
  assert.ok(token);
  await context.request.patch(base+'/api/product/onboarding',{headers:{Authorization:`Bearer ${token}`},data:{status:'skipped'}});
  await page.goto(base+'/login');
  await page.locator('#identifier').fill(email); await page.locator('#password').fill(password);
  await page.locator('#login-submit').click(); await page.waitForURL('**/dashboard');
  const routes=process.env.EMORA_QA_ROUTES ? process.env.EMORA_QA_ROUTES.split(',') : ['/','/dashboard','/chat','/sessions','/insights','/journal','/goals','/research','/community','/together','/notifications','/profile','/payment','/focus-together','/help','/trust','/status','/changelog','/offline'];
  for(const theme of ['light','dark']) {
   await page.evaluate(t=>localStorage.setItem('theme',t),theme);
   for(const width of (process.env.EMORA_QA_WIDTHS ? process.env.EMORA_QA_WIDTHS.split(',').map(Number) : process.env.EMORA_QA_QUICK ? [390] : [320,375,390,430,768,1440])) {
    await page.setViewportSize({width,height:900});
    for(const route of routes) {
     await page.goto(base+route); await page.waitForLoadState('networkidle'); await page.evaluate(()=>document.fonts.ready);
     assert.equal(new URL(page.url()).pathname,route,'Unexpected route redirect');
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
     if(overflow) console.log('Overflow elements',route,width,await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,id:e.id,right:e.getBoundingClientRect().right,width:innerWidth,scroll:document.documentElement.scrollWidth}))));
     layouts.push({route,width,theme,overflow});
     if(width===390) {
      const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      accessibility.push({route,theme,violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
     }
     if([390,1440].includes(width)&&['/','/dashboard','/chat','/profile'].includes(route)) await page.screenshot({path:`${output}/${route.slice(1)||'home'}-${theme}-${width}.png`,fullPage:true,animations:'disabled'});
    }
   }
  }
  await page.goto(base+'/');
  await page.locator('#demo-talk-tab').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#demo-reflect-tab').getAttribute('aria-selected'),'true');
  await page.setViewportSize({width:320,height:568});await page.goto(base+'/notifications');
  await page.locator('#workspace-command-trigger').click();await page.locator('#workspace-command-input').waitFor({state:'visible'});await page.keyboard.press('Escape');
  await page.locator('#mobile-more').click();
  assert.equal(await page.locator('#mobile-more').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('.navigation-sheet a').count(),13);
  await page.screenshot({path:output+'/navigation-320.png',animations:'disabled'});
  for(let i=0;i<18;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#mobile-navigation-dialog')),true);}
  await page.keyboard.press('Escape');assert.equal(await page.locator('#mobile-more').evaluate(e=>e===document.activeElement),true);
  await page.locator('#mobile-more').click();await page.locator('.navigation-sheet a[href="/journal"]').click();await page.waitForURL('**/journal');
  await page.locator('#mobile-more').click();assert.equal(await page.locator('.navigation-sheet a[href="/journal"]').getAttribute('aria-current'),'page');
  await page.setViewportSize({width:1440,height:900});assert.equal(await page.locator('#mobile-navigation-dialog').evaluate(e=>e.open),false);
  await page.goto(base+'/chat');
  await page.locator('button[data-chat-view="inspect"]').click();
  await page.locator('#companion-tools').waitFor({state:'visible'});
  await page.locator('#companion-tools-close').click();
  await page.locator('#companion-tools').waitFor({state:'hidden'});
  await page.route('**/api/auth/verify',route=>route.fulfill({status:503,contentType:'application/json',body:'{"detail":"Temporarily unavailable"}'}));
  await page.goto(base+'/dashboard');
  await page.locator('#session-retry-notice').waitFor();
  assert.equal(await page.evaluate(()=>Boolean(localStorage.getItem('token'))),true);
  await page.unroute('**/api/auth/verify');
  await page.locator('#session-retry-notice button').click();
  await page.waitForLoadState('networkidle');
  assert.equal(new URL(page.url()).pathname,'/dashboard');
  assert.equal(await page.locator('#session-retry-notice').count(),0);
  console.log(JSON.stringify({layouts:layouts.length,overflow:layouts.filter(l=>l.overflow),errors,axeViolations:accessibility.reduce((s,a)=>s+a.violations.length,0),external:[...requests]},null,2));
  assert.equal(layouts.filter(l=>l.overflow).length,0);assert.equal(errors.length,0);assert.equal(accessibility.reduce((s,a)=>s+a.violations.length,0),0);
 } finally {
  fs.writeFileSync(output+'/results.json',JSON.stringify({layouts,accessibility,errors,external:[...requests]},null,2));
  if(token){const deleted=await context.request.delete(base+'/api/account',{headers:{Authorization:`Bearer ${token}`}});console.log('QA account cleanup:',deleted.status());}
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
