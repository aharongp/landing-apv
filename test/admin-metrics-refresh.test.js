const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
 const elements=new Map(),timers=new Map();let calls=0,id=0;
 const document={hidden:false,getElementById(name){if(!elements.has(name))elements.set(name,{value:name==='key'?'test-key':'7',hidden:true,dataset:{},addEventListener(type,fn){this[type]=fn;}});return elements.get(name);}};
 const data={totals:{visitors:1,accounts:0,verified:0,converted:0,conversion:0},start:'2026-09-23',end:'2026-09-29',daily:[],pages:[],startedAt:'2026-09-23'};
 vm.runInNewContext(fs.readFileSync('public/admin-metrics.js','utf8'),{document,window:{APVMetricsChart:{mount(){}}},Intl,Date,AbortController,setTimeout(fn,ms){assert.equal(ms,300000);timers.set(++id,fn);return id;},clearTimeout(id){timers.delete(id);},fetch:async url=>{calls++;return {ok:true,json:async()=>url.includes('/ga4')?{status:'not_configured',message:'Pending'}:data};}});
 return {document,elements,timers,calls:()=>calls,async tick(){const [key,fn]=timers.entries().next().value;timers.delete(key);await fn();await new Promise(setImmediate);}};
}
test('admin refresh runs only after authentication, pauses while hidden, and stops on key change',async()=>{
 const h=setup();assert.equal(h.timers.size,0);assert.equal(h.calls(),0);
 await h.elements.get('load-metrics').click();await new Promise(setImmediate);
 assert.equal(h.calls(),2);assert.equal(h.timers.size,1);
 h.document.hidden=true;await h.tick();assert.equal(h.calls(),2);assert.equal(h.timers.size,1);
 h.document.hidden=false;await h.tick();assert.equal(h.calls(),4);assert.equal(h.timers.size,1);
 h.elements.get('key').input();assert.equal(h.timers.size,0);assert.equal(h.elements.get('metrics-panel').hidden,true);
});
