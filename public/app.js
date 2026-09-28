(function(){
  'use strict';

  const $ = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];
  const isHome = document.body.classList.contains('home-page');
  const state = {
    page: 1,
    pageSize: 18,
    catalogSeed: 1000001 + Math.floor(Date.now() / 300000) % 1000000000,
    filters: null,
    favoritesOnly: false,
    accountFavorites: [],
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
    search: $('#search-input'), make: $('#filter-make'), model: $('#filter-model'), runDrive: $('#filter-run-drive'), yearMin: $('#filter-year-min'),
    yearMax: $('#filter-year-max'), damage: $('#filter-damage'), run: $('#filter-run'), state: $('#filter-state'), city: $('#filter-city'), zip: $('#filter-zip'), cleanTitle: $('#filter-clean-title'), limitOdometer: $('#filter-limit-odometer'),
    buyNow: $('#filter-buy-now'), odometer: $('#filter-odometer'), odometerLabel: $('#odometer-label'), sort: $('#sort-select'), filtersPanel: $('#filters-panel'),
    vehicleOverlay: $('#vehicle-overlay'), vehicleDetail: $('#vehicle-detail-content'), bidOverlay: $('#bid-overlay'), bidModal: $('.bid-modal'), bidAmount: $('#bid-amount'),
    bidVehicleMini: $('#bid-vehicle-mini'), bidAmountStep: $('#bid-step-amount'), bidChatStep: $('#bid-step-chat'), chatContext: $('#chat-context'),
    kommoFallback: $('#kommo-fallback'), fallbackPayload: $('#fallback-payload'), autoMessagePreview: $('#auto-message-preview'), toast: $('#toast'), chatTabsContainer: $('#chat-history-selector'),
    authOverlay: $('#auth-overlay'), authButton: $('#auth-button'), accountChip: $('#account-chip'), accountAvatar: $('#account-avatar'),
    accountName: $('#account-name'), accountEmail: $('#account-email'), authTitle: $('#auth-title'), authReason: $('#auth-reason'), authStatus: $('#auth-status'),
    heroSearchForm: $('#hero-search-form'), heroSearchInput: $('#hero-search-input'), heroQuickResults: $('#hero-quick-results'), heroVehicleCard: $('#hero-vehicle-card'),
    heroFilterForm: $('#hero-filter-form'), heroFilterMake: $('#hero-filter-make'), heroFilterModel: $('#hero-filter-model'),
    heroFilterYearMin: $('#hero-filter-year-min'), heroFilterYearMax: $('#hero-filter-year-max'), heroFilterBuyNow: $('#hero-filter-buy-now'), heroRunDrive: $('#hero-filter-run-drive'), heroFilterState: $('#hero-filter-state'),
    heroFeaturedGrid: $('#hero-featured-grid'), featuredPrevBtn: $('#featured-prev-btn'), featuredNextBtn: $('#featured-next-btn'), featuredDots: $('#featured-dots'),
    chatReopenButton: $('#chat-reopen-button'),
    termsOverlay: $('#terms-overlay'), privacyOverlay: $('#privacy-overlay'),
    termsLinkBtn: $('#terms-link-btn'), privacyLinkBtn: $('#privacy-link-btn')
  };

  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function money(v){ const n=Number(v||0); return n>0 ? '$'+n.toLocaleString('en-US',{maximumFractionDigits:0}) : t('notAvailable','N/A'); }
  function miles(v){ const n=Number(v||0); return n>0 ? n.toLocaleString('en-US')+' mi' : t('noData','N/D'); }
  function km(v){ const n=Number(v||0); return n>0 ? Math.round(n*1.60934).toLocaleString('en-US')+' km' : ''; }
  function dateLabel(value, zone){
    if(!value) return t('unconfirmedDate');
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return t('unconfirmedDate');
    return new Intl.DateTimeFormat(currentLang==='en'?'en-US':'es-US',{month:'short',day:'numeric',year:'numeric'}).format(d)+(zone?' · '+zone:'');
  }
  function conditionLabel(v){
    const x=(v||'').toLowerCase();
    if(x.includes('run') && x.includes('drive')) return t('runsDrives');
    if(x.includes('start')) return t('starts','Arranca');
    return t('unverified','Sin verificar');
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
      navHow: 'Cómo comprar', heroRegister: 'Crea tu cuenta gratis', heroFilters: 'Más filtros',
      navHelp: 'Ayuda', navReviews: 'Reseñas',
      login: 'Iniciar sesión',
      createAccount: 'Crear cuenta',
      myBids: '💬 Mis Pujas',
      logout: 'Salir', myAccount: 'Mi cuenta',
      viewVehicles: 'Ver autos',
      exploreCatalog: 'Explorar catálogo',
      seeHow: 'Ver cómo comprar',
      heroEyebrow: 'SUBASTAS EN ESTADOS UNIDOS · 100% ONLINE',
      heroMainTitle: 'Compra tu vehículo en subastas de EE. UU. sin complicarte.',
      heroMainSub: 'Encuentra vehículos de Copart, define cuánto quieres ofertar y APV Motors te acompaña desde la puja hasta la documentación y el traslado.',
      heroSearchPlaceholder: 'Ej. Silverado 2023, número de lote o VIN',
      heroSearchButton: 'Buscar',
      statVehicles: 'vehículos cargados',
      statSteps: 'pasos claros',
      statSupport: 'atención personalizada',
      heroSearchEyebrow: 'BUSCA EN SEGUNDOS',
      heroSearchTitle: 'Encuentra tu próximo vehículo',
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
      howTitle: 'Cómo comprar desde esta página',
      step1Title: 'Crea tu cuenta gratis', step1Text: 'Regístrate y verifica tu correo para guardar favoritos y solicitar pujas.',
      step2Title: 'Selecciona un vehículo', step2Text: 'Busca por modelo, año, lote o VIN. Revisa las fotos, daños y detalles.',
      step3Title: 'Calcula tu presupuesto', step3Text: 'Ingresa tu oferta en la calculadora para ver un total estimado con tarifas.',
      step4Title: 'Coloca tu puja máxima', step4Text: 'Pulsa «Quiero ofertar» e indica cuánto estás dispuesto a ofrecer. No se realiza ningún cobro automático.',
      step5Title: 'Confirma con un asesor', step5Text: 'Continúa en el chat de APV para coordinar y confirmar la solicitud de puja.', step5Link: 'haciendo clic aquí.',
      step6Title: 'Consulta tus solicitudes', step6Text: 'En «Mi cuenta → Mis pujas» puedes retomar tus conversaciones. Tus vehículos guardados están en «Mis favoritos».',
      catalogEyebrow: 'CATÁLOGO DE SUBASTA',
      catalogTitle: 'Encuentra el auto correcto.',
      resultsAvailable: 'resultados disponibles.',
      catalogSearchPlaceholder: 'Ej. Silverado 2023, número de lote o VIN',
      search: 'Buscar', sortAuto: 'Aleatorio / búsqueda',
      navPlans: 'Planes', membershipEyebrow: 'MEMBRESÍAS APV MOTORS', membershipTitle: 'Elige cómo quieres comprar tu próximo vehículo.', membershipIntro: 'Empieza gratis. Cuando estés listo para comprar, suma descuentos y asesoría.', membershipNudge: '¿Listo para comprar? Conoce los descuentos en honorarios APV y las asesorías incluidas.',
      myFavorites: '♥ Mis favoritos', availableFavorites: 'Vehículos guardados que siguen disponibles',
      filtersTitle: 'Filtros',
      clearFilters: 'Limpiar',
      applyFilters: 'Aplicar filtros',
      brand: 'Marca', allFeminine: 'Todas', allMasculine: 'Todos', yearFrom: 'Año desde', yearTo: 'Año hasta',
      city: 'Ciudad', zipCode: 'Código postal (ZIP)', zipHint: 'ZIP de la ubicación del vehículo.', cleanTitle: 'Solo título limpio', limitOdometer: 'Limitar odómetro',
      primaryDamage: 'Daño principal', condition: 'Condición', state: 'Estado', keysOnly: 'Solo con llaves', buyNowOnly: 'Solo «Cómprala ya»', maxOdometer: 'Odómetro máximo',
      mobileFilters: '☰ Filtros', viewNote: 'Precios en USD · el VIN completo se muestra a usuarios registrados', sortBy: 'Ordenar por',
      sortSaleSoon: 'Subasta más próxima', sortNewest: 'Año: más nuevo', sortPriceAsc: 'Precio: menor', sortPriceDesc: 'Precio: mayor', sortMileage: 'Menor millaje',
      emptyTitle: 'No encontramos vehículos', emptyText: 'Prueba otra búsqueda o limpia los filtros.',
      helpEyebrow: '¿NO SABES CUÁNTO PUJAR?', helpTitle: 'Encuentra el vehículo primero. Nosotros te ayudamos con lo demás.', findVehicle: 'Buscar un vehículo',
      footerCatalog: 'Catálogo de vehículos de subasta · EE. UU.', footerSource: 'Datos de inventario obtenidos de listados públicos de subastas de Copart.', footerDisclaimer: 'La disponibilidad, pujas y condiciones finales dependen de la subasta y pueden cambiar.',
      cookieTitle: 'Uso de cookies y privacidad',
      cookieText: 'Utilizamos cookies esenciales para tu sesión y preferencias. Si aceptas todas, también usamos Google Analytics para medir las visitas. Consulta nuestros <button type="button" class="cookie-link-btn" id="cookie-terms-btn">Términos de servicio</button> y <button type="button" class="cookie-link-btn" id="cookie-privacy-btn">Política de privacidad</button>.',
      acceptCookies: 'Aceptar todas',
      declineCookies: 'Solo esenciales',
      termsOfService: 'Términos de servicio', privacyPolicy: 'Política de privacidad', termsEyebrow: 'ASPECTOS LEGALES', termsTitle: 'Términos de servicio',
      termsContent: '<h3>1. Aceptación de los Términos</h3><p>Al acceder y utilizar el portal de APV Motors, el usuario acepta cumplir con los presentes Términos de servicio. Si no está de acuerdo con alguno de los términos, debe abstenerse de utilizar el sitio.</p><h3>2. Servicios de Intermediación</h3><p>APV Motors actúa como un facilitador e intermediario de servicios para la consulta de catálogo y asistencia en subastas de vehículos en Estados Unidos (como Copart e IAA). APV Motors no es el dueño directo de los vehículos de subasta listados en el catálogo público.</p><h3>3. Ofertas y Pujas</h3><p>Las ofertas o intenciones de puja registradas por los usuarios en la plataforma representan límites de puja deseados y están sujetas a verificación y confirmación por parte de un asesor de APV Motors antes de ser presentadas en la subasta oficial.</p><h3>4. Información de Vehículos</h3><p>La información, fotografías y especificaciones de los vehículos provienen de listados públicos de subastas. Los usuarios son responsables de revisar los detalles técnicos, historial y estado del vehículo antes de autorizar una oferta final.</p><h3>5. Modificaciones</h3><p>APV Motors se reserva el derecho de actualizar o modificar estos términos en cualquier momento para reflejar cambios legales o de servicio.</p>',
      privacyEyebrow: 'PROTECCIÓN DE DATOS', privacyTitle: 'Política de privacidad',
      privacyContent: '<h3>1. Información que Recopilamos</h3><p>Recopilamos información personal que usted nos proporciona voluntariamente al registrarse o enviar una solicitud, como su nombre completo, dirección de correo electrónico, número de teléfono/WhatsApp e intenciones de puja.</p><h3>2. Uso de la Información</h3><p>Utilizamos sus datos personales para: brindar asistencia personalizada con asesores de APV Motors, gestionar sus solicitudes de puja, conservar el historial de su conversación y enviarle notificaciones relevantes sobre subastas de su interés.</p><h3>3. Integración con Servicios de Terceros</h3><p>Sus datos pueden ser procesados a través de nuestro sistema de gestión de relaciones con clientes (Kommo CRM) de forma segura para garantizar la continuidad del soporte técnico y comercial.</p><h3>4. Protección y Confidencialidad</h3><p>APV Motors implementa medidas de seguridad técnicas y organizativas para proteger sus datos personales contra acceso no autorizado, alteración o divulgación.</p><h3>5. Sus Derechos</h3><p>Usted puede solicitar en cualquier momento el acceso, corrección o eliminación de sus datos personales comunicándose con nuestro equipo de soporte.</p>',
      close: 'Cerrar', minimizeChat: 'Minimizar chat', accountEyebrow: 'CUENTA APV MOTORS', authTitle: 'Guarda tu conversación y continúa desde cualquier dispositivo.', authReason: 'Regístrate para ver el VIN completo y hablar con un asesor.', registerDirectTitle: 'Crea tu cuenta gratis', registerDirectReason: 'Completa tus datos para guardar vehículos, solicitar pujas y continuar desde cualquier dispositivo.', checkEmailTitle: 'Revisa tu correo', checkEmailReason: 'Te enviamos un código de 6 dígitos. Escríbelo para activar tu cuenta.',
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
      bidAssistance: 'ASISTENCIA DE PUJA', continueAdvisor: 'Continúa con un asesor', protectedSession: '● Sesión protegida', requestReady: '¿Cuánto te gustaría ofertar o cómo te puedo ayudar?', connectingChat: 'Conectando con el chat de APV Motors…', stableConversation: 'Tu cuenta mantiene un identificador estable para conservar la conversación.', returnChat: 'Volver al chat', reopenConversation: 'Volver a abrir tu conversación con APV Motors',
      yourActiveBids: 'Tus Pujas Activas',
      clearAllBids: '🗑 Borrar todas',
      wantToBid: 'Quiero ofertar',
      viewVehicle: 'Ver ficha',
      resetAllBids: 'Reiniciar todas las pujas', deleteBid: 'Eliminar esta puja', vehicle: 'Vehículo', lot: 'Lote', vin: 'VIN',
      noMatches: 'No encontramos coincidencias para', fullCatalog: 'Ver el catálogo completo', allResultsFor: 'Ver todos los resultados para',
      noPhoto: 'SIN FOTO', keyAvailable: 'Llave disponible', keyUnknown: 'Llave N/D', odometer: 'Odómetro', location: 'Ubicación', damage: 'Daño', document: 'Documento', body: 'Carrocería', color: 'Color',
      registerForVin: 'Regístrate para ver el VIN', previousPhoto: 'Foto anterior', nextPhoto: 'Siguiente foto', photo: 'foto', photos: 'fotos', keys: 'Llaves', unconfirmed: 'Sin confirmar', directPrice: 'PRECIO COMPRA DIRECTA (BUY IT NOW)', auctionCurrentBid: 'Puja actual subasta', estimatedRetail: 'Valor al público est.', auctionDate: 'Fecha de subasta', signInVinChat: '🔒 Debes registrarte para ver el VIN completo y abrir el chat.', lotGallery: 'GALERÍA DEL LOTE', allPhotos: 'Todas las fotos', loading: 'Cargando…', technicalPrices: 'FICHA TÉCNICA Y PRECIOS', completeVehicleInfo: 'Información completa del vehículo', officialCopartData: 'Datos oficiales Copart', directPurchase: 'Cómprala ya (Compra directa)', estimatedRepair: 'Costo estim. reparación', transmission: 'Transmisión', engine: 'Motor', cylinders: 'Cilindros', traction: 'Tracción', fuel: 'Combustible', secondaryDamage: 'Daño secundario', lossType: 'Tipo de pérdida', availableKeys: 'Llaves disponibles', titleDocument: 'Título / Documento', yardLocation: 'Ubicación / Patio', showAllTechnical: 'Ver toda la información técnica', hideInformation: 'Ocultar información', item: 'Item', vehicleType: 'Tipo de vehículo', year: 'Año', model: 'Modelo', modelGroup: 'Grupo de modelo', trim: 'Versión', conditionCode: 'Código condición', odometerBrand: 'Marca del odómetro', saleStatus: 'Estado de venta', repairCost: 'Costo reparación', yard: 'Patio', country: 'País', seller: 'Vendedor', updated: 'Actualizado', specialNote: 'NOTA ESPECIAL', announcements: 'ANUNCIOS', readyToBid: '¿Listo para ofertar?', afterSignIn: 'Después de iniciar sesión defines tu tope. APV envía a Kommo la ficha, el VIN, el lote, el monto y tus datos de cuenta.', informationSource: 'Fuente de la información', sourceDescription: 'La ficha se construye con el CSV y las fotos se consultan bajo demanda usando el enlace Image URL de Copart.', openCopart: 'Abrir lote en Copart →',
      pricingAuction: 'Precios y Subasta', mechanicalSpecs: 'Especificaciones Mecánicas', vehicleIdentity: 'Datos del Vehículo', conditionDamage: 'Estado y Condición', locationVendedor: 'Ubicación y Subasta',
      calculatorTitle: 'Calculadora de costos y total a pagar',
      costCalculator: 'HERRAMIENTA DE CÁLCULO DE TARIFAS',
      calculatorSub: 'Ingresa tu tope de puja para calcular el desglose exacto de tarifas de subasta y honorarios.',
      calculatorLockedTitle: 'Calculadora exclusiva',
      calculatorLockedSub: 'Inicia sesión o regístrate para usar la Calculadora de costos y ver el desglose exacto de tarifas para este vehículo.',
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
      navHow: 'How to buy', heroRegister: 'Create your free account', heroFilters: 'More filters',
      navHelp: 'Help', navReviews: 'Reviews',
      login: 'Log in',
      createAccount: 'Create account',
      myBids: '💬 My Bids',
      logout: 'Log out', myAccount: 'My account',
      viewVehicles: 'View vehicles',
      exploreCatalog: 'Explore catalog',
      seeHow: 'See how it works',
      heroEyebrow: 'UNITED STATES AUCTIONS · 100% ONLINE',
      heroMainTitle: 'Buy your car at U.S. auctions without the hassle.',
      heroMainSub: 'Find Copart vehicles, set your maximum bid, and let APV Motors guide you from bidding through documents and transportation.',
      heroSearchPlaceholder: 'E.g. Silverado 2023, lot number or VIN',
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
      howTitle: 'How to buy through this website',
      step1Title: 'Create your free account', step1Text: 'Register and verify your email to save favorites and request bids.',
      step2Title: 'Choose a vehicle', step2Text: 'Search by model, year, lot or VIN. Review photos, damage and details.',
      step3Title: 'Estimate your budget', step3Text: 'Enter your offer in the calculator to see an estimated total including fees.',
      step4Title: 'Set your maximum bid', step4Text: 'Select “I want to bid” and enter your maximum offer. No automatic charge is made.',
      step5Title: 'Confirm with an advisor', step5Text: 'Continue in the APV chat to coordinate and confirm your bid request.', step5Link: 'by clicking here.',
      step6Title: 'Review your requests', step6Text: 'Open “My account → My bids” to resume conversations. Saved vehicles are under “My favorites”.',
      catalogEyebrow: 'AUCTION CATALOG', catalogTitle: 'Find the right vehicle.', resultsAvailable: 'results available.', catalogSearchPlaceholder: 'E.g. Silverado 2023, lot number or VIN', search: 'Search', sortAuto: 'Random / search',
      navPlans: 'Plans', membershipEyebrow: 'APV MOTORS MEMBERSHIPS', membershipTitle: 'Choose how to buy your next vehicle.', membershipIntro: 'Start free. When you are ready to buy, add discounts and guidance.', membershipNudge: 'Ready to buy? Explore APV fee discounts and included consultations.',
      myFavorites: '♥ My favorites', availableFavorites: 'Saved vehicles still available',
      filtersTitle: 'Filters',
      clearFilters: 'Clear',
      applyFilters: 'Apply filters',
      brand: 'Make', allFeminine: 'All', allMasculine: 'All', yearFrom: 'Year from', yearTo: 'Year to', primaryDamage: 'Primary damage', condition: 'Condition', state: 'State', city: 'City', zipCode: 'ZIP code', zipHint: 'ZIP code of the vehicle location.', cleanTitle: 'Clean Title only', limitOdometer: 'Limit odometer', keysOnly: 'Keys only', buyNowOnly: 'Buy It Now only', maxOdometer: 'Maximum odometer',
      mobileFilters: '☰ Filters', viewNote: 'Prices in USD · the full VIN is shown to registered users', sortBy: 'Sort by', sortSaleSoon: 'Soonest auction', sortNewest: 'Year: newest', sortPriceAsc: 'Price: lowest', sortPriceDesc: 'Price: highest', sortMileage: 'Lowest mileage',
      emptyTitle: 'No vehicles found', emptyText: 'Try another search or clear the filters.', helpEyebrow: 'NOT SURE HOW MUCH TO BID?', helpTitle: 'Find the car first. We will help you with the rest.', findVehicle: 'Find a vehicle',
      footerCatalog: 'Auction vehicle catalog · USA', footerSource: 'Inventory data sourced from public Copart auction listings.', footerDisclaimer: 'Availability, bids, and final conditions depend on the auction and may change.',
      cookieTitle: 'Cookies and Privacy',
      cookieText: 'We use essential cookies for your session and preferences. If you accept all, we also use Google Analytics to measure visits. Read our <button type="button" class="cookie-link-btn" id="cookie-terms-btn">Terms of Service</button> and <button type="button" class="cookie-link-btn" id="cookie-privacy-btn">Privacy Policy</button>.',
      acceptCookies: 'Accept all',
      declineCookies: 'Essential only',
      termsOfService: 'Terms of Service', privacyPolicy: 'Privacy Policy', termsEyebrow: 'LEGAL TERMS', termsTitle: 'Terms of Service',
      termsContent: '<h3>1. Acceptance of Terms</h3><p>By accessing and using the APV Motors portal, you agree to comply with these Terms of Service. If you do not agree with any part of these terms, please do not use the website.</p><h3>2. Intermediary Services</h3><p>APV Motors acts as a service facilitator and intermediary for catalog browsing and auction assistance for vehicles in the United States (such as Copart and IAA). APV Motors does not directly own the public auction vehicles listed in the catalog.</p><h3>3. Offers and Bids</h3><p>Bids or purchase intentions submitted by users on the platform represent maximum desired limits and are subject to verification and confirmation by an APV Motors advisor before being placed in the official auction.</p><h3>4. Vehicle Information</h3><p>Vehicle details, photographs, and specifications originate from public auction listings. Users are responsible for reviewing technical specifications, history, and vehicle condition before authorizing a final bid.</p><h3>5. Modifications</h3><p>APV Motors reserves the right to update or modify these terms at any time to reflect legal or operational changes.</p>',
      privacyEyebrow: 'DATA PROTECTION', privacyTitle: 'Privacy Policy',
      privacyContent: '<h3>1. Information We Collect</h3><p>We collect personal information that you voluntarily provide when registering or submitting a request, such as your full name, email address, phone/WhatsApp number, and bidding intentions.</p><h3>2. How We Use Information</h3><p>We use your personal data to: provide personalized assistance with APV Motors advisors, manage your bid requests, save your conversation history, and send relevant notifications about auctions of interest.</p><h3>3. Integration with Third-Party Services</h3><p>Your data may be processed securely through our Customer Relationship Management system (Kommo CRM) to ensure continuous technical and commercial support.</p><h3>4. Security and Confidentiality</h3><p>APV Motors implements technical and organizational security measures to protect your personal data against unauthorized access, alteration, or disclosure.</p><h3>5. Your Rights</h3><p>You may request access to, correction, or deletion of your personal data at any time by contacting our support team.</p>',
      close: 'Close', minimizeChat: 'Minimize chat', accountEyebrow: 'APV MOTORS ACCOUNT', authTitle: 'Save your conversation and continue from any device.', authReason: 'Sign up to view the full VIN and chat with an advisor.', registerDirectTitle: 'Create your free account', registerDirectReason: 'Enter your details to save vehicles, request bids and continue from any device.', checkEmailTitle: 'Check your email', checkEmailReason: 'We sent you a 6-digit code. Enter it to activate your account.',
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
      bidAssistance: 'BID ASSISTANCE', continueAdvisor: 'Continue with an advisor', protectedSession: '● Protected session', requestReady: 'How much would you like to bid, or how can I help?', connectingChat: 'Connecting to APV Motors chat…', stableConversation: 'Your account uses a stable identifier to preserve the conversation.', returnChat: 'Return to chat', reopenConversation: 'Reopen your conversation with APV Motors',
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

  for(const lang of ['es','en'])Object.assign(TRANSLATIONS[lang],window.APV_I18N?.[lang]||{});
  for(const lang of ['es','en'])TRANSLATIONS[lang].privacyContent+=window.APV_LEGAL_ADDITION?.[lang]||''; // PENDIENTE DE REVISIÓN LEGAL
  let currentLang = localStorage.getItem('APV_LANG') || 'es';

  function t(key, fallback) {
    if (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) {
      return TRANSLATIONS[currentLang][key];
    }
    return fallback || (TRANSLATIONS.es[key] || key);
  }

  const originalTitle=document.title;
  const originalDescription=document.querySelector('meta[name="description"]')?.content;
  function setLanguage(lang) {
    if (!TRANSLATIONS[lang]) return;
    currentLang = lang;
    localStorage.setItem('APV_LANG', lang);
    document.documentElement.lang = lang;
    document.title = currentLang==='en' ? t('pageTitle') : originalTitle;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = currentLang==='en' ? t('pageDescription') : originalDescription;
    if (window.apvKommo && typeof window.apvKommo.setLocale === 'function') window.apvKommo.setLocale(lang);

    $$('#lang-switch .lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
      btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
    });

    $$('[data-i18n]').forEach(el => {
      const k = el.dataset.i18n;
      if (TRANSLATIONS[lang] && TRANSLATIONS[lang][k]) {
        el.textContent = TRANSLATIONS[lang][k];
      }
    });

    $$('[data-i18n-html]').forEach(el => {
      const k = el.dataset.i18nHtml;
      if (TRANSLATIONS[lang] && TRANSLATIONS[lang][k]) {
        el.innerHTML = TRANSLATIONS[lang][k];
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

    document.dispatchEvent(new Event('apv:language'));
    window.APVDisplay?.clean(document.querySelector('main'),lang);
    window.apvMembership?.render();
    if (state.filters) {
      updateCities();
      populateYears(dom.heroFilterYearMin,state.filters.minYear,state.filters.maxYear);
      populateYears(dom.heroFilterYearMax,state.filters.minYear,state.filters.maxYear);
      updateYearRangeLabels();
      renderFeaturedVehicles();
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

  const STATE_NAMES = {"AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia", "PR": "Puerto Rico"};
  async function initFilters(){
    const f=await api('/api/filters'); state.filters=f;
    const heroTotal = $('#hero-total');
    if(heroTotal) heroTotal.textContent = f.total.toLocaleString('en-US');
    populate(dom.make, f.makes); populate(dom.damage, f.damages); populate(dom.run, f.runStates); for (const o of dom.run.options) if(o.value) o.textContent=conditionLabel(o.value); populate(dom.state, f.states);
    if(dom.heroFilterMake) populate(dom.heroFilterMake, f.makes);
    if(dom.heroFilterState) populate(dom.heroFilterState, f.states);
    for(const select of [dom.state, dom.heroFilterState]) for(const option of select.options) if(option.value) option.textContent=STATE_NAMES[option.value.toUpperCase()] || option.value;
    updateCities();
    populateYears(dom.heroFilterYearMin, f.minYear, f.maxYear);
    populateYears(dom.heroFilterYearMax, f.minYear, f.maxYear);
    populateYears(dom.yearMin,f.minYear,f.maxYear);
    populateYears(dom.yearMax,f.minYear,f.maxYear);
    updateYearRangeLabels();
    const maxOdo=1000000; dom.odometer.max=maxOdo; dom.odometer.value=0; updateOdometerLabel();
    updateCatalogModels();
    if(!isHome){
      const query=new URLSearchParams(location.search);
      for(const [key,input] of [['make',dom.make],['state',dom.state]]) if(query.has(key)) input.value=query.get(key);
      updateCatalogModels();updateCities();
      if(query.has('model')) dom.model.value=query.get('model');
      dom.heroFilterMake.value=dom.make.value;updateHeroModels(dom.make.value);dom.heroFilterModel.value=dom.model.value;dom.heroFilterState.value=dom.state.value;
      const low=Math.max(Number(dom.yearMin.min),Math.min(Number(dom.yearMax.max),Number(query.get('yearMin'))||Number(dom.yearMin.min)));
      const high=Math.max(low,Math.min(Number(dom.yearMax.max),Number(query.get('yearMax'))||Number(dom.yearMax.max)));
      setYearRange(low,high);
      dom.runDrive.checked=dom.heroRunDrive.checked=query.get('runAndDrive')==='1';
      dom.buyNow.checked=dom.heroFilterBuyNow.checked=query.get('buyNowOnly')==='1';
    }
  }

  function populateYears(input,minYear,maxYear){
    const previous=input.dataset.ready?Number(input.value):null;
    input.min=minYear; input.max=maxYear;
    input.value=previous===null?(input.id.endsWith('-min')?minYear:maxYear):Math.max(minYear,Math.min(maxYear,previous));
    input.dataset.ready='1';
  }
  function updateYearRangeLabels(){
    for(const [low,high] of [[dom.yearMin,dom.yearMax],[dom.heroFilterYearMin,dom.heroFilterYearMax]]){
      $('#'+low.id+'-value').textContent=low.value;
      $('#'+high.id+'-value').textContent=high.value;
      const span=Number(low.max)-Number(low.min)||1;
      const track=low.parentElement;
      track.style.setProperty('--year-start',((Number(low.value)-Number(low.min))/span*100)+'%');
      track.style.setProperty('--year-end',((Number(high.value)-Number(low.min))/span*100)+'%');
      low.style.zIndex=Number(low.value)===Number(low.max)?'3':'1';
    }
  }
  function setYearRange(low,high){
    for(const input of [dom.yearMin,dom.heroFilterYearMin])input.value=low;
    for(const input of [dom.yearMax,dom.heroFilterYearMax])input.value=high;
    updateYearRangeLabels();
  }
  for(const [low,high] of [[dom.yearMin,dom.yearMax],[dom.heroFilterYearMin,dom.heroFilterYearMax]]){
    for(const input of [low,high])input.addEventListener('input',()=>{
      if(Number(low.value)>Number(high.value))input.value=input===low?high.value:low.value;
      setYearRange(low.value,high.value);
    });
  }

  document.addEventListener('click', e=>{ if(e.target.closest('[data-retry-featured]')) loadFeaturedVehicles(); });

  document.addEventListener('apv:featured',loadFeaturedVehicles);
  async function loadFeaturedVehicles(){
    try {
      const featuredParams=new URLSearchParams(window.apvFeaturedQuery||'');
      if(document.body.classList.contains('lp-page'))featuredParams.set('campaign','1');
      const data = await api('/api/featured'+(featuredParams.size?'?'+featuredParams:''));
      state.featuredVehicles = data.items || [];
      state.featuredPage = 1;
      renderFeaturedVehicles();
    } catch(err) {
      console.warn('[APV] Error loading featured vehicles:', err);
      dom.heroFeaturedGrid.innerHTML = `<div class="hero-quick-empty">${t('emptyText')} <button type="button" class="link-button" data-retry-featured>${currentLang==='en'?'Retry':'Reintentar'}</button></div>`;
    }
  }

  function renderFeaturedVehicles(){
    if(!dom.heroFeaturedGrid) return;
    const count=document.body.classList.contains('lp-page')?6:3;
    const startIndex = (state.featuredPage - 1) * count;
    const items = state.featuredVehicles.slice(startIndex, startIndex + count);
    if(!items.length){
      dom.heroFeaturedGrid.innerHTML = `<div class="hero-quick-empty">${t('emptyTitle')}</div>`;
      return;
    }
    dom.heroFeaturedGrid.innerHTML = items.map(v => `
      <article class="featured-vehicle-card" data-lot="${esc(v.lot)}">
        <div class="featured-card-photo" role="button" tabindex="0" aria-label="${esc(v.title)} · COPART" data-action="detail">
          ${v.image ? `<img src="${esc(v.image)}" alt="${esc(v.title)}" width="640" height="400" loading="lazy" decoding="async" />` : ''}
          <span class="featured-card-badge">COPART</span>
        </div>
        <div class="featured-card-body">
          <h3 class="featured-card-title"><button type="button" data-action="detail">${esc(v.title)}</button></h3>
          <div class="featured-card-meta">${t('lot')} ${esc(v.lot)} · ${esc(locationLabel(v))}</div>
          <div class="featured-card-prices">
            <div class="featured-price-item"><span>${t('currentBid',currentLang==='en'?'Current bid':'Puja actual')}</span><strong>${esc(cardPrice(v.currentBid))}</strong></div>
            <div class="featured-price-item"><span>${t('buyNow',currentLang==='en'?'Buy now':'Compra inmediata')}</span><strong>${esc(cardPrice(v.buyNow))}</strong></div>
          </div>
          ${comparison(v)}<div class="featured-card-actions">
            <button type="button" class="btn btn-primary featured-card-btn" data-action="detail">${t('viewCarCosts')}</button>
          </div>
        </div>
      </article>
    `).join('');

    window.APVDisplay?.clean(dom.heroFeaturedGrid,currentLang);
    if(dom.featuredPrevBtn) dom.featuredPrevBtn.disabled = (state.featuredPage <= 1);
    if(dom.featuredNextBtn) dom.featuredNextBtn.disabled = (state.featuredPage >= 2 || state.featuredVehicles.length <= (startIndex + 3));

    if(dom.featuredDots){
      $$('.featured-dot', dom.featuredDots).forEach(dot => {
        dot.classList.toggle('active', Number(dot.dataset.page) === state.featuredPage);
      });
    }
  }

  function fillModels(select, make) {
    const previous = select.value;
    const groups = state.filters?.modelsByMake || {};
    const models = make ? (groups[make] || []) : [...new Set(Object.values(groups).flat())].sort();
    select.innerHTML = `<option value="">${t('allModels')}</option>`;
    populate(select, models);
    select.value = models.includes(previous) ? previous : '';
  }
  function updateHeroModels(make) { fillModels(dom.heroFilterModel, make); }
  function updateCatalogModels() { fillModels(dom.model, dom.make.value); }
  function updateCities() {
    const previous=dom.city.value;
    const cities=[...new Set((state.filters?.cities || []).filter(row=>!dom.state.value || row.state===dom.state.value).map(row=>row.city))];
    dom.city.innerHTML=`<option value="">${t('allFeminine')}</option>`;
    populate(dom.city,cities);
    dom.city.value=cities.includes(previous)?previous:'';
  }
  dom.state.addEventListener('change',updateCities);


  function applyHeroFiltersToCatalog(){
    if(isHome){
      const query = new URLSearchParams();
      for(const [key,value] of [['q',dom.heroSearchInput.value.trim()],['make',dom.heroFilterMake.value],['model',dom.heroFilterModel.value],['state',dom.heroFilterState.value]]) if(value) query.set(key,value);
      if(Number(dom.heroFilterYearMin.value)>Number(dom.heroFilterYearMin.min)) query.set('yearMin',dom.heroFilterYearMin.value);
      if(Number(dom.heroFilterYearMax.value)<Number(dom.heroFilterYearMax.max)) query.set('yearMax',dom.heroFilterYearMax.value);
      if(dom.heroRunDrive.checked) query.set('runAndDrive','1');
      if(dom.heroFilterBuyNow.checked) query.set('buyNowOnly','1');
      location.assign('/catalogo'+(query.size?'?'+query.toString():''));return;
    }
    const textQuery = dom.heroSearchInput ? dom.heroSearchInput.value.trim() : '';
    if(dom.search) dom.search.value = textQuery;
    if(dom.heroFilterMake && dom.make) dom.make.value = dom.heroFilterMake.value || '';
    if(dom.heroFilterState && dom.state) dom.state.value = dom.heroFilterState.value || '';
    updateCities();
    if(dom.heroFilterYearMin && dom.yearMin) dom.yearMin.value = dom.heroFilterYearMin.value || '';
    if(dom.heroFilterYearMax && dom.yearMax) dom.yearMax.value = dom.heroFilterYearMax.value || '';
    if(dom.heroFilterBuyNow && dom.buyNow) dom.buyNow.checked = dom.heroFilterBuyNow.checked;

    updateCatalogModels();
    dom.model.value = dom.heroFilterModel.value;
    dom.runDrive.checked = dom.heroRunDrive.checked;
    dom.run.value = '';
    state.page = 1;
    loadVehicles();
    document.querySelector('#catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function populate(select, items){ for(const item of items){ const o=document.createElement('option'); o.value=item; o.textContent=window.APVDisplay?.label(item,currentLang)||item; select.appendChild(o); } }
  function updateOdometerLabel(){ dom.odometerLabel.textContent=Number(dom.odometer.value||0).toLocaleString('en-US')+' mi'; }

  function params(){
    const p=new URLSearchParams({page:String(state.page),pageSize:String(state.pageSize),sort:dom.sort.value,seed:String(state.catalogSeed)});
    if(dom.model.value) p.set('model',dom.model.value);
    if(dom.runDrive.checked) p.set('runAndDrive','1');
    if(state.favoritesOnly) p.set('favorites',readFavorites().join(','));
    if(dom.search.value.trim()) p.set('q',dom.search.value.trim());
    if(dom.make.value) p.set('make',dom.make.value); if(dom.damage.value) p.set('damage',dom.damage.value); if(dom.run.value) p.set('runState',dom.run.value); if(dom.state.value) p.set('state',dom.state.value);
    if(Number(dom.yearMin.value)>Number(dom.yearMin.min)) p.set('yearMin',dom.yearMin.value); if(Number(dom.yearMax.value)<Number(dom.yearMax.max)) p.set('yearMax',dom.yearMax.value);
    if(dom.limitOdometer.checked) p.set('odometerMax',dom.odometer.value);
    if(dom.city.value) p.set('city',dom.city.value);
    if(dom.zip.value.trim()) p.set('zip',dom.zip.value.trim());
    if(dom.cleanTitle.checked) p.set('cleanTitle','1'); if(dom.buyNow.checked) p.set('buyNowOnly','1');
    const entry=new URLSearchParams(location.search);for(const k of ['priceMin','priceMax'])if(entry.has(k))p.set(k,entry.get(k));
    return p;
  }

  function skeletons(){ dom.empty.classList.add('hidden'); dom.list.innerHTML=Array.from({length:6},()=>'<div class="skeleton"></div>').join(''); }

  async function loadVehicles(){
    if(isHome) return;
    if(dom.zip.value.trim() && !/^\d{5}$/.test(dom.zip.value.trim())){showToast(currentLang==='en'?'Enter a 5-digit ZIP code.':'Escribe un código ZIP de 5 dígitos.');dom.zip.focus();return;}
    if(dom.yearMin.value && dom.yearMax.value && Number(dom.yearMin.value)>Number(dom.yearMax.value)){showToast(currentLang==='en'?'The starting year must not exceed the ending year.':'El año desde no puede ser mayor que el año hasta.');return;}
    const requestId = (state.catalogRequestId || 0) + 1; state.catalogRequestId = requestId;
    state.catalogController?.abort();
    const controller=new AbortController(); state.catalogController=controller;
    const timeout=setTimeout(()=>controller.abort('timeout'),15000);
    state.loading=true; skeletons();
    try{
      const data=await api('/api/vehicles?'+params().toString(),{signal:controller.signal});
      if(requestId !== state.catalogRequestId) return;
      dom.count.textContent=data.total.toLocaleString('en-US');
      renderVehicles(data.items); renderPagination(data);
      if(!data.items.length) dom.empty.classList.remove('hidden');
      const heroPhoto = $('#hero-car-photo');
      if(data.items[0] && heroPhoto && !heroPhoto.dataset.ready) setHeroVehicle(data.items[0]);
    }catch(err){ if(requestId !== state.catalogRequestId) return; dom.list.innerHTML=''; dom.empty.classList.remove('hidden'); showToast(controller.signal.reason==='timeout' ? (currentLang==='en'?'Loading took too long. Please try again.':'La carga tardó demasiado. Intenta de nuevo.') : err.message); }
    finally{ clearTimeout(timeout); if(requestId === state.catalogRequestId) state.loading=false; }
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
    if(isHome){location.assign('/catalogo'+(q?'?q='+encodeURIComponent(q):''));return;}
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

  function readFavorites() { return state.accountFavorites; }
  function favoriteButton(lot) {
    const active=readFavorites().includes(String(lot));
    return `<button type="button" class="favorite-button" data-favorite="${esc(lot)}" aria-pressed="${active}" aria-label="${active?'Quitar de favoritos':'Guardar en mi cuenta'}">${active?'♥':'♡'}</button>`;
  }
  function refreshFavoriteButtons() {
    document.querySelectorAll('[data-favorite]').forEach(b=>{ b.outerHTML=favoriteButton(b.dataset.favorite); });
  }
  async function loadAccountFavorites() {
    const userId=state.user?.id;
    if(!userId) return;
    try {
      const data=await api('/api/user/favorites');
      if(state.user?.id!==userId) return;
      state.accountFavorites=data.lots || [];
      refreshFavoriteButtons();
      if(state.favoritesOnly) loadVehicles();
    } catch(err) { showToast(err.message); }
  }
  async function toggleFavorite(lot) {
    if(!state.user) { openAuth('Inicia sesión para guardar tus favoritos en tu cuenta.',{type:'favorite',lot}); return; }
    const userId=state.user.id;
    try {
      await state.favoritesReady;
      if(state.user?.id!==userId) return;
      const data=await api('/api/user/favorites/'+encodeURIComponent(lot),{method:readFavorites().includes(lot)?'DELETE':'PUT'});
      if(state.user?.id!==userId) return;
      state.accountFavorites=data.lots || [];
      refreshFavoriteButtons();
      if(state.favoritesOnly) loadVehicles();
    } catch(err) { showToast(err.message); }
  }
  async function showAccountFavorites() {
    if(isHome){location.assign('/catalogo?favorites=1');return;}
    clearFilters(false);
    state.favoritesOnly=true;
    $('#favorites-heading').classList.remove('hidden');
    $('#my-favorites-button').setAttribute('aria-pressed','true');
    await loadVehicles();
    document.querySelector('#catalogo').scrollIntoView({behavior:'smooth'});
  }
  document.addEventListener('click', e => {
    const button=e.target.closest('[data-favorite]');
    if(button) toggleFavorite(button.dataset.favorite);
  });

  function cardPrice(value){return Number(value)>0?money(value):'N/A';}
  function comparison(v){
    const price=Number(v.buyNow),retail=Number(v.retailValue);
    if(!Number.isFinite(price)||!Number.isFinite(retail)||price<=0||retail<=0)return '';
    const percent=Math.floor((1-price/retail)*1000)/10;
    const bar=Math.min(100,Math.max(0,price/retail*100));
    return `<div class="price-comparison"><div class="price-comparison-values"><div><span>${t('comparisonBuyNow')}</span><strong>${esc(money(price))}</strong></div><div><span>${t('retail')}</span><strong>${esc(money(retail))}</strong></div></div><div class="price-comparison-track" aria-hidden="true"><span style="width:${bar}%"></span></div>${percent>0?`<span class="price-comparison-badge">${percent} % ${t('comparisonBelow')}</span>`:''}<small>${t('comparisonNote')}</small></div>`;
  }
  const compactCatalogMedia=window.matchMedia('(max-width: 700px)');
  compactCatalogMedia.addEventListener('change',()=>{
    dom.list.querySelectorAll('.vehicle-card-details').forEach(details=>details.open=!compactCatalogMedia.matches);
  });
  function renderVehicles(items){
    dom.list.innerHTML=items.map(v=>`
      <article class="vehicle-card" data-lot="${esc(v.lot)}">
        <div class="vehicle-photo-wrap" role="button" tabindex="0" aria-label="${esc(v.title)} · COPART" data-action="detail"><div class="vehicle-photo">${v.image?`<img src="${esc(v.image)}" alt="${esc(v.title)}" width="320" height="220" loading="lazy" decoding="async" />`:`<div class="image-fallback">${t('noPhoto')}</div>`}</div></div>
        <div class="vehicle-main">
          <div class="vehicle-title-row"><h3><button type="button" data-action="detail" class="vehicle-title-button">${esc(v.title)}</button></h3><span class="source-pill">COPART</span>${favoriteButton(v.lot)}</div>
          <div class="vehicle-identifiers">⌗ ${esc(vinText(v))} &nbsp;•&nbsp; ${t('lot')} ${esc(v.lot)}</div>
          ${comparison(v)}
          <details class="vehicle-card-details" ${compactCatalogMedia.matches?'':'open'}><summary><span>${t('cardShowDetails')}</span><span>${t('cardHideDetails')}</span></summary>
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
          </details>
        </div>
        <aside class="vehicle-side">
          <div class="auction-box">
            <div class="auction-line">▣ <span>${esc(dateLabel(v.saleDate,v.timeZone))}</span></div>
            <div class="auction-line"><span class="dot">◉</span><span>${esc(v.saleStatus||t('auction'))}</span></div>
            <div class="auction-line">▥ <span>${t('retail')} ${esc(money(v.retailValue))}</span></div>
          </div>
          <div class="bid-box"><div><span>${t('currentBid',currentLang==='en'?'Current bid':'Puja actual')}</span><strong>${esc(cardPrice(v.currentBid))}</strong></div><div><span>${t('buyNow',currentLang==='en'?'Buy now':'Compra inmediata')}</span><strong>${esc(cardPrice(v.buyNow))}</strong></div></div>
          <div class="side-status">● ${esc(v.saleStatus||t('upcoming'))}</div>
          <div class="card-actions"><button class="btn btn-primary" data-action="bid">${t('wantToBid')}</button></div>
        </aside>
      </article>`).join('');
    window.APVDisplay?.clean(dom.list,currentLang);
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
    if(v.vin) return `<span class="vin-value">${esc(v.vin)}</span> <button type="button" class="copy-vin" data-copy-vin="${esc(v.vin)}">${currentLang==='en'?'Copy':'Copiar'}</button>`;
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

    const apvFeeBase = getApvFee(b);
    const apvDiscount = Math.min(apvFeeBase, window.apvMembership?.getPlan().feeDiscount || 0);
    const apvFee = apvFeeBase - apvDiscount;
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
      apvFeeBase,
      apvDiscount,
      gateFee,
      bankFee,
      titlePickupFee,
      fixedOtherFees,
      totalCopartFees,
      total,
      options: { paymentMethod, offerType, titleType, vehicleType }
    };
  }

  // Reuse the same base fees for the homepage's preliminary budget guide.
  window.apvBaseCostEstimate = bid => {
    const result=calculateCostBreakdown(bid);
    return {...result,total:result.total+(result.apvDiscount||0)};
  };

  // PENDIENTE D-082: evaluar total estimado sin registro
  function renderCalculatorHTML(v) {
    const isLoggedIn = Boolean(state.user);
    const autoTitle = detectTitleType(v);
    const autoVehicle = detectVehicleType(v);

    return `
      <div class="calc-section-container" id="vehicle-fee-calculator" data-vehicle-lot="${esc(v.lot)}">
        <div class="calc-section-header">
          <div class="calc-header-title">
            <span class="eyebrow-red">🧮 ${t('costCalculator')}</span>
            <h3>${t('calculatorHeading')}</h3>
          </div>
          ${isLoggedIn ? `<span class="calc-badge-user">✓ ${t('unlockedFor')}</span>` : ''}
        </div>

        <div class="calc-grid-layout">
          <!-- LEFT SIDE: Opciones que afectan los fees -->
          <details class="calc-options-card">
            <summary class="calc-options-title">${currentLang==='en'?"Bid settings":"Parámetros de la oferta"} <span class="calc-options-chevron" aria-hidden="true">⌄</span></summary>
            <div class="calc-options-fields">

            <!-- Método de Pago -->
            <div class="calc-opt-group">
              <label class="calc-opt-label">${t('paymentMethod')}</label>
              <div class="calc-radio-toggle">
                <label class="calc-radio-btn">
                  <input type="radio" name="calc_payment" value="secure" checked />
                  <span>${t('detailComplete18')}</span>
                </label>
                <label class="calc-radio-btn">
                  <input type="radio" name="calc_payment" value="unsecured" />
                  <span>${t('detailComplete19')}</span>
                </label>
              </div>
            </div>

            <!-- Tipo de Oferta -->
            <div class="calc-opt-group">
              <label class="calc-opt-label">${t('offerType')}</label>
              <div class="calc-radio-toggle">
                <label class="calc-radio-btn">
                  <input type="radio" name="calc_offer" value="live" checked />
                  <span>${t('detailComplete20')}</span>
                </label>
                <label class="calc-radio-btn">
                  <input type="radio" name="calc_offer" value="prebid" />
                  <span>${t('detailComplete21')}</span>
                </label>
              </div>
            </div>

            <!-- Tipo de Título (Fijo según el vehículo) -->
            <div class="calc-opt-group">
              <label class="calc-opt-label">
                ${currentLang==='en'?"Title type:":"Tipo de Título:"}
                <span class="auto-badge locked-badge" title="${currentLang==='en'?"Determined by the vehicle details":"Ajustado obligatoriamente por la ficha del vehículo"}">${t('detailComplete22')}</span>
              </label>
              <div class="calc-radio-toggle is-locked">
                <label class="calc-radio-btn ${autoTitle === 'clean' ? 'is-selected-locked' : 'is-disabled'}">
                  <input type="radio" name="calc_title" value="clean" ${autoTitle === 'clean' ? 'checked' : ''} disabled />
                  <span>${t('detailComplete23')}</span>
                </label>
                <label class="calc-radio-btn ${autoTitle === 'salvage' ? 'is-selected-locked' : 'is-disabled'}">
                  <input type="radio" name="calc_title" value="salvage" ${autoTitle === 'salvage' ? 'checked' : ''} disabled />
                  <span>🛠️ ${t('salvageLabel')}</span>
                </label>
              </div>
            </div>

            <!-- Tipo de Vehículo (Fijo según el vehículo) -->
            <div class="calc-opt-group">
              <label class="calc-opt-label">
                ${currentLang==='en'?"Vehicle type:":"Tipo de Vehículo:"}
                <span class="auto-badge locked-badge" title="${currentLang==='en'?"Determined by the vehicle category":"Ajustado obligatoriamente por la categoría del vehículo"}">${t('detailComplete22')}</span>
              </label>
              <div class="calc-radio-toggle is-locked">
                <label class="calc-radio-btn ${autoVehicle === 'standard' ? 'is-selected-locked' : 'is-disabled'}">
                  <input type="radio" name="calc_vehicle" value="standard" ${autoVehicle === 'standard' ? 'checked' : ''} disabled />
                  <span>${t('detailComplete24')}</span>
                </label>
                <label class="calc-radio-btn ${autoVehicle === 'heavy' ? 'is-selected-locked' : 'is-disabled'}">
                  <input type="radio" name="calc_vehicle" value="heavy" ${autoVehicle === 'heavy' ? 'checked' : ''} disabled />
                  <span>${t('detailComplete25')}</span>
                </label>
              </div>
            </div>
            </div>
          </details>

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
                    <input type="number" id="calc-bid-input" class="calc-bid-input" min="100" step="50" value="" placeholder="Ej. 5000" />
                    <span class="currency-code">USD</span>
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
    const breakdownOpen = wrap.querySelector('.calc-price-details')?.open || false;

    wrap.innerHTML = `
      <div class="calc-breakdown-container">
        <details class="calc-price-details" ${breakdownOpen ? 'open' : ''}>
          <summary>${currentLang==='en'?'Price breakdown':'Desglose de precios'} <span aria-hidden="true">⌄</span></summary>
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
                <span class="calc-info-badge">${t('detailComplete26')}</span>
              </div>
              <div class="calc-val-wrap">
                <strong class="calc-val">${money(breakdown.totalCopartFees)}</strong>
                <span class="calc-arrow-icon" id="copart-arrow">⌄</span>
              </div>
            </div>
            <div class="calc-subdetails hidden" id="copart-subdetails">
              <div class="calc-subrow">
                <span>${t('copartFeeLabel')} (${breakdown.options.vehicleType === 'heavy' ? (currentLang==='en'?"Heavy vehicle":"Vehículo Pesado") : (currentLang==='en'?"Standard":"Estándar")})</span>
                <span>${money(breakdown.copartBuyerFee)}</span>
              </div>
              <div class="calc-subrow">
                <span>${t('copartVirtualFeeLabel')} (${breakdown.options.offerType === 'prebid' ? (currentLang==='en'?"Pre-bid":"Preoferta") : (currentLang==='en'?"Live":"En vivo")})</span>
                <span>${money(breakdown.copartVirtualFee)}</span>
              </div>
              ${breakdown.unsecuredPaymentFee > 0 ? `
                <div class="calc-subrow warning-subrow">
                  <span>${t('detailComplete27')}</span>
                  <span>${money(breakdown.unsecuredPaymentFee)}</span>
                </div>
              ` : ''}
              ${breakdown.cleanTitleFee > 0 ? `
                <div class="calc-subrow">
                  <span>${t('detailComplete28')}</span>
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
                <span>${t('detailComplete29')}</span>
                <span class="calc-info-badge">${t('detailComplete26')}</span>
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
            <strong class="calc-val red-text">${breakdown.apvDiscount ? `<del>${money(breakdown.apvFeeBase)}</del> ` : ''}${money(breakdown.apvFee)}</strong>
          </div>
        </div>

        </details>

        ${breakdown.apvDiscount ? `<p class="membership-calculator-note">${currentLang==='en'?'Membership discount applied to APV fees':'Descuento de tu membresía aplicado a los fees APV'}: −${money(breakdown.apvDiscount)}</p>` : window.apvMembership?.available() ? `<div class="membership-calculator-note"><span>${currentLang==='en'?'With APV Plus, save US$100 on the APV fee for this purchase. Membership billed separately.':'Con APV Plus, descuenta US$100 del fee APV de esta compra. La membresía se paga por separado.'}</span><button type="button" class="link-button" data-member-plans>${currentLang==='en'?'Compare plans':'Comparar planes'}</button></div>` : ''}
        <div class="calc-total-box">
          <div class="calc-total-highlight">
            <span class="calc-total-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8v4H8zM8 14h1m3 0h1m3 0h0M8 18h1m3 0h1m3 0h0"/></svg></span>
            <div class="calc-total-left">
              <span class="calc-total-eyebrow">${currentLang==='en'?'Estimated total to pay':'Total estimado a pagar'}</span>
              <h2 class="calc-total-amount">${money(breakdown.total)}</h2>
            </div>
          </div>
          <div class="calc-total-action">
            <button class="btn btn-red-action" id="calc-proceed-bid" data-calc-bid-val="${breakdown.bid}">
              ${t('bidWithThisAmount')} →
            </button>
          </div>
          <small class="calc-total-note">${currentLang==='en'?'* Fees are estimates and may vary by auction, vehicle location and applicable regulations. Freight/transport and local taxes are not included.':'* Nota: Las tarifas y honorarios son estimados y pueden variar de acuerdo con la subasta, ubicación del vehículo y regulaciones aplicables. No incluye costos de flete/transporte ni impuestos locales.'}</small>
        </div>
      </div>
    `;
  }

  async function openDetail(lot, push=true){
    if(isHome){location.assign(window.APVTracking?.campaignURL('/vehiculo/'+encodeURIComponent(lot))||'/vehiculo/'+encodeURIComponent(lot));return;}
    try{
      state.galleryImages=[];
      const v=await getVehicle(lot); state.currentVehicle=v; renderDetail(v); dom.vehicleOverlay.classList.remove('hidden'); document.body.style.overflow='hidden';
      loadGallery(lot);
      if(push && location.pathname!==`/vehiculo/${encodeURIComponent(lot)}`) history.pushState({lot},'',window.APVTracking?.campaignURL(`/vehiculo/${encodeURIComponent(lot)}`)||`/vehiculo/${encodeURIComponent(lot)}`);
      if(push){window.APVTracking?.track('page_view',{page_location:location.href});window.APVTracking?.track('view_vehicle',{lote:String(lot)});}
    }catch(err){ showToast(err.message); }
  }

  function renderDetail(v){
    const hasBuyNow = Number(v.buyNow) > 0;
    const coverImage = v.image ? v.image.replace(/_thb\./i,'_ful.') : '';
    state.currentPhotoIdx = 0;

    const shareLink=new URL('/vehiculo/'+encodeURIComponent(v.lot),location.origin).href;
    const shareText=encodeURIComponent(v.title+' '+shareLink);
    dom.vehicleDetail.innerHTML = `
      <h2 class="detail-vehicle-title" id="vehicle-detail-title">${esc([v.year,v.make,v.model,v.trim].filter(Boolean).join(' ') || v.title)}</h2>
      <div class="detail-share-toolbar">
        <a class="detail-share-button" href="https://wa.me/?text=${shareText}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a class="detail-share-button" href="sms:?body=${shareText}">SMS</a>
        <button type="button" class="detail-share-button" data-share-vehicle="${esc(v.lot)}" title="${currentLang==='en'?'Copy vehicle link':'Copiar enlace del vehículo'}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>
          <span>${currentLang==='en'?'Copy link':'Copiar enlace'}</span>
        </button>
        <span class="detail-share-status" role="status" aria-live="polite"></span>
        <input class="detail-share-link hidden" type="text" readonly aria-label="${currentLang==='en'?'Vehicle link':'Enlace del vehículo'}" />
      </div>
      <div class="detail-layout">
        <div class="detail-main-column">
      <!-- TOP GRID: Gallery (Left), Auction & Pricing (Center), Bidding Sidebar (Right) -->
      <div class="detail-top-grid">
        <!-- Gallery Column -->
        <div class="detail-gallery-col">
          <div class="detail-gallery" id="detail-gallery">
            <div class="detail-gallery-main" id="detail-gallery-main">
              <button class="gallery-arrow prev" id="gallery-prev-btn" type="button" aria-label="${t('previousPhoto')}">‹</button>
              ${coverImage ? `<img id="detail-main-image" src="${esc(coverImage)}" alt="${esc(v.title)}" />` : `<div class="image-fallback">${t('noPhoto')}</div>`}
              <button class="gallery-arrow next" id="gallery-next-btn" type="button" aria-label="${t('nextPhoto')}">›</button>
              <button type="button" class="gallery-enlarge" data-enlarge-photo>${currentLang==='en'?'Enlarge photo':'Ampliar foto'}</button>
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
              <h3>${t('auctionHeading')}</h3>${favoriteButton(v.lot)}
            </div>
            <div class="detail-card-grid">
              <button type="button" class="btn btn-ghost btn-small" data-member-history="${esc(v.lot)}">${currentLang==='en'?'Request vehicle history':'Solicitar historial elaborado por APV'}</button>
              <div class="detail-card-row"><span>VIN</span><strong>${vinQuickSpecValue(v)}</strong></div>
              <div class="detail-card-row"><span>${t('lot')}</span><strong>${esc(v.lot)}</strong></div>
              <div class="detail-card-row"><span>${t('detailComplete0')}</span><strong>${esc(dateLabel(v.saleDate, v.timeZone))}</strong></div>
              <div class="detail-card-row"><span>${t('detailComplete1')}</span><strong>${esc(v.yardName || 'Copart Yard')}</strong></div>
              <div class="detail-card-row"><span>${t('detailComplete2')}</span><strong>${esc(locationLabel(v))}</strong></div>
              <div class="detail-card-row"><span>${t('detailComplete3')}</span><strong>${esc(v.sellerName || 'Copart Seller')}</strong></div>
            </div>
          </div>

          <div class="detail-card">
            <div class="detail-card-header">
              <span class="detail-card-icon">🧰</span>
              <h3>${t('priceHeading')}</h3>
            </div>
            <div class="detail-card-grid">
              <div class="detail-card-row"><span>${t('detailComplete4')}</span><strong>${esc(money(v.retailValue))}</strong></div>
              ${hasBuyNow ? `<div class="detail-card-row"><span>${t('detailComplete5')}</span><strong>${esc(cardPrice(v.buyNow))}</strong></div>` : ''}
              <div class="detail-card-row"><span>${t('detailComplete6')}</span><strong>${esc(v.saleStatus || (currentLang==='en'?"Active auction":"Subasta activa"))}</strong></div>
              <div class="detail-card-row"><span>${t('detailComplete7')}</span><strong>${esc(v.saleStatus || (currentLang==='en'?"Bidding enabled":"Pujas habilitadas"))}</strong></div>
            </div>
          </div>
        </div>

      </div>

      <!-- MIDDLE GRID: Damage Card (Left) & Vehicle Info Card (Right) -->
      <div class="detail-mid-grid">
        <div class="detail-card">
          <div class="detail-card-header">
            <span class="detail-card-icon">🛠️</span>
            <h3>${t('damageHeading')}</h3>
          </div>
          <div class="detail-card-grid two-col">
            <div class="detail-card-row"><span>${t('detailComplete8')}</span><strong>${esc(v.primaryDamage || 'N/D')}</strong></div>
            <div class="detail-card-row"><span>${t('detailComplete9')}</span><strong>${esc(v.secondaryDamage || 'N/D')}</strong></div>
            <div class="detail-card-row"><span>${t('detailComplete10')}</span><strong>${esc(conditionLabel(v.runsDrives))}</strong></div>
            <div class="detail-card-row"><span>${t('detailComplete11')}</span><strong>${esc(titleDoc(v))}</strong></div>
          </div>
        </div>

        <div class="detail-card">
          <div class="detail-card-header">
            <span class="detail-card-icon">⚙️</span>
            <h3>${t('infoHeading')}</h3>
          </div>
          <div class="detail-card-grid two-col">
            <div class="detail-card-row"><span>${t('detailComplete12')}</span><strong>${miles(v.odometer)}</strong></div>
            <div class="detail-card-row"><span>${t('detailComplete13')}</span><strong>${v.hasKeys === 'YES' ? (currentLang==='en'?"Yes":"Sí") : (currentLang==='en'?"No / N/A":"No / N/D")}</strong></div>
            <div class="detail-card-row"><span>${t('detailComplete14')}</span><strong>${v.cylinders ? `${v.cylinders} cyl` : 'N/D'}</strong></div>
            <div class="detail-card-row"><span>${t('detailComplete15')}</span><strong>${esc(v.engine || 'N/D')}</strong></div>
            <div class="detail-card-row"><span>${t('detailComplete16')}</span><strong>${esc(v.drive || 'N/D')}</strong></div>
            <div class="detail-card-row"><span>${t('detailComplete17')}</span><strong>${esc(v.transmission || 'N/D')}</strong></div>
          </div>
        </div>
      </div>
        </div>
        <!-- Right Bidding Sidebar Column -->
        <div class="detail-right-col">
          <div class="bidding-action-card">

            <div class="bidding-current-bid">
              <span class="bid-label">${t('auctionCurrentBid').toUpperCase()}</span>
              <h2 class="bid-amount">${esc(cardPrice(v.currentBid))} USD</h2>
            </div>
            <button class="btn btn-primary btn-bid-now" data-detail-bid>
              🔨 ${t('wantToBid')}
            </button>
            <p class="bidding-disclaimer">${t('asIs')}</p>
          </div>
          ${renderCalculatorHTML(v)}
        </div>
      </div>

    `;

    if (state.user) {
      updateCalculatorResults($('#calc-bid-input')?.value || 0);
    }
    window.APVDisplay?.clean(dom.vehicleDetail,currentLang);
    document.dispatchEvent(new Event('apv:detail'));
    setupGalleryNavigation();
    positionMobileBidCard();
  }

  const mobileDetailQuery=window.matchMedia('(max-width: 640px)');
  function positionMobileBidCard(){
    const card=$('.bidding-action-card',dom.vehicleDetail);
    const parent=$(mobileDetailQuery.matches?'.detail-gallery-col':'.detail-right-col',dom.vehicleDetail);
    if(!card||!parent)return;
    if(mobileDetailQuery.matches)parent.append(card);
    else parent.prepend(card);
  }
  mobileDetailQuery.addEventListener('change',positionMobileBidCard);

  const photoViewer=document.createElement('dialog');
  photoViewer.className='photo-viewer';
  photoViewer.innerHTML='<button type="button" class="photo-viewer-close">×</button><button type="button" class="photo-viewer-zoom">+</button><span class="photo-viewer-count" aria-live="polite"></span><button type="button" class="photo-viewer-prev">‹</button><div class="photo-viewer-stage"><img alt="" /></div><button type="button" class="photo-viewer-next">›</button>';
  document.body.append(photoViewer);
  function syncPhotoViewer(){
    const source=$('#detail-main-image');
    const image=$('img',photoViewer);
    const changed=image.getAttribute('src')!==(source?.src||'');
    image.src=source?.src||''; image.alt=state.currentVehicle?.title||'';
    if(changed || !photoViewer.open)setPhotoZoom(false);
    const count=$$('.gallery-thumb',dom.vehicleDetail).length;
    $('.photo-viewer-count',photoViewer).textContent=`${(state.currentPhotoIdx||0)+1} / ${count||1}`;
    for(const button of $$('.photo-viewer-prev,.photo-viewer-next',photoViewer))button.disabled=count<2;
    photoViewer.setAttribute('aria-label',state.currentVehicle?.title||t('photo'));
    $('.photo-viewer-close',photoViewer).ariaLabel=t('close');
    $('.photo-viewer-prev',photoViewer).ariaLabel=t('previousPhoto');
    $('.photo-viewer-next',photoViewer).ariaLabel=t('nextPhoto');
  }
  function setPhotoZoom(zoomed){
    photoViewer.classList.toggle('is-zoomed',zoomed);
    const button=$('.photo-viewer-zoom',photoViewer);
    button.textContent=zoomed?'−':'+';
    button.setAttribute('aria-label',currentLang==='en'?(zoomed?'Zoom out':'Zoom in'):(zoomed?'Reducir foto':'Acercar foto'));
    button.setAttribute('aria-pressed',String(zoomed));
    const stage=$('.photo-viewer-stage',photoViewer);stage.scrollTop=0;stage.scrollLeft=0;
  }
  function openPhotoViewer(){if(!$('#detail-main-image'))return;syncPhotoViewer();photoViewer.showModal();}
  photoViewer.addEventListener('click',e=>{
    if(e.target.closest('.photo-viewer-zoom'))setPhotoZoom(!photoViewer.classList.contains('is-zoomed'));
    if(e.target===photoViewer || e.target.closest('.photo-viewer-close'))photoViewer.close();
    if(e.target.closest('.photo-viewer-prev'))selectGalleryPhoto(state.currentPhotoIdx-1);
    if(e.target.closest('.photo-viewer-next'))selectGalleryPhoto(state.currentPhotoIdx+1);
  });
  $('.photo-viewer-stage',photoViewer).addEventListener('dblclick',()=>setPhotoZoom(!photoViewer.classList.contains('is-zoomed')));
  let photoTouch=null;
  photoViewer.addEventListener('touchstart',e=>{photoTouch=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
  photoViewer.addEventListener('touchend',e=>{
    if(photoTouch && !photoViewer.classList.contains('is-zoomed') && e.changedTouches.length===1){
      const dx=e.changedTouches[0].clientX-photoTouch.x,dy=e.changedTouches[0].clientY-photoTouch.y;
      if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)*1.5)selectGalleryPhoto(state.currentPhotoIdx+(dx<0?1:-1));
    }
    photoTouch=null;
  },{passive:true});
  photoViewer.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='ArrowLeft'){e.preventDefault();selectGalleryPhoto(state.currentPhotoIdx-1);}
    if(e.key==='ArrowRight'){e.preventDefault();selectGalleryPhoto(state.currentPhotoIdx+1);}
  });

  async function loadGallery(lot) {
    try {
      const data=await api('/api/vehicles/'+encodeURIComponent(lot)+'/images');
      if(String(state.currentVehicle?.lot)!==String(lot)) return;
      state.galleryImages=data.images || [];
      window.APVDisplay?.clean(dom.vehicleDetail,currentLang);
    document.dispatchEvent(new Event('apv:detail'));
    setupGalleryNavigation();
    } catch(err) { if(String(state.currentVehicle?.lot)===String(lot)) showToast((currentLang==='en'?"Photos could not load. Please reopen the vehicle.":"No se pudieron cargar las fotos. Intenta abrir el vehículo de nuevo.")); }
  }
  function selectGalleryPhoto(index) {
    const buttons=$$('.gallery-thumb',dom.vehicleDetail);
    if(!buttons.length) return;
    state.currentPhotoIdx=(index+buttons.length)%buttons.length;
    const img=$('#detail-main-image');
    if(img) img.src=buttons[state.currentPhotoIdx].dataset.gallerySrc;
    if(photoViewer.open)syncPhotoViewer();
    buttons.forEach((b,i)=>b.classList.toggle('active',i===state.currentPhotoIdx));
  }

  function setupGalleryNavigation(){
    const thumbs = $('#detail-gallery-thumbs');
    const main = $('#detail-main-image');
    const count = $('#detail-photo-count');
    const allGrid = $('#detail-all-grid');
    const allCount = $('#detail-all-count');

    if(!thumbs||!count) return;
    const fallbackCover = state.currentVehicle && state.currentVehicle.image ? [state.currentVehicle.image.replace(/_thb\./i, '_ful.')] : [];
    const finalImages=state.galleryImages.length ? state.galleryImages : fallbackCover;
    const label=`${finalImages.length} ${finalImages.length===1?'foto':'fotos'}`;
    count.textContent=label;
    if(allCount) allCount.textContent=label;
    if(!finalImages.length){ thumbs.innerHTML=''; if(allGrid) allGrid.innerHTML='<div class="photo-empty">No hay fotos disponibles para este lote.</div>'; return; }
    state.currentPhotoIdx=Math.max(0,finalImages.indexOf(main?.src));
    if(main) main.src=finalImages[state.currentPhotoIdx];
    else { const img=document.createElement('img'); img.id='detail-main-image'; img.alt=state.currentVehicle?.title||''; img.src=finalImages[0]; $('#detail-gallery-main .image-fallback')?.replaceWith(img); }
    $('#gallery-prev-btn').disabled=finalImages.length<2;
    $('#gallery-next-btn').disabled=finalImages.length<2;
    thumbs.innerHTML=finalImages.map((src,i)=>`<button class="gallery-thumb ${i===state.currentPhotoIdx?'active':''}" data-gallery-src="${esc(src)}" aria-label="Ver foto ${i+1}"><img src="${esc(src)}" alt="Foto ${i+1} de ${esc(state.currentVehicle?.title||'')}" loading="lazy" /></button>`).join('');
    if(photoViewer.open)syncPhotoViewer();
    if(allGrid) allGrid.innerHTML=finalImages.map((src,i)=>`<button type="button" data-gallery-src="${esc(src)}" aria-label="Ampliar foto ${i+1}"><img src="${esc(src)}" alt="Foto ${i+1} de ${esc(state.currentVehicle?.title||'')}" loading="lazy" /></button>`).join('');
  }

  function closeDetail(changeUrl=true){
    if(photoViewer.open)photoViewer.close();
    dom.vehicleOverlay.classList.add('hidden');
    if(dom.bidOverlay.classList.contains('hidden')&&dom.authOverlay.classList.contains('hidden')) document.body.style.overflow='';
    if(changeUrl && location.pathname.startsWith('/vehiculo/')) history.pushState({},'',location.pathname.replace(/\/vehiculo\/[^/]+/,'/catalogo')+location.search+location.hash);
  }

  function setAuthStatus(message, kind='error'){
    if(!message){ dom.authStatus.classList.add('hidden'); dom.authStatus.textContent=''; return; }
    dom.authStatus.textContent=message; dom.authStatus.dataset.kind=kind; dom.authStatus.classList.remove('hidden');
  }

  function openAuth(reason, action, initialTab = 'login', directRegistration = false){
    state.pendingAuthAction=action||null;
    const modal = dom.authOverlay.querySelector('.auth-modal');
    modal.classList.toggle('registration-direct', directRegistration);
    modal.classList.remove('verification-pending');
    dom.authTitle.textContent=directRegistration?t('registerDirectTitle'):t('authTitle');
    dom.authReason.textContent=reason||t('authReason');
    switchAuthTab(initialTab);
    setAuthStatus('');
    dom.authOverlay.classList.remove('hidden');
    dom.authOverlay.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    requestAnimationFrame(()=>dom.authOverlay.querySelector('form:not(.hidden) input:not([type="hidden"])')?.focus());
  }

  function closeAuth(clearPending=true){
    dom.authOverlay.classList.add('hidden');
    dom.authOverlay.setAttribute('aria-hidden','true');
    if(clearPending) state.pendingAuthAction=null;
    if(dom.bidOverlay.classList.contains('hidden')&&dom.vehicleOverlay.classList.contains('hidden')) document.body.style.overflow='';
  }

  window.APVAuth={open:openAuth,close:closeAuth};
  window.openAPVAuth=function(reason){ openAuth(reason||(currentLang==='en'?"Log in to recover your conversations and access the full VIN.":"Inicia sesión para recuperar tus conversaciones y acceder al VIN completo.")); return false; };
  window.closeAPVAuth=function(){ closeAuth(); return false; };

  function switchAuthTab(tab){
    const modal=dom.authOverlay.querySelector('.auth-modal');
    $('.auth-tabs',dom.authOverlay).classList.remove('hidden');
    modal.classList.remove('verification-pending');
    dom.authTitle.textContent=modal.classList.contains('registration-direct')&&tab==='register'?t('registerDirectTitle'):t('authTitle');
    $$('[data-auth-tab]').forEach(b=>b.classList.toggle('active',b.dataset.authTab===tab));
    $('#login-form').classList.toggle('hidden',tab!=='login');
    $('#register-form').classList.toggle('hidden',tab!=='register');
    $('#verify-form').classList.add('hidden');
    setAuthStatus('');
  }

  function applyUser(user){
    state.user=user||null;
    syncHeroOrder();
    $('#hero-registration')?.classList.toggle('hidden',Boolean(user));
    window.apvMembership?.setUser(user);
    state.accountFavorites=[];
    state.favoritesReady=user?loadAccountFavorites():Promise.resolve();
    refreshFavoriteButtons();
    if(!user && state.favoritesOnly) clearFilters();
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

  async function completeAuth(user, registered = false){
    const action=state.pendingAuthAction;
    applyUser(user); closeAuth(false); state.pendingAuthAction=null;
    showToast(`Bienvenido, ${user.name.split(' ')[0]}.`);
    await state.favoritesReady;
    await loadVehicles();
    if (registered && !['subscription','member-service','bid'].includes(action?.type)) await window.apvMembership?.prompt('registration');
    if(action&&action.type==='bid'){
      try{ await openBid(await getVehicle(action.lot), action.amount); }catch(err){ showToast(err.message); }
    }else if(action&&action.type==='favorite'){
      if(!readFavorites().includes(action.lot)) await toggleFavorite(action.lot);
    }else if(action&&['subscription','member-service'].includes(action.type)){
      try {await window.apvMembership?.resume(action);} catch(err){showToast(err.message);}
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
      const d=await api('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...window.APVTracking?.payload(),email:$('#login-email').value,password:$('#login-password').value})});
      await completeAuth(d.user);
    }catch(err){ setAuthStatus(err.message); }
    finally{ button.disabled=false; }
  }

  async function submitRegister(e){
    window.APVTracking?.track('start_registration');
    e.preventDefault(); setAuthStatus('');
    const inline=e.currentTarget.id==='hero-register-form';
    const prefix=inline?'hero-register':'register';
    const status=$('#hero-register-status');
    if(inline){ status.classList.add('hidden'); status.textContent=''; }
    const button=e.currentTarget.querySelector('button[type=submit]'); button.disabled=true;
    const email = $(`#${prefix}-email`).value.trim();
    const countryCode = $(`#${prefix}-country-code`)?.value || '+1';
    const rawPhone = $(`#${prefix}-phone`).value.trim();
    const phone = rawPhone.startsWith('+') ? rawPhone : `${countryCode} ${rawPhone}`;

    try{
      const d=await api('/api/auth/register-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...window.APVTracking?.payload(),name:$(`#${prefix}-name`).value,email,phone,password:$(`#${prefix}-password`).value})});
      if(inline) openAuth(t('checkEmailReason'),null,'register',true);
      state.inlineRegistration=inline;
      state.pendingVerifyEmail = email;
      dom.authOverlay.querySelector('.auth-modal').classList.add('verification-pending');
      dom.authTitle.textContent=t('checkEmailTitle');
      dom.authReason.textContent=t('checkEmailReason');
      $('.auth-tabs',dom.authOverlay).classList.add('hidden');
      $('#register-form').classList.add('hidden');
      $('#login-form').classList.add('hidden');
      $('#verify-form').classList.remove('hidden');
      $('#verify-code').value='';
      if ($('#verify-target-email')) $('#verify-target-email').textContent = email;
      if (d.devCode) {
        $('#verify-code').value = d.devCode;
        setAuthStatus(`Código enviado a tu correo. (Desarrollo: ${d.devCode})`, 'info');
      }
      showToast(d.message || (currentLang==='en'?"6-digit code sent.":"Código de 6 dígitos enviado."));
      requestAnimationFrame(()=>$('#verify-code')?.focus());
    }catch(err){
      if(inline){ status.textContent=err.message; status.dataset.kind='error'; status.classList.remove('hidden'); }
      else setAuthStatus(err.message);
    }
    finally{ button.disabled=false; }
  }

  async function submitVerify(e){
    e.preventDefault(); setAuthStatus('');
    const button=e.currentTarget.querySelector('button[type=submit]'); button.disabled=true;
    try{
      const d=await api('/api/auth/verify-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...window.APVTracking?.payload(),email: state.pendingVerifyEmail || $('#register-email').value, code:$('#verify-code').value.trim()})});
      window.APVTracking?.track('complete_registration',{},d.eventId);
      await completeAuth(d.user, true);
    }catch(err){ setAuthStatus(err.message); }
    finally{ button.disabled=false; }
  }

  async function initAuth(){
    try{
      const [cfg, me] = await Promise.all([api('/api/config').catch(() => ({})), api('/api/auth/me')]);
      state.config = cfg;
      const debugPanel = document.querySelector('.kommo-debug-panel');
      if (debugPanel) {
        if (cfg && cfg.debugKommo) {
          debugPanel.classList.remove('hidden');
        } else {
          debugPanel.classList.add('hidden');
        }
      }
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
            <span>Copart fees (${autoVehicle === 'heavy' ? (currentLang==='en'?"Heavy vehicle":"Vehículo Pesado") : (currentLang==='en'?"Standard":"Estándar")})</span>
            <strong>${money(breakdown.totalCopartFees)}</strong>
          </div>
          <div class="bid-mini-row">
            <span>${t('detailComplete29')}</span>
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
            <small class="bid-total-sub">${t('detailComplete30')}</small>
          </div>
          <strong class="bid-total-amount">${money(breakdown.total)} USD</strong>
        </div>
      </div>
    `;
  }

  async function openBid(v, initialAmount){
    if(!state.user){ openAuth((currentLang==='en'?"Create an account or log in to request a bid. Your account keeps your chat history across devices.":"Crea tu cuenta o inicia sesión para solicitar la puja. Tu cuenta mantiene el historial de Kommo entre dispositivos."),{type:'bid',lot:v.lot,amount:initialAmount}); return; }
    if (window.apvMembership && !await window.apvMembership.prompt('bid')) return;
    try{ if(!v.vin) v=await getVehicle(v.lot); }catch(_){}
    state.currentVehicle=v; closeDetail(false); dom.bidModal?.classList.remove('chat-mode');
    const startVal = initialAmount ? Number(initialAmount) : '';
    dom.bidAmount.value = startVal ? String(startVal) : '';
    updateBidCostPreview(startVal);
    dom.bidAmountStep.classList.remove('hidden'); dom.bidChatStep.classList.add('hidden'); dom.kommoFallback.classList.remove('hidden');
    dom.bidVehicleMini.innerHTML=`<div class="thumb" ${imageStyle(v.image)}></div><div><h4>${esc(v.title)}</h4><p>Lote ${esc(v.lot)} · VIN ${esc(v.vin||'N/D')}</p><p>Puja actual ${esc(cardPrice(v.currentBid))} · Retail ${esc(money(v.retailValue))}</p></div>`;
    dom.bidOverlay.classList.remove('hidden'); document.body.style.overflow='hidden'; syncChatReopenButton(); setTimeout(()=>dom.bidAmount.focus(),100);
  }

  function closeBid(){ dom.bidOverlay.classList.add('hidden'); dom.bidModal?.classList.remove('chat-mode'); syncChatReopenButton(); if(dom.vehicleOverlay.classList.contains('hidden')&&dom.authOverlay.classList.contains('hidden')) document.body.style.overflow=''; }

  async function continueBid(){
    if(!state.user){ closeBid(); openAuth((currentLang==='en'?"Log in before opening the chat with APV Motors.":"Debes iniciar sesión antes de abrir el chat con APV Motors."),state.currentVehicle?{type:'bid',lot:state.currentVehicle.lot}:null); return; }
    const v=state.currentVehicle, amount=Number(dom.bidAmount.value||0); if(!v||amount<=0){ showToast((currentLang==='en'?"Enter a valid maximum bid.":"Indica un tope de puja válido.")); dom.bidAmount.focus(); return; }
    try{ const result=await api('/api/bid-intents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...window.APVTracking?.payload(),lot:v.lot,maxBid:amount})});window.APVTracking?.track('bid_request',{lote:String(v.lot)},result.eventId); }catch(err){ if(err.status===401){ closeBid(); openAuth((currentLang==='en'?"Your session expired. Please log in again.":"Tu sesión expiró. Vuelve a iniciar sesión."),{type:'bid',lot:v.lot}); return; } }
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
    const result=canSend ? window.apvKommo.sendBidContext(v,amount,state.user,getUserBidsHistory()) : {ok:false,botParams:{vehicle_message:message},error:(currentLang==='en'?"The chat module could not load.":"El módulo Kommo de la página no cargó.")};
    if(result.ok && result.ready){ dom.kommoFallback.classList.add('hidden'); }
    else{
      dom.kommoFallback.classList.remove('hidden');
      dom.fallbackPayload.textContent='Mensaje preparado para Kommo:\n\n'+message;
      const fallbackCopy = $('#fallback-copy');
      if (fallbackCopy) fallbackCopy.textContent='Preparando tu solicitud con APV Motors…';
    }

    if(statusText) statusText.textContent=(currentLang==='en'?"Open or continue the conversation to link your request.":"Abre o continúa la conversación para asociar la solicitud.");
    if(statusChip) statusChip.textContent='ESPERANDO CHAT';
  }

  async function reopenLastChat(){
    if(!state.user){ openAuth((currentLang==='en'?"Log in to recover your chat conversation.":"Inicia sesión para recuperar tu conversación de Kommo.")); return; }
    const saved=readChatMemory();
    if(!saved||saved.userId!==state.user.kommoUserId){ showToast((currentLang==='en'?"There is no saved conversation for this account yet.":"Todavía no hay una conversación guardada para esta cuenta.")); syncChatReopenButton(); return; }
    try{
      const v=await getVehicle(saved.lot);
      state.currentVehicle=v;
      renderConversationSelector();
      dom.bidAmountStep.classList.add('hidden');
      dom.bidChatStep.classList.remove('hidden');
      dom.bidModal?.classList.add('chat-mode');
      if (dom.chatContext) dom.chatContext.innerHTML=`<div><strong>${esc(v.title)}</strong><br><span>Lote ${esc(v.lot)} · VIN ${esc(v.vin||'N/D')}</span></div><div><span>${currentLang==='en'?'Conversation':'Conversación'}</span><br><strong>${currentLang==='en'?'Saved in Kommo':'Guardada en Kommo'}</strong></div>`;
      const message=(window.apvKommo&&typeof window.apvKommo.buildVehicleMessage==='function')?window.apvKommo.buildVehicleMessage(v):`Vehículo: ${v.title}\nVIN: ${v.vin||'N/D'}`;
      dom.autoMessagePreview.textContent=message;
      dom.fallbackPayload.textContent='Recuperando la conversación del vehículo\n\n'+message;
      $('#fallback-copy').textContent=(currentLang==='en'?"Recovering your chat conversation\u2026":"Recuperando tu conversación de Kommo…");
      dom.kommoFallback.classList.remove('hidden');
      dom.bidOverlay.classList.remove('hidden'); document.body.style.overflow='hidden'; syncChatReopenButton();

      const api=window.apvKommo;
      if(api&&!api.__bootstrapOnly&&typeof api.reopenConversation==='function'){
        const result=api.reopenConversation(v,state.user);
        if(result.ok&&result.ready) dom.kommoFallback.classList.remove('hidden');
      }else{
        $('#fallback-copy').textContent=(currentLang==='en'?"The chat module did not load. Use \u201cCopy diagnostics\u201d for details.":"El módulo Kommo no cargó. Usa “Copiar diagnóstico” para ver la causa.");
      }
    }catch(err){ showToast('No se pudo recuperar el chat: '+err.message); }
  }

  function clearFilters(reload=true){
    const url=new URL(location.href);url.searchParams.delete('priceMin');url.searchParams.delete('priceMax');history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    $('#favorites-heading').classList.add('hidden');
    $('#my-favorites-button').setAttribute('aria-pressed','false');
    dom.search.value=''; dom.make.value=''; dom.model.value=''; updateCatalogModels(); dom.runDrive.checked=false; state.favoritesOnly=false; dom.heroRunDrive.checked=false; dom.heroFilterBuyNow.checked=false; dom.heroFilterMake.value=''; updateHeroModels(''); dom.heroSearchInput.value=''; dom.heroFilterState.value=''; setYearRange(dom.yearMin.min,dom.yearMax.max); dom.damage.value=''; dom.run.value=''; dom.state.value=''; dom.city.value=''; dom.zip.value=''; dom.cleanTitle.checked=false; dom.limitOdometer.checked=false; updateCities(); stickyInput.value=''; dom.buyNow.checked=false; dom.sort.value='auto';
    if(state.filters){ setYearRange(dom.yearMin.min,dom.yearMax.max); dom.odometer.value=0; updateOdometerLabel(); }
    state.page=1; if(reload) loadVehicles();
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
    const copyVin=e.target.closest('[data-copy-vin]');
    if(copyVin){
      try{await navigator.clipboard.writeText(copyVin.dataset.copyVin);showToast(currentLang==='en'?'VIN copied':'VIN copiado');}
      catch{const range=document.createRange();range.selectNodeContents(copyVin.previousElementSibling);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);showToast(currentLang==='en'?'Select and copy the VIN':'Selecciona y copia el VIN');}
      return;
    }
    if(e.target.closest('#detail-main-image, [data-enlarge-photo]')){openPhotoViewer();return;}

    const share=e.target.closest('[data-share-vehicle]');
    if(share){
      const link=new URL('/vehiculo/'+encodeURIComponent(share.dataset.shareVehicle),location.origin).href;
      const fallback=$('.detail-share-link',dom.vehicleDetail);
      try{
        await navigator.clipboard.writeText(link);
        $('.detail-share-status',dom.vehicleDetail).textContent=currentLang==='en'?'✓ Link copied':'✓ Enlace copiado';
        fallback.classList.add('hidden');
        showToast(currentLang==='en'?'Link copied. Ready to share.':'Enlace copiado. Ya puedes compartirlo.');
      }catch{
        $('.detail-share-status',dom.vehicleDetail).textContent=currentLang==='en'?'Select and copy the link below.':'Selecciona y copia el enlace de abajo.';
        fallback.value=link;
        fallback.classList.remove('hidden');
        fallback.focus();
        fallback.select();
        showToast(currentLang==='en'?'Copy the selected link to share it.':'Copia el enlace seleccionado para compartirlo.');
      }
      return;
    }
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

    const authCalc = e.target.closest('[data-auth-calc]');
    if (authCalc) {
      openAuth((currentLang==='en'?"Sign up or log in to use the cost calculator.":"Regístrate o inicia sesión para usar la calculadora de costos."), { type: 'calc', lot: authCalc.dataset.authCalc });
      return;
    }

    const proceedBtn = e.target.closest('#calc-proceed-bid');
    if (proceedBtn && state.currentVehicle) {
      const amount = Number(proceedBtn.dataset.calcBidVal || 0);
      await openBid(state.currentVehicle, amount);
      return;
    }

    if(e.target.closest('#gallery-prev-btn')) { selectGalleryPhoto(state.currentPhotoIdx-1); return; }
    if(e.target.closest('#gallery-next-btn')) { selectGalleryPhoto(state.currentPhotoIdx+1); return; }
    const thumb=e.target.closest('[data-gallery-src]');
    if(thumb){ selectGalleryPhoto($$('.gallery-thumb',dom.vehicleDetail).findIndex(b=>b.dataset.gallerySrc===thumb.dataset.gallerySrc)); return; }
    if(e.target.closest('[data-detail-bid]')&&state.currentVehicle){ await openBid(state.currentVehicle); return; }
    if(e.target.closest('[data-auth-vin]')&&state.currentVehicle){ openAuth((currentLang==='en'?"Sign up or log in to reveal the full VIN.":"Regístrate o inicia sesión para revelar el VIN completo."),{type:'vin',lot:state.currentVehicle.lot}); return; }
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
      else if(info.status==='loaded'){ copy.textContent=(currentLang==='en'?"Starting chat\u2026":"Kommo cargó. Inicializando el chat…"); if(statusText) statusText.textContent=(currentLang==='en'?"Chat script loaded; waiting for the chat to be ready\u2026":"button.js cargó; esperando onChatReady…"); }
      else if(info.status==='ready'){ if(statusText) statusText.textContent='Chat de Kommo listo'; }
      else if(info.status==='error'){ copy.textContent=(currentLang==='en'?"Could not connect to chat. Verify that this domain is authorized in Website Chat Button, then press Retry connection.":"No se pudo conectar con Kommo. Revisa que este dominio esté autorizado en Website Chat Button y pulsa Reintentar conexión."); if(statusText) statusText.textContent=(currentLang==='en'?"Chat reported a connection error":"Kommo reportó un error de conexión"); }
    });
  }
  if(window.apvKommo && typeof window.apvKommo.onSync==='function'){
    window.apvKommo.onSync(info=>{
      const statusText=$('#kommo-status-text');
      const statusChip=$('#kommo-status-chip');
      if(info.ok && !info.pendingChat){
        if(statusText) statusText.textContent=(currentLang==='en'?"Request linked to this conversation":"Solicitud asociada a esta conversación");
        if(statusChip) statusChip.textContent='COMPLETADO';
        const copy=$('#fallback-copy'); if(copy) copy.textContent=(currentLang==='en'?"Request submitted successfully.":"Solicitud registrada con éxito.");
      }else if(info.pendingChat){
        if(statusText) statusText.textContent=(currentLang==='en'?"Waiting for the conversation to appear\u2026":"Esperando que la conversación aparezca en Kommo…");
        if(statusChip) statusChip.textContent='ESPERANDO CHAT';
      }
    });
  }
  $('#kommo-retry')?.addEventListener('click',()=>{
    if(window.apvKommo?.retry && !window.apvKommo.__bootstrapOnly){
      $('#fallback-copy').textContent=(currentLang==='en'?"Retrying chat connection\u2026":"Reintentando conexión con Kommo…");
      window.apvKommo.retry();
    }else{
      $('#fallback-copy').textContent='El archivo /kommo.js no cargó. Recarga la v8 y comprueba el diagnóstico.';
    }
  });
  $('#kommo-sync-crm')?.addEventListener('click',()=>{
    const api=window.apvKommo;
    if(!api||api.__bootstrapOnly||typeof api.syncCrmNow!=='function'){
      const statusText=$('#kommo-status-text'); if(statusText) statusText.textContent=(currentLang==='en'?"Unable to sync: chat module unavailable.":"No se puede sincronizar: módulo Kommo no disponible.");
      showToast((currentLang==='en'?"Chat module unavailable.":"Módulo Kommo no disponible."));
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
    try{ await navigator.clipboard.writeText(payload); showToast((currentLang==='en'?"Diagnostics displayed and copied.":"Diagnóstico visible y copiado.")); }
    catch(_){ console.info('[APV Kommo diagnóstico]',diag); showToast((currentLang==='en'?"Diagnostics displayed below the chat.":"Diagnóstico visible debajo del chat.")); }
  });
  dom.chatReopenButton?.addEventListener('click',reopenLastChat);

  document.addEventListener('click',e=>{
    const opener=e.target.closest('[data-open-auth]');
    if(opener){ e.preventDefault(); openAuth((currentLang==='en'?"Log in to recover your conversations and access the full VIN.":"Inicia sesión para recuperar tus conversaciones y acceder al VIN completo.")); return; }
  },true);
  const accountToggle = $('#account-menu-toggle'), accountMenu = $('#account-menu');
  function closeAccountMenu(restoreFocus = false){
    accountMenu.classList.add('hidden');
    accountToggle.setAttribute('aria-expanded','false');
    if(restoreFocus) accountToggle.focus();
  }
  accountToggle.addEventListener('click',()=>{
    const open = accountToggle.getAttribute('aria-expanded') !== 'true';
    accountToggle.setAttribute('aria-expanded',String(open));
    accountMenu.classList.toggle('hidden',!open);
  });
  document.addEventListener('click',e=>{
    if(!dom.accountChip.contains(e.target)) closeAccountMenu();
    else if(e.target.closest('#account-menu button')) closeAccountMenu();
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && accountToggle.getAttribute('aria-expanded')==='true'){
      e.preventDefault(); closeAccountMenu(true);
    }
  });
  dom.accountChip.addEventListener('focusout',e=>{
    if(!dom.accountChip.contains(e.relatedTarget)) closeAccountMenu();
  });
  function syncHeroOrder(){
    if(isHome) return;
    const hero=$('.hero-centered');
    const heading=$('.hero-header-center');
    const filters=$('.hero-filter-card-wrap');
    if(window.matchMedia('(max-width:768px)').matches && !state.user){
      hero.insertBefore(filters,heading);
    }else{
      heading.after(filters);
    }
  }
  window.matchMedia('(max-width:768px)').addEventListener('change',syncHeroOrder);
  syncHeroOrder();
  const stickySearch=$('#sticky-search');
  const stickyInput=$('#sticky-search-input');
  let stickyFrame=0;
  function syncStickySearch(){
    stickyFrame=0;
    const visible=true;
    stickySearch.classList.toggle('is-visible',visible);
    stickySearch.inert=!visible;
    stickySearch.setAttribute('aria-hidden',String(!visible));
  }
  function scheduleStickySearch(){
    if(!stickyFrame) stickyFrame=requestAnimationFrame(syncStickySearch);
  }
  window.addEventListener('scroll',scheduleStickySearch,{passive:true});
  window.addEventListener('resize',scheduleStickySearch);
  if(window.ResizeObserver && $('.hero-centered')) new ResizeObserver(scheduleStickySearch).observe($('.hero-centered'));
  stickySearch.addEventListener('submit',e=>{
    e.preventDefault();
    dom.heroSearchInput.value=stickyInput.value;
    heroSearchToCatalog(stickyInput.value);
  });
  dom.heroSearchInput.addEventListener('input',()=>{stickyInput.value=dom.heroSearchInput.value;});
  dom.search.addEventListener('input',()=>{stickyInput.value=dom.search.value;});
  scheduleStickySearch();
  $('#hero-register-form').addEventListener('submit',submitRegister);
  $('#hero-filters-toggle').addEventListener('click',()=>{
    const button=$('#hero-filters-toggle');
    const open=button.getAttribute('aria-expanded')!=='true';
    button.setAttribute('aria-expanded',String(open));
    $('#hero-filter-options').classList.toggle('hero-filters-open',open);
  });
  const header=$('.topbar');
  const syncHeaderHeight=()=>document.documentElement.style.setProperty('--header-height',header.getBoundingClientRect().height+'px');
  syncHeaderHeight();
  if(window.ResizeObserver)new ResizeObserver(syncHeaderHeight).observe(header);
  $('#logout-button').addEventListener('click',logout);
  $$('[data-auth-tab]').forEach(b=>b.addEventListener('click',()=>switchAuthTab(b.dataset.authTab)));
  $('#login-form').addEventListener('submit',submitLogin);
  $('#register-form').addEventListener('submit',submitRegister);
  $('#verify-form')?.addEventListener('submit',submitVerify);
  $('#verify-back')?.addEventListener('click',()=>{
    if(state.inlineRegistration){
      closeAuth();
      $('#hero-register-email').focus();
      return;
    }
    const modal=dom.authOverlay.querySelector('.auth-modal');
    modal.classList.remove('verification-pending');
    dom.authTitle.textContent=t('registerDirectTitle');
    dom.authReason.textContent=t('registerDirectReason');
    $('.auth-tabs',dom.authOverlay).classList.remove('hidden');
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
      openAuth((currentLang==='en'?"Log in to view your bids and conversations.":"Inicia sesión para ver tus pujas y conversaciones."));
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
      showToast((currentLang==='en'?"You have not submitted any bid requests yet.":"Aún no has enviado solicitudes de puja."));
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
      if (dom.chatContext) dom.chatContext.innerHTML = `<div><strong>${esc(v.title)}</strong><br><span>Lote ${esc(v.lot)} · VIN ${esc(v.vin || 'N/D')}</span></div><div><span>${currentLang==='en'?'Conversation':'Conversación'}</span><br><strong>${currentLang==='en'?'Saved in Kommo':'Guardada en Kommo'}</strong></div>`;
      rememberChat(v);
      if (window.apvKommo && typeof window.apvKommo.reopenConversation === 'function') {
        window.apvKommo.reopenConversation(v, state.user);
      }
    } catch (err) {
      showToast((currentLang==='en'?"Could not load the chat for this vehicle: ":"No se pudo cargar el chat de este vehículo: ") + err.message);
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
  dom.search.addEventListener('keydown',e=>{if(e.key==='Enter'){state.page=1;loadVehicles();}}); dom.sort.addEventListener('change',()=>{state.page=1;loadVehicles();});
  dom.make.addEventListener('change', updateCatalogModels);
  dom.runDrive.addEventListener('change',()=>{ if(dom.runDrive.checked) dom.run.value=''; });
  dom.run.addEventListener('change',()=>{ dom.runDrive.checked=false; });
  $('#my-favorites-button').addEventListener('click', showAccountFavorites);
  $('#exit-favorites').addEventListener('click',()=>clearFilters());
  $('#apply-filters').addEventListener('click',()=>{state.page=1;closeMobileFilters();loadVehicles();}); $('#clear-filters').addEventListener('click',clearFilters); $('#empty-clear').addEventListener('click',clearFilters); dom.odometer.addEventListener('input',()=>{dom.limitOdometer.checked=true;updateOdometerLabel();});
  const filtersHome = document.createComment('filters-home');
  dom.filtersPanel.before(filtersHome);
  let filtersScroll = '';
  function closeMobileFilters(){
    if(!dom.filtersPanel.classList.contains('mobile-open')) return;
    dom.filtersPanel.classList.remove('mobile-open');
    filtersHome.after(dom.filtersPanel);
    document.body.style.overflow = filtersScroll;
    $('#mobile-filter-button').setAttribute('aria-expanded','false');
    $('#mobile-filter-button').focus();
  }
  $('#mobile-filter-button').setAttribute('aria-controls','filters-panel');
  $('#mobile-filter-button').setAttribute('aria-expanded','false');
  $('#mobile-filter-button').addEventListener('click',()=>{
    filtersScroll = document.body.style.overflow;
    document.body.append(dom.filtersPanel);
    dom.filtersPanel.classList.add('mobile-open');
    dom.filtersPanel.scrollTop = 0;
    document.body.style.overflow = 'hidden';
    $('#mobile-filter-button').setAttribute('aria-expanded','true');
    $('#close-mobile-filters').focus();
  });
  $('#close-mobile-filters').addEventListener('click',closeMobileFilters);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileFilters();});
  window.matchMedia('(max-width: 768px)').addEventListener('change',e=>{if(!e.matches)closeMobileFilters();});

  if(dom.termsLinkBtn && dom.termsOverlay) {
    dom.termsLinkBtn.addEventListener('click', () => {
      dom.termsOverlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    });
  }
  if(dom.privacyLinkBtn && dom.privacyOverlay) {
    dom.privacyLinkBtn.addEventListener('click', () => {
      dom.privacyOverlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    });
  }
  $$('[data-close="terms"]').forEach(btn => btn.addEventListener('click', () => {
    dom.termsOverlay?.classList.add('hidden');
    if(dom.bidOverlay.classList.contains('hidden') && dom.authOverlay.classList.contains('hidden') && dom.vehicleOverlay.classList.contains('hidden')) document.body.style.overflow = '';
  }));
  $$('[data-close="privacy"]').forEach(btn => btn.addEventListener('click', () => {
    dom.privacyOverlay?.classList.add('hidden');
    if(dom.bidOverlay.classList.contains('hidden') && dom.authOverlay.classList.contains('hidden') && dom.vehicleOverlay.classList.contains('hidden')) document.body.style.overflow = '';
  }));
  [dom.termsOverlay, dom.privacyOverlay].forEach(overlay => {
    overlay?.addEventListener('click', (e) => {
      if(e.target === overlay) {
        overlay.classList.add('hidden');
        if(dom.bidOverlay.classList.contains('hidden') && dom.authOverlay.classList.contains('hidden') && dom.vehicleOverlay.classList.contains('hidden')) document.body.style.overflow = '';
      }
    });
  });

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(dom.termsOverlay && !dom.termsOverlay.classList.contains('hidden')) dom.termsOverlay.classList.add('hidden');
      else if(dom.privacyOverlay && !dom.privacyOverlay.classList.contains('hidden')) dom.privacyOverlay.classList.add('hidden');
      else if(!dom.authOverlay.classList.contains('hidden')) closeAuth();
      else if(!dom.bidOverlay.classList.contains('hidden')) closeBid();
      else if(!dom.vehicleOverlay.classList.contains('hidden')) closeDetail();
      if(dom.termsOverlay.classList.contains('hidden') && dom.privacyOverlay.classList.contains('hidden') && dom.bidOverlay.classList.contains('hidden') && dom.authOverlay.classList.contains('hidden') && dom.vehicleOverlay.classList.contains('hidden')) document.body.style.overflow = '';
    }
  });
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

  function initCookieBanner() {
    const banner = $('#cookie-banner');
    if (!banner) return;

    const consent = localStorage.getItem('apv_cookie_consent');
    if (!consent) {
      setTimeout(() => banner.classList.remove('hidden'), 500);
    }

    const acceptBtn = $('#cookie-accept-btn');
    const declineBtn = $('#cookie-decline-btn');

    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => {
        localStorage.setItem('apv_cookie_consent', 'all');
        window.apvStartAnalytics?.();
        banner.classList.add('hidden');
      });
    }

    if (declineBtn) {
      declineBtn.addEventListener('click', () => {
        localStorage.setItem('apv_cookie_consent', 'essential');
        banner.classList.add('hidden');
        if(window.apvAnalyticsStarted) location.reload();
      });
    }

    banner.addEventListener('click', (e) => {
      const termsBtn = e.target.closest('#cookie-terms-btn');
      const privacyBtn = e.target.closest('#cookie-privacy-btn');
      if (termsBtn && dom.termsOverlay) {
        dom.termsOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }
      if (privacyBtn && dom.privacyOverlay) {
        dom.privacyOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }
    });
  }

  window.apvMembership?.configure({
    notify: showToast,
    requireAuth: action=>{openAuth((currentLang==='en'?"Log in or create your free account to continue.":"Inicia sesión o crea tu cuenta gratis para continuar."),action);if(action.type==='subscription')switchAuthTab('register');},
    closeOverlays: ()=>{closeDetail(false);closeBid();},
    changed: membership=>{
      if(state.user) state.user.membership=membership;
      if($('#calc-bid-input')) updateCalculatorResults($('#calc-bid-input').value);
      if(!dom.bidOverlay.classList.contains('hidden')) updateBidCostPreview(dom.bidAmount.value);
    }
  });

  document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ') && e.target.matches('[data-action="detail"][role="button"]')){e.preventDefault();e.target.click();}});

  async function boot(){
    if(isHome && location.hash==='#catalogo'){location.replace('/catalogo'+location.search);return;}
    initMotionEffects();
    initCookieBanner();

    // Language Switcher Bindings
    $$('#lang-switch .lang-btn').forEach(btn => {
      btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
    });
    setLanguage(currentLang);

    // Render inventory without waiting for account/configuration or filter metadata.
    const featuredReady = document.body.classList.contains('catalog-page') ? Promise.resolve() : loadFeaturedVehicles();
    const entryQuery = new URLSearchParams(location.search);
    if(entryQuery.has('q')) { dom.search.value=entryQuery.get('q'); dom.heroSearchInput.value=dom.search.value; stickyInput.value=dom.search.value; }
    const hasEntryFilters=['make','model','state','yearMin','yearMax','runAndDrive','buyNowOnly'].some(key=>entryQuery.has(key));
    const inventoryReady = isHome || hasEntryFilters ? Promise.resolve() : loadVehicles();
    const authReady = initAuth();
    const filtersReady = initFilters().then(()=>{if(hasEntryFilters && !isHome) return loadVehicles();}).catch(e=>console.warn('[APV] Filters init note:',e));
    // Open shared vehicles independently of slower inventory, filters and login requests.
    const sharedMatch=location.pathname.match(/^\/vehiculo\/([^/]+)/);
    const detailReady=sharedMatch ? openDetail(decodeURIComponent(sharedMatch[1]),false) : Promise.resolve();
    await Promise.allSettled([authReady,detailReady]);
    if(sharedMatch && state.user && state.currentVehicle && !dom.vehicleOverlay.classList.contains('hidden')){
      // Refresh authenticated fields without replacing the vehicle selected by the visitor.
      await openDetail(state.currentVehicle.lot,false);
    }
    await Promise.allSettled([featuredReady,inventoryReady,filtersReady]);
    if(entryQuery.get('favorites')==='1' && state.user) await showAccountFavorites();
    if(entryQuery.get('login')==='1' && !state.user) openAuth();
    if(location.hash==='#terminos') dom.termsOverlay.classList.remove('hidden');
    if(location.hash==='#privacidad') dom.privacyOverlay.classList.remove('hidden');
  }
  boot();
})();
