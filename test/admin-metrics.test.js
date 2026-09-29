const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createMetrics}=require('../services/adminMetrics');
function setup(){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users (id TEXT PRIMARY KEY,createdAt TEXT,emailVerified INTEGER)');let clock=new Date('2026-09-27T12:00:00Z');const metrics=createMetrics(db,()=>clock);return {db,metrics,setClock:value=>clock=new Date(value)};}
const req=(cookie='')=>({headers:{cookie,'user-agent':'normal-browser'},socket:{encrypted:true}});
test('visits require consent, exclude invalid pages and bots, and deduplicate browsers across refreshes',()=>{
 const {db,metrics}=setup();
 assert.equal(metrics.visit(req(),{path:'/',cookieConsent:'essential'}),null);
 assert.equal(metrics.visit(req(),{path:'/admin',cookieConsent:'all'}),null);
 assert.equal(metrics.visit({headers:{'user-agent':'Googlebot'},socket:{}},{path:'/',cookieConsent:'all'}),null);
 const cookie=metrics.visit(req(),{path:'/',cookieConsent:'all'});assert.match(cookie,/HttpOnly; SameSite=Lax; Secure/);
 metrics.visit(req(cookie),{path:'/',cookieConsent:'all'});metrics.visit(req(cookie),{path:'/lp',cookieConsent:'all'});
 const result=metrics.summary(7);assert.equal(result.totals.visitors,1);assert.equal(result.pages.length,2);assert.equal(result.daily[0].visitors,null);assert.equal(result.totals.conversion,0);db.close();
});
test('conversion counts verified measured browsers once and separates all accounts from attributed registrations',()=>{
 const {db,metrics,setClock}=setup();const cookie=metrics.visit(req(),{path:'/lp',cookieConsent:'all'});
 db.prepare('INSERT INTO users VALUES (?,?,?)').run('a','2026-09-27T12:01:00Z',1);
 db.prepare('INSERT INTO users VALUES (?,?,?)').run('b','2026-09-27T13:00:00Z',0);
 metrics.registration({id:'a',emailVerified:1},req(cookie),'all');metrics.registration({id:'a',emailVerified:1},req(cookie),'all');
 metrics.registration({id:'b',emailVerified:0},req(cookie),'all');metrics.registration({id:'c',emailVerified:1},req(cookie),'essential');metrics.registration({id:'d',emailVerified:1},req(),'all');
 let total=metrics.summary(30).totals;assert.deepEqual(total,{visitors:1,accounts:2,verified:1,converted:1,conversion:100});
 setClock('2026-09-28T12:00:00Z');metrics.visit(req(cookie),{path:'/catalogo',cookieConsent:'all'});assert.equal(metrics.summary(7).totals.visitors,1);
 setClock('2026-10-20T12:00:00Z');total=metrics.summary(7).totals;assert.equal(total.visitors,0);assert.equal(total.conversion,null);assert.throws(()=>metrics.summary(1000),RangeError);db.close();
});
