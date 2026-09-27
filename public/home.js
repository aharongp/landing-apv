(() => {
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
  const stage = document.getElementById('hero-video-stage');
  const id = stage?.dataset.videoId;
  if (id && /^[\w-]{11}$/.test(id)) {
    const play = document.createElement('button');
    play.className='hero-video-launch';
    play.type='button'; play.innerHTML='<span aria-hidden="true">▶</span><strong>Conoce APV Motors</strong><small>Reproducir video</small>';
    play.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src=`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      frame.title='Conoce APV Motors'; frame.allow='autoplay; encrypted-media; picture-in-picture'; frame.allowFullscreen=true;
      stage.replaceChildren(frame);frame.focus();
    });
    stage.replaceChildren(play);
  }
})();
