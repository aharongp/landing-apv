'use strict';
const crypto = require('crypto');
const Stripe = require('stripe');

const PLANS = Object.freeze({
  free: { id: 'free', name: 'Gratis', amount: 0, feeDiscount: 0, consultationDiscount: 0, includedMinutes: 0 },
  plus: { id: 'plus', name: 'APV Plus', amount: 9700, feeDiscount: 100, consultationDiscount: 30, includedMinutes: 20 },
  premium: { id: 'premium', name: 'APV Premium', amount: 29700, feeDiscount: 200, consultationDiscount: 40, includedMinutes: 60 }
});
const objectId = value => typeof value === 'string' ? value : value?.id;
const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

function createBillingService({ database, env = process.env, stripe: injectedStripe, now = () => Date.now() }) {
  let initialized = false, stripeClient;
  const priceCache = new Map();
  function db() {
    const d = database();
    if (!initialized) {
      d.exec(`
        CREATE TABLE IF NOT EXISTS billing_accounts (
          userId TEXT PRIMARY KEY, customerId TEXT UNIQUE, subscriptionId TEXT UNIQUE,
          planId TEXT NOT NULL DEFAULT 'free', status TEXT NOT NULL DEFAULT 'free',
          paidThrough INTEGER NOT NULL DEFAULT 0, periodStart INTEGER NOT NULL DEFAULT 0,
          periodEnd INTEGER NOT NULL DEFAULT 0, cancelAtPeriodEnd INTEGER NOT NULL DEFAULT 0,
          checkoutId TEXT, checkoutPlan TEXT, checkoutExpires INTEGER,
          checkoutAttempt TEXT, updatedAt INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS billing_fee_quotes (
          intentId TEXT PRIMARY KEY, userId TEXT NOT NULL, lot TEXT NOT NULL, planId TEXT NOT NULL,
          base REAL NOT NULL, discount REAL NOT NULL, total REAL NOT NULL, createdAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS billing_events (id TEXT PRIMARY KEY, processedAt INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS billing_locks (userId TEXT PRIMARY KEY, token TEXT, expiresAt INTEGER);
        CREATE TABLE IF NOT EXISTS billing_benefits (
          id TEXT PRIMARY KEY, userId TEXT NOT NULL, invoiceId TEXT NOT NULL,
          minutes INTEGER NOT NULL, validUntil INTEGER NOT NULL, requestedAt INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_benefits_user ON billing_benefits(userId);
        CREATE TABLE IF NOT EXISTS member_requests (
          id TEXT PRIMARY KEY, userId TEXT NOT NULL, kind TEXT NOT NULL, lot TEXT,
          benefitId TEXT UNIQUE, planId TEXT NOT NULL, discount INTEGER NOT NULL DEFAULT 0,
          minutes INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending',
          createdAt INTEGER NOT NULL, completedAt INTEGER
        );
      `);
      initialized = true;
    }
    return d;
  }
  function config() {
    const interval = (env.BILLING_INTERVAL || 'year') === 'year' ? 'year' : null;
    const consultationCadence = (env.BILLING_CONSULTATION_CADENCE || 'period') === 'period' ? 'period' : null;
    const feeScope = (env.BILLING_FEE_SCOPE || 'per_vehicle') === 'per_vehicle' ? 'per_vehicle' : null;
    let origin = '';
    try {
      const u = new URL(env.PUBLIC_APP_URL);
      if (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname) && !String(env.STRIPE_SECRET_KEY).startsWith('sk_live_'))) origin = u.origin;
    } catch (_) {}
    return { interval, consultationCadence, feeScope, origin,
      ready: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_PLUS && env.STRIPE_PRICE_PREMIUM && env.STRIPE_PORTAL_CONFIGURATION && interval && consultationCadence && feeScope && origin),
      consultationPrice: 99,
      live: String(env.STRIPE_SECRET_KEY || '').startsWith('sk_live_') };
  }
  function stripe() {
    if (injectedStripe) return injectedStripe;
    if (!env.STRIPE_SECRET_KEY) throw error('Las suscripciones todavía no están disponibles.', 503);
    return stripeClient ||= new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 15000 });
  }
  function account(userId) {
    db().prepare('INSERT OR IGNORE INTO billing_accounts (userId) VALUES (?)').run(userId);
    return db().prepare('SELECT * FROM billing_accounts WHERE userId = ?').get(userId);
  }
  function membership(userId) {
    const a = userId ? account(userId) : null;
    const active = a && ['active', 'past_due'].includes(a.status) && a.paidThrough > Math.floor(now() / 1000);
    const plan = PLANS[active ? a.planId : 'free'] || PLANS.free;
    const benefits = active ? db().prepare('SELECT id, minutes, validUntil, requestedAt FROM billing_benefits WHERE userId = ? AND validUntil > ? ORDER BY validUntil').all(userId, Math.floor(now() / 1000)) : [];
    return { plan: { ...plan }, status: a?.status || 'free', paidThrough: a?.paidThrough || 0,
      cancelAtPeriodEnd: Boolean(a?.cancelAtPeriodEnd), hasCustomer: Boolean(a?.customerId), benefits };
  }
  function publicPlans() {
    const c = config();
    return { plans: Object.values(PLANS), interval: c.interval, consultationCadence: c.consultationCadence,
      feeScope: c.feeScope, consultationPrice: c.consultationPrice, available: c.ready };
  }
  async function locked(userId, work) {
    const token = crypto.randomUUID();
    db().prepare('DELETE FROM billing_locks WHERE expiresAt < ?').run(now());
    const acquired = db().prepare('INSERT OR IGNORE INTO billing_locks (userId, token, expiresAt) VALUES (?, ?, ?)').run(userId, token, now() + 600000);
    if (!acquired.changes) throw error('Tu suscripción se está actualizando. Intenta de nuevo en unos segundos.', 409);
    try { return await work(); }
    finally { db().prepare('DELETE FROM billing_locks WHERE userId = ? AND token = ?').run(userId, token); }
  }
  function priceId(planId) { return planId === 'plus' ? env.STRIPE_PRICE_PLUS : planId === 'premium' ? env.STRIPE_PRICE_PREMIUM : null; }
  function pricePlan(id) { return ['plus', 'premium'].find(p => priceId(p) && priceId(p) === id); }
  async function validatedPrice(planId, requireActive = true) {
    const id = priceId(planId);
    if (!id) throw error('Plan no disponible.', 503);
    let p = priceCache.get(id);
    if (!p) {
      p = await stripe().prices.retrieve(id);
      if ((!p.active && requireActive) || p.currency !== 'usd' || p.unit_amount !== PLANS[planId].amount || p.recurring?.interval !== config().interval || p.recurring?.interval_count !== 1 || p.livemode !== config().live || p.billing_scheme !== 'per_unit') throw error('La configuración del precio necesita revisión. Contacta a APV.', 503);
      priceCache.set(id, p);
    }
    if (requireActive && !p.active) throw error('Plan no disponible.', 503);
    return p;
  }
  async function ensureCustomer(user) {
    const a = account(user.id);
    if (a.customerId) return a.customerId;
    const customer = await stripe().customers.create({ email: user.email, name: user.name, metadata: { apvUserId: user.id } }, { idempotencyKey: `apv-customer-${user.id}` });
    db().prepare('UPDATE billing_accounts SET customerId = ? WHERE userId = ?').run(customer.id, user.id);
    return customer.id;
  }
  async function checkout(user, planId) {
    if (!['plus', 'premium'].includes(planId)) throw error('Selecciona un plan válido.');
    if (!config().ready) throw error('Las suscripciones todavía no están disponibles.', 503);
    return locked(user.id, async () => {
      await validatedPrice(planId);
      const customer = await ensureCustomer(user);
      // Check Stripe itself, including incomplete/past-due subscriptions, not only the local mirror.
      const subscriptions = await stripe().subscriptions.list({ customer, status: 'all', limit: 100 });
      if (subscriptions.has_more || subscriptions.data.some(s => !['canceled', 'incomplete_expired'].includes(s.status))) throw error('Ya tienes una suscripción. Usa Gestionar suscripción para cambiarla o actualizar el pago.', 409);
      let a = account(user.id);
      if (a.checkoutId) {
        const session = await stripe().checkout.sessions.retrieve(a.checkoutId);
        if (session.status === 'open' && session.expires_at > now() / 1000) {
          if (a.checkoutPlan === planId) return { url: session.url };
          await stripe().checkout.sessions.expire(session.id);
        } else if (session.status === 'complete') throw error('Estamos confirmando tu pago. Actualiza el estado de tu cuenta.', 409);
        db().prepare('UPDATE billing_accounts SET checkoutId = NULL, checkoutAttempt = NULL WHERE userId = ?').run(user.id);
        a = account(user.id);
      }
      if (a.checkoutAttempt && a.checkoutPlan !== planId) throw error('Reintenta el plan anterior para recuperar tu sesión de pago antes de cambiar de plan.', 409);
      if (!a.checkoutAttempt) {
        db().prepare('UPDATE billing_accounts SET checkoutAttempt = ?, checkoutPlan = ? WHERE userId = ?').run(crypto.randomUUID(), planId, user.id);
        a = account(user.id);
      }
      const c = config();
      const session = await stripe().checkout.sessions.create({ mode: 'subscription', customer, client_reference_id: user.id,
        payment_method_types: ['card'], line_items: [{ price: priceId(planId), quantity: 1 }],
        metadata: { apvUserId: user.id, planId }, subscription_data: { metadata: { apvUserId: user.id } },
        success_url: `${c.origin}/?billing=success#planes`, cancel_url: `${c.origin}/?billing=canceled#planes`,
        billing_address_collection: 'auto', locale: 'auto',
        custom_text: { submit: { message: 'Suscripción con renovación automática. Puedes cancelar la renovación desde Mi suscripción.' } }
      }, { idempotencyKey: `apv-checkout-${a.checkoutAttempt}` });
      db().prepare('UPDATE billing_accounts SET checkoutId = ?, checkoutExpires = ? WHERE userId = ?').run(session.id, session.expires_at, user.id);
      return { url: session.url };
    });
  }
  async function portal(user) {
    if (!config().ready) throw error('La gestión de suscripciones todavía no está disponible.', 503);
    const a = account(user.id);
    if (!a.customerId) throw error('Tu cuenta no tiene una suscripción de pago.');
    const session = await stripe().billingPortal.sessions.create({ customer: a.customerId,
      configuration: env.STRIPE_PORTAL_CONFIGURATION, return_url: `${config().origin}/?billing=return#planes` });
    return { url: session.url };
  }
  async function syncSubscription(userId, subscription) {
    const a = account(userId);
    if (objectId(subscription.customer) !== a.customerId) throw error('La suscripción no pertenece a esta cuenta.', 403);
    const items = subscription.items?.data || [];
    const item = items.length === 1 ? items[0] : null;
    const planId = pricePlan(objectId(item?.price));
    if (planId) await validatedPrice(planId, false);
    const invoice = typeof subscription.latest_invoice === 'string' ? await stripe().invoices.retrieve(subscription.latest_invoice) : subscription.latest_invoice;
    const start = item?.current_period_start || subscription.current_period_start || 0;
    const end = item?.current_period_end || subscription.current_period_end || 0;
    const invoiceHasPlan = invoice?.lines?.data?.some(line => objectId(line.pricing?.price_details?.price || line.price) === priceId(planId));
    const paid = planId && invoiceHasPlan && subscription.status === 'active' && invoice?.status === 'paid' && !subscription.pause_collection && item.quantity === 1;
    const sameSubscription = a.subscriptionId === subscription.id;
    // Never activate an upgrade until its invoice is paid. Preserve only previously paid time otherwise.
    const effectivePlan = !planId ? 'free' : paid ? planId : sameSubscription ? a.planId : 'free';
    const paidThrough = !planId ? 0 : paid ? end : sameSubscription ? a.paidThrough : 0;
    const status = subscription.pause_collection ? 'paused' : subscription.status;
    db().exec('BEGIN IMMEDIATE');
    try {
      db().prepare(`UPDATE billing_accounts SET subscriptionId = ?, planId = ?, status = ?, paidThrough = ?,
        periodStart = ?, periodEnd = ?, cancelAtPeriodEnd = ?, updatedAt = ?, checkoutId = NULL, checkoutAttempt = NULL WHERE userId = ?`).run(
        subscription.id, effectivePlan, status, paidThrough, start, end, subscription.cancel_at_period_end ? 1 : 0, now(), userId);
      if (paid && config().consultationCadence) {
        const period = config().consultationCadence === 'once' ? 'once' : String(start);
        const benefitId = `${userId}:${period}`;
        db().prepare(`INSERT INTO billing_benefits (id, userId, invoiceId, minutes, validUntil) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET minutes = CASE WHEN requestedAt IS NULL THEN MAX(minutes, excluded.minutes) ELSE minutes END,
          validUntil = MAX(validUntil, excluded.validUntil)`).run(benefitId, userId, invoice.id, PLANS[planId].includedMinutes, end);
      }
      db().exec('COMMIT');
    } catch (err) { db().exec('ROLLBACK'); throw err; }
    return membership(userId);
  }
  async function refresh(user) {
    if (!config().ready) return membership(user.id);
    return locked(user.id, async () => {
      const a = account(user.id);
      if (!a.customerId) return membership(user.id);
      const list = await stripe().subscriptions.list({ customer: a.customerId, status: 'all', limit: 100, expand: ['data.latest_invoice'] });
      const relevant = list.data.filter(s => s.items?.data?.some(i => pricePlan(objectId(i.price))));
      const subscription = relevant.find(s => !['canceled', 'incomplete_expired'].includes(s.status)) || relevant.find(s => s.id === a.subscriptionId);
      if (subscription) await syncSubscription(user.id, subscription);
      return membership(user.id);
    });
  }
  async function webhook(rawBody, signature) {
    if (!env.STRIPE_WEBHOOK_SECRET) throw error('Webhook no configurado.', 503);
    let event;
    try { event = stripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET); }
    catch (_) { throw error('Firma de Stripe inválida.', 400); }
    if (event.livemode !== config().live) throw error('Modo de Stripe incorrecto.');
    if (db().prepare('SELECT id FROM billing_events WHERE id = ?').get(event.id)) return { received: true };
    const obj = event.data.object;
    const supported = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required'];
    if (supported.includes(event.type)) {
      const customer = objectId(obj.customer);
      const a = db().prepare('SELECT * FROM billing_accounts WHERE customerId = ?').get(customer || '');
      if (a) await locked(a.userId, async () => {
        const subId = event.type.startsWith('customer.subscription.') ? obj.id : objectId(obj.subscription || obj.parent?.subscription_details?.subscription);
        if (subId) {
          // Retrieve current state inside the lock: events can arrive twice or out of order.
          const subscription = await stripe().subscriptions.retrieve(subId, { expand: ['latest_invoice'] });
          const latestAccount = account(a.userId);
          if (!latestAccount.subscriptionId || latestAccount.subscriptionId === subscription.id || !['canceled', 'incomplete_expired'].includes(subscription.status)) await syncSubscription(a.userId, subscription);
        }
      });
    }
    db().prepare('INSERT OR IGNORE INTO billing_events (id, processedAt) VALUES (?, ?)').run(event.id, now());
    return { received: true };
  }
  function apvFeeQuote(userId, bid) {
    const b = Math.max(0, Number(bid) || 0);
    const base = b <= 0 ? 0 : b <= 5999 ? 350 : b <= 9999 ? 450 : b <= 14999 ? 650 : 700;
    const m = membership(userId);
    const discount = Math.min(base, m.plan.feeDiscount);
    return { planId: m.plan.id, base, discount, total: base - discount };
  }
  function recordFeeQuote(userId, intentId, lot, bid) {
    const quote = apvFeeQuote(userId, bid);
    db().prepare('INSERT OR IGNORE INTO billing_fee_quotes (intentId, userId, lot, planId, base, discount, total, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(intentId, userId, lot, quote.planId, quote.base, quote.discount, quote.total, now());
    return quote;
  }
  function requestService(user, kind, lot) {
    if (!['history', 'consultation', 'included_consultation'].includes(kind)) throw error('Servicio inválido.');
    const m = membership(user.id), d = db();
    d.exec('BEGIN IMMEDIATE');
    try {
      let benefit = null;
      if (kind === 'included_consultation') {
        benefit = m.benefits.find(b => !b.requestedAt);
        if (!benefit) throw error('No tienes una asesoría incluida disponible.', 409);
        const used = d.prepare('UPDATE billing_benefits SET requestedAt = ? WHERE id = ? AND requestedAt IS NULL').run(now(), benefit.id);
        if (!used.changes) throw error('Esta asesoría ya fue solicitada.', 409);
      }
      const existing = d.prepare("SELECT id FROM member_requests WHERE userId = ? AND kind = ? AND COALESCE(lot, '') = ? AND status = 'pending'").get(user.id, kind, lot || '');
      if (existing && !benefit) { d.exec('COMMIT'); return { id: existing.id, existing: true }; }
      const id = crypto.randomUUID();
      d.prepare(`INSERT INTO member_requests (id, userId, kind, lot, benefitId, planId, discount, minutes, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, user.id, kind, lot || null, benefit?.id || null, m.plan.id, kind === 'consultation' ? m.plan.consultationDiscount : 0, benefit?.minutes || (kind === 'consultation' ? 60 : 0), now());
      d.exec('COMMIT'); return { id };
    } catch (err) { d.exec('ROLLBACK'); throw err; }
  }
  function requests() { return db().prepare(`SELECT r.*, u.name, u.email, u.phone FROM member_requests r JOIN users u ON u.id = r.userId ORDER BY r.createdAt DESC LIMIT 200`).all(); }
  function completeRequest(id) { return db().prepare("UPDATE member_requests SET status = 'completed', completedAt = ? WHERE id = ? AND status = 'pending'").run(now(), id).changes; }
  return { config, publicPlans, membership, checkout, portal, refresh, webhook, apvFeeQuote, recordFeeQuote, requestService, requests, completeRequest };
}
module.exports = { createBillingService, PLANS };
