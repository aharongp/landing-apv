(() => {
  'use strict';
  const cfg=window.APV_MARKETING||{}, keys=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid'];
  const params=new URLSearchParams(location.search);
  const read=key=>{try{return localStorage.getItem(key);}catch{return null;}};
  const consent=()=>read('apv_cookie_consent');
  const cookie=name=>document.cookie.split('; ').find(x=>x.startsWith(name+'='))?.slice(name.length+1);
  let src=null;try{src=JSON.parse(decodeURIComponent(cookie('apv_src')||''));}catch{}
  if(!src){src={landing:location.pathname,timestamp:new Date().toISOString()};for(const k of keys)if(params.has(k))src[k]=params.get(k).slice(0,160);document.cookie=`apv_src=${encodeURIComponent(JSON.stringify(src))}; Max-Age=7776000; Path=/; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;}
  const variant=Object.hasOwn(cfg.variants||{},params.get('v'))?params.get('v'):'ahorro';
  const campaignURL=path=>{const url=new URL(path,location.origin);for(const key of [...keys,'v','ab_bucket'])if(params.has(key))url.searchParams.set(key,params.get(key));return url.pathname+url.search+url.hash;};
  let started=false;
  function track(name,data={},eventId){
    if(consent()!=='all')return;
    window.gtag?.('event',name,{...data,...(location.pathname==='/lp'?{variant}:{}),...(eventId?{event_id:eventId}:{})});
    const meta={complete_registration:'CompleteRegistration',bid_request:'Lead'}[name];
    if(meta&&window.fbq)window.fbq('track',meta,{}, {eventID:eventId});
  }
  function page(){const path=location.pathname;if(path==='/')track('view_home');if(path==='/lp')track('view_landing',{variant});if(/^\/vehiculo\//.test(path))track('view_vehicle',{lote:path.split('/')[2]});const bucket=params.get('ab_bucket');if(['home','lp'].includes(bucket)){try{if(sessionStorage.getItem('apv_ab_reported')!==bucket){track('ab_assign',{bucket});sessionStorage.setItem('apv_ab_reported',bucket);}}catch{track('ab_assign',{bucket});}}}
  window.apvStartAnalytics=()=>{
    if(started||consent()!=='all')return;started=true;window.apvAnalyticsStarted=true;
    if(cfg.ga4Id){window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments);};window.gtag('js',new Date());window.gtag('config',cfg.ga4Id,{send_page_view:true});const s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(cfg.ga4Id);document.head.append(s);}
    if(cfg.pixelId){const f=window.fbq=function(){f.callMethod?f.callMethod.apply(f,arguments):f.queue.push(arguments);};f.queue=[];f.loaded=true;f.version='2.0';window._fbq=f;const s=document.createElement('script');s.async=true;s.src='https://connect.facebook.net/en_US/fbevents.js';document.head.append(s);f('init',cfg.pixelId);f('track','PageView');}
    page();
  };
  const payload=()=>({apv_src:src,cookieConsent:consent()==='all'?'all':'essential'});
  window.APVTracking={track,payload,campaignURL,variant};
  document.addEventListener('click',e=>{
    const el=e.target.closest('a,button');if(!el)return;
    if(el.id==='cookie-settings-btn'){document.querySelector('#cookie-banner').classList.remove('hidden');return;}
    const id=el.dataset.cta||el.id||el.closest('section')?.id||'navigation';
    if(el.matches('[data-plan]'))track('plan_click',{plan:el.dataset.plan});
    if(el.matches('[data-cta],.btn,.button,.hero-secondary-link'))track('cta_click',{cta_id:id});
    if(el.matches('a')&&/^https:\/\/wa.me\//.test(el.href)){
      const ref=el.dataset.cta||`${location.pathname==='/lp'?'lp':location.pathname.startsWith('/vehiculo')?'vehicle':'home'}-${el.closest('section')?.id||'contact'}`;
      const url=new URL(el.href);const text=(url.searchParams.get('text')||'').replace(/\s*\[ref:[^\]]+\]/g,'');url.searchParams.set('text',`${text} [ref:${ref}]`.trim());el.href=url.href;track('whatsapp_click',{cta_id:ref});
    }
    if(el.matches('a')&&el.origin===location.origin&&/^\/(catalogo|vehiculo\/)/.test(el.pathname))el.href=campaignURL(el.href);
    if(el.id==='cookie-accept-btn'||el.id==='cookie-decline-btn')setTimeout(()=>fetch('/api/marketing/consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload())}).catch(()=>{}),0);
  },true);
  window.apvStartAnalytics();
})();
