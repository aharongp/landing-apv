(function () {
  'use strict';
  let config = null, user = null, membership = null, hooks = {}, busy = false;
  const root = document.querySelector('#membership-content');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const usd = n => 'US$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const en = () => document.documentElement.lang === 'en';
  const copy = (es, english) => en() ? english : es;
  const date = seconds => new Date(seconds * 1000).toLocaleDateString(en() ? 'en-US' : 'es-US');
  async function api(url, options) {
    const r = await fetch(url, options);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || copy('No se pudo completar la solicitud.', 'The request could not be completed.'));
    return data;
  }
  function status(message, kind = '') {
    const el = document.querySelector('#membership-status');
    el.textContent = message; el.classList.toggle('hidden', !message); el.dataset.kind = kind;
  }
  function notify(message) { if (hooks.notify) hooks.notify(message); else status(message); }
  function currentPlan() { return membership?.plan || { id:'free', name:'Gratis', feeDiscount:0, consultationDiscount:0 }; }
  function openPlans() {
    hooks.closeOverlays?.();
    document.querySelector('#planes').scrollIntoView({ behavior:'smooth', block:'start' });
  }
  function render() {
    if (!root || !config) return;
    const current = currentPlan();
    const period = config.interval === 'month' ? copy('/mes','/month') : config.interval === 'year' ? copy('/año','/year') : '';
    const allowance = config.consultationCadence === 'period' ? copy('cada año pagado','each paid year') : config.consultationCadence === 'once' ? copy('una sola vez','one time') : '';
    const common = [copy('Inventario de carros','Vehicle inventory'),copy('Favoritos en tu cuenta','Account favorites'),copy('Reporte del historial elaborado por APV Motors','Vehicle history report prepared by APV Motors'),copy('Atención personalizada','Personal assistance')];
    const subtitles = { free:copy('Explora y prepara tu compra.','Explore and plan your purchase.'), plus:copy('Ahorro y orientación para tu compra.','Savings and guidance for your purchase.'), premium:copy('Mayor descuento y una asesoría completa.','A larger discount and a full consultation.') };
    root.innerHTML = `<div class="membership-grid">${config.plans.map(plan => {
      const selected = user && current.id === plan.id;
      const features = [...common,
        plan.feeDiscount ? `${usd(plan.feeDiscount)} ${copy('de descuento en fees APV por vehículo','off APV fees per vehicle')}` : copy('Fees APV a tarifa regular','Standard APV fees'),
        `${copy('Quick Call de 60 min:','60-minute Quick Call:')} ${usd(config.consultationPrice - plan.consultationDiscount)}${plan.consultationDiscount ? ` (${usd(plan.consultationDiscount)} ${copy('de descuento','off')})` : ''}`,
        plan.includedMinutes ? `${copy('Una asesoría de','One')} ${plan.includedMinutes} ${copy('min incluida','minute consultation included')} ${allowance}` : copy('Sin asesoría gratuita incluida','No free consultation included')];
      const action = selected ? 'current' : plan.id === 'free' ? (user && current.id !== 'free' ? 'portal' : 'free') : user && membership?.hasCustomer && membership.status !== 'free' && !['canceled','incomplete_expired'].includes(membership.status) ? 'portal' : 'checkout';
      const label = selected ? copy('Tu plan actual','Your current plan') : action === 'portal' ? copy('Cambiar mi plan','Change my plan') : plan.id === 'free' ? copy('Crear cuenta gratis','Create free account') : copy('Elegir ','Choose ') + plan.name;
      return `<article class="membership-card ${plan.id === 'plus' ? 'membership-featured' : ''}"><div class="membership-card-top"><span class="membership-label">${plan.id === 'plus' ? copy('PARA TU PRÓXIMA COMPRA','FOR YOUR NEXT PURCHASE') : plan.id === 'premium' ? copy('MÁS ACOMPAÑAMIENTO','MORE GUIDANCE') : copy('EMPIEZA AQUÍ','START HERE')}</span><h3>${esc(plan.name)}</h3><p>${esc(subtitles[plan.id])}</p></div><div class="membership-price">${usd(plan.amount / 100)}<span>${plan.id === 'free' ? '' : period}</span></div><ul>${features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul><button type="button" class="btn ${plan.id === 'plus' ? 'btn-primary' : 'btn-dark'}" data-member-action="${action}" data-plan="${plan.id}" ${selected || (plan.id !== 'free' && !config.available) ? 'disabled' : ''}>${esc(label)}</button>${plan.id === 'free' ? `<small>${copy('Sin tarjeta. Sin cobros automáticos.','No card. No automatic charges.')}</small>` : `<small>${copy('Renovación anual automática. Cancela la renovación desde tu cuenta.','Automatically renews annually. Cancel renewal from your account.')}</small>`}</article>`;
    }).join('')}</div><p class="membership-terms">${copy('Precios en USD. La suscripción se paga por separado de la compra del vehículo. Los descuentos aplican a los servicios de APV, no a tarifas de Copart, transporte ni impuestos.','Prices in USD. Membership is billed separately from vehicle purchases. Discounts apply to APV services, not Copart fees, shipping or taxes.')} ${config.consultationCadence ? esc(copy(`La asesoría incluida se ofrece ${allowance}; solicita la cita desde tu cuenta mientras el plan esté activo.`,`The included consultation is offered ${allowance}; request it through your account while your plan is active.`)) : ''}</p>${!config.available ? `<p class="membership-availability">${copy('Los planes de pago estarán disponibles próximamente. Puedes usar tu cuenta gratis.','Paid plans will be available soon. You can use your free account.')}</p>` : ''}`;
    const account = document.querySelector('#membership-account');
    account.classList.toggle('hidden', !user);
    if (user) {
      const unpaid = ['past_due','unpaid','incomplete'].includes(membership?.status);
      const active = current.id !== 'free';
      const available = membership?.benefits?.filter(b=>!b.requestedAt) || [];
      account.innerHTML = `<div><span class="membership-label">${copy('MI SUSCRIPCIÓN','MY SUBSCRIPTION')}</span><h3>${esc(current.name)}</h3><p>${active ? `${membership.cancelAtPeriodEnd ? copy('Tu renovación está cancelada. Beneficios hasta el ','Renewal canceled. Benefits until ') : copy('Período pagado hasta el ','Paid period through ')}${date(membership.paidThrough)}.` : copy('Tu cuenta gratis conserva el inventario y tus favoritos.','Your free account keeps inventory access and favorites.')}</p>${unpaid ? `<p class="membership-payment-alert" role="alert">${copy('Tu pago necesita atención. Actualiza tu método de pago para recuperar los beneficios de pago.','Your payment needs attention. Update your payment method to restore paid benefits.')}</p>` : ''}</div><div class="membership-account-actions">${membership?.hasCustomer ? `<button type="button" class="btn btn-dark" data-member-action="portal">${copy('Gestionar pago o cancelar','Manage billing or cancel')}</button>` : ''}<button type="button" class="btn btn-ghost" data-member-action="refresh">${copy('Actualizar estado','Refresh status')}</button><button type="button" class="btn btn-ghost" data-member-service="consultation">${copy('Solicitar asesoría de 60 min','Request a 60-minute consultation')} · ${usd(config.consultationPrice - current.consultationDiscount)}</button>${available.map(b=>`<button type="button" class="btn btn-primary" data-member-service="included_consultation">${copy('Solicitar mi asesoría de','Request my included')} ${b.minutes} min ${copy('incluida','consultation')}</button>`).join('')}</div>`;
    }
    const chip = document.querySelector('#my-membership-button');
    if (chip) chip.textContent = copy('Mi plan: ','My plan: ') + current.name;
    document.querySelectorAll('[data-membership-nudge]').forEach(el => {
      let dismissed = false;
      try { dismissed = Number(localStorage.getItem('apv-membership-dismissed') || 0) > Date.now() - 7*86400000; } catch (_) {}
      el.classList.toggle('hidden', current.id !== 'free' || dismissed || !config.available);
    });
    hooks.changed?.(membership);
  }
  async function refresh() {
    if (!user) return;
    const id = user.id;
    const m = await api('/api/billing/refresh', {method:'POST'});
    if (user?.id !== id) return;
    membership = m; render(); return m;
  }
  async function choose(planId) {
    if (!user) { hooks.requireAuth?.({type:'subscription',planId}); return; }
    const d = await api('/api/billing/checkout', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId})});
    location.assign(d.url);
  }
  async function requestService(kind, lot) {
    if (!user) { hooks.requireAuth?.({type:'member-service',kind,lot}); return; }
    await api('/api/billing/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,lot})});
    notify(copy('Solicitud registrada. Un asesor de APV coordinará contigo la entrega o la cita.','Request recorded. An APV advisor will coordinate delivery or your appointment.'));
    membership = await api('/api/billing/me'); render();
  }
  document.addEventListener('click', async e => {
    if (e.target.closest('[data-member-plans]')) { openPlans(); return; }
    if (e.target.closest('[data-member-dismiss]')) { try {localStorage.setItem('apv-membership-dismissed',String(Date.now()));} catch (_) {} render(); return; }
    const button = e.target.closest('[data-member-action],[data-member-service],[data-member-history]');
    if (!button || busy || button.disabled) return;
    busy = true; button.disabled = true;
    try {
      if (button.hasAttribute('data-member-history')) await requestService('history',button.dataset.memberHistory);
      else if (button.dataset.memberService) await requestService(button.dataset.memberService);
      else if (button.dataset.memberAction === 'checkout') await choose(button.dataset.plan);
      else if (button.dataset.memberAction === 'portal') { const d=await api('/api/billing/portal',{method:'POST'}); location.assign(d.url); }
      else if (button.dataset.memberAction === 'refresh') { await refresh(); status(copy('Estado actualizado.','Status refreshed.')); }
      else if (button.dataset.memberAction === 'free') hooks.requireAuth?.({type:'subscription',planId:'free'});
    } catch(err) { notify(err.message); }
    finally {busy=false;if(button.isConnected)button.disabled=false;}
  });
  async function handleReturn() {
    const value=new URLSearchParams(location.search).get('billing');
    if (!value || !user) return;
    if (value === 'success') {
      status(copy('Estamos verificando el pago con Stripe…','Verifying your payment with Stripe…'));
      for (let i=0;i<4;i++) {
        try { const m=await refresh(); if(m?.plan.id!=='free'){status(copy('Tu suscripción está activa. Ya puedes usar tus beneficios.','Your membership is active. Your benefits are ready.'),'success');break;} }
        catch(err) {if(i===3)status(err.message);}
        if(i===3)status(copy('El pago sigue en verificación. Usa Actualizar estado en unos momentos.','Payment is still being verified. Refresh status in a moment.'));
        else await new Promise(r=>setTimeout(r,1500));
      }
    } else if(value==='return') { try {await refresh();} catch(err){status(err.message);} }
    else if(value==='canceled') status(copy('No completaste la suscripción. Puedes seguir usando tu cuenta gratis.','Checkout was not completed. You can keep using your free account.'));
    const url=new URL(location.href);url.searchParams.delete('billing');history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  }
  window.apvMembership = {
    configure(value){hooks=value;},
    setUser(value){user=value;membership=value?.membership || null;render();handleReturn();},
    render, openPlans, choose, requestService,
    getPlan: currentPlan,
    resume: async action => {openPlans();if(action.type==='member-service')await requestService(action.kind,action.lot);else if(action.planId!=='free')await choose(action.planId);},
    available: ()=>Boolean(config?.available)
  };
  api('/api/plans').then(data=>{config=data;render();}).catch(()=>{if(root)root.textContent=copy('No se pudieron cargar los planes. Recarga la página para intentarlo de nuevo.','Could not load plans. Reload the page to try again.');});
})();
