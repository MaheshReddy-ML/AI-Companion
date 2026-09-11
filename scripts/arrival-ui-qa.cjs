const {chromium}=require('playwright');
const {AxeBuilder}=require('@axe-core/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true});
const out='tmp/arrival-qa';fs.mkdirSync(out,{recursive:true});
const results=[],errors=[];
try {for(const theme of ['light','dark']){
const context=await browser.newContext({colorScheme:theme,reducedMotion:'reduce'});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
for(const width of [320,390,768,1024,1440]){
await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:8001/');await page.evaluate(()=>document.fonts.ready);
await page.getByRole('button',{name:'Think with me',exact:true}).click();assert.match(await page.locator('#arrival-reply').textContent(),/one step at a time/);
await page.getByRole('button',{name:'Keep it light',exact:true}).click();assert.match(await page.locator('#arrival-reply').textContent(),/Tea break/);
await page.getByRole('button',{name:'Just listen',exact:true}).click();
await page.getByRole('tab',{name:'Reflect',exact:true}).click();await page.locator('#demo-reflect').waitFor({state:'visible'});
if(width<761){await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Open navigation',exact:true}).getAttribute('aria-expanded'),'false');}
await page.screenshot({path:`${out}/${theme}-${width}.png`,fullPage:true});
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
const violations=(await new AxeBuilder({page}).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({html:n.html,summary:n.failureSummary}))}));results.push({theme,width,overflow,violations});
}await context.close();}
fs.writeFileSync(out+'/results.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));assert(!results.some(r=>r.overflow||r.violations.length));assert.equal(errors.length,0);
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
