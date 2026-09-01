(function(){
  'use strict';

  const $ = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];
  const state = {
    page: 1,
    pageSize: 18,
    filters: null,
    currentVehicle: null,
    loading: false,
    user: null,
    config: null,
    pendingAuthAction: null,
    galleryImages: [],
    heroSearchTimer: null
  };

  const dom = {
    list: $('#catalog-list'), count: $('#catalog-count'), pagination: $('#pagination'), empty: $('#catalog-empty'),
    search: $('#search-input'), searchButton: $('#search-button'), make: $('#filter-make'), yearMin: $('#filter-year-min'),
    yearMax: $('#filter-year-max'), damage: $('#filter-damage'), run: $('#filter-run'), state: $('#filter-state'), keys: $('#filter-keys'),
    buyNow: $('#filter-buy-now'), odometer: $('#filter-odometer'), odometerLabel: $('#odometer-label'), sort: $('#sort-select'), filtersPanel: $('#filters-panel'),
    vehicleOverlay: $('#vehicle-overlay'), vehicleDetail: $('#vehicle-detail-content'), bidOverlay: $('#bid-overlay'), bidModal: $('.bid-modal'), bidAmount: $('#bid-amount'),
    bidVehicleMini: $('#bid-vehicle-mini'), bidAmountStep: $('#bid-step-amount'), bidChatStep: $('#bid-step-chat'), chatContext: $('#chat-context'),
    kommoFallback: $('#kommo-fallback'), fallbackPayload: $('#fallback-payload'), autoMessagePreview: $('#auto-message-preview'), toast: $('#toast'),
    authOverlay: $('#auth-overlay'), authButton: $('#auth-button'), accountChip: $('#account-chip'), accountAvatar: $('#account-avatar'),
    accountName: $('#account-name'), accountEmail: $('#account-email'), authReason: $('#auth-reason'), authStatus: $('#auth-status'),
    heroSearchForm: $('#hero-search-form'), heroSearchInput: $('#hero-search-input'), heroQuickResults: $('#hero-quick-results'), heroVehicleCard: $('#hero-vehicle-card'),
    chatReopenButton: $('#chat-reopen-button')
  };

  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function money(v){ const n=Number(v||0); return n>0 ? '$'+n.toLocaleString('en-US',{maximumFractionDigits:0}) : 'N/A'; }
  function miles(v){ const n=Number(v||0); return n>0 ? n.toLocaleString('en-US')+' mi' : 'N/D'; }
  function km(v){ const n=Number(v||0); return n>0 ? Math.round(n*1.60934).toLocaleString('en-US')+' km' : ''; }
  function dateLabel(value, zone){
    if(!value) return 'TBA';
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return 'TBA';
    return new Intl.DateTimeFormat('es-US',{month:'short',day:'numeric',year:'numeric'}).format(d)+(zone?' · '+zone:'');
  }
  function conditionLabel(v){
    const x=(v||'').toLowerCase();
    if(x.includes('run') && x.includes('drive')) return 'Runs & Drives';
    if(x.includes('start')) return 'Arranca';
    return v || 'Sin verificar';
  }
  function icon(text){ return `<span aria-hidden="true">${text}</span>`; }
  function imageStyle(url){ return url ? `style="background-image:url('${esc(url)}')"` : ''; }
  function titleDoc(v){ return [v.titleState,v.titleType].filter(Boolean).join(' · ') || 'N/D'; }
  function locationLabel(v){ return [v.locationCity,v.locationState].filter(Boolean).join(', ') || 'N/D'; }
  function vinText(v){ return v.vin || 'VIN protegido · inicia sesión para verlo'; }
  function initials(name){ return String(name||'AP').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase() || 'AP'; }

  const CHAT_MEMORY_KEY='apv_last_kommo_chat_v2';
  const BIDS_HISTORY_KEY='apv_user_bids_v15';

  function getUserBidsHistory(){
    if(!state.user) return [];
    try{
      const store=JSON.parse(localStorage.getItem(BIDS_HISTORY_KEY)||'{}');
      return Array.isArray(store[state.user.id])?store[state.user.id]:[];
    }catch(_){ return []; }
  }

  function saveUserBidRecord(v, maxBid){
    if(!state.user||!v||!v.lot) return;
    try{
      const store=JSON.parse(localStorage.getItem(BIDS_HISTORY_KEY)||'{}');
      const userList=Array.isArray(store[state.user.id])?store[state.user.id]:[];
      const filtered=userList.filter(b=>String(b.lot)!==String(v.lot));
      filtered.unshift({
        lot: String(v.lot),
        title: v.title||`Lote ${v.lot}`,
        vin: v.vin||'',
        maxBid: Number(maxBid||0),
        image: v.image||'',
        date: new Date().toISOString()
      });
      store[state.user.id]=filtered.slice(0, 15);
      localStorage.setItem(BIDS_HISTORY_KEY, JSON.stringify(store));
    }catch(_){}
  }

  function readChatMemory(){
    try{ const x=JSON.parse(localStorage.getItem(CHAT_MEMORY_KEY)||'null'); return x&&x.lot&&x.userId?x:null; }catch(_){ return null; }
  }
  function rememberChat(v){
    if(!state.user||!state.user.kommoUserId||!v?.lot) return;
    try{ localStorage.setItem(CHAT_MEMORY_KEY,JSON.stringify({userId:state.user.kommoUserId,lot:String(v.lot),title:v.title||'',savedAt:Date.now()})); }catch(_){}
    syncChatReopenButton();
  }
  function syncChatReopenButton(){
    if(!dom.chatReopenButton) return;
    const saved=readChatMemory();
    const bidIsOpen=!!(dom.bidOverlay&&!dom.bidOverlay.classList.contains('hidden'));
    const canOpen=!!(state.user&&saved&&saved.userId===state.user.kommoUserId&&!bidIsOpen);
    dom.chatReopenButton.classList.toggle('hidden',!canOpen);
    if(canOpen) dom.chatReopenButton.title=saved.title?`Volver al chat de ${saved.title}`:'Volver a tu conversación';
  }

  async function clearUserBids(){
    try {
      await api('/api/user/bids', { method: 'DELETE' });
    } catch(_) {}
    if(state.user && state.user.id){
      try{
        const store=JSON.parse(localStorage.getItem(BIDS_HISTORY_KEY)||'{}');
        delete store[state.user.id];
        localStorage.setItem(BIDS_HISTORY_KEY, JSON.stringify(store));
      }catch(_){}
    }
    try{ localStorage.removeItem(CHAT_MEMORY_KEY); }catch(_){}
    showToast('Historial de pujas limpiado correctamente.');
    renderConversationSelector();
  }

  async function renderConversationSelector(){
    const container=$('#chat-history-selector');
    if(!container||!state.user) return;

    let bids=getUserBidsHistory();
    try{
      const serverBids=await api('/api/user/bids').catch(()=>null);
      if(serverBids && serverBids.ok && Array.isArray(serverBids.bids)){
        serverBids.bids.forEach(sb=>{
          if(sb.vehicle && !bids.some(b=>String(b.lot)===String(sb.lot))){
            bids.push({
              lot: String(sb.lot),
              title: sb.vehicle.title||`Lote ${sb.lot}`,
              vin: sb.vehicle.vin||'',
              maxBid: 0,
              image: sb.vehicle.image||'',
              date: sb.syncedAt
            });
          }
        });
      }
    }catch(_){}

    if(bids.length===0){
      container.classList.add('hidden');
      return;
    }

    const currentLot=state.currentVehicle ? String(state.currentVehicle.lot) : '';
    container.classList.remove('hidden');
    container.innerHTML=`
      <div class="chat-history-title">
        <span>Tus Conversaciones Activas (${bids.length})</span>
        <button type="button" class="btn-clear-bids" id="btn-clear-bids" title="Reiniciar historial de pujas">🗑 Reiniciar pujas</button>
      </div>
      <div class="chat-tabs-scroll">
        ${bids.map(b=>`
          <button type="button" class="chat-tab ${String(b.lot)===currentLot?'active':''}" data-switch-lot="${esc(b.lot)}">
            🚗 ${esc(b.title.slice(0, 22))}${b.maxBid?` <span class="tab-bid-chip">$${Number(b.maxBid).toLocaleString()}</span>`:''}
          </button>
        `).join('')}
      </div>
    `;

    const clearBtn=$('#btn-clear-bids', container);
    if(clearBtn) clearBtn.onclick=clearUserBids;
  }

  function showToast(msg){ dom.toast.textContent=msg; dom.toast.classList.remove('hidden'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>dom.toast.classList.add('hidden'),3200); }

  async function api(path, options){
    const r=await fetch(path, options);
    const data=await r.json().catch(()=>({}));
    if(!r.ok){ const err=new Error(data.error||'No se pudo completar la solicitud.'); err.status=r.status; err.data=data; throw err; }
    return data;
  }

  async function initFilters(){
    const f=await api('/api/filters'); state.filters=f;
    $('#hero-total').textContent = f.total.toLocaleString('en-US');
    populate(dom.make, f.makes); populate(dom.damage, f.damages); populate(dom.run, f.runStates); populate(dom.state, f.states);
    dom.yearMin.value=f.minYear; dom.yearMin.min=f.minYear; dom.yearMin.max=f.maxYear;
    dom.yearMax.value=f.maxYear; dom.yearMax.min=f.minYear; dom.yearMax.max=f.maxYear;
    const maxOdo=Math.max(100000,Math.ceil((f.maxOdometer||250000)/25000)*25000); dom.odometer.max=maxOdo; dom.odometer.value=maxOdo; updateOdometerLabel();
  }
  function populate(select, items){ for(const item of items){ const o=document.createElement('option'); o.value=item; o.textContent=item; select.appendChild(o); } }
  function updateOdometerLabel(){ dom.odometerLabel.textContent=Number(dom.odometer.value||0).toLocaleString('en-US')+' mi'; }

  function params(){
    const p=new URLSearchParams({page:String(state.page),pageSize:String(state.pageSize),sort:dom.sort.value});
    if(dom.search.value.trim()) p.set('q',dom.search.value.trim());
    if(dom.make.value) p.set('make',dom.make.value); if(dom.damage.value) p.set('damage',dom.damage.value); if(dom.run.value) p.set('runState',dom.run.value); if(dom.state.value) p.set('state',dom.state.value);
    if(dom.yearMin.value) p.set('yearMin',dom.yearMin.value); if(dom.yearMax.value) p.set('yearMax',dom.yearMax.value);
    if(dom.odometer.value && state.filters && Number(dom.odometer.value)<Number(dom.odometer.max)) p.set('odometerMax',dom.odometer.value);
    if(dom.keys.checked) p.set('keysOnly','1'); if(dom.buyNow.checked) p.set('buyNowOnly','1');
    return p;
  }

  function skeletons(){ dom.empty.classList.add('hidden'); dom.list.innerHTML=Array.from({length:6},()=>'<div class="skeleton"></div>').join(''); }

  async function loadVehicles(){
    if(state.loading) return; state.loading=true; skeletons();
    try{
      const data=await api('/api/vehicles?'+params().toString());
      dom.count.textContent=data.total.toLocaleString('en-US');
      renderVehicles(data.items); renderPagination(data);
      if(!data.items.length) dom.empty.classList.remove('hidden');
      if(data.items[0] && !$('#hero-car-photo').dataset.ready) setHeroVehicle(data.items[0]);
    }catch(err){ dom.list.innerHTML=''; dom.empty.classList.remove('hidden'); showToast(err.message); }
    finally{ state.loading=false; }
  }

  function setHeroVehicle(v){
    const photo=$('#hero-car-photo');
    photo.dataset.ready='1';
    photo.style.backgroundImage=v.image?`url('${v.image}')`:'';
    $('#hero-car-title').textContent=v.title;
    $('#hero-car-meta').textContent=`Lote ${v.lot} · ${locationLabel(v)}`;
    if(dom.heroVehicleCard) dom.heroVehicleCard.dataset.lot=v.lot;
  }

  function heroSearchToCatalog(query){
    const q=String(query||'').trim();
    dom.search.value=q;
    state.page=1;
    dom.heroQuickResults?.classList.add('hidden');
    loadVehicles();
    document.querySelector('#catalogo')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  window.APVHeroSearch=function(query){ heroSearchToCatalog(query); return false; };

  function renderHeroQuickResults(items, query){
    if(!dom.heroQuickResults) return;
    const q=String(query||'').trim();
    if(!q){ dom.heroQuickResults.innerHTML=''; dom.heroQuickResults.classList.add('hidden'); return; }
    if(!items.length){
      dom.heroQuickResults.innerHTML=`<div class="hero-quick-empty">No encontramos coincidencias para “${esc(q)}”.</div><button type="button" class="hero-quick-all" data-hero-search-all>Ver el catálogo completo</button>`;
      dom.heroQuickResults.classList.remove('hidden');
      return;
    }
    dom.heroQuickResults.innerHTML=items.map(v=>`<button type="button" class="hero-quick-item" data-hero-lot="${esc(v.lot)}"><span class="hero-quick-photo" ${imageStyle(v.image)}></span><span class="hero-quick-copy"><strong>${esc(v.title)}</strong><span>Lote ${esc(v.lot)} · ${esc(locationLabel(v))}</span></span></button>`).join('')+`<button type="button" class="hero-quick-all" data-hero-search-all>Ver todos los resultados para “${esc(q)}”</button>`;
    dom.heroQuickResults.classList.remove('hidden');
  }

  async function quickHeroSearch(){
    if(!dom.heroSearchInput) return;
    const q=dom.heroSearchInput.value.trim();
    if(q.length<2){ renderHeroQuickResults([], ''); return; }
    try{
      const p=new URLSearchParams({q,page:'1',pageSize:'5',sort:'saleSoon'});
      const data=await api('/api/vehicles?'+p.toString());
      if(dom.heroSearchInput.value.trim()!==q) return;
      renderHeroQuickResults(data.items||[],q);
    }catch(_){ /* El buscador principal sigue disponible aunque fallen sugerencias. */ }
  }

  function renderVehicles(items){
    dom.list.innerHTML=items.map(v=>`
      <article class="vehicle-card" data-lot="${esc(v.lot)}">
        <div class="vehicle-photo-wrap" data-action="detail"><div class="vehicle-photo" ${imageStyle(v.image)}>${v.image?'':'<div class="image-fallback">SIN FOTO</div>'}</div></div>
        <div class="vehicle-main">
          <div class="vehicle-title-row"><h3 data-action="detail">${esc(v.title)}</h3><span class="source-pill">COPART</span></div>
          <div class="vehicle-identifiers">⌗ ${esc(vinText(v))} &nbsp;•&nbsp; Lote ${esc(v.lot)}</div>
          <div class="spec-chips">
            <span class="spec-chip">${icon('🔑')} ${v.hasKeys==='YES'?'Llave disponible':'Llave N/D'}</span>
            <span class="spec-chip">${icon('⚙')} ${esc(v.transmission||'N/D')}</span>
            <span class="spec-chip">${icon('◉')} ${esc(v.drive||'N/D')}</span>
            ${v.engine?`<span class="spec-chip">${icon('◴')} ${esc(v.engine)}</span>`:''}
            ${v.cylinders?`<span class="spec-chip">${icon('⬡')} ${esc(v.cylinders)} cyl</span>`:''}
            ${v.fuel?`<span class="spec-chip">${icon('⛽')} ${esc(v.fuel)}</span>`:''}
          </div>
          <div class="info-grid">
            <div class="info-line"><span>Odómetro</span><strong>${esc(miles(v.odometer))}${v.odometer?' ('+esc(km(v.odometer))+')':''}</strong></div>
            <div class="info-line"><span>Ubicación</span><strong>${esc(locationLabel(v))}</strong></div>
            <div class="info-line"><span>Daño</span><strong>${esc([v.primaryDamage,v.secondaryDamage].filter(Boolean).join(' + ')||'N/D')}</strong></div>
            <div class="info-line"><span>Documento</span><strong>${esc(titleDoc(v))}</strong></div>
            <div class="info-line"><span>Condición</span><strong>${esc(conditionLabel(v.runsDrives))}</strong></div>
            <div class="info-line"><span>Carrocería</span><strong>${esc(v.body||'N/D')}</strong></div>
            <div class="info-line"><span>Color</span><strong>${esc(v.color||'N/D')}</strong></div>
            <div class="info-line"><span>Retail</span><strong>${esc(money(v.retailValue))}</strong></div>
          </div>
        </div>
        <aside class="vehicle-side">
          <div class="auction-box">
            <div class="auction-line">▣ <span>${esc(dateLabel(v.saleDate,v.timeZone))}</span></div>
            <div class="auction-line"><span class="dot">◉</span><span>${esc(v.saleStatus||'Subasta')}</span></div>
            <div class="auction-line">▥ <span>Retail ${esc(money(v.retailValue))}</span></div>
          </div>
          <div class="bid-box"><div><span>Puja actual</span><strong>${esc(money(v.currentBid))}</strong></div><div><span>Buy now</span><strong>${esc(money(v.buyNow))}</strong></div></div>
          <div class="side-status">● ${esc(v.saleStatus||'PRÓXIMA')}</div>
          <div class="card-actions"><button class="btn btn-ghost" data-action="detail">Ver ficha</button><button class="btn btn-primary" data-action="bid">Quiero ofertar</button></div>
        </aside>
      </article>`).join('');
  }

  function renderPagination(data){
    if(data.pages<=1){ dom.pagination.innerHTML=''; return; }
    const start=Math.max(1,data.page-2), end=Math.min(data.pages,data.page+2); const btn=[];
    btn.push(`<button class="page-btn" data-page="${data.page-1}" ${data.page===1?'disabled':''}>‹</button>`);
    if(start>1){ btn.push('<button class="page-btn" data-page="1">1</button>'); if(start>2) btn.push('<span>…</span>'); }
    for(let i=start;i<=end;i++) btn.push(`<button class="page-btn ${i===data.page?'active':''}" data-page="${i}">${i}</button>`);
    if(end<data.pages){ if(end<data.pages-1) btn.push('<span>…</span>'); btn.push(`<button class="page-btn" data-page="${data.pages}">${data.pages}</button>`); }
    btn.push(`<button class="page-btn" data-page="${data.page+1}" ${data.page===data.pages?'disabled':''}>›</button>`); dom.pagination.innerHTML=btn.join('');
  }

  async function getVehicle(lot){ return api('/api/vehicles/'+encodeURIComponent(lot)); }

  async function openDetail(lot, push=true){
    try{
      state.galleryImages=[];
      const v=await getVehicle(lot); state.currentVehicle=v; renderDetail(v); dom.vehicleOverlay.classList.remove('hidden'); document.body.style.overflow='hidden';
      loadGallery(lot);
      if(push && location.pathname!==`/vehiculo/${encodeURIComponent(lot)}`) history.pushState({lot},'',`/vehiculo/${encodeURIComponent(lot)}`);
    }catch(err){ showToast(err.message); }
  }

  function vinQuickSpec(v){
    if(v.vin) return quickSpec('VIN', v.vin);
    return `<div class="quick-spec locked-spec"><span>VIN</span><button type="button" data-auth-vin>🔒 Regístrate para ver el VIN</button></div>`;
  }

  function quickSpec(label,value){ return `<div class="quick-spec"><span>${esc(label)}</span><strong>${esc(value||'N/D')}</strong></div>`; }
  function detailSpec(label,value){ return `<div class="detail-spec"><span>${esc(label)}</span><strong>${esc(value||'N/D')}</strong></div>`; }

  function renderDetail(v){
    const hasBuyNow=Number(v.buyNow)>0;
    const coverImage=v.image?v.image.replace(/_thb\./i,'_ful.'):'';
    state.currentPhotoIdx = 0;
    dom.vehicleDetail.innerHTML=`
      <div class="detail-hero">
        <div class="detail-gallery" id="detail-gallery">
          <div class="detail-gallery-main" id="detail-gallery-main">
            <button class="gallery-arrow prev" id="gallery-prev-btn" type="button" aria-label="Foto anterior">‹</button>
            ${coverImage?`<img id="detail-main-image" src="${esc(coverImage)}" alt="${esc(v.title)}" />`:'<div class="image-fallback">SIN FOTO DISPONIBLE</div>'}
            <button class="gallery-arrow next" id="gallery-next-btn" type="button" aria-label="Siguiente foto">›</button>
            <span id="detail-photo-count" class="photo-count">1 foto</span>
          </div>
          <div id="detail-gallery-thumbs" class="detail-gallery-thumbs">${coverImage?`<button class="gallery-thumb active" data-gallery-src="${esc(coverImage)}"><img src="${esc(coverImage)}" alt="Foto 1" /></button>`:''}</div>
        </div>
        <div class="detail-summary">
          <span class="eyebrow">LOTE ${esc(v.lot)} · COPART</span>
          <h2 id="vehicle-detail-title">${esc(v.title)}</h2>
          <div class="title-document-badge">${esc(titleDoc(v))}</div>
          <div class="detail-pills"><span class="condition-pill">${esc(conditionLabel(v.runsDrives))}</span><span class="spec-chip">🔑 ${v.hasKeys==='YES'?'Llaves':'Sin confirmar'}</span><span class="spec-chip">⚙ ${esc(v.transmission||'N/D')}</span></div>
          ${hasBuyNow?`<div class="buy-now-highlight"><span>PRECIO COMPRA DIRECTA (BUY IT NOW)</span><strong>${esc(money(v.buyNow))}</strong></div>`:''}
          <div class="detail-price-grid">
            <div class="detail-price highlight-price"><span>Puja actual subasta</span><strong>${esc(money(v.currentBid))}</strong></div>
            <div class="detail-price"><span>Valor retail estimado</span><strong>${esc(money(v.retailValue))}</strong></div>
            <div class="detail-price"><span>Fecha de subasta</span><strong class="small-value">${esc(dateLabel(v.saleDate,v.timeZone))}</strong></div>
            <div class="detail-price"><span>Ubicación</span><strong class="small-value">${esc(locationLabel(v))}</strong></div>
          </div>
          <button class="btn btn-primary full" data-detail-bid>Quiero ofertar</button>
          ${!state.user?'<p class="signin-detail-note">🔒 Debes registrarte para ver el VIN completo y abrir el chat.</p>':''}
        </div>
      </div>
      <div class="detail-body">
        <section class="all-photos-section" id="all-photos-section">
          <div class="technical-heading"><div><span class="eyebrow">GALERÍA DEL LOTE</span><h3>Todas las fotos</h3></div><span id="all-photos-count" class="detail-source">Cargando…</span></div>
          <div id="detail-all-photos" class="detail-all-photos">${coverImage?`<button type="button" data-gallery-src="${esc(coverImage)}"><img src="${esc(coverImage)}" alt="Foto del vehículo" /></button>`:''}</div>
        </section>
        <div class="technical-heading"><div><span class="eyebrow">FICHA TÉCNICA Y PRECIOS</span><h3>Información completa del vehículo</h3></div><span class="detail-source">Datos oficiales Copart</span></div>
        <div class="quick-tech-grid">
          ${hasBuyNow?quickSpec('Buy It Now (Compra directa)', money(v.buyNow)):''}
          ${quickSpec('Puja actual subasta', money(v.currentBid))}
          ${quickSpec('Valor retail estimado', money(v.retailValue))}
          ${v.repairCost?quickSpec('Costo estim. reparación', money(v.repairCost)):''}
          ${vinQuickSpec(v)}
          ${quickSpec('Odómetro',miles(v.odometer)+(v.odometer?' · '+km(v.odometer):''))}
          ${quickSpec('Transmisión',v.transmission||'N/D')}
          ${quickSpec('Motor',v.engine||'N/D')}
          ${quickSpec('Cilindros',v.cylinders?`${v.cylinders} cyl`:'N/D')}
          ${quickSpec('Tracción',v.drive||'N/D')}
          ${quickSpec('Combustible',v.fuel||'N/D')}
          ${quickSpec('Daño principal',v.primaryDamage||'N/D')}
          ${quickSpec('Daño secundario',v.secondaryDamage||'N/D')}
          ${quickSpec('Tipo de pérdida',v.lossType||'N/D')}
          ${quickSpec('Carrocería',v.body||'N/D')}
          ${quickSpec('Llaves disponibles',v.hasKeys==='YES'?'Sí':'No / N/D')}
          ${quickSpec('Título / Documento',titleDoc(v))}
          ${quickSpec('Ubicación / Patio',locationLabel(v))}
        </div>
        <button id="toggle-full-tech" class="full-tech-toggle" type="button" aria-expanded="false">Ver toda la información técnica <span>⌄</span></button>
        <div id="full-tech" class="full-tech hidden">
          <div class="detail-specs">
            ${detailSpec('Lote',v.lot)}
            ${detailSpec('Item',v.item||'N/D')}
            ${detailSpec('Tipo de vehículo',v.vehicleType||'N/D')}
            ${detailSpec('Año',v.year||'N/D')}
            ${detailSpec('Marca',v.make||'N/D')}
            ${detailSpec('Modelo',v.model||'N/D')}
            ${detailSpec('Grupo de modelo',v.modelGroup||'N/D')}
            ${detailSpec('Trim',v.trim||'N/D')}
            ${detailSpec('Color',v.color||'N/D')}
            ${detailSpec('Daño principal',v.primaryDamage||'N/D')}
            ${detailSpec('Daño secundario',v.secondaryDamage||'N/D')}
            ${detailSpec('Condición',conditionLabel(v.runsDrives))}
            ${detailSpec('Documento',titleDoc(v))}
            ${detailSpec('Código condición',v.conditionCode||'N/D')}
            ${detailSpec('Odómetro brand',v.odometerBrand||'N/D')}
            ${detailSpec('Motor',v.engine||'N/D')}
            ${detailSpec('Cilindros',v.cylinders?`${v.cylinders} cyl`:'N/D')}
            ${detailSpec('Transmisión',v.transmission||'N/D')}
            ${detailSpec('Estado de venta',v.saleStatus||'N/D')}
            ${detailSpec('Make an Offer',v.makeOfferEligible?'Sí':'No')}
            ${detailSpec('Buy It Now',money(v.buyNow))}
            ${detailSpec('Puja actual',money(v.currentBid))}
            ${detailSpec('Retail estimado',money(v.retailValue))}
            ${detailSpec('Costo reparación',money(v.repairCost))}
            ${detailSpec('Patio',v.yardName||'N/D')}
            ${detailSpec('Yard number',v.yardNumber||'N/D')}
            ${detailSpec('ZIP',v.locationZip||'N/D')}
            ${detailSpec('País',v.locationCountry||'N/D')}
            ${detailSpec('Seller',v.sellerName||'N/D')}
            ${detailSpec('Sale light',v.saleLight||'N/D')}
            ${detailSpec('AutoGrade',v.autoGrade||'N/D')}
            ${detailSpec('Actualizado',v.lastUpdated||'N/D')}
          </div>
          ${v.specialNote||v.announcements?`<div class="detail-text-info">${v.specialNote?`<div><span>NOTA ESPECIAL</span><p>${esc(v.specialNote)}</p></div>`:''}${v.announcements?`<div><span>ANUNCIOS</span><p>${esc(v.announcements)}</p></div>`:''}</div>`:''}
        </div>
        <div class="detail-bottom">
          <div class="detail-note"><h4>¿Listo para ofertar?</h4><p>Después de iniciar sesión defines tu tope. APV envía a Kommo la ficha, el VIN, el lote, el monto y tus datos de cuenta.</p><button class="btn btn-primary" style="margin-top:14px" data-detail-bid>Quiero ofertar</button></div>
          <div class="detail-note"><h4>Fuente de la información</h4><p>La ficha se construye con el CSV y las fotos se consultan bajo demanda usando el enlace Image URL de Copart.</p><a href="${esc(v.copartUrl)}" target="_blank" rel="noreferrer">Abrir lote en Copart →</a></div>
        </div>
      </div>`;

    setupGalleryNavigation();
  }

  function setupGalleryNavigation(){
    const mainContainer = $('#detail-gallery-main');
    if(!mainContainer) return;
    mainContainer.onclick = (e) => {
      if(!state.galleryImages || !state.galleryImages.length) return;
      if(e.target.closest('#gallery-prev-btn')) {
        changePhotoIndex(-1);
        return;
      }
      if(e.target.closest('#gallery-next-btn')) {
        changePhotoIndex(1);
        return;
      }
      const rect = mainContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if(clickX < rect.width * 0.4) {
        changePhotoIndex(-1);
      } else {
        changePhotoIndex(1);
      }
    };
  }

  function changePhotoIndex(dir){
    if(!state.galleryImages || !state.galleryImages.length) return;
    state.currentPhotoIdx = (state.currentPhotoIdx + dir + state.galleryImages.length) % state.galleryImages.length;
    const newSrc = state.galleryImages[state.currentPhotoIdx];
    const mainImg = $('#detail-main-image');
    if(mainImg && newSrc) mainImg.src = newSrc;
    $$('.gallery-thumb').forEach((t, i) => t.classList.toggle('active', i === state.currentPhotoIdx));
  }

  async function loadGallery(lot){
    try{
      const data=await api('/api/vehicles/'+encodeURIComponent(lot)+'/images');
      if(!state.currentVehicle || String(state.currentVehicle.lot) !== String(lot)) return;
      let images=(data.images||[]).filter(Boolean);

      if(images.length <= 1 && state.currentVehicle.imageApi) {
        try {
          const res = await fetch(state.currentVehicle.imageApi);
          if(res.ok) {
            const clientData = await res.json();
            if(clientData && Array.isArray(clientData.lotImages)) {
              const extracted = clientData.lotImages.map(item => {
                const link = Array.isArray(item.link) ? (item.link.find(l => l.url && (l.url.includes('_ful.') || l.url.includes('_hrs.'))) || item.link[0]) : null;
                return link ? String(link.url).trim().replace(/^http:/i, 'https:') : null;
              }).filter(Boolean);
              if(extracted.length > 0) {
                images = [...new Set([...extracted, ...images])];
              }
            }
          }
        } catch(_) {}
      }

      state.galleryImages=images;
      renderGallery(images);
    }catch(_){
      if(state.currentVehicle && String(state.currentVehicle.lot) === String(lot)) {
        const cover = state.currentVehicle.image ? [state.currentVehicle.image.replace(/_thb\./i, '_ful.'), state.currentVehicle.image] : [];
        state.galleryImages = cover;
        renderGallery(cover);
      }
    }
  }

  function renderGallery(images){
    const main=$('#detail-main-image'); const thumbs=$('#detail-gallery-thumbs'); const count=$('#detail-photo-count');
    const allGrid=$('#detail-all-photos'); const allCount=$('#all-photos-count');
    if(!thumbs||!count) return;
    const fallbackCover = state.currentVehicle && state.currentVehicle.image ? [state.currentVehicle.image.replace(/_thb\./i, '_ful.')] : [];
    const finalImages=images.length?images:fallbackCover;
    state.galleryImages = finalImages;
    state.currentPhotoIdx = 0;
    const label=`${finalImages.length} ${finalImages.length===1?'foto':'fotos'}`;
    count.textContent=label;
    if(allCount) allCount.textContent=label;
    if(!finalImages.length){ thumbs.innerHTML=''; if(allGrid) allGrid.innerHTML='<div class="photo-empty">No hay fotos disponibles para este lote.</div>'; return; }
    if(main) main.src=finalImages[0];
    thumbs.innerHTML=finalImages.map((src,i)=>`<button class="gallery-thumb ${i===0?'active':''}" data-gallery-src="${esc(src)}" aria-label="Ver foto ${i+1}"><img src="${esc(src)}" alt="Foto ${i+1} de ${esc(state.currentVehicle.title)}" loading="lazy" /></button>`).join('');
    if(allGrid) allGrid.innerHTML=finalImages.map((src,i)=>`<button type="button" data-gallery-src="${esc(src)}" aria-label="Ampliar foto ${i+1}"><img src="${esc(src)}" alt="Foto ${i+1} de ${esc(state.currentVehicle.title)}" loading="lazy" /></button>`).join('');
  }

  function closeDetail(changeUrl=true){
    dom.vehicleOverlay.classList.add('hidden');
    if(dom.bidOverlay.classList.contains('hidden')&&dom.authOverlay.classList.contains('hidden')) document.body.style.overflow='';
    if(changeUrl && location.pathname.startsWith('/vehiculo/')) history.pushState({},'',location.pathname.replace(/\/vehiculo\/[^/]+/,'/')+location.search+location.hash);
  }

  function setAuthStatus(message, kind='error'){
    if(!message){ dom.authStatus.classList.add('hidden'); dom.authStatus.textContent=''; return; }
    dom.authStatus.textContent=message; dom.authStatus.dataset.kind=kind; dom.authStatus.classList.remove('hidden');
  }

  function openAuth(reason, action){
    state.pendingAuthAction=action||null;
    dom.authReason.textContent=reason||'Regístrate para ver el VIN completo y hablar con un asesor.';
    setAuthStatus('');
    dom.authOverlay.classList.remove('hidden');
    dom.authOverlay.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    requestAnimationFrame(()=>dom.authOverlay.querySelector('input:not([type="hidden"])')?.focus());
  }

  function closeAuth(clearPending=true){
    dom.authOverlay.classList.add('hidden');
    dom.authOverlay.setAttribute('aria-hidden','true');
    if(clearPending) state.pendingAuthAction=null;
    if(dom.bidOverlay.classList.contains('hidden')&&dom.vehicleOverlay.classList.contains('hidden')) document.body.style.overflow='';
  }

  // Public fallback used by the header and by any future CTA. Keeping this
  // tiny API independent from boot() means the login window still opens even
  // if another part of the page has a temporary initialization error.
  window.APVAuth={open:openAuth,close:closeAuth};
  window.openAPVAuth=function(reason){ openAuth(reason||'Inicia sesión para recuperar tus conversaciones y acceder al VIN completo.'); return false; };
  window.closeAPVAuth=function(){ closeAuth(); return false; };

  function switchAuthTab(tab){
    $$('[data-auth-tab]').forEach(b=>b.classList.toggle('active',b.dataset.authTab===tab));
    $('#login-form').classList.toggle('hidden',tab!=='login');
    $('#register-form').classList.toggle('hidden',tab!=='register');
    $('#verify-form').classList.add('hidden');
    setAuthStatus('');
  }

  function applyUser(user){
    state.user=user||null;
    if(user){
      dom.authButton.classList.add('hidden'); dom.accountChip.classList.remove('hidden');
      dom.accountAvatar.textContent=initials(user.name); dom.accountName.textContent=user.name; dom.accountEmail.textContent=user.email;
      if(user.picture){ dom.accountAvatar.style.backgroundImage=`url('${user.picture}')`; dom.accountAvatar.classList.add('has-photo'); }
      if(window.apvKommo && typeof window.apvKommo.init==='function') window.apvKommo.init(user);
    }else{
      dom.accountChip.classList.add('hidden'); dom.authButton.classList.remove('hidden');
    }
    syncChatReopenButton();
  }

  async function completeAuth(user){
    const action=state.pendingAuthAction;
    applyUser(user); closeAuth(false); state.pendingAuthAction=null;
    showToast(`Bienvenido, ${user.name.split(' ')[0]}.`);
    await loadVehicles();
    if(action&&action.type==='bid'){
      try{ await openBid(await getVehicle(action.lot)); }catch(err){ showToast(err.message); }
    }else if(action&&action.type==='vin'){
      await openDetail(action.lot,false);
    }else if(!dom.vehicleOverlay.classList.contains('hidden')&&state.currentVehicle){
      await openDetail(state.currentVehicle.lot,false);
    }
  }

  async function submitLogin(e){
    e.preventDefault(); setAuthStatus('');
    const button=e.currentTarget.querySelector('button[type=submit]'); button.disabled=true;
    try{
      const d=await api('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#login-email').value,password:$('#login-password').value})});
      await completeAuth(d.user);
    }catch(err){ setAuthStatus(err.message); }
    finally{ button.disabled=false; }
  }

  async function submitRegister(e){
    e.preventDefault(); setAuthStatus('');
    const button=e.currentTarget.querySelector('button[type=submit]'); button.disabled=true;
    const email = $('#register-email').value.trim();
    try{
      const d=await api('/api/auth/register-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('#register-name').value,email,phone:$('#register-phone').value,password:$('#register-password').value})});
      state.pendingVerifyEmail = email;
      $('#register-form').classList.add('hidden');
      $('#verify-form').classList.remove('hidden');
      if ($('#verify-target-email')) $('#verify-target-email').textContent = email;
      if (d.devCode) {
        $('#verify-code').value = d.devCode;
        setAuthStatus(`Código enviado a tu correo. (Desarrollo: ${d.devCode})`, 'info');
      }
      showToast(d.message || 'Código de 6 dígitos enviado.');
    }catch(err){ setAuthStatus(err.message); }
    finally{ button.disabled=false; }
  }

  async function submitVerify(e){
    e.preventDefault(); setAuthStatus('');
    const button=e.currentTarget.querySelector('button[type=submit]'); button.disabled=true;
    try{
      const d=await api('/api/auth/verify-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email: state.pendingVerifyEmail || $('#register-email').value, code:$('#verify-code').value.trim()})});
      await completeAuth(d.user);
    }catch(err){ setAuthStatus(err.message); }
    finally{ button.disabled=false; }
  }

  async function initAuth(){
    try{
      const cfg = await api('/api/config').catch(() => ({}));
      state.config = cfg;
      const debugPanel = document.querySelector('.kommo-debug-panel');
      if (debugPanel) {
        if (cfg && cfg.debugKommo) {
          debugPanel.classList.remove('hidden');
        } else {
          debugPanel.classList.add('hidden');
        }
      }
      const me=await api('/api/auth/me');
      applyUser(me.authenticated?me.user:null);
    }catch(err){ showToast('No se pudo inicializar la cuenta: '+err.message); }
  }

  async function logout(){
    try{ await api('/api/auth/logout',{method:'POST'}); }catch(_){}
    // Recargar es intencional: Kommo debe reiniciarse sin el user_id de la cuenta anterior.
    location.reload();
  }

  async function openBid(v){
    if(!state.user){ openAuth('Crea tu cuenta o inicia sesión para solicitar la puja. Tu cuenta mantiene el historial de Kommo entre dispositivos.',{type:'bid',lot:v.lot}); return; }
    try{ if(!v.vin) v=await getVehicle(v.lot); }catch(_){}
    state.currentVehicle=v; closeDetail(false); dom.bidModal?.classList.remove('chat-mode'); dom.bidAmount.value=''; dom.bidAmountStep.classList.remove('hidden'); dom.bidChatStep.classList.add('hidden'); dom.kommoFallback.classList.remove('hidden');
    dom.bidVehicleMini.innerHTML=`<div class="thumb" ${imageStyle(v.image)}></div><div><h4>${esc(v.title)}</h4><p>Lote ${esc(v.lot)} · VIN ${esc(v.vin||'N/D')}</p><p>Puja actual ${esc(money(v.currentBid))} · Retail ${esc(money(v.retailValue))}</p></div>`;
    dom.bidOverlay.classList.remove('hidden'); document.body.style.overflow='hidden'; syncChatReopenButton(); setTimeout(()=>dom.bidAmount.focus(),100);
  }

  function closeBid(){ dom.bidOverlay.classList.add('hidden'); dom.bidModal?.classList.remove('chat-mode'); syncChatReopenButton(); if(dom.vehicleOverlay.classList.contains('hidden')&&dom.authOverlay.classList.contains('hidden')) document.body.style.overflow=''; }

  async function continueBid(){
    if(!state.user){ closeBid(); openAuth('Debes iniciar sesión antes de abrir el chat con APV Motors.',state.currentVehicle?{type:'bid',lot:state.currentVehicle.lot}:null); return; }
    const v=state.currentVehicle, amount=Number(dom.bidAmount.value||0); if(!v||amount<=0){ showToast('Indica un tope de puja válido.'); dom.bidAmount.focus(); return; }
    try{ await api('/api/bid-intents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lot:v.lot,maxBid:amount})}); }catch(err){ if(err.status===401){ closeBid(); openAuth('Tu sesión expiró. Vuelve a iniciar sesión.',{type:'bid',lot:v.lot}); return; } }
    dom.bidAmountStep.classList.add('hidden'); dom.bidChatStep.classList.remove('hidden'); dom.bidModal?.classList.add('chat-mode');
    if (dom.chatContext) dom.chatContext.innerHTML=`<div><strong>${esc(v.title)}</strong><br><span>Lote ${esc(v.lot)} · VIN ${esc(v.vin||'N/D')}</span></div><div><span>Tope solicitado</span><br><strong>${esc(money(amount))} USD</strong></div>`;
    const message=window.apvKommo ? window.apvKommo.buildVehicleMessage(v) : `Vehículo: ${v.title}\nVIN: ${v.vin||'N/D'}`;
    dom.autoMessagePreview.textContent=message;
    saveUserBidRecord(v, amount);
    rememberChat(v);
    renderConversationSelector();

    const statusText=$('#kommo-status-text');
    const statusChip=$('#kommo-status-chip');
    if(statusText) statusText.textContent='Preparando tu solicitud...';
    if(statusChip) statusChip.textContent='PROCESANDO';

    const canSend=window.apvKommo && !window.apvKommo.__bootstrapOnly && typeof window.apvKommo.sendBidContext==='function';
    const result=canSend ? window.apvKommo.sendBidContext(v,amount,state.user) : {ok:false,botParams:{vehicle_message:message},error:'El módulo Kommo de la página no cargó.'};
    if(result.ok && result.ready){ dom.kommoFallback.classList.add('hidden'); }
    else{
      dom.kommoFallback.classList.remove('hidden');
      dom.fallbackPayload.textContent='Mensaje preparado para Kommo:\n\n'+message;
      const fallbackCopy = $('#fallback-copy');
      if (fallbackCopy) fallbackCopy.textContent='Preparando tu solicitud con APV Motors…';
    }

    (async () => {
      try {
        const syncFn = (window.apvKommo && typeof window.apvKommo.syncBidBackend === 'function')
          ? window.apvKommo.syncBidBackend
          : async (l, m) => api('/api/kommo/sync-bid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lot: String(l), maxBid: Number(m) }) });
        const syncRes = await syncFn(v.lot, amount);
        if (syncRes && syncRes.ok) {
          if(statusText) statusText.textContent='Solicitud registrada';
          if(statusChip) statusChip.textContent='COMPLETADO';
          const fallbackCopy = $('#fallback-copy');
          if (fallbackCopy) fallbackCopy.textContent = 'Solicitud registrada con éxito.';
        }
      } catch (syncErr) {
        console.warn('[KOMMO BACKEND SYNC NOTICE]', syncErr.message || syncErr);
        if(statusText) statusText.textContent='Solicitud enviada. Tu asesor atenderá tu consulta.';
        if(statusChip) statusChip.textContent='ENVIADO';
      }
    })();
  }

  async function reopenLastChat(){
    if(!state.user){ openAuth('Inicia sesión para recuperar tu conversación de Kommo.'); return; }
    const saved=readChatMemory();
    if(!saved||saved.userId!==state.user.kommoUserId){ showToast('Todavía no hay una conversación guardada para esta cuenta.'); syncChatReopenButton(); return; }
    try{
      const v=await getVehicle(saved.lot);
      state.currentVehicle=v;
      renderConversationSelector();
      dom.bidAmountStep.classList.add('hidden');
      dom.bidChatStep.classList.remove('hidden');
      dom.bidModal?.classList.add('chat-mode');
      if (dom.chatContext) dom.chatContext.innerHTML=`<div><strong>${esc(v.title)}</strong><br><span>Lote ${esc(v.lot)} · VIN ${esc(v.vin||'N/D')}</span></div><div><span>Conversación</span><br><strong>Guardada en Kommo</strong></div>`;
      const message=(window.apvKommo&&typeof window.apvKommo.buildVehicleMessage==='function')?window.apvKommo.buildVehicleMessage(v):`Vehículo: ${v.title}\nVIN: ${v.vin||'N/D'}`;
      dom.autoMessagePreview.textContent=message;
      dom.fallbackPayload.textContent='Recuperando la conversación del vehículo\n\n'+message;
      $('#fallback-copy').textContent='Recuperando tu conversación de Kommo…';
      dom.kommoFallback.classList.remove('hidden');
      dom.bidOverlay.classList.remove('hidden'); document.body.style.overflow='hidden'; syncChatReopenButton();

      const api=window.apvKommo;
      if(api&&!api.__bootstrapOnly&&typeof api.reopenConversation==='function'){
        const result=api.reopenConversation(v,state.user);
        if(result.ok&&result.ready) dom.kommoFallback.classList.add('hidden');
      }else{
        $('#fallback-copy').textContent='El módulo Kommo no cargó. Usa “Copiar diagnóstico” para ver la causa.';
      }
    }catch(err){ showToast('No se pudo recuperar el chat: '+err.message); }
  }

  function clearFilters(){
    dom.search.value=''; dom.make.value=''; dom.damage.value=''; dom.run.value=''; dom.state.value=''; dom.keys.checked=false; dom.buyNow.checked=false; dom.sort.value='saleSoon';
    if(state.filters){ dom.yearMin.value=state.filters.minYear; dom.yearMax.value=state.filters.maxYear; dom.odometer.value=dom.odometer.max; updateOdometerLabel(); }
    state.page=1; loadVehicles();
  }

  dom.list.addEventListener('click',async e=>{
    const card=e.target.closest('.vehicle-card'); if(!card)return; const action=e.target.closest('[data-action]')?.dataset.action; if(!action)return; const lot=card.dataset.lot;
    if(action==='detail') openDetail(lot);
    if(action==='bid'){ try{ await openBid(await getVehicle(lot)); }catch(err){showToast(err.message);} }
  });
  dom.pagination.addEventListener('click',e=>{ const b=e.target.closest('[data-page]'); if(!b||b.disabled)return; state.page=Number(b.dataset.page); loadVehicles(); document.querySelector('#catalogo').scrollIntoView({behavior:'smooth'}); });
  dom.vehicleDetail.addEventListener('click',async e=>{
    const thumb=e.target.closest('[data-gallery-src]');
    if(thumb){ const img=$('#detail-main-image'); if(img) img.src=thumb.dataset.gallerySrc; $$('.gallery-thumb',dom.vehicleDetail).forEach(b=>b.classList.toggle('active',b===thumb)); return; }
    if(e.target.closest('[data-detail-bid]')&&state.currentVehicle){ await openBid(state.currentVehicle); return; }
    if(e.target.closest('[data-auth-vin]')&&state.currentVehicle){ openAuth('Regístrate o inicia sesión para revelar el VIN completo.',{type:'vin',lot:state.currentVehicle.lot}); return; }
    const toggle=e.target.closest('#toggle-full-tech');
    if(toggle){ const full=$('#full-tech'); const expanded=toggle.getAttribute('aria-expanded')==='true'; toggle.setAttribute('aria-expanded',String(!expanded)); full.classList.toggle('hidden',expanded); toggle.innerHTML=expanded?'Ver toda la información <span>⌄</span>':'Ocultar información <span>⌃</span>'; }
  });

  $$('[data-close="vehicle"]').forEach(b=>b.addEventListener('click',()=>closeDetail()));
  $$('[data-close="bid"]').forEach(b=>b.addEventListener('click',closeBid));
  $$('[data-close="auth"]').forEach(b=>b.addEventListener('click',()=>closeAuth()));
  dom.vehicleOverlay.addEventListener('click',e=>{ if(e.target===dom.vehicleOverlay) closeDetail(); });
  dom.bidOverlay.addEventListener('click',e=>{ if(e.target===dom.bidOverlay) closeBid(); });
  dom.authOverlay.addEventListener('click',e=>{ if(e.target===dom.authOverlay) closeAuth(); });

  if(window.apvKommo && typeof window.apvKommo.onReady==='function'){
    window.apvKommo.onReady(()=>{
      dom.kommoFallback.classList.add('hidden');
      try{ window.crmPlugin('runChatShow'); }catch(_){}
    });
  }
  if(window.apvKommo && typeof window.apvKommo.onStatus==='function'){
    window.apvKommo.onStatus(info=>{
      const copy=$('#fallback-copy');
      if(!copy) return;
      const statusText=$('#kommo-status-text'); const statusChip=$('#kommo-status-chip');
      if(statusChip){ statusChip.className='kommo-status-chip '+(info.status==='ready'?'ready':info.status==='error'?'error':info.status==='loading'||info.status==='loaded'?'loading':''); statusChip.textContent=String(info.status||'sin estado').toUpperCase(); }
      if(info.status==='loading'){ copy.textContent='Conectando con Kommo…'; if(statusText) statusText.textContent='Conectando con Website Chat Button…'; }
      else if(info.status==='loaded'){ copy.textContent='Kommo cargó. Inicializando el chat…'; if(statusText) statusText.textContent='button.js cargó; esperando onChatReady…'; }
      else if(info.status==='ready'){ if(statusText) statusText.textContent='Chat de Kommo listo'; }
      else if(info.status==='error'){ copy.textContent='No se pudo conectar con Kommo. Revisa que este dominio esté autorizado en Website Chat Button y pulsa Reintentar conexión.'; if(statusText) statusText.textContent='Kommo reportó un error de conexión'; }
    });
  }
  $('#kommo-retry')?.addEventListener('click',()=>{
    if(window.apvKommo?.retry && !window.apvKommo.__bootstrapOnly){
      $('#fallback-copy').textContent='Reintentando conexión con Kommo…';
      window.apvKommo.retry();
    }else{
      $('#fallback-copy').textContent='El archivo /kommo.js no cargó. Recarga la v8 y comprueba el diagnóstico.';
    }
  });
  $('#kommo-sync-crm')?.addEventListener('click',()=>{
    const api=window.apvKommo;
    if(!api||api.__bootstrapOnly||typeof api.syncCrmNow!=='function'){
      const statusText=$('#kommo-status-text'); if(statusText) statusText.textContent='No se puede sincronizar: módulo Kommo no disponible.';
      showToast('Módulo Kommo no disponible.');
      return;
    }
    const result=api.syncCrmNow();
    const msg=result&&result.ok
      ? 'Datos de contacto y vehículo reenviados a Kommo. Actualiza la tarjeta del lead en unos segundos.'
      : `No se pudieron reenviar los datos: ${(result&&result.reason)||(result&&result.error)||'sin detalle'}`;
    const statusText=$('#kommo-status-text'); if(statusText) statusText.textContent=msg;
    showToast(result&&result.ok?'Datos CRM reenviados.':'No se pudo sincronizar CRM.');
  });
  $('#kommo-test-hook')?.addEventListener('click',()=>{
    const api=window.apvKommo;
    if(!api||api.__bootstrapOnly||typeof api.testHook!=='function'){
      $('#fallback-copy').textContent='No puedo probar el hook porque /kommo.js no está activo. Copia el diagnóstico.';
      return;
    }
    const result=api.testHook();
    const msg=result&&result.ok
      ? `Hook apv_bid_request despachado por ${result.api}. La API de Kommo no devuelve confirmación; revisa si apareció la etiqueta APV_BID_REQUEST.`
      : `El hook no salió: ${(result&&result.reason)||'sin detalle'}`;
    $('#fallback-copy').textContent=msg;
    const statusText=$('#kommo-status-text'); if(statusText) statusText.textContent=msg;
    showToast(result&&result.ok?'Hook despachado desde la página.':'No se pudo despachar el hook.');
  });
  $('#kommo-diagnostics')?.addEventListener('click',async()=>{
    const diag=window.apvKommo&&typeof window.apvKommo.debug==='function'?window.apvKommo.debug():{version:'15.0.0',status:'apvKommo ausente',pageUrl:location.href};
    const payload=JSON.stringify(diag,null,2);
    const out=$('#kommo-diagnostic-output'); if(out){ out.textContent=payload; out.classList.remove('hidden'); }
    try{ await navigator.clipboard.writeText(payload); showToast('Diagnóstico visible y copiado.'); }
    catch(_){ console.info('[APV Kommo diagnóstico]',diag); showToast('Diagnóstico visible debajo del chat.'); }
  });
  dom.chatReopenButton?.addEventListener('click',reopenLastChat);

  document.addEventListener('click',e=>{
    const opener=e.target.closest('[data-open-auth]');
    if(opener){ e.preventDefault(); openAuth('Inicia sesión para recuperar tus conversaciones y acceder al VIN completo.'); return; }
  },true);
  $('#logout-button').addEventListener('click',logout);
  $$('[data-auth-tab]').forEach(b=>b.addEventListener('click',()=>switchAuthTab(b.dataset.authTab)));
  $('#login-form').addEventListener('submit',submitLogin);
  $('#register-form').addEventListener('submit',submitRegister);
  $('#verify-form')?.addEventListener('submit',submitVerify);
  $('#verify-back')?.addEventListener('click',()=>{
    $('#verify-form').classList.add('hidden');
    $('#register-form').classList.remove('hidden');
    setAuthStatus('');
  });

  if(dom.heroSearchForm){
    dom.heroSearchForm.addEventListener('submit',e=>{ e.preventDefault(); heroSearchToCatalog(dom.heroSearchInput.value); });
    dom.heroSearchInput.addEventListener('input',()=>{ clearTimeout(state.heroSearchTimer); state.heroSearchTimer=setTimeout(quickHeroSearch,180); });
    dom.heroSearchInput.addEventListener('keydown',e=>{ if(e.key==='Escape'){ dom.heroQuickResults.classList.add('hidden'); dom.heroSearchInput.blur(); } });
    dom.heroQuickResults.addEventListener('click',e=>{
      const item=e.target.closest('[data-hero-lot]');
      if(item){ dom.heroQuickResults.classList.add('hidden'); openDetail(item.dataset.heroLot); return; }
      if(e.target.closest('[data-hero-search-all]')) heroSearchToCatalog(dom.heroSearchInput.value);
    });
    dom.heroVehicleCard.addEventListener('click',()=>{ const lot=dom.heroVehicleCard.dataset.lot; if(lot) openDetail(lot); });
    document.addEventListener('click',e=>{ if(!e.target.closest('.hero-search-card')) dom.heroQuickResults.classList.add('hidden'); });
  }

  $('#my-bids-button')?.addEventListener('click', async () => {
    if (!state.user) {
      openAuth('Inicia sesión para ver tus pujas y conversaciones.');
      return;
    }
    const bids = getUserBidsHistory();
    if (!bids.length) {
      try {
        const res = await api('/api/user/bids');
        if (res.ok && res.bids && res.bids.length > 0) {
          const firstLot = res.bids[0].lot;
          const v = await getVehicle(firstLot);
          state.currentVehicle = v;
          reopenLastChat();
          return;
        }
      } catch (_) {}
      showToast('Aún no has enviado solicitudes de puja.');
      return;
    }
    const targetLot = bids[0].lot;
    try {
      const v = await getVehicle(targetLot);
      state.currentVehicle = v;
      reopenLastChat();
    } catch (_) {
      reopenLastChat();
    }
  });

  dom.bidChatStep.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-switch-lot]');
    if (!tab) return;
    const lot = tab.dataset.switchLot;
    if (!lot || (state.currentVehicle && String(state.currentVehicle.lot) === String(lot))) return;
    try {
      const v = await getVehicle(lot);
      state.currentVehicle = v;
      renderConversationSelector();
      if (dom.chatContext) dom.chatContext.innerHTML = `<div><strong>${esc(v.title)}</strong><br><span>Lote ${esc(v.lot)} · VIN ${esc(v.vin || 'N/D')}</span></div><div><span>Conversación</span><br><strong>Guardada en Kommo</strong></div>`;
      rememberChat(v);
      if (window.apvKommo && typeof window.apvKommo.reopenConversation === 'function') {
        window.apvKommo.reopenConversation(v, state.user);
      }
    } catch (err) {
      showToast('No se pudo cargar el chat de este vehículo: ' + err.message);
    }
  });

  $('#bid-continue').addEventListener('click',continueBid); dom.bidAmount.addEventListener('keydown',e=>{if(e.key==='Enter') continueBid();});
  dom.searchButton.addEventListener('click',()=>{state.page=1;loadVehicles();}); dom.search.addEventListener('keydown',e=>{if(e.key==='Enter'){state.page=1;loadVehicles();}}); dom.sort.addEventListener('change',()=>{state.page=1;loadVehicles();});
  $('#apply-filters').addEventListener('click',()=>{state.page=1;dom.filtersPanel.classList.remove('mobile-open');loadVehicles();}); $('#clear-filters').addEventListener('click',clearFilters); $('#empty-clear').addEventListener('click',clearFilters); dom.odometer.addEventListener('input',updateOdometerLabel);
  $('#mobile-filter-button').addEventListener('click',()=>dom.filtersPanel.classList.toggle('mobile-open'));
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ if(!dom.authOverlay.classList.contains('hidden')) closeAuth(); else if(!dom.bidOverlay.classList.contains('hidden')) closeBid(); else if(!dom.vehicleOverlay.classList.contains('hidden')) closeDetail(); } });
  window.addEventListener('popstate',()=>{ const m=location.pathname.match(/^\/vehiculo\/([^/]+)/); if(m) openDetail(decodeURIComponent(m[1]),false); else {dom.vehicleOverlay.classList.add('hidden'); if(dom.bidOverlay.classList.contains('hidden')&&dom.authOverlay.classList.contains('hidden')) document.body.style.overflow='';} });

  function initMotionEffects() {
    const progressBar = $('#scroll-progress-bar');
    const topbar = $('.topbar');
    window.addEventListener('scroll', () => {
      const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
      if (progressBar) progressBar.style.width = `${scrolled}%`;
      if (topbar) {
        if (winScroll > 30) topbar.classList.add('scrolled');
        else topbar.classList.remove('scrolled');
      }
    }, { passive: true });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

      $$('.reveal-on-scroll').forEach((el) => observer.observe(el));
    } else {
      $$('.reveal-on-scroll').forEach((el) => el.classList.add('is-visible'));
    }
  }

  window.apvPageDebug=function(){
    return {
      version:'15.0.0',
      url:location.href,
      user:state.user?{email:state.user.email,kommoUserId:state.user.kommoUserId}:null,
      savedChat:readChatMemory(),
      kommo:window.apvKommo&&typeof window.apvKommo.debug==='function'?window.apvKommo.debug():null
    };
  };

  async function boot(){
    initMotionEffects();
    try { await initAuth(); } catch(e) { console.warn('[APV] Auth init note:', e); }
    try { await initFilters(); } catch(e) { console.warn('[APV] Filters init note:', e); }
    try { await loadVehicles(); } catch(e) { showToast('Error al cargar el catálogo: ' + e.message); }
    try {
      const m=location.pathname.match(/^\/vehiculo\/([^/]+)/);
      if(m) await openDetail(decodeURIComponent(m[1]),false);
    } catch(_){}
  }
  boot();
})();
