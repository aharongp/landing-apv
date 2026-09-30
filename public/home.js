(() => {
  const hero = document.querySelector('.home-video-hero');
  if (hero) {
    const actions = hero.querySelector('.hero-primary-actions');
    const videoCard = hero.querySelector('.hero-video-card');
    const originalPosition = document.createComment('hero actions desktop position');
    actions.before(originalPosition);
    const mobileHero = window.matchMedia('(max-width:768px)');
    const arrangeHero = () => {
      if (mobileHero.matches) videoCard.after(actions);
      else originalPosition.after(actions);
    };
    mobileHero.addEventListener('change', arrangeHero);
    arrangeHero();
  }
  const depositCases = document.querySelector('.deposit-cases');
  if (depositCases) {
    const origin = document.createComment('deposit cases desktop position');
    depositCases.before(origin);
    const details = document.createElement('details');
    details.className = 'mobile-section-details';
    const summary = document.createElement('summary');
    details.append(summary);
    const mobile = window.matchMedia('(max-width:768px)');
    const arrangeDeposit = () => {
      if (mobile.matches) { origin.after(details); details.append(depositCases); }
      else { origin.after(depositCases); details.remove(); }
    };
    const label = () => { summary.textContent = document.documentElement.lang === 'en' ? 'If you win, lose or don’t pay' : 'Si ganas, no ganas o no pagas'; };
    label(); arrangeDeposit();
    mobile.addEventListener('change', arrangeDeposit);
    document.addEventListener('apv:language', label);
  }
  const budgetForm = document.getElementById('budget-form');
  if (budgetForm) {
    const result = document.getElementById('budget-result');
    const error = document.getElementById('budget-error');
    const money = value => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
    budgetForm.addEventListener('input', () => { result.hidden=true;error.hidden=true; });
    budgetForm.addEventListener('submit', event => {
      event.preventDefault(); result.hidden=true;error.hidden=true;
      if(!window.APVAuth?.isAuthenticated()) {
        window.APVAuth?.open(document.documentElement.lang==='en'?'Create a free account to calculate your budget. Your amounts will be kept.':'Crea tu cuenta gratis para calcular tu presupuesto. Conservaremos los importes que ingresaste.',{type:'budget'},'register');
        return;
      }
      try {
        if(!budgetForm.reportValidity()) return;
        const quote = window.APVBudget.quote(document.getElementById('budget-total').value,document.getElementById('budget-reserve').value,window.apvBaseCostEstimate);
        for(const [id,value] of [['budget-bid',quote.bid],['budget-purchase',quote.purchase],['budget-reserved',quote.reserve],['budget-sum',quote.total]]) document.getElementById(id).textContent=money(value);
        const query=document.getElementById('budget-query').value.trim();
        document.getElementById('budget-catalog').href=window.APVTracking.campaignURL('/catalogo'+(query?'?q='+encodeURIComponent(query):''));
        result.hidden=false;
      } catch (err) {
        error.textContent=document.documentElement.lang==='en' ? (err instanceof RangeError ? 'Enter a valid budget and a smaller reserve, leaving enough for the bid and fees.' : 'Unable to calculate now. Please use the calculator on the vehicle page.') : (err instanceof RangeError ? err.message : 'No se pudo calcular ahora. Puedes usar la calculadora de la ficha del vehículo.');
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
  const captions=document.getElementById('hero-captions'),cc=document.getElementById('video-captions'),transcript=document.getElementById('video-transcript');
  let captionsOn=false;
  function syncCaptions(){if(captions)captions.track.mode=captionsOn?'showing':'hidden';if(cc){cc.setAttribute('aria-pressed',String(captionsOn));cc.setAttribute('aria-label',captionsOn?text('Ocultar subtítulos','Hide captions'):text('Mostrar subtítulos','Show captions'));}}
  cc?.addEventListener('click',()=>{captionsOn=!captionsOn;syncCaptions();});
  video.addEventListener('loadedmetadata',syncCaptions);
  captions?.addEventListener('load',syncCaptions);
  const format = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const text = (es,en) => document.documentElement.lang === 'en' ? en : es;
  let mediaGeneration = 0;
  let started = false;
  const message = text => { status.textContent = text; status.hidden = !text; };
  const sync = () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    progress.disabled = !duration;
    progress.max = duration || 100;
    progress.value = video.currentTime;
    progress.setAttribute('aria-valuetext', `${format(video.currentTime)} ${text("de","of")} ${duration ? format(duration) : text("duración pendiente","duration pending")}`);
    time.textContent = `${format(video.currentTime)} / ${duration ? format(duration) : '--:--'}`;
    toggle.setAttribute('aria-label', video.paused ? text("Reproducir video","Play video") : text("Pausar video","Pause video"));
    toggle.firstElementChild.textContent = video.paused ? '▶' : 'Ⅱ';
    mute.setAttribute('aria-label', video.muted ? text("Activar sonido","Unmute video") : text("Silenciar video","Mute video"));
    mute.setAttribute('aria-pressed', String(video.muted));
    fullscreen.setAttribute('aria-label', document.fullscreenElement === stage ? text('Salir de pantalla completa','Exit fullscreen') : text('Ver video en pantalla completa','Watch video in fullscreen'));
  };
  const play = async () => {
    const generation = mediaGeneration;
    const fromCover = document.activeElement === cover;
    cover.hidden = true;
    controls.hidden = false;
    if (fromCover) toggle.focus({preventScroll:true});
    message(text("Cargando video…","Loading video\u2026"));
    try {
      if (video.error) video.load();
      await video.play();
      if (generation !== mediaGeneration) return;
      started = true;
      message('');
    } catch {
      if (generation !== mediaGeneration) return;
      message(text("No se pudo reproducir. Pulsa reproducir para reintentar.","Playback failed. Press play to retry."));
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
    } catch { message(text("La pantalla completa no está disponible en este navegador.","Fullscreen is not available in this browser.")); }
  });
  document.addEventListener('fullscreenchange', () => fullscreen.setAttribute('aria-label', document.fullscreenElement === stage ? text("Salir de pantalla completa","Exit fullscreen") : text("Ver video en pantalla completa","Watch video in fullscreen")));
  for (const event of ['timeupdate', 'loadedmetadata', 'durationchange', 'play', 'pause', 'volumechange', 'ended']) video.addEventListener(event, sync);
  video.addEventListener('playing', () => message(''));
  video.addEventListener('waiting', () => { if (!video.paused) message(text("Cargando video…","Loading video\u2026")); });
  video.addEventListener('canplay', () => message(''));
  video.addEventListener('error', () => message(text("No se pudo cargar el video. Pulsa reproducir para reintentar.","The video could not load. Press play to retry.")));
  video.controls = false;
  stage.classList.add('video-enhanced');
  cover.hidden = false;
  const setMediaLanguage = () => {
    const en = document.documentElement.lang === 'en';
    const source = video.querySelector('source');
    const src = en ? '/assets/cars-vsl-en.mp4' : '/assets/cars-vsl.mp4';
    if(captions){captions.src=src.replace('.mp4','.vtt');captions.srclang=en?'en':'es';captions.label=en?'English':'Español';}
    if(transcript){transcript.href='/video-transcript-'+(en?'en':'es')+'.html';transcript.textContent=text('Leer transcripción','Read transcript');}
    const scope=document.getElementById('video-scope-note');if(scope)scope.textContent=text('Video orientativo. Tu asesor confirma disponibilidad, gastos adicionales y depósito.','General overview. Your advisor confirms availability, additional costs and deposit terms.');
    syncCaptions();
    if (source.getAttribute('src') !== src) {
      mediaGeneration++; video.pause(); started = false;
      source.setAttribute('src', src);
      video.poster = en ? '/assets/cars-vsl-en-poster.jpg' : '/assets/cars-vsl-poster.jpg?v=182466f81c4e';
      video.querySelector('a').href = src;
      cover.hidden = false; controls.hidden = true; message('');
      speed.value = '1'; video.load();
    }
    sync();
  };
  document.addEventListener('apv:language', setMediaLanguage);
  setMediaLanguage();
})();
