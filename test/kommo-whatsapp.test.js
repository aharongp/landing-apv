const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function service(records, request = async () => ({status:202})) {
  const calls = [];
  const context = {
    module: {exports:{}}, __dirname: path.join(__dirname, '../services'),
    require: name => name === './catalogDb' ? {getUserSyncRecords: user => records.filter(r => r.apvUserId === user)} : require(name),
    process: {env:{KOMMO_SUBDOMAIN:'apvmotorusa', KOMMO_WHATSAPP_BOT_ID:'93029'}}, console,
    request: async (...args) => { calls.push(args); return request(...args); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services/kommo.js'),'utf8') +
    '\nkommoFetch=request;isEnabled=()=>true;readEnvFile=()=>({});', context);
  return { run: context.module.exports.requestWhatsAppTransfer, calls };
}
const record = (leadId, apvUserId='alice') => ({apvUserId, chatKey:`apv:${apvUserId}`, leadId});

test('handoff only runs on one existing lead belonging to the signed-in visitor', async () => {
  const {run,calls} = service([record(11), record(11), record(22,'bob')]);
  assert.equal((await run('alice')).requested, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['/api/v4/bots/run', {
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
  assert.equal((await run('alice')).code,'WHATSAPP_COOLDOWN');
  release({status:202}); await first;
  assert.equal(calls.length,1);
  const failed=service([record(11)],async()=>{throw new Error('timeout');});
  await assert.rejects(failed.run('alice'),/timeout/);
  assert.equal((await failed.run('alice')).code,'WHATSAPP_COOLDOWN');
  assert.equal(failed.calls.length,1);
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
 assert.equal(calls[1][1].body[0].entity_id,71);
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
 assert.equal(calls.length,2);
});
