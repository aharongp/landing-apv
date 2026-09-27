const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const script=fs.readFileSync('public/tracking.js','utf8');
function browser(consent,config={ga4Id:'G-TEST',pixelId:'123-test',variants:{ahorro:{}}}){
 const scripts=[],storage=new Map([['apv_cookie_consent',consent]]),listeners={};
 const context={URL,URLSearchParams,Date,setTimeout,fetch:async()=>({ok:true}),location:new URL('https://site.test/lp?utm_source=test&v=ahorro'),localStorage:{getItem:k=>storage.get(k)},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},document:{cookie:'',querySelectorAll:()=>[],createElement:()=>({}),head:{append:s=>scripts.push(s.src)},addEventListener:(name,fn)=>listeners[name]=fn}};
 context.window=context;context.APV_MARKETING=config;vm.runInNewContext(script,context);return {context,scripts,storage,listeners};
}
test('essential consent creates first-party attribution but no Google/Meta scripts or events',()=>{
 const {context,scripts}=browser('essential');assert.equal(scripts.length,0);assert.match(context.document.cookie,/apv_src=/);assert.equal(context.gtag,undefined);assert.equal(context.fbq,undefined);context.APVTracking.track('bid_request',{},'test');assert.equal(scripts.length,0);
});
test('all consent enables configured scripts and shares conversion IDs with pixel',()=>{
 const {context,scripts}=browser('all');assert.equal(scripts.length,2);assert.match(scripts[0],/googletagmanager/);assert.match(scripts[1],/fbevents/);
 context.APVTracking.track('complete_registration',{},'registration-test');const events=context.dataLayer.map(x=>Array.from(x));assert.ok(events.some(x=>x[1]==='view_landing'&&x[2].variant==='ahorro'));assert.ok(events.some(x=>x[1]==='complete_registration'&&x[2].event_id==='registration-test'));
 assert.ok(context.fbq.queue.some(x=>x[1]==='CompleteRegistration'&&x[3].eventID==='registration-test'));
 assert.match(context.APVTracking.campaignURL('/vehiculo/12345678'),/utm_source=test/);
});
test('missing integrations stay inactive even after consent',()=>{const {context,scripts}=browser('all',{variants:{}});assert.equal(scripts.length,0);assert.equal(context.fbq,undefined);assert.equal(context.gtag,undefined);});
