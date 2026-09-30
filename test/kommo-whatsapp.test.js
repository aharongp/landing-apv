const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function service(records, request = async () => ({status:202}), leadRequest) {
  const calls = [];
  const context = {
    module: {exports:{}}, __dirname: path.join(__dirname, '../services'),
    require: name => name === './catalogDb' ? {getUserSyncRecords: user => records.filter(r => r.apvUserId === user)} : require(name),
    process: {env:{KOMMO_SUBDOMAIN:'apvmotorusa', KOMMO_WHATSAPP_BOT_ID:'93029'}}, console,
    request: async (...args) => { calls.push(args); const match = args[0].match(/^\/api\/v4\/leads\/(\d+)\?with=contacts$/); return match ? (leadRequest ? leadRequest(...args) : {status:200,data:{id:Number(match[1])}}) : request(...args); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services/kommo.js'),'utf8') +
    '\nkommoFetch=request;isEnabled=()=>true;readEnvFile=()=>({});', context);
  return { run: context.module.exports.requestWhatsAppTransfer, calls };
}
const record = (leadId, apvUserId='alice') => ({apvUserId, chatKey:`apv:${apvUserId}`, leadId});

test('handoff only runs on one existing lead belonging to the signed-in visitor', async () => {
  const {run,calls} = service([record(11), record(11), record(22,'bob')]);
  assert.equal((await run('alice')).requested, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1])), ['/api/v4/bots/run', {
    method:'POST', maxRetries:0, body:[{bot_id:93029,entity_id:11,entity_type:'leads'}]
  }]);
  assert.equal((await run('unknown')).code,'CHAT_NOT_LINKED');
  assert.equal(calls.filter(([,o])=>o.method==='POST').length,1);
});

test('missing, mismatched and ambiguous conversations never create or message a lead', async () => {
  for (const records of [[],[record(null)],[{...record(11),chatKey:'apv:someone-else'}],[record(11),record(12)]]) {
    const {run,calls}=service(records);
    assert.equal((await run('alice')).code,'CHAT_NOT_LINKED');
    assert.equal(calls.filter(([,o])=>o.method==='POST').length,0);
  }
});

test('concurrent clicks and ambiguous failures do not launch duplicate bots', async () => {
  let release;
  const {run,calls}=service([record(11)],()=>new Promise(resolve=>{release=resolve;}));
  const first=run('alice');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await run('alice')).code,'WHATSAPP_COOLDOWN');
  release({status:202}); await first;
  assert.equal(calls.filter(([,o])=>o.method==='POST').length,1);
  const failed=service([record(11)],async()=>{throw new Error('timeout');});
  await assert.rejects(failed.run('alice'),/timeout/);
  assert.equal((await failed.run('alice')).code,'WHATSAPP_COOLDOWN');
  assert.equal(failed.calls.filter(([,o])=>o.method==='POST').length,1);
});

test('visible handoff button requests a link once and presents recoverable errors', async () => {
  const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
  const handler=source.slice(source.indexOf("  $('#chat-whatsapp-button')?.addEventListener"),source.indexOf("  dom.chatReopenButton?.addEventListener"));
  let click, release, requests=0;
  const button={disabled:false,addEventListener:(_,fn)=>{click=fn;},setAttribute(){},removeAttribute(){}};
  const status={dataset:{},classList:{remove(){}},textContent:''};
  const context={$:selector=>selector==='#chat-whatsapp-button'?button:status,t:key=>key,api:async(url,options)=>{
    assert.equal(url,'/api/kommo/whatsapp-transfer');assert.equal(options.method,'POST');requests++;
    return new Promise(resolve=>{release=resolve;});
  }};
  vm.runInNewContext(handler,context);
  const first=click(); await click();assert.equal(requests,1);assert.equal(button.disabled,true);
  release({ok:true});await first;assert.equal(status.textContent,'whatsappRequested');assert.equal(button.disabled,false);
  context.api=async()=>{throw {data:{code:'CHAT_NOT_LINKED'}};};
  await click();assert.equal(status.textContent,'whatsappNotLinked');assert.equal(button.disabled,false);
  context.api=async()=>{throw new Error('offline');};
  await click();assert.equal(status.textContent,'whatsappUnavailable');assert.equal(button.disabled,false);
});

const contact = (id, leads=[71], fieldId=1126783) => ({id:21,custom_fields_values:[{field_id:fieldId,values:[{value:id}]}],_embedded:{leads:leads.map(id=>({id}))}});
test('late first message recovers the existing lead by exact APV identity without creating entities',async()=>{
 const {run,calls}=service([record(null)],async(endpoint,options)=>options.method==='POST'?{status:202}:{data:{_embedded:{contacts:[contact('alice')]}}});
 assert.equal((await run('alice')).requested,true);
 assert.match(calls[0][0],/contacts\?query=alice&with=leads/);
 assert.equal(calls[2][1].body[0].entity_id,71);
 assert.equal(calls.filter(([,o])=>o.method==='POST').length,1);
});
test('recovery refuses partial identities, unrelated fields, multiple contacts, leads and truncated searches',async()=>{
 for(const data of [
  {_embedded:{contacts:[contact('alice-extra')]}},
  {_embedded:{contacts:[contact('alice',[71],479326)]}},
  {_embedded:{contacts:[contact('alice'),contact('alice')]}},
  {_embedded:{contacts:[contact('alice',[71,72])]}},
  {_links:{next:{href:'next'}},_embedded:{contacts:[contact('alice')]}}
 ]){
  const {run,calls}=service([],async()=>({data}));
  assert.equal((await run('alice')).code,'CHAT_NOT_LINKED');
  assert.equal(calls.filter(([,o])=>o.method==='POST').length,0);
 }
});
test('concurrent recovery shares the lookup and launches the bot only once',async()=>{
 let release;
 const {run,calls}=service([],async(endpoint,options)=>options.method==='POST'?{status:202}:new Promise(resolve=>{release=resolve;}));
 const first=run('alice'),second=run('alice');
 release({data:{_embedded:{contacts:[contact('alice')]}}});
 const results=await Promise.all([first,second]);
 assert.equal(results.filter(r=>r.requested).length,1);
 assert.equal(results.filter(r=>r.code==='WHATSAPP_COOLDOWN').length,1);
 assert.equal(calls.length,3);
});

test('a deleted cached lead never starts a bot and reports the actual problem', async () => {
  for (const missing of [{status:204}, {status:200,data:{id:11,is_deleted:true}}]) {
    const {run,calls}=service([record(11)], async()=>({status:204}), async()=>missing);
    assert.equal((await run('alice')).code,'CHAT_LEAD_REMOVED');
    assert.equal(calls.some(([,o])=>o.method==='POST'),false);
  }
});

test('a stale mapping recovers only a live lead with the exact APV identity', async () => {
  const {run,calls}=service([record(11)],async(endpoint,options)=>options.method==='POST'?{status:202}:{data:{_embedded:{contacts:[contact('alice')]}}},
    async endpoint=>endpoint.includes('/11?')?{status:204}:{status:200,data:{id:71}});
  assert.equal((await run('alice')).requested,true);
  assert.equal(calls.find(([,o])=>o.method==='POST')[1].body[0].entity_id,71);
});

test('a removed lead returned in contact links is not a usable conversation', async () => {
  const {run,calls}=service([],async()=>({data:{_embedded:{contacts:[contact('alice')]}}}),async()=>({status:204}));
  assert.equal((await run('alice')).code,'CHAT_NOT_LINKED');
  assert.equal(calls.some(([,o])=>o.method==='POST'),false);
});

test('reopening includes account identity before loading the widget without zeroing the budget', () => {
  const win={setTimeout(){},clearTimeout(){}};
  let captured;
  const document={getElementById:()=>null,createElement:()=>({}),head:{appendChild(){captured=JSON.parse(JSON.stringify(win.crm_plugin.params));}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/kommo.js'),'utf8'),{window:win,document,console:{info(){}}});
  const result=win.apvKommo.reopenConversation({lot:'123',title:'Test car'},{kommoUserId:'alice',name:'Alice',email:'alice@example.test',phone:'+15550000001'});
  assert.equal(result.ok,true);
  assert.equal(win.crmPluginConfig.onlinechat.user_id,'apv:alice');
  assert.equal(captured[0].contact.custom_fields.find(f=>f.id===1126783).values[0].value,'alice');
  assert.equal(captured.some(p=>p.lead||p.note),false);
});

test('bid sync recovers accepted chats by exact account field, not native visitor UID or main contact',async()=>{
 const saved=[],updates=[],requests=[];
 const catalog={getSyncRecord:()=>null,getUserSyncRecords:()=>[],saveSyncRecord:r=>saved.push(r)};
 const context={module:{exports:{}},require:n=>n==='./catalogDb'?catalog:require(n),__dirname:path.join(__dirname,'../services'),process:{env:{}},console,
 request:async(ep,o={})=>{requests.push([ep,o]);if(ep.startsWith('/api/v4/contacts?'))return {data:{_embedded:{contacts:[contact('alice')]}}};if(ep==='/api/v4/leads/71?with=contacts')return {status:200,data:{id:71,_embedded:{contacts:[{id:999,is_main:true},{id:21}]}}};return {data:{}};},
 updated:(id)=>updates.push(id)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services/kommo.js'),'utf8')+'\nkommoFetch=request;findKommoIncomingLead=async()=>null;updateContact=async(id)=>updated(id);updateLead=async()=>{};updateActiveBidsSummary=async()=>{};',context);
 const result=await context.module.exports.syncBid({user:{kommoUserId:'alice'},vehicle:{lot:'123',title:'Car'},maxBid:3000});
 assert.equal(result.leadId,71);assert.equal(result.contactId,21);assert.deepEqual(updates,[21]);
 assert.equal(saved[0].chatKey,'apv:alice');
 assert.equal(requests.some(([ep,o])=>o.method==='POST'&&ep==='/api/v4/leads'),false);
});

test('My bids rebuilds chat memory on a new device before reopening',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const handler=source.slice(source.indexOf("  $('#my-bids-button')?.addEventListener"),source.indexOf('  dom.bidChatStep.addEventListener'));
 for(const localBids of [[],[{lot:'123'}]]){
  let click,remembered,reopened=false;
  const context={$:()=>({addEventListener:(_,fn)=>click=fn}),state:{user:{kommoUserId:'alice'}},getUserBidsHistory:()=>localBids,
   api:async()=>({ok:true,bids:[{lot:'123'}]}),getVehicle:async lot=>({lot}),rememberChat:v=>remembered=v.lot,
   reopenLastChat:()=>{assert.equal(remembered,'123');reopened=true;},showToast:msg=>assert.fail(msg),currentLang:'es'};
  vm.runInNewContext(handler,context);await click();assert.equal(reopened,true);
 }
});

test('chat ready sends contact and lead metadata together before showing the chat',()=>{
 const win={setTimeout(){},clearTimeout(){}};
 const document={getElementById:()=>null,createElement:()=>({}),head:{appendChild(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/kommo.js'),'utf8'),{window:win,document,console:{info(){}}});
 win.apvKommo.sendBidContext({lot:'123',title:'Test car'},3000,{kommoUserId:'alice',name:'Alice'},[]);
 const ready=Array.from(win.crmPlugin.q).find(call=>call[0]==='onChatReady')[1];
 const sent=[];win.crm_plugin.setMeta=payload=>sent.push(payload);ready();
 assert.equal(sent.length,1);
 assert.equal(sent[0].contact.custom_fields.find(f=>f.id===1126783).values[0].value,'alice');
 assert.equal(sent[0].lead.sale,3000);
 assert.equal(sent[0].bot_params.lot,'123');
});

const verifiedUser = {email:'alice@example.test',phone:'+15550000001',emailVerified:1};
function legacyRecovery(options={}) {
 const legacy={id:21,custom_fields_values:[
  {field_id:479326,values:[{value:'alice@example.test'}]},
  {field_id:479324,values:[{value:'+1 555 000 0001'}]}
 ],_embedded:{leads:[{id:71}]}};
 if(options.edit)options.edit(legacy);
 const lead={id:71,pipeline_id:14370344,status_id:110996284,_embedded:{contacts:[{id:21,is_main:true}]},...options.lead};
 const talks={_embedded:{talks:[{contact_id:21,origin:'onlinechat',source_id:73183,entity_type:'lead',entity_id:71}]},...options.talks};
 return service([],async(ep,o={})=>{
  if(ep.includes('query=alice&'))return {data:{_embedded:{contacts:[]}}};
  if(ep.includes('query=alice%40example.test'))return {data:{_embedded:{contacts:options.duplicate?[legacy,legacy]:[legacy]},...options.search}};
  if(ep.includes('/talks?'))return {data:talks};
  if(ep==='/api/v4/contacts/21?with=leads')return {data:options.fresh||legacy};
  if(o.method==='PATCH'||ep==='/api/v4/bots/run')return {status:202};
  throw Error('Unexpected endpoint '+ep);
 },async()=>({status:200,data:lead}));
}

test('legacy contact recovery verifies server account, phone, unique lead and native chat before binding',async()=>{
 const {run,calls}=legacyRecovery();
 assert.equal((await run('alice',verifiedUser)).requested,true);
 const mutations=calls.filter(([,o])=>['PATCH','POST'].includes(o.method));
 assert.equal(mutations.length,2);
 assert.equal(mutations[0][0],'/api/v4/contacts/21');
 assert.equal(mutations[0][1].body.custom_fields_values[0].values[0].value,'alice');
 assert.equal(mutations[1][1].body[0].entity_id,71);
});

test('legacy recovery rejects unverified identities, conflicting ownership and ambiguous or unrelated chats',async()=>{
 const cases=[
  {user:{...verifiedUser,emailVerified:0}},
  {user:{...verifiedUser,phone:'+15559999999'}},
  {duplicate:true},
  {search:{_links:{next:{href:'next'}}}},
  {edit:c=>c.custom_fields_values.push({field_id:1126783,values:[{value:'bob'}]})},
  {edit:c=>c.custom_fields_values[0].values.push({value:'bob@example.test'})},
  {edit:c=>c._embedded.leads.push({id:72})},
  {lead:{is_deleted:true}},
  {lead:{status_id:142}},
  {lead:{pipeline_id:11193467}},
  {lead:{_embedded:{contacts:[{id:999,is_main:true},{id:21}]}}},
  {talks:{_embedded:{talks:[{contact_id:21,origin:'waba',source_id:62880,entity_type:'lead',entity_id:71}]}}},
  {talks:{_embedded:{talks:[{contact_id:21,origin:'onlinechat',source_id:73183,entity_type:'lead',entity_id:72}]}}},
  {fresh:{id:21,custom_fields_values:[],_embedded:{leads:[{id:71}]}}}
 ];
 for(const opts of cases){
  const {run,calls}=legacyRecovery(opts);
  assert.equal((await run('alice',opts.user||verifiedUser)).code,'CHAT_NOT_LINKED');
  assert.equal(calls.some(([,o])=>['PATCH','POST'].includes(o.method)),false);
 }
});
