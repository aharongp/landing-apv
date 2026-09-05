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
    heroSearchTimer: null,
    featuredVehicles: [],
    featuredPage: 1
  };

  const dom = {
    list: $('#catalog-list'), count: $('#catalog-count'), pagination: $('#pagination'), empty: $('#catalog-empty'),
    search: $('#search-input'), searchButton: $('#search-button'), make: $('#filter-make'), yearMin: $('#filter-year-min'),
    yearMax: $('#filter-year-max'), damage: $('#filter-damage'), run: $('#filter-run'), state: $('#filter-state'), keys: $('#filter-keys'),
    buyNow: $('#filter-buy-now'), odometer: $('#filter-odometer'), odometerLabel: $('#odometer-label'), sort: $('#sort-select'), filtersPanel: $('#filters-panel'),
    vehicleOverlay: $('#vehicle-overlay'), vehicleDetail: $('#vehicle-detail-content'), bidOverlay: $('#bid-overlay'), bidModal: $('.bid-modal'), bidAmount: $('#bid-amount'),
    bidVehicleMini: $('#bid-vehicle-mini'), bidAmountStep: $('#bid-step-amount'), bidChatStep: $('#bid-step-chat'), chatContext: $('#chat-context'),
    kommoFallback: $('#kommo-fallback'), fallbackPayload: $('#fallback-payload'), autoMessagePreview: $('#auto-message-preview'), toast: $('#toast'), chatTabsContainer: $('#chat-history-selector'),
    authOverlay: $('#auth-overlay'), authButton: $('#auth-button'), accountChip: $('#account-chip'), accountAvatar: $('#account-avatar'),
    accountName: $('#account-name'), accountEmail: $('#account-email'), authReason: $('#auth-reason'), authStatus: $('#auth-status'),
    heroSearchForm: $('#hero-search-form'), heroSearchInput: $('#hero-search-input'), heroQuickResults: $('#hero-quick-results'), heroVehicleCard: $('#hero-vehicle-card'),
    heroFilterForm: $('#hero-filter-form'), heroFilterMake: $('#hero-filter-make'), heroFilterModel: $('#hero-filter-model'),
    heroFilterYearMin: $('#hero-filter-year-min'), heroFilterYearMax: $('#hero-filter-year-max'), heroFilterBuyNow: $('#hero-filter-buy-now'), heroFilterState: $('#hero-filter-state'),
    heroFeaturedGrid: $('#hero-featured-grid'), featuredPrevBtn: $('#featured-prev-btn'), featuredNextBtn: $('#featured-next-btn'), featuredDots: $('#featured-dots'),
    chatReopenButton: $('#chat-reopen-button')
  };

  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function money(v){ const n=Number(v||0); return n>0 ? '$'+n.toLocaleString('en-US',{maximumFractionDigits:0}) : t('notAvailable','N/A'); }
  function miles(v){ const n=Number(v||0); return n>0 ? n.toLocaleString('en-US')+' mi' : t('noData','N/D'); }
  function km(v){ const n=Number(v||0); return n>0 ? Math.round(n*1.60934).toLocaleString('en-US')+' km' : ''; }
  function dateLabel(value, zone){
    if(!value) return 'TBA';
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return 'TBA';
    return new Intl.DateTimeFormat(currentLang==='en'?'en-US':'es-US',{month:'short',day:'numeric',year:'numeric'}).format(d)+(zone?' · '+zone:'');
  }
  function conditionLabel(v){
    const x=(v||'').toLowerCase();
    if(x.includes('run') && x.includes('drive')) return 'Runs & Drives';
    if(x.includes('start')) return t('starts','Arranca');
    return v || t('unverified','Sin verificar');
  }
  function icon(text){ return `<span aria-hidden="true">${text}</span>`; }
  function imageStyle(url){ return url ? `style="background-image:url('${esc(url)}')"` : ''; }
  function titleDoc(v){ return [v.titleState,v.titleType].filter(Boolean).join(' · ') || t('noData','N/D'); }
  function locationLabel(v){ return [v.locationCity,v.locationState].filter(Boolean).join(', ') || t('noData','N/D'); }
  function vinText(v){ return v.vin || t('protectedVin','VIN protegido · inicia sesión para verlo'); }
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
    if(canOpen) dom.chatReopenButton.title=saved.title?`${t('returnChat')} · ${saved.title}`:t('returnChat');
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
    showToast(currentLang==='en'?'Bid history cleared.':'Historial de pujas limpiado correctamente.');
    renderConversationSelector();
  }

  async function deleteSingleBid(lot){
    if(!lot) return;
    try {
      await api('/api/user/bids/' + encodeURIComponent(lot), { method: 'DELETE' });
    } catch(_) {}
    if(state.user && state.user.id){
      try{
        const store=JSON.parse(localStorage.getItem(BIDS_HISTORY_KEY)||'{}');
        const list=Array.isArray(store[state.user.id])?store[state.user.id]:[];
        store[state.user.id]=list.filter(b=>String(b.lot)!==String(lot));
        localStorage.setItem(BIDS_HISTORY_KEY, JSON.stringify(store));
      }catch(_){}
    }
    showToast(currentLang==='en'?`Bid for lot ${lot} deleted.`:`Puja para lote ${lot} eliminada.`);
    renderConversationSelector();
  }

  const TRANSLATIONS = {
    es: {
      pageTitle: 'APV Motors | Subastas de vehículos en EE. UU.',
      pageDescription: 'Compra vehículos de subastas en Estados Unidos 100% online con APV Motors.',
      navCatalog: 'Catálogo',
      navHow: 'Cómo funciona',
      navHelp: 'Ayuda',
      login: 'Iniciar sesión',
      createAccount: 'Crear cuenta',
      myBids: '💬 Mis Pujas',
      logout: 'Salir',
      viewVehicles: 'Ver vehículos',
      exploreCatalog: 'Explorar catálogo',
      seeHow: 'Ver cómo funciona',
      heroEyebrow: 'SUBASTAS EN ESTADOS UNIDOS · 100% ONLINE',
      heroMainTitle: 'Compra tu carro en subastas de EE. UU. sin complicarte.',
      heroMainSub: 'Encuentra vehículos de Copart, define cuánto quieres ofertar y APV Motors te acompaña desde la puja hasta la documentación y el traslado.',
      heroSearchPlaceholder: 'Ej. Toyota Camry, 41633106 o VIN',
      heroSearchButton: 'Buscar',
      statVehicles: 'vehículos cargados',
      statSteps: 'pasos claros',
      statSupport: 'atención personalizada',
      heroSearchEyebrow: 'BUSCA EN SEGUNDOS',
      heroSearchTitle: 'Encuentra tu próximo carro',
      heroSearchSub: 'Busca por marca, modelo, lote o VIN.',
      featuredVehicle: 'VEHÍCULO DESTACADO',
      openFeaturedVehicle: 'Abrir vehículo destacado',
      auctionLive: '● SUBASTA',
      copartVehicles: 'Vehículos de Copart',
      csvUpdated: 'Datos actualizados desde tu CSV.',
      vinLoginHint: 'El VIN completo se revela después de iniciar sesión.',
      startSearch: 'BUSCAR',
      allModels: 'Todos los modelos',
      allMakes: 'Todas las marcas',
      buyItNow: 'Buy it now',
      heroAuctionNotice: 'Acceso a lotes en venta en subastas de Copart e IAA',
      featuredVehiclesTitle: 'Vehículos más destacados',
      howTitle: '¿Cómo comprar un vehículo de subasta?',
      step1Title: 'Seleccionar el vehículo', step1Text: 'en las subastas de Copart o IAA.',
      step2Title: 'Identificar el monto', step2Text: 'que deseas ofertar por el vehículo.',
      step3Title: 'Depósito de seguridad', step3Text: 'para poder realizar la subasta.',
      step4Title: 'Realizar el pago del vehículo', step4Text: 'en caso de haber ganado la subasta.',
      step5Title: 'Traslado en grúa', step5Text: 'Contrata el servicio', step5Link: 'haciendo clic aquí.',
      step6Title: 'Traspaso, impuestos y placas', step6Text: 'Gestión de documentos.',
      catalogEyebrow: 'CATÁLOGO DE SUBASTA',
      catalogTitle: 'Encuentra el vehículo correcto.',
      resultsAvailable: 'resultados disponibles.',
      catalogSearchPlaceholder: 'Buscar VIN, lote, marca o modelo',
      search: 'Buscar',
      filtersTitle: 'Filtros',
      clearFilters: 'Limpiar',
      applyFilters: 'Aplicar filtros',
      brand: 'Marca', allFeminine: 'Todas', allMasculine: 'Todos', yearFrom: 'Año desde', yearTo: 'Año hasta',
      primaryDamage: 'Daño principal', condition: 'Condición', state: 'Estado', keysOnly: 'Solo con llaves', buyNowOnly: 'Solo Buy It Now', maxOdometer: 'Odómetro máximo',
      mobileFilters: '☰ Filtros', viewNote: 'Precios en USD · el VIN completo se muestra a usuarios registrados', sortBy: 'Ordenar por',
      sortSaleSoon: 'Subasta más próxima', sortNewest: 'Año: más nuevo', sortPriceAsc: 'Precio: menor', sortPriceDesc: 'Precio: mayor', sortMileage: 'Menor millaje',
      emptyTitle: 'No encontramos vehículos', emptyText: 'Prueba otra búsqueda o limpia los filtros.',
      helpEyebrow: '¿NO SABES CUÁNTO PUJAR?', helpTitle: 'Encuentra el carro primero. Nosotros te ayudamos con lo demás.', findVehicle: 'Buscar un vehículo',
      footerCatalog: 'Catálogo de vehículos de subasta · EE. UU.', footerDisclaimer: 'La disponibilidad, pujas y condiciones finales dependen de la subasta y pueden cambiar.',
      close: 'Cerrar', accountEyebrow: 'CUENTA APV MOTORS', authTitle: 'Guarda tu conversación y continúa desde cualquier dispositivo.', authReason: 'Regístrate para ver el VIN completo y hablar con un asesor.',
      fullName: 'Nombre completo',
      email: 'Correo electrónico',
      phoneLabel: 'Teléfono / WhatsApp',
      countryCode: 'Código de país',
      password: 'Contraseña',
      loginContinue: 'Entrar y continuar',
      sendVerificationCode: 'Enviar código de verificación',
      sendCodeNote: 'Enviaremos un código de 6 dígitos a tu correo para activar tu cuenta de forma segura.',
      confirmEmail: 'Confirma tu correo electrónico', verifyInstructions: 'Ingresa el código de 6 dígitos que enviamos a', sixDigitCode: 'Código de 6 dígitos', verifyCodePlaceholder: 'Ej. 482910', verifyActivate: 'Verificar y activar cuenta', modifyRegistration: '← Modificar datos de registro',
      bidStep: 'PASO 2 DE TU COMPRA', bidTitle: 'Establece tu tope de oferta', bidExplain: 'Indica el máximo que deseas ofertar por este vehículo. Esto no realiza ningún cargo automático.', myMaxBid: 'Mi tope de oferta', writeMaxBid: 'Escribe tu tope', cancel: 'Cancelar',
      bidAssistance: 'ASISTENCIA DE PUJA', continueAdvisor: 'Continúa con un asesor', protectedSession: '● Sesión protegida', requestReady: 'Tu solicitud está lista.', connectingChat: 'Conectando con el chat de APV Motors…', stableConversation: 'Tu cuenta mantiene un identificador estable para conservar la conversación.', returnChat: 'Volver al chat', reopenConversation: 'Volver a abrir tu conversación con APV Motors',
      yourActiveBids: 'Tus Pujas Activas',
      clearAllBids: '🗑 Borrar todas',
      wantToBid: 'Quiero ofertar',
      viewVehicle: 'Ver ficha',
      resetAllBids: 'Reiniciar todas las pujas', deleteBid: 'Eliminar esta puja', vehicle: 'Vehículo', lot: 'Lote', vin: 'VIN',
      noMatches: 'No encontramos coincidencias para', fullCatalog: 'Ver el catálogo completo', allResultsFor: 'Ver todos los resultados para',
      noPhoto: 'SIN FOTO', keyAvailable: 'Llave disponible', keyUnknown: 'Llave N/D', odometer: 'Odómetro', location: 'Ubicación', damage: 'Daño', document: 'Documento', body: 'Carrocería', color: 'Color',
      registerForVin: 'Regístrate para ver el VIN', previousPhoto: 'Foto anterior', nextPhoto: 'Siguiente foto', photo: 'foto', photos: 'fotos', keys: 'Llaves', unconfirmed: 'Sin confirmar', directPrice: 'PRECIO COMPRA DIRECTA (BUY IT NOW)', auctionCurrentBid: 'Puja actual subasta', estimatedRetail: 'Valor retail estimado', auctionDate: 'Fecha de subasta', signInVinChat: '🔒 Debes registrarte para ver el VIN completo y abrir el chat.', lotGallery: 'GALERÍA DEL LOTE', allPhotos: 'Todas las fotos', loading: 'Cargando…', technicalPrices: 'FICHA TÉCNICA Y PRECIOS', completeVehicleInfo: 'Información completa del vehículo', officialCopartData: 'Datos oficiales Copart', directPurchase: 'Buy It Now (Compra directa)', estimatedRepair: 'Costo estim. reparación', transmission: 'Transmisión', engine: 'Motor', cylinders: 'Cilindros', traction: 'Tracción', fuel: 'Combustible', secondaryDamage: 'Daño secundario', lossType: 'Tipo de pérdida', availableKeys: 'Llaves disponibles', titleDocument: 'Título / Documento', yardLocation: 'Ubicación / Patio', showAllTechnical: 'Ver toda la información técnica', hideInformation: 'Ocultar información', item: 'Item', vehicleType: 'Tipo de vehículo', year: 'Año', model: 'Modelo', modelGroup: 'Grupo de modelo', trim: 'Trim', conditionCode: 'Código condición', odometerBrand: 'Odómetro brand', saleStatus: 'Estado de venta', repairCost: 'Costo reparación', yard: 'Patio', country: 'País', seller: 'Seller', updated: 'Actualizado', specialNote: 'NOTA ESPECIAL', announcements: 'ANUNCIOS', readyToBid: '¿Listo para ofertar?', afterSignIn: 'Después de iniciar sesión defines tu tope. APV envía a Kommo la ficha, el VIN, el lote, el monto y tus datos de cuenta.', informationSource: 'Fuente de la información', sourceDescription: 'La ficha se construye con el CSV y las fotos se consultan bajo demanda usando el enlace Image URL de Copart.', openCopart: 'Abrir lote en Copart →',
      pricingAuction: 'Precios y Subasta', mechanicalSpecs: 'Especificaciones Mecánicas', vehicleIdentity: 'Datos del Vehículo', conditionDamage: 'Estado y Condición', locationSeller: 'Ubicación y Subasta',
      calculatorTitle: 'Calculadora de Costos y Total a Pagar',
      costCalculator: 'HERRAMIENTA DE CÁLCULO DE FEES',
      calculatorSub: 'Ingresa tu tope de puja para calcular el desglose exacto de tarifas de subasta y honorarios.',
      calculatorLockedTitle: 'Calculadora Exclusiva',
      calculatorLockedSub: 'Inicia sesión o regístrate para usar la Calculadora de Costos y ver el desglose exacto de fees para este vehículo.',
      calculatorInputLabel: 'Ingresa tu tope de puja ($ USD)',
      unlockedFor: 'Sesión activa',
      loginToUseCalc: 'Iniciar sesión para usar la calculadora',
      yourBid: 'Tope de puja (Oferta)',
      copartFeeLabel: 'Tarifa comprador Copart',
      copartVirtualFeeLabel: 'Tarifa puja en vivo / Internet',
      apvFeeLabel: 'Honorarios APV Motors',
      gateFeeLabel: 'Gastos de portón (Gate fee)',
      bankFeeLabel: 'Comisión bancaria (Bank fee)',
      titlePickupFeeLabel: 'Retiro de título (Title pickup)',
      totalToPay: 'TOTAL ESTIMADO A PAGAR',
      bidWithThisAmount: 'Ofertar con este tope',
      totalDisclaimer: '* No incluye costo de flete/transporte ni impuestos locales.',
      noData: 'N/D', notAvailable: 'N/A', starts: 'Arranca', unverified: 'Sin verificar', protectedVin: 'VIN protegido · inicia sesión para verlo',
      maxRequested: 'Tope solicitado', conversation: 'Conversación', savedInKommo: 'Guardada en Kommo',
      welcome: 'Bienvenido', codeSent: 'Código de 6 dígitos enviado.', validBid: 'Indica un tope de puja válido.', preparingRequest: 'Preparando tu solicitud...', processing: 'PROCESANDO', waitingChatInstruction: 'Abre o continúa la conversación para asociar la solicitud.', waitingChat: 'ESPERANDO CHAT', associatedConversation: 'Solicitud asociada a esta conversación', completed: 'COMPLETED', waitingKommo: 'Esperando que la conversación aparezca en Kommo…'
    },
    en: {
      pageTitle: 'APV Motors | Vehicle auctions in the USA',
      pageDescription: 'Buy auction vehicles in the United States 100% online with APV Motors.',
      navCatalog: 'Catalog',
      navHow: 'How it works',
      navHelp: 'Help',
      login: 'Log in',
      createAccount: 'Create account',
      myBids: '💬 My Bids',
      logout: 'Log out',
      viewVehicles: 'View vehicles',
      exploreCatalog: 'Explore catalog',
      seeHow: 'See how it works',
      heroEyebrow: 'UNITED STATES AUCTIONS · 100% ONLINE',
      heroMainTitle: 'Buy your car at U.S. auctions without the hassle.',
      heroMainSub: 'Find Copart vehicles, set your maximum bid, and let APV Motors guide you from bidding through documents and transportation.',
      heroSearchPlaceholder: 'E.g. Toyota Camry, 41633106 or VIN',
      heroSearchButton: 'Search',
      statVehicles: 'vehicles loaded',
      statSteps: 'clear steps',
      statSupport: 'personal assistance',
      heroSearchEyebrow: 'SEARCH IN SECONDS',
      heroSearchTitle: 'Find your next car',
      heroSearchSub: 'Search by make, model, lot, or VIN.',
      featuredVehicle: 'FEATURED VEHICLE', openFeaturedVehicle: 'Open featured vehicle', auctionLive: '● AUCTION', copartVehicles: 'Copart vehicles', csvUpdated: 'Data updated from your CSV.', vinLoginHint: 'The full VIN is revealed after you log in.',
      startSearch: 'START SEARCH',
      allModels: 'All models',
      allMakes: 'All makes',
      buyItNow: 'Buy it now',
      heroAuctionNotice: 'Access to lots for sale at Copart and IAA auctions',
      featuredVehiclesTitle: 'Featured vehicles',
      howTitle: 'How do I buy an auction vehicle?',
      step1Title: 'Select the vehicle', step1Text: 'at a Copart or IAA auction.',
      step2Title: 'Choose the amount', step2Text: 'you want to bid on the vehicle.',
      step3Title: 'Security deposit', step3Text: 'required to participate in the auction.',
      step4Title: 'Pay for the vehicle', step4Text: 'if you win the auction.',
      step5Title: 'Tow transportation', step5Text: 'Hire the service', step5Link: 'by clicking here.',
      step6Title: 'Transfer, taxes, and plates', step6Text: 'Document management.',
      catalogEyebrow: 'AUCTION CATALOG', catalogTitle: 'Find the right vehicle.', resultsAvailable: 'results available.', catalogSearchPlaceholder: 'Search VIN, lot, make, or model', search: 'Search',
      filtersTitle: 'Filters',
      clearFilters: 'Clear',
      applyFilters: 'Apply filters',
      brand: 'Make', allFeminine: 'All', allMasculine: 'All', yearFrom: 'Year from', yearTo: 'Year to', primaryDamage: 'Primary damage', condition: 'Condition', state: 'State', keysOnly: 'Keys only', buyNowOnly: 'Buy It Now only', maxOdometer: 'Maximum odometer',
      mobileFilters: '☰ Filters', viewNote: 'Prices in USD · the full VIN is shown to registered users', sortBy: 'Sort by', sortSaleSoon: 'Soonest auction', sortNewest: 'Year: newest', sortPriceAsc: 'Price: lowest', sortPriceDesc: 'Price: highest', sortMileage: 'Lowest mileage',
      emptyTitle: 'No vehicles found', emptyText: 'Try another search or clear the filters.', helpEyebrow: 'NOT SURE HOW MUCH TO BID?', helpTitle: 'Find the car first. We will help you with the rest.', findVehicle: 'Find a vehicle',
      footerCatalog: 'Auction vehicle catalog · USA', footerDisclaimer: 'Availability, bids, and final conditions depend on the auction and may change.',
      close: 'Close', accountEyebrow: 'APV MOTORS ACCOUNT', authTitle: 'Save your conversation and continue from any device.', authReason: 'Sign up to view the full VIN and chat with an advisor.',
      fullName: 'Full name',
      email: 'Email address',
      phoneLabel: 'Phone / WhatsApp',
      countryCode: 'Country code',
      password: 'Password',
      loginContinue: 'Log in and continue',
      sendVerificationCode: 'Send verification code',
      sendCodeNote: 'We will send a 6-digit verification code to your email to safely activate your account.',
      confirmEmail: 'Confirm your email address', verifyInstructions: 'Enter the 6-digit code we sent to', sixDigitCode: '6-digit code', verifyCodePlaceholder: 'E.g. 482910', verifyActivate: 'Verify and activate account', modifyRegistration: '← Edit registration details',
      bidStep: 'STEP 2 OF YOUR PURCHASE', bidTitle: 'Set your maximum bid', bidExplain: 'Enter the most you want to bid on this vehicle. This will not make an automatic charge.', myMaxBid: 'My maximum bid', writeMaxBid: 'Enter your maximum', cancel: 'Cancel',
      bidAssistance: 'BID ASSISTANCE', continueAdvisor: 'Continue with an advisor', protectedSession: '● Protected session', requestReady: 'Your request is ready.', connectingChat: 'Connecting to APV Motors chat…', stableConversation: 'Your account uses a stable identifier to preserve the conversation.', returnChat: 'Return to chat', reopenConversation: 'Reopen your conversation with APV Motors',
      yourActiveBids: 'Your Active Bids',
      clearAllBids: '🗑 Clear all',
      wantToBid: 'I want to bid',
      viewVehicle: 'View details',
      resetAllBids: 'Reset all bids', deleteBid: 'Delete this bid', vehicle: 'Vehicle', lot: 'Lot', vin: 'VIN',
      noMatches: 'We found no matches for', fullCatalog: 'View the full catalog', allResultsFor: 'View all results for',
      noPhoto: 'NO PHOTO', keyAvailable: 'Key available', keyUnknown: 'Key N/A', odometer: 'Odometer', location: 'Location', damage: 'Damage', document: 'Document', body: 'Body style', color: 'Color', retail: 'Retail', auction: 'Auction', currentBid: 'Current bid', buyNow: 'Buy now', upcoming: 'UPCOMING',
      registerForVin: 'Sign up to view the VIN', previousPhoto: 'Previous photo', nextPhoto: 'Next photo', photo: 'photo', photos: 'photos', keys: 'Keys', unconfirmed: 'Unconfirmed', directPrice: 'DIRECT PURCHASE PRICE (BUY IT NOW)', auctionCurrentBid: 'Current auction bid', estimatedRetail: 'Estimated retail value', auctionDate: 'Auction date', signInVinChat: '🔒 You must sign up to view the full VIN and open the chat.', lotGallery: 'LOT GALLERY', allPhotos: 'All photos', loading: 'Loading…', technicalPrices: 'TECHNICAL DETAILS AND PRICES', completeVehicleInfo: 'Complete vehicle information', officialCopartData: 'Official Copart data', directPurchase: 'Buy It Now (Direct purchase)', estimatedRepair: 'Est. repair cost', transmission: 'Transmission', engine: 'Engine', cylinders: 'Cylinders', traction: 'Drive', fuel: 'Fuel', secondaryDamage: 'Secondary damage', lossType: 'Loss type', availableKeys: 'Keys available', titleDocument: 'Title / Document', yardLocation: 'Location / Yard', showAllTechnical: 'View all technical information', hideInformation: 'Hide information', item: 'Item', vehicleType: 'Vehicle type', year: 'Year', model: 'Model', modelGroup: 'Model group', trim: 'Trim', conditionCode: 'Condition code', odometerBrand: 'Odometer brand', saleStatus: 'Sale status', repairCost: 'Repair cost', yard: 'Yard', country: 'Country', seller: 'Seller', updated: 'Updated', specialNote: 'SPECIAL NOTE', announcements: 'ANNOUNCEMENTS', readyToBid: 'Ready to bid?', afterSignIn: 'After logging in, you set your maximum. APV sends Kommo the vehicle details, VIN, lot, amount, and your account information.', informationSource: 'Information source', sourceDescription: 'Details come from the CSV, and photos are requested on demand through Copart’s Image URL.', openCopart: 'Open lot on Copart →',
      pricingAuction: 'Pricing & Auction', mechanicalSpecs: 'Mechanical Specs', vehicleIdentity: 'Vehicle Specifications', conditionDamage: 'Condition & Damage', locationSeller: 'Location & Yard',
      calculatorTitle: 'Cost & Total Payment Calculator',
      costCalculator: 'FEE CALCULATOR TOOL',
      calculatorSub: 'Enter your maximum bid to calculate the exact breakdown of auction fees and service charges.',
      calculatorLockedTitle: 'Exclusive Calculator',
      calculatorLockedSub: 'Log in or create an account to use the Cost Calculator and view exact fee breakdown for this vehicle.',
      calculatorInputLabel: 'Enter your maximum bid ($ USD)',
      unlockedFor: 'Active session',
      loginToUseCalc: 'Log in to use the calculator',
      yourBid: 'Maximum bid amount',
      copartFeeLabel: 'Copart Buyer Fee',
      copartVirtualFeeLabel: 'Live / Internet Bid Fee',
      apvFeeLabel: 'APV Motors Service Fee',
      gateFeeLabel: 'Gate Fee',
      bankFeeLabel: 'Bank Fee',
      titlePickupFeeLabel: 'Title Pickup Fee',
      totalToPay: 'ESTIMATED TOTAL TO PAY',
      bidWithThisAmount: 'Bid with this amount',
      totalDisclaimer: '* Does not include shipping/towing cost or local taxes.',
      noData: 'N/A', notAvailable: 'N/A', starts: 'Starts', unverified: 'Unverified', protectedVin: 'Protected VIN · log in to view it',
      maxRequested: 'Requested maximum', conversation: 'Conversation', savedInKommo: 'Saved in Kommo',
      welcome: 'Welcome', codeSent: '6-digit code sent.', validBid: 'Enter a valid maximum bid.', preparingRequest: 'Preparing your request...', processing: 'PROCESSING', waitingChatInstruction: 'Open or continue the conversation to associate the request.', waitingChat: 'WAITING FOR CHAT', associatedConversation: 'Request associated with this conversation', completed: 'COMPLETED', waitingKommo: 'Waiting for the conversation to appear in Kommo…'
    }
  };

  let currentLang = localStorage.getItem('APV_LANG') || 'es';

  function t(key, fallback) {
    if (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) {
      return TRANSLATIONS[currentLang][key];
    }
    return fallback || (TRANSLATIONS.es[key] || key);
  }

  function setLanguage(lang) {
    if (!TRANSLATIONS[lang]) return;
    currentLang = lang;
    localStorage.setItem('APV_LANG', lang);
    document.documentElement.lang = lang;
    document.title = t('pageTitle');
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = t('pageDescription');
    if (window.apvKommo && typeof window.apvKommo.setLocale === 'function') window.apvKommo.setLocale(lang);

    $$('#lang-switch .lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    $$('[data-i18n]').forEach(el => {
      const k = el.dataset.i18n;
      if (TRANSLATIONS[lang] && TRANSLATIONS[lang][k]) {
        el.textContent = TRANSLATIONS[lang][k];
      }
    });

    $$('[data-i18n-placeholder]').forEach(el => {
      const value = TRANSLATIONS[lang][el.dataset.i18nPlaceholder];
      if (value) el.placeholder = value;
    });
    $$('[data-i18n-aria-label]').forEach(el => {
      const value = TRANSLATIONS[lang][el.dataset.i18nAriaLabel];
      if (value) el.setAttribute('aria-label', value);
    });
    $$('[data-i18n-title]').forEach(el => {
      const value = TRANSLATIONS[lang][el.dataset.i18nTitle];
      if (value) el.title = value;
    });

    if (state.filters) {
      loadVehicles();
    }
    if (state.currentVehicle && !dom.vehicleOverlay.classList.contains('hidden')) {
      renderDetail(state.currentVehicle);
    }
    if (state.user) {
      renderConversationSelector();
    }
  }

  function renderConversationSelector(){
    const container = dom.chatTabsContainer;
    if(!container) return;

    let bids=[];
    try {
      if(state.user && state.user.kommoUserId){
        bids=getUserBidsHistory();
        if(bids.length===0 && state.currentVehicle){
          const savedBids=catalogMemory.get('apv_bids_v15')||[];
          savedBids.forEach(sb=>{
            if(String(sb.userId)===String(state.user.id) && sb.vehicle){
              bids.push({
                lot: String(sb.vehicle.lot),
                title: sb.vehicle.title||'Vehículo',
                maxBid: 0,
                image: sb.vehicle.image||'',
                date: sb.syncedAt
              });
            }
          });
        }
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
        <span>${t('yourActiveBids', 'Tus Pujas Activas')} (${bids.length})</span>
        <button type="button" class="btn-clear-bids" id="btn-clear-bids" title="${esc(t('resetAllBids'))}">${t('clearAllBids', '🗑 Borrar todas')}</button>
      </div>
      <div class="chat-tabs-scroll">
        ${bids.map(b=>`
          <div class="chat-tab-wrap ${String(b.lot)===currentLot?'active':''}">
            <button type="button" class="chat-tab ${String(b.lot)===currentLot?'active':''}" data-switch-lot="${esc(b.lot)}">
              🚗 ${esc(b.title.slice(0, 22))}${b.maxBid?` <span class="tab-bid-chip">$${Number(b.maxBid).toLocaleString()}</span>`:''}
            </button>
            <button type="button" class="btn-delete-single-bid" data-delete-lot="${esc(b.lot)}" title="${esc(t('deleteBid'))}">×</button>
          </div>
        `).join('')}
      </div>
    `;

    const clearBtn=$('#btn-clear-bids', container);
    if(clearBtn) clearBtn.onclick=clearUserBids;

    $$('[data-delete-lot]', container).forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        deleteSingleBid(btn.dataset.deleteLot);
      };
    });
  }

  function showToast(msg){ dom.toast.textContent=msg; dom.toast.classList.remove('hidden'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>dom.toast.classList.add('hidden'),3200); }

  async function api(path, options){
    const r=await fetch(path, options);
    const data=await r.json().catch(()=>({}));
    if(!r.ok){ const err=new Error(data.error||(currentLang==='en'?'The request could not be completed.':'No se pudo completar la solicitud.')); err.status=r.status; err.data=data; throw err; }
    return data;
  }

  async function initFilters(){
    const f=await api('/api/filters'); state.filters=f;
    const heroTotal = $('#hero-total');
    if(heroTotal) heroTotal.textContent = f.total.toLocaleString('en-US');
    populate(dom.make, f.makes); populate(dom.damage, f.damages); populate(dom.run, f.runStates); populate(dom.state, f.states);
    if(dom.heroFilterMake) populate(dom.heroFilterMake, f.makes);
    if(dom.heroFilterState) populate(dom.heroFilterState, f.states);
    populateYears(dom.heroFilterYearMin, f.minYear, f.maxYear);
    populateYears(dom.heroFilterYearMax, f.minYear, f.maxYear);
    dom.yearMin.value=f.minYear; dom.yearMin.min=f.minYear; dom.yearMin.max=f.maxYear;
    dom.yearMax.value=f.maxYear; dom.yearMax.min=f.minYear; dom.yearMax.max=f.maxYear;
    const maxOdo=Math.max(100000,Math.ceil((f.maxOdometer||250000)/25000)*25000); dom.odometer.max=maxOdo; dom.odometer.value=maxOdo; updateOdometerLabel();
    loadFeaturedVehicles();
  }

  function populateYears(select, minYear, maxYear) {
    if(!select) return;
    const currentVal = select.value;
    select.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = select === dom.heroFilterYearMin ? (currentLang === 'en' ? 'Min year' : 'Año desde') : (currentLang === 'en' ? 'Max year' : 'Año hasta');
    select.appendChild(defaultOpt);
    for(let y = maxYear; y >= minYear; y--) {
      const o = document.createElement('option');
      o.value = y;
      o.textContent = y;
      select.appendChild(o);
    }
    select.value = currentVal;
  }

  async function loadFeaturedVehicles(){
    try {
      const data = await api('/api/vehicles?page=1&pageSize=6&sort=saleSoon');
      state.featuredVehicles = data.items || [];
      renderFeaturedVehicles();
    } catch(err) {
      console.warn('[APV] Error loading featured vehicles:', err);
    }
  }

  function renderFeaturedVehicles(){
    if(!dom.heroFeaturedGrid) return;
    const startIndex = (state.featuredPage - 1) * 3;
    const items = state.featuredVehicles.slice(startIndex, startIndex + 3);
    if(!items.length){
      dom.heroFeaturedGrid.innerHTML = `<div class="hero-quick-empty">${t('loading')}</div>`;
      return;
    }
    dom.heroFeaturedGrid.innerHTML = items.map(v => `
      <article class="featured-vehicle-card" data-lot="${esc(v.lot)}">
        <div class="featured-card-photo" ${imageStyle(v.image)} data-action="detail">
          <span class="featured-card-badge">● SUBASTA COPART</span>
        </div>
        <div class="featured-card-body">
          <h3 class="featured-card-title" data-action="detail">${esc(v.title)}</h3>
          <div class="featured-card-meta">${t('lot')} ${esc(v.lot)} · ${esc(locationLabel(v))}</div>
          <div class="featured-card-prices">
            <div class="featured-price-item">
              <span>${t('currentBid')}</span>
              <strong>${esc(money(v.currentBid))}</strong>
            </div>
            <div class="featured-price-item">
              <span>${t('buyNow')}</span>
              <strong>${esc(money(v.buyNow))}</strong>
            </div>
          </div>
          <div class="featured-card-actions">
            <button type="button" class="btn btn-ghost featured-card-btn" data-action="detail">${t('viewVehicle')}</button>
            <button type="button" class="btn btn-primary featured-card-btn" data-action="bid">${t('wantToBid')}</button>
          </div>
        </div>
      </article>
    `).join('');

    if(dom.featuredPrevBtn) dom.featuredPrevBtn.disabled = (state.featuredPage <= 1);
    if(dom.featuredNextBtn) dom.featuredNextBtn.disabled = (state.featuredPage >= 2 || state.featuredVehicles.length <= (startIndex + 3));

    if(dom.featuredDots){
      $$('.featured-dot', dom.featuredDots).forEach(dot => {
        dot.classList.toggle('active', Number(dot.dataset.page) === state.featuredPage);
      });
    }
  }

  async function updateHeroModels(makeValue){
    if(!dom.heroFilterModel) return;
    const prevVal = dom.heroFilterModel.value;
    dom.heroFilterModel.innerHTML = `<option value="">${t('allModels')}</option>`;
    if(!makeValue) return;
    try {
      const data = await api(`/api/vehicles?make=${encodeURIComponent(makeValue)}&pageSize=50`);
      const models = [...new Set((data.items || []).map(v => v.model).filter(Boolean))].sort();
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        dom.heroFilterModel.appendChild(opt);
      });
      dom.heroFilterModel.value = prevVal;
    } catch(_) {}
  }

  function applyHeroFiltersToCatalog(){
    const textQuery = (dom.heroSearchInput ? dom.heroSearchInput.value.trim() : '') || (dom.heroFilterModel ? dom.heroFilterModel.value : '');
    if(dom.search) dom.search.value = textQuery;
    if(dom.heroFilterMake && dom.make) dom.make.value = dom.heroFilterMake.value || '';
    if(dom.heroFilterState && dom.state) dom.state.value = dom.heroFilterState.value || '';
    if(dom.heroFilterYearMin && dom.yearMin) dom.yearMin.value = dom.heroFilterYearMin.value || '';
    if(dom.heroFilterYearMax && dom.yearMax) dom.yearMax.value = dom.heroFilterYearMax.value || '';
    if(dom.heroFilterBuyNow && dom.buyNow) dom.buyNow.checked = dom.heroFilterBuyNow.checked;

    state.page = 1;
    loadVehicles();
    document.querySelector('#catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      const heroPhoto = $('#hero-car-photo');
      if(data.items[0] && heroPhoto && !heroPhoto.dataset.ready) setHeroVehicle(data.items[0]);
    }catch(err){ dom.list.innerHTML=''; dom.empty.classList.remove('hidden'); showToast(err.message); }
    finally{ state.loading=false; }
  }

  function setHeroVehicle(v){
    const photo=$('#hero-car-photo');
    if(!photo) return;
    photo.dataset.ready='1';
    photo.style.backgroundImage=v.image?`url('${v.image}')`:'';
    const titleEl = $('#hero-car-title'); if(titleEl) titleEl.textContent=v.title;
    const metaEl = $('#hero-car-meta'); if(metaEl) metaEl.textContent=`${t('lot')} ${v.lot} · ${locationLabel(v)}`;
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
      dom.heroQuickResults.innerHTML=`<div class="hero-quick-empty">${t('noMatches')} “${esc(q)}”.</div><button type="button" class="hero-quick-all" data-hero-search-all>${t('fullCatalog')}</button>`;
      dom.heroQuickResults.classList.remove('hidden');
      return;
    }
    dom.heroQuickResults.innerHTML=items.map(v=>`<button type="button" class="hero-quick-item" data-hero-lot="${esc(v.lot)}"><span class="hero-quick-photo" ${imageStyle(v.image)}></span><span class="hero-quick-copy"><strong>${esc(v.title)}</strong><span>${t('lot')} ${esc(v.lot)} · ${esc(locationLabel(v))}</span></span></button>`).join('')+`<button type="button" class="hero-quick-all" data-hero-search-all>${t('allResultsFor')} “${esc(q)}”</button>`;
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
        <div class="vehicle-photo-wrap" data-action="detail"><div class="vehicle-photo" ${imageStyle(v.image)}>${v.image?'':`<div class="image-fallback">${t('noPhoto')}</div>`}</div></div>
        <div class="vehicle-main">
          <div class="vehicle-title-row"><h3 data-action="detail">${esc(v.title)}</h3><span class="source-pill">COPART</span></div>
          <div class="vehicle-identifiers">⌗ ${esc(vinText(v))} &nbsp;•&nbsp; ${t('lot')} ${esc(v.lot)}</div>
          <div class="spec-chips">
            <span class="spec-chip">${icon('🔑')} ${v.hasKeys==='YES'?t('keyAvailable'):t('keyUnknown')}</span>
            <span class="spec-chip">${icon('⚙')} ${esc(v.transmission||t('noData'))}</span>
            <span class="spec-chip">${icon('◉')} ${esc(v.drive||t('noData'))}</span>
            ${v.engine?`<span class="spec-chip">${icon('◴')} ${esc(v.engine)}</span>`:''}
            ${v.cylinders?`<span class="spec-chip">${icon('⬡')} ${esc(v.cylinders)} cyl</span>`:''}
            ${v.fuel?`<span class="spec-chip">${icon('⛽')} ${esc(v.fuel)}</span>`:''}
          </div>
          <div class="info-grid">
            <div class="info-line"><span>${t('odometer')}</span><strong>${esc(miles(v.odometer))}${v.odometer?' ('+esc(km(v.odometer))+')':''}</strong></div>
            <div class="info-line"><span>${t('location')}</span><strong>${esc(locationLabel(v))}</strong></div>
            <div class="info-line"><span>${t('damage')}</span><strong>${esc([v.primaryDamage,v.secondaryDamage].filter(Boolean).join(' + ')||t('noData'))}</strong></div>
            <div class="info-line"><span>${t('document')}</span><strong>${esc(titleDoc(v))}</strong></div>
            <div class="info-line"><span>${t('condition')}</span><strong>${esc(conditionLabel(v.runsDrives))}</strong></div>
            <div class="info-line"><span>${t('body')}</span><strong>${esc(v.body||t('noData'))}</strong></div>
            <div class="info-line"><span>${t('color')}</span><strong>${esc(v.color||t('noData'))}</strong></div>
            <div class="info-line"><span>${t('retail')}</span><strong>${esc(money(v.retailValue))}</strong></div>
          </div>
        </div>
        <aside class="vehicle-side">
          <div class="auction-box">
            <div class="auction-line">▣ <span>${esc(dateLabel(v.saleDate,v.timeZone))}</span></div>
            <div class="auction-line"><span class="dot">◉</span><span>${esc(v.saleStatus||t('auction'))}</span></div>
            <div class="auction-line">▥ <span>${t('retail')} ${esc(money(v.retailValue))}</span></div>
          </div>
          <div class="bid-box"><div><span>${t('currentBid')}</span><strong>${esc(money(v.currentBid))}</strong></div><div><span>${t('buyNow')}</span><strong>${esc(money(v.buyNow))}</strong></div></div>
          <div class="side-status">● ${esc(v.saleStatus||t('upcoming'))}</div>
          <div class="card-actions"><button class="btn btn-ghost" data-action="detail">${t('viewVehicle')}</button><button class="btn btn-primary" data-action="bid">${t('wantToBid')}</button></div>
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

  function vinQuickSpec(v){
    if(v.vin) return quickSpec(t('vin'),v.vin);
    if(state.user) return quickSpec(t('vin'),v.vin||t('unverified'));
    return `<div class="quick-spec locked-spec"><span>${t('vin')}</span><button type="button" data-auth-vin>🔒 ${t('registerForVin')}</button></div>`;
  }

  function vinQuickSpecValue(v){
    if(v.vin) return esc(v.vin);
    if(state.user) return esc(v.vin||t('unverified'));
    return `<button type="button" class="btn-auth-vin-inline" data-auth-vin>🔒 ${t('registerForVin')}</button>`;
  }

  function quickSpec(label,value){ return `<div class="quick-spec"><span>${esc(label)}</span><strong>${esc(value||'N/D')}</strong></div>`; }
  function detailSpec(label,value){ return `<div class="detail-spec"><span>${esc(label)}</span><strong>${esc(value||'N/D')}</strong></div>`; }

  function detectTitleType(v) {
    if (!v) return 'salvage';
    const str = ((v.titleType || '') + ' ' + (v.titleDoc || '') + ' ' + (v.titleState || '') + ' ' + (v.title || '')).toLowerCase();
    if (str.includes('clean') || str.includes('clear') || str.includes('limpio') || str.includes('rebuilt')) {
      return 'clean';
    }
    return 'salvage';
  }

  function detectVehicleType(v) {
    if (!v) return 'standard';
    const str = ((v.vehicleType || '') + ' ' + (v.body || '') + ' ' + (v.title || '')).toLowerCase();
    if (
      str.includes('heavy') ||
      str.includes('industrial') ||
      str.includes('truck') ||
      str.includes('trailer') ||
      str.includes('bus') ||
      str.includes('tractor') ||
      str.includes('commercial') ||
      str.includes('medium duty') ||
      str.includes('pesado')
    ) {
      return 'heavy';
    }
    return 'standard';
  }

  function getCopartBuyerFee(bid, vehicleType = 'standard') {
    const b = Math.max(0, Number(bid) || 0);
    if (b <= 0) return 0;
    if (vehicleType === 'heavy') {
      return Math.max(250, Math.round(b * 0.10));
    }
    if (b < 100) return 35;
    if (b < 200) return 60;
    if (b < 300) return 75;
    if (b < 400) return 90;
    if (b < 500) return 105;
    if (b < 600) return 135;
    if (b < 700) return 150;
    if (b < 800) return 160;
    if (b < 900) return 175;
    if (b < 1000) return 185;
    if (b < 1200) return 210;
    if (b < 1300) return 220;
    if (b < 1400) return 230;
    if (b < 1500) return 240;
    if (b < 1700) return 260;
    if (b < 2000) return 280;
    if (b < 2400) return 310;
    if (b < 3000) return 350;
    if (b < 3500) return 400;
    if (b < 4500) return 480;
    if (b < 5000) return 520;
    if (b < 6000) return 565;
    if (b < 7500) return 625;
    if (b < 10000) return 700;
    if (b < 15000) return 775;
    return Math.round(b * 0.055 * 100) / 100;
  }

  function getCopartVirtualBidFee(bid, offerType = 'live') {
    const b = Math.max(0, Number(bid) || 0);
    if (b <= 0) return 0;
    if (offerType === 'prebid') {
      if (b < 100) return 0;
      if (b < 500) return 29;
      if (b < 1000) return 39;
      if (b < 1500) return 49;
      if (b < 2000) return 59;
      if (b < 4000) return 69;
      if (b < 6000) return 79;
      if (b < 8000) return 89;
      if (b < 10000) return 99;
      return 109;
    }
    if (b < 100) return 0;
    if (b < 500) return 39;
    if (b < 1000) return 49;
    if (b < 1500) return 69;
    if (b < 2000) return 79;
    if (b < 4000) return 89;
    if (b < 6000) return 99;
    if (b < 8000) return 109;
    if (b < 10000) return 119;
    return 129;
  }

  function getApvFee(bid) {
    const b = Math.max(0, Number(bid) || 0);
    if (b <= 0) return 0;
    if (b <= 5999) return 350;
    if (b <= 9999) return 450;
    if (b <= 14999) return 650;
    return 700;
  }

  function calculateCostBreakdown(bid, options = {}) {
    const b = Math.max(0, Number(bid) || 0);
    const paymentMethod = options.paymentMethod || 'secure';
    const offerType = options.offerType || 'live';
    const titleType = options.titleType || 'clean';
    const vehicleType = options.vehicleType || 'standard';

    if (b <= 0) {
      return {
        bid: 0,
        copartBuyerFee: 0,
        copartVirtualFee: 0,
        unsecuredPaymentFee: 0,
        cleanTitleFee: 0,
        apvFee: 0,
        gateFee: 0,
        bankFee: 0,
        titlePickupFee: 0,
        fixedOtherFees: 0,
        totalCopartFees: 0,
        total: 0,
        options: { paymentMethod, offerType, titleType, vehicleType }
      };
    }

    const copartBuyerFee = getCopartBuyerFee(b, vehicleType);
    const copartVirtualFee = getCopartVirtualBidFee(b, offerType);
    const unsecuredPaymentFee = paymentMethod === 'unsecured' ? Math.max(35, Math.round(b * 0.035)) : 0;
    const cleanTitleFee = titleType === 'clean' ? 50 : 0;

    const apvFee = getApvFee(b);
    const gateFee = 79;
    const bankFee = 30;
    const titlePickupFee = 20;
    const fixedOtherFees = gateFee + bankFee + titlePickupFee;

    const totalCopartFees = copartBuyerFee + copartVirtualFee + unsecuredPaymentFee + cleanTitleFee;
    const total = b + totalCopartFees + apvFee + fixedOtherFees;

    return {
      bid: b,
      copartBuyerFee,
      copartVirtualFee,
      unsecuredPaymentFee,
      cleanTitleFee,
      apvFee,
      gateFee,
      bankFee,
      titlePickupFee,
      fixedOtherFees,
      totalCopartFees,
      total,
      options: { paymentMethod, offerType, titleType, vehicleType }
    };
  }

  function renderCalculatorHTML(v) {
    const isLoggedIn = Boolean(state.user);
    const autoTitle = detectTitleType(v);
    const autoVehicle = detectVehicleType(v);

    return `
      <div class="calc-section-container" id="vehicle-fee-calculator" data-vehicle-lot="${esc(v.lot)}">
        <div class="calc-section-header">
          <div class="calc-header-title">
            <span class="eyebrow-red">🧮 ${t('costCalculator')}</span>
            <h3>Calculadora de Costos & Opciones de Puja</h3>
          </div>
          ${isLoggedIn ? `<span class="calc-badge-user">✓ ${t('unlockedFor')}</span>` : ''}
        </div>

        <div class="calc-grid-layout">
          <!-- LEFT SIDE: Opciones que afectan los fees -->
          <div class="calc-options-card">
            <h4 class="calc-options-title">⚙️ Parámetros de la Oferta</h4>

            <!-- Método de Pago -->
            <div class="calc-opt-group">
              <label class="calc-opt-label">Método de Pago:</label>
              <div class="calc-radio-toggle">
                <label class="calc-radio-btn">
                  <input type="radio" name="calc_payment" value="secure" checked />
                  <span>🔒 Pago Seguro</span>
                </label>
                <label class="calc-radio-btn">
                  <input type="radio" name="calc_payment" value="unsecured" />
                  <span>⚠️ Pago no garantizado</span>
                </label>
              </div>
            </div>

            <!-- Tipo de Oferta -->
            <div class="calc-opt-group">
              <label class="calc-opt-label">Tipo de Oferta:</label>
              <div class="calc-radio-toggle">
                <label class="calc-radio-btn">
                  <input type="radio" name="calc_offer" value="live" checked />
                  <span>⚡ Oferta en Vivo</span>
                </label>
                <label class="calc-radio-btn">
                  <input type="radio" name="calc_offer" value="prebid" />
                  <span>📝 Pre oferta</span>
                </label>
              </div>
            </div>

            <!-- Tipo de Título (Fijo según el vehículo) -->
            <div class="calc-opt-group">
              <label class="calc-opt-label">
                Tipo de Título:
                <span class="auto-badge locked-badge" title="Ajustado obligatoriamente por la ficha del vehículo">🔒 Fijo por vehículo</span>
              </label>
              <div class="calc-radio-toggle is-locked">
                <label class="calc-radio-btn ${autoTitle === 'clean' ? 'is-selected-locked' : 'is-disabled'}">
                  <input type="radio" name="calc_title" value="clean" ${autoTitle === 'clean' ? 'checked' : ''} disabled />
                  <span>📄 Título Limpio</span>
                </label>
                <label class="calc-radio-btn ${autoTitle === 'salvage' ? 'is-selected-locked' : 'is-disabled'}">
                  <input type="radio" name="calc_title" value="salvage" ${autoTitle === 'salvage' ? 'checked' : ''} disabled />
                  <span>🛠️ Título Salvage</span>
                </label>
              </div>
            </div>

            <!-- Tipo de Vehículo (Fijo según el vehículo) -->
            <div class="calc-opt-group">
              <label class="calc-opt-label">
                Tipo de Vehículo:
                <span class="auto-badge locked-badge" title="Ajustado obligatoriamente por la categoría del vehículo">🔒 Fijo por vehículo</span>
              </label>
              <div class="calc-radio-toggle is-locked">
                <label class="calc-radio-btn ${autoVehicle === 'standard' ? 'is-selected-locked' : 'is-disabled'}">
                  <input type="radio" name="calc_vehicle" value="standard" ${autoVehicle === 'standard' ? 'checked' : ''} disabled />
                  <span>🚗 Vehículos Estándar</span>
                </label>
                <label class="calc-radio-btn ${autoVehicle === 'heavy' ? 'is-selected-locked' : 'is-disabled'}">
                  <input type="radio" name="calc_vehicle" value="heavy" ${autoVehicle === 'heavy' ? 'checked' : ''} disabled />
                  <span>🚛 Vehículo pesado</span>
                </label>
              </div>
            </div>
          </div>

          <!-- RIGHT SIDE: Calculadora más pequeña -->
          <div class="calc-breakdown-card">
            ${!isLoggedIn ? `
              <div class="calc-locked-content">
                <div class="calc-locked-icon">🔒</div>
                <div class="calc-locked-info">
                  <span class="eyebrow-red">${t('calculatorLockedTitle')}</span>
                  <h4>${t('calculatorTitle')}</h4>
                  <p>${t('calculatorLockedSub')}</p>
                </div>
                <button class="btn btn-primary btn-red" data-auth-calc="${esc(v.lot)}">
                  🔑 ${t('loginToUseCalc')}
                </button>
              </div>
            ` : `
              <div class="calc-input-section">
                <label for="calc-bid-input">
                  <span>Ingresa tu tope de puja:</span>
                </label>
                <div class="calc-input-row">
                  <div class="calc-input-currency-wrap">
                    <span class="currency-symbol">$</span>
                    <input type="number" id="calc-bid-input" class="calc-bid-input" min="100" step="50" value="" placeholder="Ingresa tu tope de puja" />
                    <span class="currency-code">USD</span>
                  </div>
                  <div class="calc-quick-add">
                    <button type="button" class="btn-quick-add" data-add="250">+$250</button>
                    <button type="button" class="btn-quick-add" data-add="500">+$500</button>
                    <button type="button" class="btn-quick-add" data-add="1000">+$1,000</button>
                  </div>
                </div>
              </div>

              <div id="calc-results-wrap"></div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  function getSelectedCalcOptions() {
    const root = dom.vehicleDetail;
    const paymentMethod = root.querySelector('input[name="calc_payment"]:checked')?.value || 'secure';
    const offerType = root.querySelector('input[name="calc_offer"]:checked')?.value || 'live';
    const titleType = root.querySelector('input[name="calc_title"]:checked')?.value || 'clean';
    const vehicleType = root.querySelector('input[name="calc_vehicle"]:checked')?.value || 'standard';
    return { paymentMethod, offerType, titleType, vehicleType };
  }

  function updateCalculatorResults(bidAmount) {
    const wrap = $('#calc-results-wrap');
    if (!wrap) return;
    const b = Number(bidAmount || 0);

    if (b <= 0) {
      wrap.innerHTML = `
        <div class="calc-empty-prompt">
          <span class="prompt-icon">💡</span>
          <p>Ingresa tu tope de puja arriba para ver el desglose exacto de tarifas y el total a pagar.</p>
        </div>
      `;
      return;
    }

    const options = getSelectedCalcOptions();
    const breakdown = calculateCostBreakdown(b, options);

    wrap.innerHTML = `
      <div class="calc-breakdown-container">
        <div class="calc-breakdown-list">
          <div class="calc-row">
            <div class="calc-label"><span class="calc-icon">🏎️</span> <span>${t('yourBid')}</span></div>
            <strong class="calc-val">${money(breakdown.bid)}</strong>
          </div>

          <!-- Grouped Copart Fees Row -->
          <div class="calc-group-row" id="toggle-copart-group">
            <div class="calc-row calc-row-toggle">
              <div class="calc-label">
                <span class="calc-icon">🏛️</span>
                <span>Copart fees</span>
                <span class="calc-info-badge">Desglose ⌄</span>
              </div>
              <div class="calc-val-wrap">
                <strong class="calc-val">${money(breakdown.totalCopartFees)}</strong>
                <span class="calc-arrow-icon" id="copart-arrow">⌄</span>
              </div>
            </div>
            <div class="calc-subdetails hidden" id="copart-subdetails">
              <div class="calc-subrow">
                <span>${t('copartFeeLabel')} (${breakdown.options.vehicleType === 'heavy' ? 'Vehículo Pesado' : 'Estándar'})</span>
                <span>${money(breakdown.copartBuyerFee)}</span>
              </div>
              <div class="calc-subrow">
                <span>${t('copartVirtualFeeLabel')} (${breakdown.options.offerType === 'prebid' ? 'Pre oferta' : 'En vivo'})</span>
                <span>${money(breakdown.copartVirtualFee)}</span>
              </div>
              ${breakdown.unsecuredPaymentFee > 0 ? `
                <div class="calc-subrow warning-subrow">
                  <span>Recargo Pago no garantizado (3.5%)</span>
                  <span>${money(breakdown.unsecuredPaymentFee)}</span>
                </div>
              ` : ''}
              ${breakdown.cleanTitleFee > 0 ? `
                <div class="calc-subrow">
                  <span>Procesamiento Título Limpio</span>
                  <span>${money(breakdown.cleanTitleFee)}</span>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Grouped Other Fees Row -->
          <div class="calc-group-row" id="toggle-other-group">
            <div class="calc-row calc-row-toggle">
              <div class="calc-label">
                <span class="calc-icon">📋</span>
                <span>Otros fees (Portón, Banco, Título)</span>
                <span class="calc-info-badge">Desglose ⌄</span>
              </div>
              <div class="calc-val-wrap">
                <strong class="calc-val">${money(breakdown.fixedOtherFees)}</strong>
                <span class="calc-arrow-icon" id="other-arrow">⌄</span>
              </div>
            </div>
            <div class="calc-subdetails hidden" id="other-subdetails">
              <div class="calc-subrow">
                <span>${t('gateFeeLabel')}</span>
                <span>${money(breakdown.gateFee)}</span>
              </div>
              <div class="calc-subrow">
                <span>${t('bankFeeLabel')}</span>
                <span>${money(breakdown.bankFee)}</span>
              </div>
              <div class="calc-subrow">
                <span>${t('titlePickupFeeLabel')}</span>
                <span>${money(breakdown.titlePickupFee)}</span>
              </div>
            </div>
          </div>

          <!-- APV Motors Fee -->
          <div class="calc-row highlight-apv">
            <div class="calc-label"><span class="calc-icon">🤝</span> <span>${t('apvFeeLabel')}</span></div>
            <strong class="calc-val red-text">${money(breakdown.apvFee)}</strong>
          </div>
        </div>

        <div class="calc-total-box">
          <div class="calc-total-left">
            <span class="calc-total-eyebrow">${t('totalToPay')}</span>
            <h2 class="calc-total-amount">${money(breakdown.total)}</h2>
            <small class="calc-total-note">* Nota: Las tarifas y honorarios son estimados y pueden variar de acuerdo con la subasta, ubicación del vehículo y regulaciones aplicables. No incluye costos de flete/transporte ni impuestos locales.</small>
          </div>
          <button class="btn btn-red-action" id="calc-proceed-bid" data-calc-bid-val="${breakdown.bid}">
            ${t('bidWithThisAmount')} →
          </button>
        </div>
      </div>
    `;
  }

  async function openDetail(lot, push=true){
    try{
      state.galleryImages=[];
      const v=await getVehicle(lot); state.currentVehicle=v; renderDetail(v); dom.vehicleOverlay.classList.remove('hidden'); document.body.style.overflow='hidden';
      loadGallery(lot);
      if(push && location.pathname!==`/vehiculo/${encodeURIComponent(lot)}`) history.pushState({lot},'',`/vehiculo/${encodeURIComponent(lot)}`);
    }catch(err){ showToast(err.message); }
  }

  function renderDetail(v){
    const hasBuyNow = Number(v.buyNow) > 0;
    const coverImage = v.image ? v.image.replace(/_thb\./i,'_ful.') : '';
    state.currentPhotoIdx = 0;

    dom.vehicleDetail.innerHTML = `
      <!-- TOP GRID: Gallery (Left), Auction & Pricing (Center), Bidding Sidebar (Right) -->
      <div class="detail-top-grid">
        <!-- Gallery Column -->
        <div class="detail-gallery-col">
          <div class="detail-gallery" id="detail-gallery">
            <div class="detail-gallery-main" id="detail-gallery-main">
              <button class="gallery-arrow prev" id="gallery-prev-btn" type="button" aria-label="${t('previousPhoto')}">‹</button>
              ${coverImage ? `<img id="detail-main-image" src="${esc(coverImage)}" alt="${esc(v.title)}" />` : `<div class="image-fallback">${t('noPhoto')}</div>`}
              <button class="gallery-arrow next" id="gallery-next-btn" type="button" aria-label="${t('nextPhoto')}">›</button>
              <span id="detail-photo-count" class="photo-count">1 ${t('photo')}</span>
            </div>
            <div id="detail-gallery-thumbs" class="detail-gallery-thumbs">${coverImage ? `<button class="gallery-thumb active" data-gallery-src="${esc(coverImage)}"><img src="${esc(coverImage)}" alt="Foto 1" /></button>` : ''}</div>
          </div>
        </div>

        <!-- Center Column (Auction Card + Pricing Card) -->
        <div class="detail-center-col">
          <div class="detail-card">
            <div class="detail-card-header">
              <span class="detail-card-icon">⚖️</span>
              <h3>Auction / Subasta</h3>
            </div>
            <div class="detail-card-grid">
              <div class="detail-card-row"><span>VIN</span><strong>${vinQuickSpecValue(v)}</strong></div>
              <div class="detail-card-row"><span>${t('lot')}</span><strong>${esc(v.lot)}</strong></div>
              <div class="detail-card-row"><span>Fecha de subasta</span><strong>${esc(dateLabel(v.saleDate, v.timeZone))}</strong></div>
              <div class="detail-card-row"><span>Nombre de venta</span><strong>${esc(v.yardName || 'Copart Yard')}</strong></div>
              <div class="detail-card-row"><span>Ubicación</span><strong>${esc(locationLabel(v))}</strong></div>
              <div class="detail-card-row"><span>Vendedor</span><strong>${esc(v.sellerName || 'Copart Seller')}</strong></div>
            </div>
          </div>

          <div class="detail-card">
            <div class="detail-card-header">
              <span class="detail-card-icon">🧰</span>
              <h3>Pricing analysis / Análisis de Precios</h3>
            </div>
            <div class="detail-card-grid">
              <div class="detail-card-row"><span>Valor Retail Estimado</span><strong>${esc(money(v.retailValue))}</strong></div>
              ${hasBuyNow ? `<div class="detail-card-row"><span>Compra directa (Buy Now)</span><strong>${esc(money(v.buyNow))}</strong></div>` : ''}
              <div class="detail-card-row"><span>Estado de Venta</span><strong>${esc(v.saleStatus || 'Subasta activa')}</strong></div>
              <div class="detail-card-row"><span>Reserva Vendedor</span><strong>${esc(v.saleStatus || 'Pujas habilitadas')}</strong></div>
            </div>
          </div>
        </div>

        <!-- Right Bidding Sidebar Column -->
        <div class="detail-right-col">
          <div class="bidding-action-card">
            <div class="bidding-card-header">
              <span class="bidding-timer-icon">⏱️</span>
              <span>Tiempo para puja preliminar</span>
            </div>
            <div class="bidding-current-bid">
              <span class="bid-label">${t('auctionCurrentBid').toUpperCase()}</span>
              <h2 class="bid-amount">${esc(money(v.currentBid))} USD</h2>
            </div>
            <button class="btn btn-primary btn-bid-now" data-detail-bid>
              🔨 ${t('wantToBid').toUpperCase()} / OFERTAR
            </button>
            <p class="bidding-disclaimer">Vehículos vendidos en su estado actual "as is - where is", todas las ventas son finales.</p>
          </div>
        </div>
      </div>

      <!-- MIDDLE GRID: Damage Card (Left) & Vehicle Info Card (Right) -->
      <div class="detail-mid-grid">
        <div class="detail-card">
          <div class="detail-card-header">
            <span class="detail-card-icon">🛠️</span>
            <h3>Damage / Daños y Condición</h3>
          </div>
          <div class="detail-card-grid two-col">
            <div class="detail-card-row"><span>Daño principal</span><strong>${esc(v.primaryDamage || 'N/D')}</strong></div>
            <div class="detail-card-row"><span>Daño secundario</span><strong>${esc(v.secondaryDamage || 'N/D')}</strong></div>
            <div class="detail-card-row"><span>Condición</span><strong>${esc(conditionLabel(v.runsDrives))}</strong></div>
            <div class="detail-card-row"><span>Título / Doc</span><strong>${esc(titleDoc(v))}</strong></div>
          </div>
        </div>

        <div class="detail-card">
          <div class="detail-card-header">
            <span class="detail-card-icon">⚙️</span>
            <h3>Vehicle Info / Información del Vehículo</h3>
          </div>
          <div class="detail-card-grid two-col">
            <div class="detail-card-row"><span>Odómetro</span><strong>${miles(v.odometer)}</strong></div>
            <div class="detail-card-row"><span>Tiene Llave</span><strong>${v.hasKeys === 'YES' ? 'Sí' : 'No / N/D'}</strong></div>
            <div class="detail-card-row"><span>Cilindros</span><strong>${v.cylinders ? `${v.cylinders} cyl` : 'N/D'}</strong></div>
            <div class="detail-card-row"><span>Tipo de motor</span><strong>${esc(v.engine || 'N/D')}</strong></div>
            <div class="detail-card-row"><span>Tracción</span><strong>${esc(v.drive || 'N/D')}</strong></div>
            <div class="detail-card-row"><span>Transmisión</span><strong>${esc(v.transmission || 'N/D')}</strong></div>
          </div>
        </div>
      </div>

      <!-- BOTTOM SECTION: Price Calculator -->
      ${renderCalculatorHTML(v)}
    `;

    if (state.user) {
      updateCalculatorResults($('#calc-bid-input')?.value || 0);
    }
    setupGalleryNavigation();
  }

  function setupGalleryNavigation(){
    const thumbs = $('#detail-gallery-thumbs');
    const main = $('#detail-main-image');
    const count = $('#detail-photo-count');
    const allGrid = $('#detail-all-grid');
    const allCount = $('#detail-all-count');

    if(!thumbs||!count) return;
    const fallbackCover = state.currentVehicle && state.currentVehicle.image ? [state.currentVehicle.image.replace(/_thb\./i, '_ful.')] : [];
    const finalImages=state.galleryImages||fallbackCover;
    const label=`${finalImages.length} ${finalImages.length===1?'foto':'fotos'}`;
    count.textContent=label;
    if(allCount) allCount.textContent=label;
    if(!finalImages.length){ thumbs.innerHTML=''; if(allGrid) allGrid.innerHTML='<div class="photo-empty">No hay fotos disponibles para este lote.</div>'; return; }
    if(main) main.src=finalImages[0];
    thumbs.innerHTML=finalImages.map((src,i)=>`<button class="gallery-thumb ${i===0?'active':''}" data-gallery-src="${esc(src)}" aria-label="Ver foto ${i+1}"><img src="${esc(src)}" alt="Foto ${i+1} de ${esc(state.currentVehicle?.title||'')}" loading="lazy" /></button>`).join('');
    if(allGrid) allGrid.innerHTML=finalImages.map((src,i)=>`<button type="button" data-gallery-src="${esc(src)}" aria-label="Ampliar foto ${i+1}"><img src="${esc(src)}" alt="Foto ${i+1} de ${esc(state.currentVehicle?.title||'')}" loading="lazy" /></button>`).join('');
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
      try{ await openBid(await getVehicle(action.lot), action.amount); }catch(err){ showToast(err.message); }
    }else if(action&&action.type==='calc'){
      await openDetail(action.lot,false);
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
    const countryCode = $('#register-country-code')?.value || '+1';
    const rawPhone = $('#register-phone').value.trim();
    const phone = rawPhone.startsWith('+') ? rawPhone : `${countryCode} ${rawPhone}`;

    try{
      const d=await api('/api/auth/register-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('#register-name').value,email,phone,password:$('#register-password').value})});
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
    location.reload();
  }

  function updateBidCostPreview(bidAmount) {
    const container = $('#bid-cost-preview');
    if (!container) return;
    const v = state.currentVehicle;
    if (!v) { container.innerHTML = ''; return; }
    const b = Number(bidAmount || 0);

    if (b <= 0) {
      container.innerHTML = `
        <div class="bid-mini-prompt">
          <span>💡 Ingresa tu tope de oferta para ver el desglose estimado de costos.</span>
        </div>
      `;
      return;
    }

    const autoTitle = detectTitleType(v);
    const autoVehicle = detectVehicleType(v);
    const options = {
      paymentMethod: 'secure',
      offerType: 'live',
      titleType: autoTitle,
      vehicleType: autoVehicle
    };
    const breakdown = calculateCostBreakdown(b, options);

    container.innerHTML = `
      <div class="bid-mini-breakdown">
        <div class="bid-mini-header">
          <span>📊 Desglose estimado para tu tope de ${money(breakdown.bid)}</span>
        </div>
        <div class="bid-mini-grid">
          <div class="bid-mini-row">
            <span>Puja (Tope)</span>
            <strong>${money(breakdown.bid)}</strong>
          </div>
          <div class="bid-mini-row">
            <span>Copart fees (${autoVehicle === 'heavy' ? 'Vehículo Pesado' : 'Estándar'})</span>
            <strong>${money(breakdown.totalCopartFees)}</strong>
          </div>
          <div class="bid-mini-row">
            <span>Otros fees (Portón, Banco, Título)</span>
            <strong>${money(breakdown.fixedOtherFees)}</strong>
          </div>
          <div class="bid-mini-row red-highlight">
            <span>Fee APV Motors</span>
            <strong class="red-text">${money(breakdown.apvFee)}</strong>
          </div>
        </div>
        <div class="bid-mini-total">
          <div class="bid-total-left">
            <span class="bid-total-label">Total estimado a pagar</span>
            <small class="bid-total-sub">* Sujeto a variaciones de subasta y ubicación</small>
          </div>
          <strong class="bid-total-amount">${money(breakdown.total)} USD</strong>
        </div>
      </div>
    `;
  }

  async function openBid(v, initialAmount){
    if(!state.user){ openAuth('Crea tu cuenta o inicia sesión para solicitar la puja. Tu cuenta mantiene el historial de Kommo entre dispositivos.',{type:'bid',lot:v.lot,amount:initialAmount}); return; }
    try{ if(!v.vin) v=await getVehicle(v.lot); }catch(_){}
    state.currentVehicle=v; closeDetail(false); dom.bidModal?.classList.remove('chat-mode');
    const startVal = initialAmount ? Number(initialAmount) : '';
    dom.bidAmount.value = startVal ? String(startVal) : '';
    updateBidCostPreview(startVal);
    dom.bidAmountStep.classList.remove('hidden'); dom.bidChatStep.classList.add('hidden'); dom.kommoFallback.classList.remove('hidden');
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
    const result=canSend ? window.apvKommo.sendBidContext(v,amount,state.user,getUserBidsHistory()) : {ok:false,botParams:{vehicle_message:message},error:'El módulo Kommo de la página no cargó.'};
    if(result.ok && result.ready){ dom.kommoFallback.classList.add('hidden'); }
    else{
      dom.kommoFallback.classList.remove('hidden');
      dom.fallbackPayload.textContent='Mensaje preparado para Kommo:\n\n'+message;
      const fallbackCopy = $('#fallback-copy');
      if (fallbackCopy) fallbackCopy.textContent='Preparando tu solicitud con APV Motors…';
    }

    if(statusText) statusText.textContent='Abre o continúa la conversación para asociar la solicitud.';
    if(statusChip) statusChip.textContent='ESPERANDO CHAT';
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
        if(result.ok&&result.ready) dom.kommoFallback.classList.remove('hidden');
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
  
  dom.bidAmount.addEventListener('input', e => {
    updateBidCostPreview(e.target.value);
  });

  dom.vehicleDetail.addEventListener('input', e => {
    if (e.target.id === 'calc-bid-input') {
      updateCalculatorResults(e.target.value);
    }
  });

  dom.vehicleDetail.addEventListener('change', e => {
    if (e.target.matches('input[name^="calc_"]')) {
      const input = $('#calc-bid-input');
      const val = input ? input.value : (state.currentVehicle?.currentBid || 1000);
      updateCalculatorResults(val);
    }
  });

  dom.vehicleDetail.addEventListener('click',async e=>{
    const toggleCopart = e.target.closest('#toggle-copart-group');
    if (toggleCopart) {
      const sub = $('#copart-subdetails', dom.vehicleDetail);
      const arrow = $('#copart-arrow', dom.vehicleDetail);
      if (sub) sub.classList.toggle('hidden');
      if (arrow) arrow.classList.toggle('is-open');
      return;
    }

    const toggleOther = e.target.closest('#toggle-other-group');
    if (toggleOther) {
      const sub = $('#other-subdetails', dom.vehicleDetail);
      const arrow = $('#other-arrow', dom.vehicleDetail);
      if (sub) sub.classList.toggle('hidden');
      if (arrow) arrow.classList.toggle('is-open');
      return;
    }

    const quickAdd = e.target.closest('[data-add]');
    if (quickAdd) {
      const input = $('#calc-bid-input');
      if (input) {
        const current = Number(input.value || 0);
        const add = Number(quickAdd.dataset.add || 0);
        input.value = current + add;
        updateCalculatorResults(input.value);
      }
      return;
    }

    const authCalc = e.target.closest('[data-auth-calc]');
    if (authCalc) {
      openAuth('Regístrate o inicia sesión para usar la calculadora de costos.', { type: 'calc', lot: authCalc.dataset.authCalc });
      return;
    }

    const proceedBtn = e.target.closest('#calc-proceed-bid');
    if (proceedBtn && state.currentVehicle) {
      const amount = Number(proceedBtn.dataset.calcBidVal || 0);
      await openBid(state.currentVehicle, amount);
      return;
    }

    const thumb=e.target.closest('[data-gallery-src]');
    if(thumb){ const img=$('#detail-main-image'); if(img) img.src=thumb.dataset.gallerySrc; $$('.gallery-thumb',dom.vehicleDetail).forEach(b=>b.classList.toggle('active',b===thumb)); return; }
    if(e.target.closest('[data-detail-bid]')&&state.currentVehicle){ await openBid(state.currentVehicle); return; }
    if(e.target.closest('[data-auth-vin]')&&state.currentVehicle){ openAuth('Regístrate o inicia sesión para revelar el VIN completo.',{type:'vin',lot:state.currentVehicle.lot}); return; }
    const toggle = e.target.closest('#toggle-full-tech');
    if (toggle) {
      const full = $('#full-tech');
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      full.classList.toggle('hidden', expanded);

      const label = $('#toggle-tech-label', toggle);
      const arrow = $('#toggle-tech-arrow', toggle);
      if (label) label.textContent = expanded ? t('showAllTechnical') : t('hideInformation');
      if (arrow) arrow.textContent = expanded ? '⌄' : '⌃';
      toggle.classList.toggle('is-open', !expanded);
    }
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
  if(window.apvKommo && typeof window.apvKommo.onSync==='function'){
    window.apvKommo.onSync(info=>{
      const statusText=$('#kommo-status-text');
      const statusChip=$('#kommo-status-chip');
      if(info.ok && !info.pendingChat){
        if(statusText) statusText.textContent='Solicitud asociada a esta conversación';
        if(statusChip) statusChip.textContent='COMPLETADO';
        const copy=$('#fallback-copy'); if(copy) copy.textContent='Solicitud registrada con éxito.';
      }else if(info.pendingChat){
        if(statusText) statusText.textContent='Esperando que la conversación aparezca en Kommo…';
        if(statusChip) statusChip.textContent='ESPERANDO CHAT';
      }
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

  if(dom.heroFilterMake){
    dom.heroFilterMake.addEventListener('change', (e) => updateHeroModels(e.target.value));
  }

  if(dom.heroFilterForm){
    dom.heroFilterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      applyHeroFiltersToCatalog();
    });
  }

  if(dom.featuredPrevBtn){
    dom.featuredPrevBtn.addEventListener('click', () => {
      if(state.featuredPage > 1){
        state.featuredPage--;
        renderFeaturedVehicles();
      }
    });
  }

  if(dom.featuredNextBtn){
    dom.featuredNextBtn.addEventListener('click', () => {
      if(state.featuredPage < 2){
        state.featuredPage++;
        renderFeaturedVehicles();
      }
    });
  }

  if(dom.featuredDots){
    dom.featuredDots.addEventListener('click', (e) => {
      const dot = e.target.closest('.featured-dot');
      if(dot && dot.dataset.page){
        state.featuredPage = Number(dot.dataset.page);
        renderFeaturedVehicles();
      }
    });
  }

  if(dom.heroFeaturedGrid){
    dom.heroFeaturedGrid.addEventListener('click', async (e) => {
      const card = e.target.closest('[data-lot]');
      if(!card) return;
      const lot = card.dataset.lot;
      const action = e.target.closest('[data-action]')?.dataset.action || 'detail';
      if(action === 'bid'){
        try {
          const v = await getVehicle(lot);
          openBid(v);
        } catch(err) { showToast(err.message); }
      } else {
        openDetail(lot);
      }
    });
  }

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

    // Language Switcher Bindings
    $$('#lang-switch .lang-btn').forEach(btn => {
      btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
    });
    setLanguage(currentLang);

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
