(() => {
  const budgetForm = document.getElementById('budget-form');
  if (budgetForm) {
    const result = document.getElementById('budget-result');
    const error = document.getElementById('budget-error');
    const money = value => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
    budgetForm.addEventListener('input', () => { result.hidden=true;error.hidden=true; });
    budgetForm.addEventListener('submit', event => {
      event.preventDefault(); result.hidden=true;error.hidden=true;
      try {
        if(!budgetForm.reportValidity()) return;
        const quote = window.APVBudget.quote(document.getElementById('budget-total').value,document.getElementById('budget-reserve').value,window.apvBaseCostEstimate);
        for(const [id,value] of [['budget-bid',quote.bid],['budget-purchase',quote.purchase],['budget-reserved',quote.reserve],['budget-sum',quote.total]]) document.getElementById(id).textContent=money(value);
        const query=document.getElementById('budget-query').value.trim();
        document.getElementById('budget-catalog').href='/catalogo'+(query?'?q='+encodeURIComponent(query):'');
        result.hidden=false;
      } catch (err) {
        error.textContent=err instanceof RangeError ? err.message : 'No se pudo calcular ahora. Puedes usar la calculadora de la ficha del vehículo.';
        error.hidden=false;
      }
    });
  }
  const carousel = document.querySelector('.review-carousel');
  if (carousel) {
    const slides = [...carousel.querySelectorAll('.review-slide')];
    const dots = [...carousel.querySelectorAll('[data-review]')];
    let current = 0;
    const show = index => {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => { slide.hidden = i !== current; });
      dots.forEach((dot, i) => { if(i === current) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current'); });
      document.getElementById('review-position').textContent = `${current + 1} de ${slides.length}`;
    };
    document.getElementById('review-prev').addEventListener('click', () => show(current - 1));
    document.getElementById('review-next').addEventListener('click', () => show(current + 1));
    dots.forEach(dot => dot.addEventListener('click', () => show(Number(dot.dataset.review))));
    carousel.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); show(current + (event.key === 'ArrowRight' ? 1 : -1));
      }
    });
    let touch = null;
    carousel.addEventListener('touchstart', e => { touch = e.touches.length === 1 ? {x:e.touches[0].clientX,y:e.touches[0].clientY} : null; }, {passive:true});
    carousel.addEventListener('touchend', e => {
      if(!touch) return;
      const dx=e.changedTouches[0].clientX-touch.x, dy=e.changedTouches[0].clientY-touch.y;
      if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)) show(current+(dx<0?1:-1));
      touch=null;
    }, {passive:true});
  }
})();
