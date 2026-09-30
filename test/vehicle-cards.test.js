const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/app.js','utf8');
const start=source.indexOf('  function comparison(v){'),end=source.indexOf('  function renderVehicles(items)',start);
const context={setInterval(){},document:{addEventListener(){}},window:{APVIcons:require('../public/icons')},currentLang:'en',t:key=>key,esc:value=>String(value??'').replace(/</g,'&lt;').replace(/"/g,'&quot;'),money:n=>'$'+n,cardPrice:n=>Number(n)>0?'$'+n:'N/A',locationLabel:v=>v.location, favoriteButton:lot=>`<button data-favorite="${lot}"></button>`,dateLabel:()=> 'N/A',miles:v=>String(v||'Mileage unconfirmed'),titleDoc:v=>v.titleType||'Title unconfirmed'};
vm.createContext(context);vm.runInContext(source.slice(start,end),context);
test('compact comparison uses buy now and keeps explicit exclusions in the detail',()=>{
 const vehicle={currentBid:1,buyNow:5000,retailValue:10000};
 assert.match(context.comparison(vehicle),/50%/);
 assert.match(context.comparison(vehicle),/\$10000/);
 assert.match(context.comparisonDetails(vehicle),/shipping, taxes and repairs/);
 assert.equal(context.comparisonDetails({currentBid:1,retailValue:10000}),'');
 assert.equal(context.comparison({currentBid:1,retailValue:10000}),'');
 assert.equal(context.comparison({buyNow:12000,retailValue:10000}),'');
 assert.equal(context.comparison({buyNow:Infinity,retailValue:10000}),'');
});
test('shared cards preserve bid/detail/favorite actions and only show available buy now prices',()=>{
 const v={lot:'123',title:'Toyota <test>',currentBid:200,buyNow:14500,location:'Houston, TX'};
 for(const featured of [true,false]){
  const html=context.vehicleCardHTML(v,featured);
  assert.match(html,/Toyota &lt;test>/);assert.match(html,/data-favorite="123"/);
  assert.match(html,/data-action="buy"/);assert.match(html,/data-action="bid"/);assert.match(html,/data-action="detail"/);
  assert.match(html,/\$200/);assert.match(html,/\$14500/);
 }
 const noBuy=context.vehicleCardHTML({...v,currentBid:0,buyNow:0});
 assert.doesNotMatch(noBuy,/class="auction-tile-buy"/);assert.match(noBuy,/<strong>N\/A<\/strong>/);
});
test('card dates keep timezone and include actual sale time',()=>{
 const label=context.auctionCardDate({saleAt:Date.parse('2026-09-29T16:00:00Z'),timeZone:'CDT'});
 assert.match(label,/11:00/);assert.match(label,/CDT/);
 assert.equal(context.auctionTimeLabel({saleAt:null}),'unconfirmedDate');
});

test('card and countdown share canonical instant even when legacy date is misleading',()=>{
 const v={saleAt:Date.parse('2099-09-30T19:00:00Z'),saleDate:'2020-01-01T12:00:00',timeZone:'PDT'};
 assert.match(context.auctionCardDate(v),/12:00/);
 assert.match(context.auctionTimeLabel(v),/d /);
 assert.match(context.comparison({buyNow:600,retailValue:8500}),/92.9%/);
 assert.match(context.comparisonDetails({buyNow:600,retailValue:8500}),/shipping, taxes and repairs/);
});


test('expired auction cards and detail notices agree in Spanish and English',()=>{
 const old={lot:'64228046',title:'Toyota',saleAt:Date.parse('2000-01-01T12:00:00Z'),buyNow:600};
 for(const [lang,label] of [['es','Caducado'],['en','Expired']]){
  context.currentLang=lang;
  assert.equal(context.auctionTimeLabel(old),label);
  assert.match(context.vehicleCardHTML(old),new RegExp('is-expired[^>]*>[\\s\\S]*?'+label));
  const notice=context.auctionExpiryNotice(old);assert.ok(notice.includes('<strong>'+label+'</strong>'));assert.doesNotMatch(notice,/ hidden/);
 }
 context.currentLang='en';
 assert.match(context.auctionExpiryNotice({saleAt:Date.parse('2099-01-01T12:00:00Z')}),/ hidden/);
 assert.match(context.auctionExpiryNotice({saleAt:null}),/ hidden/);
});
