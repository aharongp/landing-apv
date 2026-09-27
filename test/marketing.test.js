const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const marketing=require('../services/marketing');
const landing=require('../services/landingPage');
const fs=require('node:fs');
function request(cookie=''){return {method:'GET',headers:{cookie},socket:{}};}
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(){}};}
test('first source wins and source cookie lasts 90 days without marketing consent',()=>{
 const res=response();marketing.capture(request(),res,new URL('https://test/go?utm_source=test&utm_campaign=qa&v=primera-vez'));
 const cookie=res.headers['Set-Cookie'];assert.match(cookie,/Max-Age=7776000; SameSite=Lax/);
 const src=marketing.readSource(request(cookie));assert.equal(src.utm_source,'test');assert.equal(src.landing,'/go');
 const later=response();marketing.capture(request(cookie),later,new URL('https://test/?utm_source=later'));assert.equal(later.headers['Set-Cookie'],undefined);
});
test('AB route persists group, preserves all parameters and never stores forced assignments',()=>{
 const url=new URL('https://test/go?utm_source=test&v=primera-vez&custom=1');
 const res=response();marketing.assign(request('apv_ab=lp'),res,url);assert.equal(res.status,302);assert.match(res.headers.Location,/^\/lp\?/);assert.match(res.headers.Location,/custom=1/);assert.equal(res.headers['Set-Cookie'],undefined);
 const forced=response();marketing.assign(request('apv_ab=home'),forced,new URL(url+'&force=lp'));assert.match(forced.headers.Location,/^\/lp\?/);assert.equal(forced.headers['Set-Cookie'],undefined);
 const fresh=response();marketing.assign(request(),fresh,url);assert.match(fresh.headers['Set-Cookie'][0],/Max-Age=2592000/);
});
test('SSR metadata escapes inventory content and delivers distinct raw vehicle metadata',()=>{
 const html=marketing.metadata('<head><title>x</title><meta name="description" content="x"></head>','/vehiculo/12345678',{title:'2024 Toyota <Corolla>',image:'https://example.test/photo.jpg',retailValue:18000,locationCity:'Houston',primaryDamage:'Front end'});
 assert.match(html,/<title>2024 Toyota &lt;Corolla&gt; en subasta/);assert.match(html,/og:image" content="https:\/\/example.test\/photo.jpg/);assert.match(html,/og:locale" content="es_US/);
});
test('campaign variants reuse sections, contain four key FAQs, and fall back for invalid variants',()=>{
 const home=fs.readFileSync('public/index.html','utf8');
 for(const v of ['ahorro','primera-vez','conocedor','invalid']){
   const html=landing(home,v);assert.match(html,/id="autos"/);assert.equal((html.match(/data-key-faq/g)||[]).length,4);assert.match(html,/class="home-page lp-page"/);assert.ok(!html.includes('id="planes"'));assert.ok(!html.includes('id="hero-video"'));assert.ok(!html.includes('href="#planes"'));assert.match(html,/id="register-form"/);
 }
 assert.match(landing(home,'invalid'),/data-variant="ahorro"/);
});
test('consent stored separately from auth; CAPI gated, hashed and deduplicated',async()=>{
 const db=new DatabaseSync(':memory:');const service=marketing.createAttribution(db);const user={id:'test-id',email:' TEST@example.test ',phone:'+1 (555) 123-4567'};
 const req=request();service.save(user.id,req,{apv_src:{landing:'/lp',utm_source:'test'},cookieConsent:'essential'});
 service.save(user.id,req,{apv_src:{landing:'/',utm_source:'later'}});assert.equal(service.get(user.id).source.utm_source,'test');
 const oldFetch=global.fetch, oldPixel=process.env.META_PIXEL_ID,oldToken=process.env.META_CAPI_TOKEN;let calls=[];
 process.env.META_PIXEL_ID='test';process.env.META_CAPI_TOKEN='test';global.fetch=async(url,init)=>{calls.push(JSON.parse(init.body));return {ok:true};};
 try{
  assert.equal(await service.conversion('Lead',user,'e1','essential'),false);assert.equal(calls.length,0);
  service.save(user.id,req,{cookieConsent:'all'});assert.equal(service.get(user.id).consent,'all');
  assert.equal(await service.conversion('Lead',user,'e1','all'),true);assert.equal(await service.conversion('Lead',user,'e1','all'),false);assert.equal(calls.length,1);
  const event=calls[0].data[0];assert.equal(event.event_id,'e1');for(const hashes of Object.values(event.user_data))assert.match(hashes[0],/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(event).includes('example.test'));
  service.save(user.id,req,{cookieConsent:'essential'});assert.equal(service.get(user.id).consent,'essential');
 }finally{global.fetch=oldFetch;if(oldPixel===undefined)delete process.env.META_PIXEL_ID;else process.env.META_PIXEL_ID=oldPixel;if(oldToken===undefined)delete process.env.META_CAPI_TOKEN;else process.env.META_CAPI_TOKEN=oldToken;db.close();}
});
