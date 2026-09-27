const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {quote}=require('../public/budget');
// Exercise the guide against the production vehicle calculator, including fee jumps.
const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
const context=vm.createContext({window:{}});
vm.runInContext(source.slice(source.indexOf('  function getCopartBuyerFee('),source.indexOf('  function renderCalculatorHTML(')),context);
const estimate=bid=>context.window.apvBaseCostEstimate(bid);
test('budget guide reserves additional costs and never exceeds the requested total',()=>{
 for(const total of [1000,6000,7000,10000,11500,15000,17500,22000,50000]){
  const reserve=Math.floor(total*.2);
  const result=quote(total,reserve,estimate);
  assert.ok(result.bid>0);
  assert.equal(result.total,result.purchase+reserve);
  assert.ok(result.total<=total);
  assert.ok(estimate(result.bid+1).total+reserve>total,'the next dollar must exceed this budget');
 }
});
test('base-fee guide is consistent for anonymous and paid members',()=>{
 const base=quote(10000,2000,estimate);
 context.window.apvMembership={getPlan:()=>({feeDiscount:100})};
 assert.deepEqual(quote(10000,2000,estimate),base);
 delete context.window.apvMembership;
});
test('budget guide rejects invalid budgets and insufficient purchase funds',()=>{
 for(const [total,reserve] of [[0,0],[1000,1000],[1000,-1],[NaN,0],[Infinity,0],[1000001,0],[1000,999]]) assert.throws(()=>quote(total,reserve,estimate),RangeError);
});
test('displayed APV fee tiers match the vehicle calculator',()=>{
 for(const [bid,fee] of [[1,350],[5999,350],[6000,450],[9999,450],[10000,650],[14999,650],[15000,700]]) assert.equal(context.getApvFee(bid),fee);
});
