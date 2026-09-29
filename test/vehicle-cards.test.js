const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/app.js','utf8');
const start=source.indexOf('  function comparison(v){'),end=source.indexOf('  function renderVehicles(items)',start);
const context={window:{APVIcons:require('../public/icons')},currentLang:'en',t:key=>key,esc:value=>String(value??'').replace(/</g,'&lt;').replace(/"/g,'&quot;'),money:n=>'$'+n,cardPrice:n=>Number(n)>0?'$'+n:'N/A',locationLabel:v=>v.location, favoriteButton:lot=>`<button data-favorite="${lot}"></button>`,dateLabel:()=> 'N/A'};
vm.createContext(context);vm.runInContext(source.slice(start,end),context);
test('small savings badge uses buy now and never the current bid',()=>{
 assert.match(context.comparison({currentBid:1,buyNow:5000,retailValue:10000}),/50%/);
 assert.equal(context.comparison({currentBid:1,retailValue:10000}),'');
 assert.equal(context.comparison({buyNow:12000,retailValue:10000}),'');
 assert.equal(context.comparison({buyNow:Infinity,retailValue:10000}),'');
});
test('shared cards preserve bid/detail/favorite actions and only show available buy now prices',()=>{
 const v={lot:'123',title:'Toyota <test>',currentBid:200,buyNow:14500,location:'Houston, TX'};
 for(const featured of [true,false]){
  const html=context.vehicleCardHTML(v,featured);
  assert.match(html,/Toyota &lt;test>/);assert.match(html,/data-favorite="123"/);
  assert.match(html,/data-action="bid"/);assert.match(html,/data-action="detail"/);
  assert.match(html,/\$200/);assert.match(html,/\$14500/);
 }
 const noBuy=context.vehicleCardHTML({...v,currentBid:0,buyNow:0});
 assert.doesNotMatch(noBuy,/class="auction-tile-buy"/);assert.match(noBuy,/<strong>N\/A<\/strong>/);
});
test('card dates keep timezone and include actual sale time',()=>{
 const label=context.auctionCardDate({saleDate:'2026-09-29T16:00:00Z',timeZone:'CDT'});
 assert.match(label,/11:00/);assert.match(label,/CDT/);
 assert.equal(context.auctionTimeLabel({saleDate:null}),'N/A');
});
