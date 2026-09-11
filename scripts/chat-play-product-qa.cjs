const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const base=process.env.EMORA_QA_BASE||'http://127.0.0.1:8000';
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const page=await context.newPage();let token;const checks=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try {
  const response=await context.request.post(base+'/api/auth/register',{data:{name:'Interaction QA',email:`chat-play-${Date.now()}@example.com`,password:'Design-QA-Only-963!'}});assert(response.ok());
  const session=await response.json();token=session.token;assert(token);
  await context.request.patch(base+'/api/product/meeting',{headers:{Authorization:`Bearer ${token}`},data:{preferredName:'Reviewer',complete:true,expectedVersion:0}});
  await context.addInitScript(session=>{localStorage.setItem('token',session.token);localStorage.setItem('user',JSON.stringify(session.user));},session);
  await page.goto(base+'/play');
  const quest=page.locator('[data-quest-state="AVAILABLE"]:not([data-quest="one-quiet-minute"]):not([data-quest="focus-sprint"])').first();await quest.waitFor();const id=await quest.getAttribute('data-quest');await quest.click();
  const active=page.locator(`[data-quest="${id}"][data-quest-state="IN_PROGRESS"]`);await active.waitFor();await page.locator('#mission-dialog').waitFor({state:'visible'});
  const responses=['A friend made time to listen','A warm meal helped me reset','A quiet walk gave me space'];
  for(const [index,input] of (await page.locator('[data-mission-response]').all()).entries())await input.fill(responses[index]);
  await page.locator('#mission-submit').click();
  await page.locator('#play-completion-layer').waitFor({state:'visible'});assert.equal(await page.locator('#play-completion-close').evaluate(e=>e===document.activeElement),true);
  await page.locator('#play-completion-close').click();assert(await page.locator(`[data-quest="${id}"]`).isDisabled());checks.push('Real ritual start, completion, dialog focus and completed state');
  await page.locator('[data-section-link][href="#play-about"]').click();
  await page.locator('#memory-input').fill('QA prefers quiet mornings');await page.locator('#memory-form button').click();await page.locator('#memory-list').getByText('QA prefers quiet mornings',{exact:true}).waitFor();await page.locator('#memory-list [data-memory]').click();await page.locator('#memory-list').getByText('QA prefers quiet mornings',{exact:true}).waitFor({state:'hidden'});checks.push('Personal memory saved and removed through live APIs');
  await page.route('**/api/play/memories', async route => route.request().method()==='POST' ? route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Please try again shortly.'})}) : route.continue());
  await page.locator('#memory-input').fill('Keep this draft after an error');await page.locator('#memory-form button').click();await page.locator('#play-memory-status').getByText('Please try again shortly.',{exact:true}).waitFor();assert.equal(await page.locator('#memory-input').inputValue(),'Keep this draft after an error');assert.equal(await page.locator('#memory-form button').isDisabled(),false);await page.unroute('**/api/play/memories');checks.push('Memory service failure preserves draft and allows retry');
  assert.equal(await page.locator('#space-form').getAttribute('data-locked'),'true');checks.push('Free-plan room customization remains locked');
  await page.goto(base+'/chat');await page.locator('#new-chat-button').click();await page.locator('#message-input').waitFor();
  await page.locator('[data-chat-view="inspect"]').click();await page.locator('#companion-tools').waitFor({state:'visible'});await page.locator('#companion-tools-close').click();await page.locator('#companion-tools').waitFor({state:'hidden'});checks.push('New chat and options open/close');
  await page.locator('.chat-actions-menu summary').click();await page.locator('#pin-chat-button').waitFor({state:'visible'});await page.keyboard.press('Escape');assert.equal(await page.locator('.chat-actions-menu').evaluate(e=>e.open),false);checks.push('Conversation actions keyboard dismissal');
  await page.setViewportSize({width:390,height:844});await page.locator('[data-chat-view="navigate"]').click();await page.locator('.chat-history-close').waitFor({state:'visible'});assert.equal(await page.locator('main').evaluate(e=>e.inert),true);await page.keyboard.press('Escape');assert.equal(await page.locator('main').evaluate(e=>e.inert),false);checks.push('Mobile history open, background isolation and Escape');
  assert.deepEqual(errors,[]);
 }finally{
  if(token)checks.push('Temporary account cleanup HTTP '+(await context.request.delete(base+'/api/account',{headers:{Authorization:`Bearer ${token}`}})).status());
  fs.mkdirSync('tmp/product-interactions',{recursive:true});fs.writeFileSync('tmp/product-interactions/results.json',JSON.stringify({checks,errors},null,2));await browser.close();
 }
 console.log(JSON.stringify({checks,errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
