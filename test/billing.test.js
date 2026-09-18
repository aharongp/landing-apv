const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const Stripe = require('stripe');
const { createBillingService } = require('../services/billing');
function fixture(t, changes = {}) {
  const db = new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT)');
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run('u1','Test','test@example.invalid','1234567');
  let time = 1800000000000, nextSession = 0, customerCount = 0;
  const env = {STRIPE_SECRET_KEY:'sk_test_dummy',STRIPE_WEBHOOK_SECRET:'whsec_test',STRIPE_PRICE_PLUS:'price_plus',STRIPE_PRICE_PREMIUM:'price_premium',STRIPE_PORTAL_CONFIGURATION:'bpc_test',PUBLIC_APP_URL:'https://cars.example.test',BILLING_INTERVAL:'year',BILLING_CONSULTATION_CADENCE:'period',BILLING_FEE_SCOPE:'per_vehicle',...changes};
  const subscriptions = new Map(), sessions = new Map(), idempotency = new Map();
  const sdk = new Stripe('sk_test_dummy');
  const stripe = {
    webhooks:sdk.webhooks,
    customers:{create:async()=>{customerCount++;return {id:'cus_u1'};}},
    prices:{retrieve:async id=>({id,active:true,currency:'usd',unit_amount:id==='price_plus'?9700:29700,recurring:{interval:'year',interval_count:1},livemode:false,billing_scheme:'per_unit'})},
    subscriptions:{list:async()=>({data:[...subscriptions.values()],has_more:false}),retrieve:async id=>subscriptions.get(id)},
    invoices:{retrieve:async()=>{throw Error('unexpected invoice lookup');}},
    checkout:{sessions:{
      create:async(params,options)=>{if(idempotency.has(options.idempotencyKey))return idempotency.get(options.idempotencyKey);const s={id:'cs_'+(++nextSession),url:'https://checkout.stripe.com/test_'+nextSession,status:'open',expires_at:time/1000+3600,params};sessions.set(s.id,s);idempotency.set(options.idempotencyKey,s);return s;},
      retrieve:async id=>sessions.get(id),expire:async id=>{sessions.get(id).status='expired';}
    }},
    billingPortal:{sessions:{create:async params=>({url:'https://billing.stripe.com/test',params})}}
  };
  const service=createBillingService({database:()=>db,env,stripe,now:()=>time});
  const user={id:'u1',name:'Test',email:'test@example.invalid'};
  function subscription(plan='plus',status='active',id='sub_1') {
    return {id,customer:'cus_u1',status,cancel_at_period_end:false,items:{data:[{price:{id:'price_'+plan},quantity:1,current_period_start:time/1000-100,current_period_end:time/1000+1000}]},latest_invoice:{id:'in_1',status:'paid',lines:{data:[{pricing:{price_details:{price:'price_'+plan}}}]}}};
  }
  async function send(type, object, id='evt_'+Math.random()) {
    const raw=JSON.stringify({id,livemode:false,type,data:{object}});
    const signature=sdk.webhooks.generateTestHeaderString({payload:raw,secret:env.STRIPE_WEBHOOK_SECRET});
    return service.webhook(Buffer.from(raw),signature);
  }
  return {db,service,user,stripe,env,subscriptions,sessions,subscription,send,setTime:v=>{time=v;},now:()=>time,customers:()=>customerCount};
}
test('plans fail closed until business terms and Stripe settings are configured',async t=>{
 const f=fixture(t,{BILLING_INTERVAL:'month'});
 assert.equal(f.service.publicPlans().available,false);
 await assert.rejects(f.service.checkout(f.user,'plus'),{statusCode:503});
 assert.equal(f.customers(),0);
 assert.equal(f.service.membership('u1').plan.id,'free');
});
test('checkout rejects client amounts, reuses sessions and prevents duplicate subscriptions',async t=>{
 const f=fixture(t);
 await assert.rejects(f.service.checkout(f.user,'free'),{statusCode:400});
 const first=await f.service.checkout(f.user,'plus'),second=await f.service.checkout(f.user,'plus');
 assert.equal(first.url,second.url);assert.equal(f.sessions.size,1);assert.equal(f.customers(),1);
 assert.deepEqual(f.sessions.get('cs_1').params.line_items,[{price:'price_plus',quantity:1}]);
 await f.service.checkout(f.user,'premium');assert.equal(f.sessions.get('cs_1').status,'expired');assert.equal(f.sessions.size,2);
 f.subscriptions.set('sub_1',f.subscription('premium'));
 await assert.rejects(f.service.checkout(f.user,'plus'),{statusCode:409});
});
test('concurrent checkouts create only one session',async t=>{
 const f=fixture(t);const outcomes=await Promise.allSettled([f.service.checkout(f.user,'plus'),f.service.checkout(f.user,'plus')]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.sessions.size,1);
});
test('configured price amount must match the advertised price',async t=>{
 const f=fixture(t);f.stripe.prices.retrieve=async()=>({active:true,currency:'usd',unit_amount:970,recurring:{interval:'year',interval_count:1},livemode:false,billing_scheme:'per_unit'});
 await assert.rejects(f.service.checkout(f.user,'plus'),{statusCode:503});assert.equal(f.customers(),0);
});
test('signed payments grant discounts; duplicates do not grant multiple consultations',async t=>{
 const f=fixture(t);await f.service.checkout(f.user,'plus');
 const s=f.subscription();f.subscriptions.set(s.id,s);
 await f.send('invoice.paid',{customer:s.customer,parent:{subscription_details:{subscription:s.id}}},'evt_paid');
 const member=f.service.membership('u1');assert.equal(member.plan.id,'plus');assert.equal(member.benefits.length,1);assert.equal(member.benefits[0].minutes,20);
 assert.deepEqual(f.service.apvFeeQuote('u1',4000),{planId:'plus',base:350,discount:100,total:250});
 await f.send('invoice.paid',{customer:s.customer,parent:{subscription_details:{subscription:s.id}}},'evt_paid');
 assert.equal(f.service.membership('u1').benefits.length,1);
 f.service.requestService(f.user,'included_consultation');
 assert.throws(()=>f.service.requestService(f.user,'included_consultation'),{statusCode:409});
 assert.equal(f.service.requests().length,1);
 assert.equal(f.service.apvFeeQuote('other-user',4000).discount,0);
});
test('invalid signatures cannot grant benefits',async t=>{
 const f=fixture(t);await assert.rejects(f.service.webhook(Buffer.from('{}'),'invalid'),{statusCode:400});assert.equal(f.service.membership('u1').plan.id,'free');
});
test('unpaid upgrades do not grant Premium; cancel-at-end preserves paid benefits',async t=>{
 const f=fixture(t);await f.service.checkout(f.user,'plus');let s=f.subscription();f.subscriptions.set(s.id,s);await f.service.refresh(f.user);
 s.items.data[0].price.id='price_premium'; // Old paid invoice is still for Plus.
 await f.send('customer.subscription.updated',s);assert.equal(f.service.membership('u1').plan.id,'plus');
 s.latest_invoice={id:'in_upgrade',status:'paid',lines:{data:[{pricing:{price_details:{price:'price_premium'}}}]}};
 s.cancel_at_period_end=true;await f.service.refresh(f.user);
 assert.equal(f.service.membership('u1').plan.id,'premium');assert.equal(f.service.membership('u1').cancelAtPeriodEnd,true);
 assert.equal(f.service.membership('u1').benefits[0].minutes,60);
 f.setTime((s.items.data[0].current_period_end+1)*1000);assert.equal(f.service.membership('u1').plan.id,'free');
});
test('out-of-order events retrieve current state and do not reactivate canceled plans',async t=>{
 const f=fixture(t);await f.service.checkout(f.user,'plus');const s=f.subscription();f.subscriptions.set(s.id,s);await f.service.refresh(f.user);
 const old={...s};s.status='canceled';await f.send('customer.subscription.updated',old);assert.equal(f.service.membership('u1').plan.id,'free');
});
test('annual renewal grants one new consultation without restoring the used benefit',async t=>{
 const f=fixture(t);await f.service.checkout(f.user,'plus');const s=f.subscription();f.subscriptions.set(s.id,s);await f.service.refresh(f.user);f.service.requestService(f.user,'included_consultation');
 f.setTime(f.now()+31536000000);
 s.latest_invoice.id='in_renew';s.items.data[0].current_period_start+=31536000;s.items.data[0].current_period_end+=31536000;
 await f.service.refresh(f.user);await f.service.refresh(f.user);
 const benefits=f.service.membership('u1').benefits;
 assert.equal(benefits.length,1);assert.equal(benefits[0].requestedAt,null);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM billing_benefits').get().n,2);
});
test('confirmed public terms show annual prices and the Quick Call base price',t=>{
 const f=fixture(t);const plans=f.service.publicPlans();
 assert.equal(plans.interval,'year');assert.equal(plans.consultationCadence,'period');assert.equal(plans.consultationPrice,99);
 assert.deepEqual(plans.plans.map(p=>99-p.consultationDiscount),[99,69,59]);
});
