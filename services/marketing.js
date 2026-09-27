'use strict';
const crypto = require('crypto');
const campaign = require('./campaignConfig');
const keys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid'];
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const origin = () => (process.env.PUBLIC_SITE_URL || 'https://cars.apvmotorusa.com').replace(/\/$/,'');
function cookies(req) { return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),x.slice(i+1)];})); }
function source(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const key of [...keys,'landing','timestamp']) if (typeof value[key] === 'string') out[key]=value[key].replace(/[\r\n]/g,' ').slice(0,key==='landing'?200:160);
  return out.landing ? out : null;
}
function readSource(req) { try{return source(JSON.parse(decodeURIComponent(cookies(req).apv_src||'')));}catch{return null;} }
function capture(req,res,url) {
  if (readSource(req) || req.method !== 'GET' || !['/','/lp','/go','/catalogo'].includes(url.pathname) && !/^\/vehiculo\/\d{5,12}$/.test(url.pathname)) return;
  const value={landing:url.pathname,timestamp:new Date().toISOString()};
  for(const key of keys) if(url.searchParams.has(key))value[key]=url.searchParams.get(key).slice(0,160);
  res.setHeader('Set-Cookie',`apv_src=${encodeURIComponent(JSON.stringify(value))}; Path=/; Max-Age=7776000; SameSite=Lax${req.socket.encrypted||req.headers['x-forwarded-proto']==='https'?'; Secure':''}`);
}
function assign(req,res,url) {
  const forced=url.searchParams.get('force');
  const saved=cookies(req).apv_ab;
  const bucket=['home','lp'].includes(forced)?forced:['home','lp'].includes(saved)?saved:crypto.randomInt(2)?'home':'lp';
  if(!['home','lp'].includes(forced) && !['home','lp'].includes(saved)) {
    const prior=res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie',[...(prior?[prior]:[]),`apv_ab=${bucket}; Path=/; Max-Age=2592000; SameSite=Lax${req.socket.encrypted||req.headers['x-forwarded-proto']==='https'?'; Secure':''}`]);
  }
  const params=new URLSearchParams(url.searchParams);params.set('ab_bucket',bucket);
  res.writeHead(302,{'Location':(bucket==='home'?'/':'/lp')+'?'+params,'X-Robots-Tag':'noindex, follow','Cache-Control':'no-store'});res.end();
}
function publicConfig() { return {...campaign,license:process.env.DEALER_LICENSE_NO||'[LICENCIA_NO]',ga4Id:process.env.GA4_MEASUREMENT_ID||'',pixelId:process.env.META_PIXEL_ID||''}; }
function metadata(html,pathname,vehicle) {
  let title='Autos de subasta en EE. UU. sin licencia | APV Motors';
  let description='Compra autos de Copart con APV Motors. Pujamos por ti con licencia de dealer. Honorarios desde US$350 y depósito reembolsable.';
  let image=origin()+'/assets/og-default.jpg';
  if(pathname==='/catalogo'){title='Autos en subasta: catálogo | APV Motors';description='Explora autos de Copart, revisa su estado y calcula los costos de tu puja con APV Motors.';}
  if(pathname==='/lp'){title='Elige tu auto de subasta | APV Motors';description='Mira autos por presupuesto. APV Motors puja por ti en Copart y te acompaña durante la compra.';}
  if(vehicle){title=`${vehicle.title} en subasta | APV Motors`;description=[vehicle.locationCity,vehicle.locationState,vehicle.primaryDamage,vehicle.retailValue>0?`Valor al público estimado: US$${Number(vehicle.retailValue).toLocaleString('en-US')}`:''].filter(Boolean).join(' · ');if(/^https?:\/\//.test(vehicle.image||''))image=vehicle.image;}
  html=html.replace(/<title>[\s\S]*?<\/title>/i,`<title>${esc(title)}</title>`).replace(/<meta[^>]+name="description"[^>]*>/i,`<meta name="description" content="${esc(description)}">`);
  return html.replace('</head>',`<link rel="canonical" href="${esc(origin()+pathname)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${esc(image)}"><meta property="og:url" content="${esc(origin()+pathname)}"><meta property="og:type" content="website"><meta property="og:locale" content="es_US"><meta name="twitter:card" content="summary_large_image">${pathname==='/lp'?'<meta name="robots" content="noindex, follow">':''}</head>`);
}
let reviewCache=null,reviewExpires=0,reviewPending=null;
async function reviews() {
  if(!process.env.GOOGLE_PLACES_API_KEY||!process.env.GOOGLE_PLACE_ID)return {live:false};
  if(reviewExpires>Date.now())return reviewCache;
  if(reviewPending)return reviewPending;
  reviewPending=(async()=>{
    try {
      // Legacy supports newest ordering; New returns relevance-ranked reviews only.
      const url=new URL('https://maps.googleapis.com/maps/api/place/details/json');
      url.search=new URLSearchParams({place_id:process.env.GOOGLE_PLACE_ID,key:process.env.GOOGLE_PLACES_API_KEY,fields:'name,rating,user_ratings_total,reviews,url',language:'es',reviews_sort:'newest'});
      const response=await fetch(url,{signal:AbortSignal.timeout(5000)});const data=await response.json();
      if(!response.ok||data.status!=='OK')throw Error('places_unavailable');
      const r=data.result;
      reviewCache={live:true,rating:r.rating,total:r.user_ratings_total,url:r.url,reviews:(r.reviews||[]).filter(x=>x.rating>=4&&x.text?.trim()).slice(0,5).map(x=>({author:x.author_name,authorUrl:x.author_url,text:x.text,rating:x.rating,time:x.time}))};
      reviewExpires=Date.now()+86400000;return reviewCache;
    }catch{return {live:false};}finally{reviewPending=null;}
  })();return reviewPending;
}
function createAttribution(db) {
  db.exec('CREATE TABLE IF NOT EXISTS marketing_users (userId TEXT PRIMARY KEY, source TEXT, consent TEXT NOT NULL DEFAULT \'essential\'); CREATE TABLE IF NOT EXISTS marketing_events (eventId TEXT PRIMARY KEY, status TEXT NOT NULL)');
  function get(id){const row=db.prepare('SELECT * FROM marketing_users WHERE userId=?').get(id);return row?{source:JSON.parse(row.source||'null'),consent:row.consent}:{source:null,consent:'essential'};}
  function save(id,req,body={}){const old=get(id);const src=old.source||readSource(req)||source(body.apv_src);const consent=body.cookieConsent==='all'?'all':body.cookieConsent==='essential'?'essential':old.consent;db.prepare('INSERT INTO marketing_users VALUES (?,?,?) ON CONFLICT(userId) DO UPDATE SET source=excluded.source,consent=excluded.consent').run(id,JSON.stringify(src),consent);return {source:src,consent};}
  async function conversion(name,user,eventId,consent) {
    if(consent!=='all'||!process.env.META_PIXEL_ID||!process.env.META_CAPI_TOKEN)return false;
    const claimed=db.prepare("INSERT OR IGNORE INTO marketing_events VALUES (?,'pending')").run(eventId);if(!claimed.changes)return false;
    const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
    const user_data={external_id:[hash(String(user.id))]};
    if(user.email)user_data.em=[hash(user.email.trim().toLowerCase())];
    if(user.phone)user_data.ph=[hash(user.phone.replace(/\D/g,''))];
    try {
      const version=process.env.META_API_VERSION||'v23.0';
      const response=await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(process.env.META_PIXEL_ID)}/events`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.META_CAPI_TOKEN}`},signal:AbortSignal.timeout(5000),body:JSON.stringify({data:[{event_name:name,event_time:Math.floor(Date.now()/1000),event_id:eventId,action_source:'website',event_source_url:origin(),user_data}]})});
      if(!response.ok)throw Error('capi_unavailable');db.prepare("UPDATE marketing_events SET status='sent' WHERE eventId=?").run(eventId);return true;
    }catch{db.prepare('DELETE FROM marketing_events WHERE eventId=?').run(eventId);console.warn('[CAPI] Delivery failed; no personal data logged.');return false;}
  }
  return {get,save,conversion};
}
module.exports={keys,source,readSource,capture,assign,publicConfig,metadata,reviews,createAttribution,esc,origin};
