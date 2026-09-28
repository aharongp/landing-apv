const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const landing=require('../services/landingPage');
const marketing=require('../services/marketing');
const home=fs.readFileSync('public/index.html','utf8');
function translations(){const window={APV_MARKETING:require('../services/campaignConfig')};vm.runInNewContext(fs.readFileSync('public/marketing-i18n.js','utf8'),{window});return window.APV_I18N;}
test('all marketing copy and all 15 archived reviews have distinct English translations',()=>{
 const {es,en}=translations();
 for(let n=31;n<=155;n++){assert.ok(en['marketing_'+n]);if(![97,98,99,100,101,103,149,150,152].includes(n))assert.notEqual(en['marketing_'+n],es['marketing_'+n]);}
 const keys=[...home.matchAll(/<blockquote data-i18n="([^"]+)"/g)].map(m=>m[1]);assert.equal(keys.length,15);
 for(const key of keys){assert.ok(en[key]);assert.notEqual(es[key],en[key]);}
});
test('each landing variant exposes one working language selector outside its hidden header',()=>{
 for(const variant of ['ahorro','primera-vez','conocedor']){
  const html=landing(home,variant);assert.equal((html.match(/id="lang-switch"/g)||[]).length,1);
  const brand=html.slice(html.indexOf('<div class="lp-brand wrap">'),html.indexOf('<main'));
  assert.match(brand,/id="lang-switch"/);assert.match(brand,/data-lang="en"/);assert.match(brand,/data-lang="es"/);
 }
});
test('Google reviews request translations and cache each language independently',async()=>{
 const previousFetch=global.fetch,oldKey=process.env.GOOGLE_PLACES_API_KEY,oldId=process.env.GOOGLE_PLACE_ID;const calls=[];
 process.env.GOOGLE_PLACES_API_KEY='test';process.env.GOOGLE_PLACE_ID='test';
 global.fetch=async url=>{const lang=url.searchParams.get('language');calls.push(lang);return {ok:true,json:async()=>({status:'OK',result:{rating:5,user_ratings_total:227,reviews:[{rating:5,text:lang==='en'?'Great service':'Excelente servicio',author_name:'Test'}]}})};};
 try{const es=await marketing.reviews('es'),en=await marketing.reviews('en');assert.equal(es.reviews[0].text,'Excelente servicio');assert.equal(en.reviews[0].text,'Great service');await marketing.reviews('en');await marketing.reviews('es');assert.deepEqual(calls,['es','en']);}
 finally{global.fetch=previousFetch;for(const [key,value] of [['GOOGLE_PLACES_API_KEY',oldKey],['GOOGLE_PLACE_ID',oldId]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('player changes media with language, resets playback and translates playback controls',()=>{
 const listeners={};function element(){return {hidden:true,paused:true,muted:false,currentTime:0,duration:100,value:'1',firstElementChild:{},classList:{add(){}},attrs:{},addEventListener(name,cb){this.events??={};this.events[name]=cb;},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];}};}
 const ids=Object.fromEntries(['hero-video','hero-video-stage','video-cover','video-controls','video-toggle','video-progress','video-time','video-mute','video-speed','video-fullscreen','video-status'].map(id=>[id,element()]));
 const source=element();source.attrs.src='/assets/cars-vsl.mp4';const link={};const video=ids['hero-video'];video.querySelector=sel=>sel==='source'?source:link;video.pause=()=>video.paused=true;video.load=()=>video.currentTime=0;
 const document={documentElement:{lang:'es'},getElementById:id=>ids[id]||null,querySelector:()=>null,addEventListener:(name,cb)=>listeners[name]=cb};
 vm.runInNewContext(fs.readFileSync('public/home.js','utf8'),{document,window:{}});
 video.currentTime=50;document.documentElement.lang='en';listeners['apv:language']();assert.equal(source.attrs.src,'/assets/cars-vsl-en.mp4');assert.equal(video.currentTime,0);assert.equal(video.poster,'/assets/cars-vsl-en-poster.jpg');assert.equal(ids['video-toggle'].attrs['aria-label'],'Play video');assert.equal(ids['video-cover'].hidden,false);
 document.documentElement.lang='es';listeners['apv:language']();assert.equal(source.attrs.src,'/assets/cars-vsl.mp4');assert.equal(ids['video-toggle'].attrs['aria-label'],'Reproducir video');
});
