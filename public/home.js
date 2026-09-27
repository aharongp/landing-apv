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
        document.getElementById('budget-catalog').href=window.APVTracking.campaignURL('/catalogo'+(query?'?q='+encodeURIComponent(query):''));
        result.hidden=false;
      } catch (err) {
        error.textContent=err instanceof RangeError ? err.message : 'No se pudo calcular ahora. Puedes usar la calculadora de la ficha del vehículo.';
        error.hidden=false;
      }
    });
  }
  const carousel = document.querySelector('.review-carousel');
  if (carousel) {
    const track=document.getElementById('review-slides');
    let slides=[],dots=[],current=0;
    const pageSize=()=>Math.max(1,Math.floor((track.clientWidth+24)/(slides[0]?.getBoundingClientRect().width+24||1)));
    const pages=()=>Math.max(1,Math.ceil(slides.length/pageSize()));
    const update=()=>{
      const count=pages();current=Math.min(current,count-1);
      dots.forEach((dot,i)=>{dot.hidden=i>=count || (i!==0 && i!==count-1 && Math.abs(i-current)>1);if(i===current)dot.setAttribute('aria-current','true');else dot.removeAttribute('aria-current');});
      document.getElementById('review-position').textContent=`${current+1} / ${count}`;
      document.getElementById('review-prev').disabled=current===0;
      document.getElementById('review-next').disabled=current===count-1;
    };
    const show=index=>{
      current=Math.max(0,Math.min(index,pages()-1));
      const target=slides[current*pageSize()];
      if(target)track.scrollTo({left:target.offsetLeft-slides[0].offsetLeft,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      update();
    };
    const refresh=()=>{slides=[...track.querySelectorAll('.review-slide')];dots=[...carousel.querySelectorAll('[data-review]')];slides.forEach(s=>s.hidden=false);current=0;show(0);};
    document.getElementById('review-prev').addEventListener('click',()=>show(current-1));
    document.getElementById('review-next').addEventListener('click',()=>show(current+1));
    carousel.addEventListener('click',event=>{const dot=event.target.closest('[data-review]');if(dot)show(Number(dot.dataset.review));});
    carousel.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();show(current+(event.key==='ArrowRight'?1:-1));}});
    track.addEventListener('scroll',()=>{
      const step=(slides[0]?.getBoundingClientRect().width+24||1)*pageSize();
      current=track.scrollLeft>=track.scrollWidth-track.clientWidth-2?pages()-1:Math.round(track.scrollLeft/step);update();
    },{passive:true});
    new ResizeObserver(()=>show(0)).observe(track);
    document.addEventListener('apv:reviews',refresh);
    refresh();
  }
})();

(() => {
  const video = document.getElementById('hero-video');
  if (!video) return;
  const stage = document.getElementById('hero-video-stage');
  const cover = document.getElementById('video-cover');
  const controls = document.getElementById('video-controls');
  const toggle = document.getElementById('video-toggle');
  const progress = document.getElementById('video-progress');
  const time = document.getElementById('video-time');
  const mute = document.getElementById('video-mute');
  const speed = document.getElementById('video-speed');
  const fullscreen = document.getElementById('video-fullscreen');
  const status = document.getElementById('video-status');
  const format = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  let started = false;
  const message = text => { status.textContent = text; status.hidden = !text; };
  const sync = () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    progress.disabled = !duration;
    progress.max = duration || 100;
    progress.value = video.currentTime;
    progress.setAttribute('aria-valuetext', `${format(video.currentTime)} de ${duration ? format(duration) : 'duración pendiente'}`);
    time.textContent = `${format(video.currentTime)} / ${duration ? format(duration) : '--:--'}`;
    toggle.setAttribute('aria-label', video.paused ? 'Reproducir video' : 'Pausar video');
    toggle.firstElementChild.textContent = video.paused ? '▶' : 'Ⅱ';
    mute.setAttribute('aria-label', video.muted ? 'Activar sonido' : 'Silenciar video');
    mute.setAttribute('aria-pressed', String(video.muted));
  };
  const play = async () => {
    const fromCover = document.activeElement === cover;
    cover.hidden = true;
    controls.hidden = false;
    if (fromCover) toggle.focus({preventScroll:true});
    message('Cargando video…');
    try {
      if (video.error) video.load();
      await video.play();
      started = true;
      message('');
    } catch {
      message('No se pudo reproducir. Pulsa reproducir para reintentar.');
      if (!started) { cover.hidden = false; controls.hidden = true; if (fromCover) cover.focus({preventScroll:true}); }
    }
    sync();
  };
  const togglePlayback = () => { if (video.paused) play(); else video.pause(); };
  cover.addEventListener('click', play);
  toggle.addEventListener('click', togglePlayback);
  video.addEventListener('click', togglePlayback);
  progress.addEventListener('input', () => { if (Number.isFinite(video.duration)) video.currentTime = Number(progress.value); sync(); });
  mute.addEventListener('click', () => { video.muted = !video.muted; });
  speed.addEventListener('change', () => { video.playbackRate = Number(speed.value); });
  fullscreen.hidden = !stage.requestFullscreen && !video.webkitEnterFullscreen;
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stage.requestFullscreen) await stage.requestFullscreen();
      else video.webkitEnterFullscreen();
    } catch { message('La pantalla completa no está disponible en este navegador.'); }
  });
  document.addEventListener('fullscreenchange', () => fullscreen.setAttribute('aria-label', document.fullscreenElement === stage ? 'Salir de pantalla completa' : 'Ver video en pantalla completa'));
  for (const event of ['timeupdate', 'loadedmetadata', 'durationchange', 'play', 'pause', 'volumechange', 'ended']) video.addEventListener(event, sync);
  video.addEventListener('playing', () => message(''));
  video.addEventListener('waiting', () => { if (!video.paused) message('Cargando video…'); });
  video.addEventListener('canplay', () => message(''));
  video.addEventListener('error', () => message('No se pudo cargar el video. Pulsa reproducir para reintentar.'));
  video.controls = false;
  stage.classList.add('video-enhanced');
  cover.hidden = false;
  sync();
})();
