(() => {
  const cfg=window.APV_MARKETING||{};
  const campaignHero=document.querySelector('.lp-hero');
  if(campaignHero && 'IntersectionObserver' in window){
    const stickyObserver=new IntersectionObserver(([entry])=>{
      document.body.classList.toggle('lp-hero-visible',entry.isIntersecting);
    });
    stickyObserver.observe(campaignHero);
  }
  const english=()=>document.documentElement.lang==='en';
  const text=(es,en)=>english()?en:es;
  document.querySelectorAll('[data-license]').forEach(el=>el.textContent=cfg.license||'[LICENCIA_NO]');
  function deposits(){document.querySelectorAll('[data-deposit-terms]').forEach(el=>el.textContent=text(`${cfg.deposit.percent} % de tu tope, mínimo US$${cfg.deposit.minimum}.`,`${cfg.deposit.percent}% of your limit, minimum US$${cfg.deposit.minimum}.`));}
  deposits();document.addEventListener('apv:language',deposits);
  const ranges=[[0,6000],[6000,10000],[10000,15000],[15000,null]];
  document.querySelectorAll('[data-budget]').forEach(button=>button.addEventListener('click',()=>{
    const index=Number(button.dataset.budget);document.querySelectorAll('[data-budget]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    const [min,max]=ranges[index];const q=new URLSearchParams({priceMin:min});if(max)q.set('priceMax',max);
    window.apvFeaturedQuery=q.toString();document.dispatchEvent(new Event('apv:featured'));
    document.querySelector('#lp-range-link').href=window.APVTracking.campaignURL('/catalogo?'+q);
    window.APVTracking.track('budget_select',{bucket:index,price_min:min,price_max:max});
  }));

  fetch('/api/reviews').then(r=>r.json()).then(data=>{
    if(!data.live)return;
    const applyRating=()=>document.querySelectorAll('[data-live-rating]').forEach(el=>{el.hidden=false;el.classList.add('rating-badge');el.textContent=`★ ${data.rating} ${text('en Google','on Google')} · ${data.total} ${text('reseñas','reviews')}`;});applyRating();document.addEventListener('apv:language',applyRating);
    const container=document.querySelector('#review-slides'), dots=document.querySelector('.review-dots');
    if(!container||!data.reviews.length)return;
    const template=container.querySelector('.review-slide').cloneNode(true);
    const ranked=[...data.reviews].sort((a,b)=>Number(/apv motors/i.test(b.text))-Number(/apv motors/i.test(a.text)));
    container.replaceChildren();dots.replaceChildren();
    ranked.forEach((r,i)=>{const slide=template.cloneNode(true);slide.hidden=false;slide.setAttribute('aria-label',`${i+1} / ${ranked.length}`);slide.querySelector('blockquote').textContent='“'+r.text+'”';const author=slide.querySelector('.review-author strong');author.textContent=r.author;
      if(/^https:\/\//.test(r.authorUrl||'')){const link=document.createElement('a');link.href=r.authorUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent=r.author;author.replaceChildren(link);}
      slide.querySelector('.review-stars').textContent='★'.repeat(r.rating);slide.querySelector('.review-stars').setAttribute('aria-label',r.rating+'/5');slide.querySelector('.review-avatar').textContent=r.author.slice(0,2).toUpperCase();const caption=slide.querySelector('.review-author div>span');if(caption)caption.textContent=text('Reseña en Google','Google review');container.append(slide);
      const dot=document.createElement('button');dot.type='button';dot.dataset.review=i;dot.setAttribute('aria-label',text('Ver reseña de ','Read review by ')+r.author);dots.append(dot);
    });
    document.dispatchEvent(new Event('apv:reviews'));
  }).catch(()=>{});
})();
