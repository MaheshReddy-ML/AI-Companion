// Isolated API fixtures; runs the real chat renderer and responsive styles.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const reports=[];
 for(const [width,theme] of [[390,"dark"],[1280,"dark"],[2048,"dark"],[1280,"light"]]){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(theme=>{localStorage.setItem('token','chat-layout-fixture');localStorage.setItem('theme',theme);},theme);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const conversation={id:'qa-chat',title:'A conversation',characterName:'Emora',updatedAt:new Date().toISOString(),messages:Array.from({length:30},(_,i)=>({id:`m${i}`,role:i%2?'assistant':'user',timestamp:new Date().toISOString(),content:`Message ${i+1}. ${'A longer conversation should remain readable as the messages arrive. '.repeat(i%3+1)}`}))};
  await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;let body={};if(p==='/api/auth/verify')body={verified:true,user:{id:'qa',name:'Layout QA',access:{entitlements:[]}}};if(p==='/api/chat')body=[conversation];return r.fulfill({contentType:'application/json',body:JSON.stringify(body)});});
  await page.route('**/static/js/dashboard.js*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('app/static/js/dashboard.js','utf8')+'\nwindow.chatQA={state,renderMessages};'}));
  await page.goto('http://127.0.0.1:8000/chat');
  await page.waitForFunction(()=>document.querySelectorAll('#chat-messages .message-row').length===30);
  await page.waitForTimeout(700);
  const geometry=()=>page.evaluate(()=>{const log=document.querySelector('#chat-messages'),composer=document.querySelector('.chat-input-area');return {bottom:log.getBoundingClientRect().bottom,composerTop:composer.getBoundingClientRect().top,distance:log.scrollHeight-log.scrollTop-log.clientHeight,height:log.clientHeight,overflow:document.documentElement.scrollWidth>innerWidth,opacity:getComputedStyle(log).opacity,css:[log,log.parentElement,document.querySelector(".chat-main")].map(e=>({rect:e.getBoundingClientRect().toJSON(),position:getComputedStyle(e).position,height:getComputedStyle(e).height,top:getComputedStyle(e).top,bottom:getComputedStyle(e).bottom,minHeight:getComputedStyle(e).minHeight,overflow:getComputedStyle(e).overflow}))};});
  let layout=await geometry();assert(layout.height>100,JSON.stringify(layout));assert(layout.bottom<=layout.composerTop-8,JSON.stringify(layout));assert(layout.distance<3,JSON.stringify(layout));assert(!layout.overflow);
  await page.evaluate(()=>{document.querySelector('#chat-messages').scrollTop=200;chatQA.state.isThinking=true;chatQA.renderMessages();});
  await page.waitForTimeout(400);
  assert(Math.abs(await page.locator('#chat-messages').evaluate(e=>e.scrollTop)-200)<3,'reading position survives thinking update');
  await page.locator('#jump-to-latest').click();await page.waitForFunction(()=>{const e=document.querySelector('#chat-messages');return e.scrollHeight-e.scrollTop-e.clientHeight<3;});
  await page.locator('#message-input').fill('A growing draft\n'.repeat(8));await page.waitForTimeout(300);
  layout=await geometry();assert(layout.bottom<=layout.composerTop-8,JSON.stringify(layout));assert(layout.distance<3,'composer growth follows latest');
  await page.screenshot({path:`tmp/meet-qa/chat-${width}-${theme}.png`});
  assert.equal(errors.length,0,errors.join('\n'));reports.push({width,theme,...layout});await context.close();
 }
 fs.writeFileSync('tmp/meet-qa/chat-report.json',JSON.stringify(reports,null,2));console.log(reports);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
