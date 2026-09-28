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

  const container=document.querySelector('#review-slides'), dots=document.querySelector('.review-dots');
  const archived=container ? [...container.children].map(el=>el.cloneNode(true)) : [];
  let requestVersion=0;
  function translate(root){
    root.querySelectorAll('[data-i18n-aria-label]').forEach(el=>{const value=window.APV_I18N?.[english()?'en':'es']?.[el.dataset.i18nAriaLabel];if(value)el.setAttribute('aria-label',value);});
    root.querySelectorAll('[data-i18n]').forEach(el=>{const value=window.APV_I18N?.[english()?'en':'es']?.[el.dataset.i18n];if(value)el.textContent=value;});
  }
  function render(data={}){
    if(!container)return;
    const known=new Set((data.reviews||[]).map(r=>r.author.trim().toLowerCase()));
    const cards=archived.filter(el=>!known.has(el.querySelector('.review-author strong').textContent.trim().toLowerCase())).map(el=>{const card=el.cloneNode(true);translate(card);return card;});
    for(const review of (data.reviews||[]).slice().reverse()){
      const card=archived[0].cloneNode(true);translate(card);
      const quote=card.querySelector('blockquote');quote.removeAttribute('data-i18n');quote.textContent='“'+review.text+'”';
      const author=card.querySelector('.review-author strong');author.textContent=review.author;
      if(/^https:\/\//.test(review.authorUrl||'')){const link=document.createElement('a');link.href=review.authorUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent=review.author;author.replaceChildren(link);}
      card.querySelector('.review-avatar').textContent=review.author.slice(0,2).toUpperCase();
      const caption=card.querySelector('.review-author div>span');caption.removeAttribute('data-i18n');caption.textContent=text('Reseña en Google','Google review (translated when available)');
      const stars=card.querySelector('.review-stars');stars.removeAttribute('data-i18n-aria-label');stars.textContent='★'.repeat(review.rating);stars.setAttribute('aria-label',review.rating+'/5');cards.unshift(card);
    }
    container.replaceChildren(...cards);dots.replaceChildren();
    cards.forEach((card,i)=>{card.hidden=false;card.setAttribute('aria-label',`${i+1} / ${cards.length}`);card.setAttribute('aria-roledescription',text('diapositiva','slide'));const button=document.createElement('button');button.type='button';button.dataset.review=i;button.setAttribute('aria-label',text('Ver página de reseñas ','View review page ')+(i+1));dots.append(button);});
    document.dispatchEvent(new Event('apv:reviews'));
  }
  async function loadReviews(){
    const version=++requestVersion;render();
    document.querySelectorAll('[data-review-score]').forEach(el=>el.textContent=(5).toLocaleString(english()?'en-US':'es-US',{minimumFractionDigits:1}));
    try{
      const response=await fetch('/api/reviews?lang='+(english()?'en':'es'));const data=await response.json();
      if(version!==requestVersion||!data.live)return;
      document.querySelectorAll('[data-review-score]').forEach(el=>el.textContent=Number(data.rating).toLocaleString(english()?'en-US':'es-US',{minimumFractionDigits:1,maximumFractionDigits:1}));
      document.querySelectorAll('[data-review-score-date]').forEach(el=>el.hidden=true);
      document.querySelectorAll('[data-live-rating]').forEach(el=>{el.hidden=false;el.classList.add('rating-badge');el.textContent=`★ ${data.rating} ${text('en Google','on Google')} · ${data.total} ${text('reseñas','reviews')}`;});
      render(data);
    }catch{}
  }
  document.addEventListener('apv:language',loadReviews);loadReviews();
})();
