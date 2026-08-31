(function () {
  'use strict';

  window.__APV_KOMMO_MODULE_STATE__ = 'module-evaluating';
  try { console.info('[APV Kommo] modulo v15.0.0 evaluando'); } catch (_) {}

  const KOMMO = {
    id: '1079929',
    hash: '6d8c62ca368a64df3bcc532f95d9deb45050e8ce2f5003d4dc7ab509c9e09889',
    locale: 'es',
    hook: 'apv_bid_request'
  };

  let currentUser = null;
  let chatReady = false;
  let chatShown = false;
  let loaderState = 'idle';
  let callbacksBound = false;
  let pendingBid = null;
  let lastBidContext = null;
  let activeChatKey = '';
  let lastHookResult = null;
  let lastConversations = null;
  let conversationsChangeCount = 0;
  let botParamsQueueCount = 0;
  let crmMetaQueueCount = 0;
  let lastMetaStage = '';
  let lastCrmPayload = null;
  let lastCrmMetaResult = null;
  let crmSyncAttempts = 0;
  let lastCrmSyncResults = [];
  let crmSyncTimers = [];
  const readyCallbacks = [];
  const statusCallbacks = [];

  function log() {
    try { console.info.apply(console, ['[APV Kommo]'].concat(Array.from(arguments))); } catch (_) {}
  }

  function setStatus(status, detail) {
    loaderState = status;
    log('status:', status, detail || '');
    statusCallbacks.forEach(function (cb) {
      try { cb({ status, detail: detail || '' }); } catch (_) {}
    });
  }

  function ensureOfficialBootstrapObjects() {
    // Replica el snippet oficial entregado por Kommo.
    window.crm_plugin = window.crm_plugin || {
      id: KOMMO.id,
      hash: KOMMO.hash,
      locale: KOMMO.locale,
      setMeta: function (p) {
        this.params = (this.params || []).concat([p]);
      }
    };

    if (typeof window.crmPlugin !== 'function') {
      window.crmPlugin = function () {
        (window.crmPlugin.q = window.crmPlugin.q || []).push(arguments);
      };
    }
  }

  function chatKey(user, vehicle) {
    const lot = vehicle && vehicle.lot ? String(vehicle.lot) : 'general';
    return `apv:${user.kommoUserId}:vehicle:${lot}`;
  }

  function resetPluginForChat(nextKey) {
    if (!activeChatKey || activeChatKey === nextKey) return;

    clearCrmSyncTimers();
    try {
      if (typeof window.crmPlugin === 'function') window.crmPlugin('runDestroy');
    } catch (_) {}

    const oldScript = document.getElementById('crm_plugin_script');
    if (oldScript) oldScript.remove();

    try { delete window.crm_plugin; } catch (_) { window.crm_plugin = undefined; }
    try { delete window.crmPlugin; } catch (_) { window.crmPlugin = undefined; }
    try { delete window.amoSocialButton; } catch (_) { window.amoSocialButton = undefined; }

    chatReady = false;
    chatShown = false;
    loaderState = 'idle';
    callbacksBound = false;
    lastHookResult = null;
    ensureOfficialBootstrapObjects();
  }

  function configureForUser(user, vehicle) {
    const nextKey = chatKey(user, vehicle);
    resetPluginForChat(nextKey);
    activeChatKey = nextKey;

    // La configuración debe existir ANTES de incluir button.js.
    window.crmPluginConfig = {
      hidden: true,
      onlinechat: {
        mode: 'frame',
        container: '#kommo-chat-frame',
        user_id: nextKey,
        locale: {
          extends: 'es',
          compose_placeholder: 'Escribe un mensaje…'
        },
        theme: {
          header: false,
          background: '#ffffff',
          system_color: '#64748b',
          message: {
            outgoing_background: '#0f172a',
            outgoing_color: '#ffffff',
            incoming_background: '#f1f5f9',
            incoming_color: '#0f172a'
          },
          compose: {
            height: 64,
            button_background: '#0f172a'
          }
        }
      }
    };
  }

  function buildVehicleMessage(vehicle) {
    const model = vehicle.title || [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
    return [
      `Vehículo: ${model || 'N/D'}`,
      `VIN: ${vehicle.vin || 'N/D'}`
    ].join('\n');
  }

  function buildContext(vehicle) {
    const vehicleMessage = buildVehicleMessage(vehicle);
    return {
      context: 'apv_auction_bid_request',
      vin: vehicle.vin || '',
      vehicle_model: vehicle.title || [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' '),
      vehicle_message: vehicleMessage
    };
  }

  function setBotParamsOnly(vehicle, stage) {
    ensureOfficialBootstrapObjects();
    const botParams = buildContext(vehicle);
    try {
      // Deliberadamente separado de lead/contact/note. Kommo documenta bot_params
      // como la fuente que el Salesbot lee al arrancar; esta llamada ocurre antes
      // de button.js y se repite al recibir onChatReady.
      window.crm_plugin.setMeta({ bot_params: botParams });
      botParamsQueueCount += 1;
      lastMetaStage = stage || 'bot_params';
      log('bot_params enviados (' + lastMetaStage + '):', botParams);
      return { ok: true, botParams, message: botParams.vehicle_message };
    } catch (err) {
      log('bot_params error:', err);
      return { ok: false, botParams, message: botParams.vehicle_message, error: err.message };
    }
  }

  function clearCrmSyncTimers() {
    crmSyncTimers.forEach(function (id) { try { window.clearTimeout(id); } catch (_) {} });
    crmSyncTimers = [];
  }

  async function syncBidBackend(lot, maxBid) {
    const res = await fetch('/api/kommo/sync-bid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lot: String(lot), maxBid: Number(maxBid) })
    });
    const data = await res.json().catch(function() { return {}; });
    if (!res.ok) {
      const err = new Error(data.error || 'Error al sincronizar con Kommo CRM desde backend.');
      err.code = data.code || 'KOMMO_SYNC_ERROR';
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function setMetaForBid(vehicle, maxBid, user, stage) {
    const bot = setBotParamsOnly(vehicle, stage || 'before-script');
    return { ok: bot.ok, ready: chatReady, botParams: bot.botParams, message: bot.message, error: bot.error };
  }

  function dispatchKeyActionHook(context) {
    const hookContext = context || pendingBid || lastBidContext;
    if (!chatReady || !hookContext) {
      lastHookResult = { ok: false, reason: !chatReady ? 'chat_not_ready' : 'no_bid_context', at: Date.now() };
      return lastHookResult;
    }

    try {
      if (typeof window.crmPlugin !== 'function') throw new Error('crmPlugin no disponible');
      // API oficial actual de Kommo.
      window.crmPlugin('sendKeyActionHook', KOMMO.hook);
      hookContext.hookAttempts = (hookContext.hookAttempts || 0) + 1;
      hookContext.hookSent = true;
      lastHookResult = {
        ok: true,
        dispatched: true,
        confirmedByKommo: false,
        api: 'crmPlugin',
        hook: KOMMO.hook,
        lot: hookContext.lot || null,
        at: Date.now(),
        note: 'La API JS no devuelve acuse de recibo del Key Action; esto confirma solo el despacho desde la pagina.'
      };
      log('Key Action hook enviado:', KOMMO.hook, 'lote:', hookContext.lot || 'N/D');
      return lastHookResult;
    } catch (err) {
      // Fallback para cuentas/documentación antiguas donde aún aparece amoSocialButton.
      try {
        if (typeof window.amoSocialButton === 'function') {
          window.amoSocialButton('sendKeyActionHook', KOMMO.hook);
          hookContext.hookAttempts = (hookContext.hookAttempts || 0) + 1;
          hookContext.hookSent = true;
          lastHookResult = {
            ok: true,
            dispatched: true,
            confirmedByKommo: false,
            api: 'amoSocialButton',
            hook: KOMMO.hook,
            lot: hookContext.lot || null,
            at: Date.now(),
            note: 'La API JS no devuelve acuse de recibo del Key Action; esto confirma solo el despacho desde la pagina.'
          };
          log('Key Action hook enviado por alias legacy:', KOMMO.hook);
          return lastHookResult;
        }
      } catch (legacyErr) {
        err = legacyErr;
      }
      lastHookResult = { ok: false, reason: err.message || String(err), at: Date.now() };
      log('Key Action hook error:', err);
      return lastHookResult;
    }
  }

  function scheduleHookAfterVisible() {
    if (!pendingBid || pendingBid.hookSent) return;
    // La reacción "Mensaje de bienvenida" es visual. La disparamos cuando el
    // chat ya fue mostrado, no simplemente cuando button.js terminó de cargar.
    window.setTimeout(function () {
      if (pendingBid && !pendingBid.hookSent) dispatchKeyActionHook();
    }, 350);
  }

  function markReady() {
    if (chatReady) return;
    chatReady = true;
    setStatus('ready');

    // Reaplicamos primero SOLO bot_params sobre la implementación real. De esta
    // forma el Salesbot recibe VIN/modelo antes de abrir visualmente el chat.
    if (pendingBid && pendingBid.vehicle && pendingBid.user) {
      setBotParamsOnly(pendingBid.vehicle, 'onChatReady');
    }

    readyCallbacks.forEach(function (cb) {
      try { cb(); } catch (_) {}
    });

    // Damos un pequeño margen para que Kommo procese setMeta antes de mostrar
    // el Live Chat; el bot de bienvenida se dispara alrededor de esta apertura.
    window.setTimeout(function () {
      try { window.crmPlugin('runChatShow'); } catch (_) {}
    }, 300);
  }

  function bindCallbacksBeforeLoad() {
    if (callbacksBound) return;
    callbacksBound = true;
    ensureOfficialBootstrapObjects();

    // Se encolan antes de cargar button.js.
    window.crmPlugin('onChatReady', function () {
      log('onChatReady');
      markReady();
    });

    window.crmPlugin('onChatShow', function () {
      log('onChatShow');
      chatShown = true;
      scheduleCrmSyncAfterVisible();
      scheduleHookAfterVisible();
    });

    window.crmPlugin('onChatHide', function () {
      log('onChatHide');
      chatShown = false;
    });

    window.crmPlugin('onConversationsChange', function (conversations) {
      conversationsChangeCount += 1;
      lastConversations = conversations;
      log('onConversationsChange', conversations);
    });
  }

  function injectOfficialScript() {
    ensureOfficialBootstrapObjects();
    bindCallbacksBeforeLoad();

    const existing = document.getElementById('crm_plugin_script');
    if (existing) {
      if (chatReady) setStatus('ready');
      else if (loaderState === 'idle') setStatus('loading');
      return;
    }

    setStatus('loading');
    const script = document.createElement('script');
    script.async = true;
    script.id = 'crm_plugin_script';
    script.src = 'https://gso.kommo.com/js/button.js';
    script.onload = function () {
      setStatus(chatReady ? 'ready' : 'loaded');
      log('button.js cargado');

      // Registrar de nuevo sobre la implementación ya cargada no daña la cola
      // y evita perder callbacks en navegadores donde la sustitución fue rápida.
      try { window.crmPlugin('onChatReady', markReady); } catch (_) {}
      try {
        window.crmPlugin('onChatShow', function () {
          chatShown = true;
          scheduleCrmSyncAfterVisible();
          scheduleHookAfterVisible();
        });
      } catch (_) {}
      try {
        window.crmPlugin('onConversationsChange', function (conversations) {
          conversationsChangeCount += 1;
          lastConversations = conversations;
          log('onConversationsChange', conversations);
        });
      } catch (_) {}
    };
    script.onerror = function () {
      setStatus('error', 'No se pudo descargar https://gso.kommo.com/js/button.js');
    };
    document.head.appendChild(script);
  }

  function init(user) {
    if (!user || !user.kommoUserId) return false;
    currentUser = user;
    ensureOfficialBootstrapObjects();
    return true;
  }

  function sendBidContext(vehicle, maxBid, user) {
    currentUser = user || currentUser;
    if (!currentUser || !currentUser.kommoUserId) {
      return { ok: false, ready: false, botParams: buildContext(vehicle), error: 'Usuario no autenticado' };
    }

    configureForUser(currentUser, vehicle);
    ensureOfficialBootstrapObjects();

    // Orden crítico: meta primero, luego button.js.
    const result = setMetaForBid(vehicle, maxBid, currentUser, 'before-button-js');
    pendingBid = {
      lot: vehicle.lot,
      vehicle,
      maxBid,
      user: currentUser,
      hookSent: false,
      hookAttempts: 0,
      crmNoteSent: false,
      crmSyncAttempts: 0,
      createdAt: Date.now()
    };
    // Keep a durable in-page context even after closing/reopening the modal so
    // the diagnostic "Probar hook" never loses the selected vehicle.
    lastBidContext = pendingBid;

    if (loaderState === 'idle' || loaderState === 'error') injectOfficialScript();

    // Si la instancia ya estaba lista para este vehículo, reabrimos el frame.
    if (chatReady) {
      try { window.crmPlugin('runChatShow'); } catch (_) {}
      if (chatShown) {
        scheduleCrmSyncAfterVisible();
        scheduleHookAfterVisible();
      }
    }

    return result;
  }

  function reopenConversation(vehicle, user) {
    currentUser = user || currentUser;
    if (!currentUser || !currentUser.kommoUserId || !vehicle) {
      return { ok: false, ready: chatReady, error: 'Falta usuario o vehículo para reabrir la conversación' };
    }

    configureForUser(currentUser, vehicle);
    // Reabrir no vuelve a disparar automáticamente el hook, pero conservamos
    // el contexto para que la prueba manual siga funcionando.
    pendingBid = null;
    lastBidContext = {
      lot: vehicle.lot,
      vehicle,
      maxBid: 0,
      user: currentUser,
      hookSent: false,
      hookAttempts: 0,
      reopened: true,
      createdAt: Date.now()
    };
    ensureOfficialBootstrapObjects();

    if (loaderState === 'idle' || loaderState === 'error') injectOfficialScript();
    if (chatReady) {
      try { window.crmPlugin('runChatShow'); chatShown = true; } catch (_) {}
    }
    return { ok: true, ready: chatReady, chatKey: activeChatKey };
  }

  function showChat() {
    if (!chatReady || typeof window.crmPlugin !== 'function') return false;
    try {
      window.crmPlugin('runChatShow');
      return true;
    } catch (_) {
      return false;
    }
  }

  function retry() {
    if (!currentUser) return false;
    const script = document.getElementById('crm_plugin_script');
    if (script) script.remove();
    callbacksBound = false;
    clearCrmSyncTimers();
    chatReady = false;
    chatShown = false;
    loaderState = 'idle';
    if (pendingBid) pendingBid.hookSent = false;
    injectOfficialScript();
    return true;
  }

  function testHook() {
    const context = pendingBid || lastBidContext;
    if (context) context.hookSent = false;
    return dispatchKeyActionHook(context);
  }

  function onReady(callback) {
    if (typeof callback !== 'function') return;
    readyCallbacks.push(callback);
    if (chatReady) callback();
  }

  function onStatus(callback) {
    if (typeof callback !== 'function') return;
    statusCallbacks.push(callback);
    callback({ status: loaderState, detail: '' });
  }

  window.apvKommo = {
    init,
    retry,
    reopenConversation,
    showChat,
    testHook,
    syncBidBackend,
    isReady: function () { return chatReady; },
    getStatus: function () { return loaderState; },
    getChatKey: function () { return activeChatKey; },
    buildContext,
    buildVehicleMessage,
    sendBidContext,
    onReady,
    onStatus,
    debug: function () {
      return {
        version: '15.0.0',
        status: loaderState,
        ready: chatReady,
        shown: chatShown,
        chatKey: activeChatKey,
        pendingBid: pendingBid ? {
          lot: pendingBid.lot,
          hookSent: pendingBid.hookSent,
          hookAttempts: pendingBid.hookAttempts,
          crmSyncAttempts: pendingBid.crmSyncAttempts || 0,
          lastCrmSyncStage: pendingBid.lastCrmSyncStage || null,
          message: buildVehicleMessage(pendingBid.vehicle)
        } : null,
        lastBidContext: lastBidContext ? {
          lot: lastBidContext.lot,
          reopened: !!lastBidContext.reopened,
          hookSent: !!lastBidContext.hookSent,
          hookAttempts: lastBidContext.hookAttempts || 0,
          crmSyncAttempts: lastBidContext.crmSyncAttempts || 0,
          lastCrmSyncStage: lastBidContext.lastCrmSyncStage || null,
          message: buildVehicleMessage(lastBidContext.vehicle)
        } : null,
        lastHookResult,
        nativeLauncherHidden: !!(window.crmPluginConfig && window.crmPluginConfig.hidden),
        chatKeySchema: 'v15-user-apv15-vehicle',
        metaStrategy: 'bot-params-before-load; crm-entities-after-onChatShow-with-split-retries',
        botParamsQueueCount: botParamsQueueCount,
        crmMetaQueueCount: crmMetaQueueCount,
        lastMetaStage: lastMetaStage,
        lastCrmMetaResult: lastCrmMetaResult,
        lastCrmPayload: lastCrmPayload,
        crmSyncAttempts: crmSyncAttempts,
        lastCrmSyncResults: lastCrmSyncResults.slice(-12),
        manualCrmSyncAvailable: true,
        crmFieldEncoding: { phoneEnumId: 403274, emailEnumId: 403284 },
        conversationsFalseIsExpected: lastConversations === false,
        conversationsChangeCount: conversationsChangeCount,
        lastConversations: lastConversations,
        hasCrmPlugin: typeof window.crmPlugin === 'function',
        hasLegacyAlias: typeof window.amoSocialButton === 'function',
        hasCrmPluginData: !!window.crm_plugin,
        metaQueueLength: window.crm_plugin && Array.isArray(window.crm_plugin.params) ? window.crm_plugin.params.length : null,
        moduleState: window.__APV_KOMMO_MODULE_STATE__,
        pageVersion: window.__APV_PAGE_VERSION__ || null,
        scriptSrc: (document.querySelector('script[src*=\"/kommo.js\"]') || {}).src || null
      };
    }
  };
  window.__APV_KOMMO_MODULE_STATE__ = 'module-ready';
  try { console.info('[APV Kommo] modulo v15.0.0 listo'); } catch (_) {}
})();
