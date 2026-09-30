const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
function form({currentBid=700,amount=699,mode='bid',lang='es',serverError}={}){
  const input={value:String(amount),message:'',reports:0,setCustomValidity(message){this.message=message;},reportValidity(){this.reports++;},focus(){}};
  const calls=[];
  const context=vm.createContext({
    state:{user:{id:'test'},currentVehicle:{lot:'71000001',currentBid},purchaseMode:mode},
    dom:{bidAmount:input},currentLang:lang,money:value=>`$${value}`,window:{},showToast(){},
    api:async(...args)=>{calls.push(args);throw serverError||new Error('Stop before chat side effects');}
  });
  vm.runInContext(source.slice(source.indexOf('  function validateBidAmount(){'),source.indexOf('  async function openBid(')),context);
  vm.runInContext(source.slice(source.indexOf('  async function continueBid(){'),source.indexOf("    dom.bidAmountStep.classList.add('hidden');",source.indexOf('  async function continueBid(){')))+'\n}',context);
  return {context,input,calls,submit:()=>vm.runInContext('continueBid()',context)};
}

test('bid form blocks a lower maximum and accepts the current bid after correction',async()=>{
  const f=form();await f.submit();
  assert.equal(f.calls.length,0);assert.equal(f.input.min,'700');assert.match(f.input.message,/700/);assert.equal(f.input.reports,1);
  f.input.value='700';await f.submit();assert.equal(f.calls.length,1);assert.equal(f.input.message,'');
  f.input.value='701';await f.submit();assert.equal(f.calls.length,2);
});

test('bid form resets minimum for vehicles without a bid and for Buy It Now',async()=>{
  const f=form();await f.submit();
  f.context.state.currentVehicle.currentBid=0;f.input.value='1';await f.submit();
  assert.equal(f.input.min,'1');assert.equal(f.input.message,'');assert.equal(f.calls.length,1);
  f.context.state.currentVehicle.currentBid=700;f.context.state.purchaseMode='buy';f.input.value='600';await f.submit();
  assert.equal(f.input.min,'1');assert.equal(f.calls.length,2);
  f.input.value='';await f.submit();assert.equal(f.calls.length,2);
});

test('bid form applies a higher current bid reported by the server without raising the user amount',async()=>{
  const f=form({amount:700,lang:'en',serverError:Object.assign(new Error('Bid changed'),{status:409,data:{code:'BID_BELOW_CURRENT',currentBid:800}})});
  await f.submit();assert.equal(f.calls.length,1);assert.equal(f.input.value,'700');assert.equal(f.input.min,'800');assert.match(f.input.message,/at least \$800/);
  await f.submit();assert.equal(f.calls.length,1,'Repeat attempt is blocked in the browser');
});
