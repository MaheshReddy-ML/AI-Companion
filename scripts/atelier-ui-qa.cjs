const {chromium}=require('playwright');
const {AxeBuilder}=require('@axe-core/playwright');
const fs=require('node:fs');
const base=process.env.EMORA_QA_BASE||'http://127.0.0.1:8000';
const out=process.env.EMORA_QA_OUTPUT||'tmp/atelier-qa';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const ctx=await browser.newContext({reducedMotion:'reduce'});const page=await ctx.newPage();
 const errors=[],layouts=[],a11y=[];let token;
 page.on('pageerror',e=>errors.push({url:page.url(),message:e.message}));
 try {
  const email=`atelier-qa-${Date.now()}@example.com`,password='Atelier-QA-Only-963!';
  const reg=await ctx.request.post(base+'/api/auth/register',{data:{name:'Atelier QA',email,password}});
  if(!reg.ok())throw Error('Registration '+reg.status()+': '+await reg.text());
  const session=await reg.json(); token=session.token;
  if(!token){const login=await ctx.request.post(base+'/api/auth/login',{data:{email,password}});Object.assign(session,await login.json());token=session.token;}
  await ctx.request.patch(base+'/api/product/onboarding',{headers:{Authorization:`Bearer ${token}`},data:{status:'skipped',step:0}});
  await ctx.addInitScript(({token,user})=>{localStorage.setItem('token',token);localStorage.setItem('user',JSON.stringify(user));},session);
  const routes=['','dashboard','chat','sessions','insights','journal','goals','research','community','together','notifications','profile','payment','focus-together','help','trust','status','changelog','offline','play','your-emora'];
  for(const theme of ['light','dark']) {
   await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
   for(const width of [390,1440,320,768]) {
    await page.setViewportSize({width,height:1000});
    for(const route of routes) {
     const response=await page.goto(base+'/'+route);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(120);
     const data=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,resolvedTheme:document.documentElement.className,styled:!!document.querySelector('link[href*="atelier.css"]'),offenders:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+3&&getComputedStyle(e).position!=='fixed'}).slice(0,5).map(e=>e.className)}));
     layouts.push({route:route||'home',theme,width,status:response.status(),...data});
     if([390,1440].includes(width))await page.screenshot({path:`${out}/${route||'home'}-${theme}-${width}.png`,fullPage:true});
     if(width===390&&['dashboard','journal','trust','chat','payment','sessions','profile',''].includes(route)) a11y.push({route,theme,violations:(await new AxeBuilder({page}).analyze()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({html:n.html,summary:n.failureSummary}))}))});
    }
   }
  }
  await page.goto(base+'/dashboard');await page.locator('#workspace-command-trigger').click();await page.locator('#workspace-command-input').fill('atelier-empty-result');await page.keyboard.press('Escape');
  if(await page.locator('#workspace-command-dialog').evaluate(e=>e.open))throw Error('Search did not close');
 } finally {
  fs.writeFileSync(out+'/atelier-results.json',JSON.stringify({layouts,errors,a11y},null,2));
  if(token)console.log('Account cleanup',(await ctx.request.delete(base+'/api/account',{headers:{Authorization:`Bearer ${token}`}})).status());
  await browser.close();
 }
 console.log(JSON.stringify({layouts:layouts.length,overflow:layouts.filter(x=>x.overflow),httpErrors:layouts.filter(x=>x.status>=400),errors,a11y:a11y.map(x=>({route:x.route,theme:x.theme,violations:x.violations.map(v=>v.id)}))},null,2));
 if(layouts.some(x=>x.overflow||x.status>=400)||errors.length||a11y.some(x=>x.violations.length))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
