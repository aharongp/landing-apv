'use strict';
// Run with node --env-file=.env scripts/setup-stripe.js [--apply].
const Stripe = require('stripe');
const fs = require('fs');
const path = require('path');
const { PLANS } = require('../services/billing');
async function main() {
  const interval = process.env.BILLING_INTERVAL || 'year';
  const origin = new URL(process.env.PUBLIC_APP_URL || 'https://cars.apvmotorusa.com').origin;
  if (interval !== 'year') throw new Error('Las membresías APV son anuales: BILLING_INTERVAL debe ser year.');
  const description = ['plus','premium'].map(id=>({plan:id,amount:PLANS[id].amount,currency:'usd',interval}));
  console.log('Productos a configurar:',JSON.stringify(description));
  if (!process.argv.includes('--apply')) {console.log('Vista previa. Añade --apply para configurar estos productos, precios, portal y webhook en tu cuenta Stripe.');return;}
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Falta STRIPE_SECRET_KEY.');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY,{maxNetworkRetries:2,timeout:20000});
  const mode=process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')?'live':'test';
  const ids={},products=[];
  for (const id of ['plus','premium']) {
    const productId=`apv_membership_${id}`;
    let product;
    try {product=await stripe.products.retrieve(productId);}
    catch(err) {if(err.code!=='resource_missing')throw err;product=await stripe.products.create({id:productId,name:PLANS[id].name,metadata:{app:'apv',planId:id}},{idempotencyKey:`apv-product-${id}`});}

    const lookup=`apv_${id}_${interval}_usd_${PLANS[id].amount}`;
    const existing=await stripe.prices.list({lookup_keys:[lookup],limit:1});
    const price=existing.data[0]||await stripe.prices.create({product:product.id,currency:'usd',unit_amount:PLANS[id].amount,recurring:{interval},lookup_key:lookup},{idempotencyKey:lookup});
    if(!price.active || price.unit_amount!==PLANS[id].amount || price.currency!=='usd' || price.recurring.interval!==interval)throw new Error('Precio existente incompatible: '+id);
    ids[id]=price.id;products.push({product:product.id,prices:[price.id]});
  }
  const portal=await stripe.billingPortal.configurations.create({business_profile:{headline:'Gestiona tu membresía APV Motors'},default_return_url:origin+'/#planes',
    features:{customer_update:{enabled:true,allowed_updates:['email','address']},invoice_history:{enabled:true},payment_method_update:{enabled:true},
      subscription_cancel:{enabled:true,mode:'at_period_end'},subscription_update:{enabled:true,default_allowed_updates:['price'],products,
        proration_behavior:'always_invoice',schedule_at_period_end:{conditions:[{type:'decreasing_item_amount'}]}}},metadata:{app:'apv'}
  },{idempotencyKey:`apv-portal-${interval}-${ids.plus}-${ids.premium}`});
  const target=origin+'/api/stripe/webhook';
  const endpoints=await stripe.webhookEndpoints.list({limit:100});
  let endpoint=endpoints.data.find(e=>e.url===target),secret=process.env.STRIPE_WEBHOOK_SECRET;
  const enabled_events=['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','invoice.payment_action_required'];
  if(!endpoint) {endpoint=await stripe.webhookEndpoints.create({url:target,enabled_events},{idempotencyKey:`apv-webhook-${origin}`});secret=endpoint.secret;}
  else {await stripe.webhookEndpoints.update(endpoint.id,{enabled_events});}
  const dir=path.join(__dirname,'..','data');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,`stripe-setup-${mode}.env`);
  const values={STRIPE_PRICE_PLUS:ids.plus,STRIPE_PRICE_PREMIUM:ids.premium,STRIPE_PORTAL_CONFIGURATION:portal.id,...(secret?{STRIPE_WEBHOOK_SECRET:secret}:{})};
  fs.writeFileSync(file,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
  console.log(`Configuración ${mode} guardada en ${file}. Copia esas variables a .env y a EasyPanel. No se han creado suscripciones ni cobros.`);
  if(!secret)console.log('El webhook ya existía: copia su secreto de firma desde Stripe a STRIPE_WEBHOOK_SECRET.');
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
