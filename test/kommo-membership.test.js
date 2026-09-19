const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {PLANS}=require('../services/billing');
test('existing car conversation records plan changes once, including a return to a previous plan',async()=>{
 const notes=[];
 const catalog={getUserSyncRecords:()=>[{leadId:10,contactId:20,lot:'123'}],getBidIntents:()=>[{userId:'u1',lot:'123',maxBid:5000}],findVehicleByLotOrId:()=>({title:'Test vehicle',vin:'TESTVIN'})};
 const context={module:{exports:{}},require:name=>name==='./catalogDb'?catalog:require(name),__dirname:path.join(__dirname,'../services'),console:{log(){},warn(){}},process:{env:{}},request:async(endpoint,options={})=>{
   if(options.method==='POST'){notes.unshift({params:{text:options.body[0].params.text}});return {data:{}};}
   return {data:{_embedded:{notes}}};
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services/kommo.js'),'utf8')+'\nkommoFetch=request;getLeadFieldIds=async()=>({});',context);
 const user={id:'u1',kommoUserId:'apv-u1',name:'Test',membership:{plan:PLANS.free,status:'free'}};
 const sync=()=>context.module.exports.updateActiveBidsSummary(user,{strict:true,noteOnly:true});
 await sync();await sync();assert.equal(notes.length,1);
 user.membership={plan:PLANS.plus,status:'active',paidThrough:1900000000};await sync();await sync();assert.equal(notes.length,2);assert.match(notes[0].params.text,/APV Plus/);assert.match(notes[0].params.text,/\$100 USD/);
 user.membership={plan:PLANS.premium,status:'active',paidThrough:1900000000};await sync();assert.equal(notes.length,3);assert.match(notes[0].params.text,/APV Premium/);
 user.membership={plan:PLANS.plus,status:'active',paidThrough:1900000000};await sync();assert.equal(notes.length,4);assert.match(notes[0].params.text,/APV Plus/);
});
