const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apv-test-'));
process.env.APV_DATA_DIR=dir;
const catalog=require('../services/catalogDb');
after(()=>{catalog.initDatabase().close();fs.rmSync(dir,{recursive:true,force:true});});
const headers=['Lot number','Year','Make','Model Group','VIN','Image Thumbnail','Sale Date M/D/CY','Sale time (HHMM)','Time Zone','Runs/Drives','Special Note','Damage Description','Image URL'];
const row=(lot, changes={})=>Object.assign({'Lot number':lot,Year:'2023',Make:'CHEVROLET','Model Group':'SILVERADO',VIN:'1ABCDEFGHI2345678','Image Thumbnail':'https://cs.copart.com/test_thb.jpg','Sale Date M/D/CY':'20990101','Sale time (HHMM)':'1200','Time Zone':'PST','Runs/Drives':'Run & Drive Verified','Special Note':'','Damage Description':'NORMAL WEAR','Image URL':'https://inventoryv2.copart.io/v1/lotImages/test'},changes);
const csv=rows=>[headers,...rows.map(r=>headers.map(h=>r[h]||''))].map(r=>r.map(c=>'"'+c.replaceAll('"','""')+'"').join(',')).join('\r\n');
test('CSV handles inch marks, commas, multiline and escaped quotes',()=>{
 assert.deepEqual(catalog.parseCsv('a,b\n22" wheel,test\n"hello, ""world""\nagain",ok'),[['a','b'],['22" wheel','test'],['hello, "world"\nagain','ok']]);
 assert.throws(()=>catalog.parseCsv('a,b\n"unfinished'));
});
test('snapshot import, filters, deduplication, expiry, rollback and favorites',()=>{
 const input=csv([row('12345678'),row('12345678'),row('22345678',{'Sale Date M/D/CY':'20000101'}),row('32345678',{'Sale Date M/D/CY':'0','Runs/Drives':'DEFAULT'}),row('bad'),row('42345678',{Make:'FORD TRUCK','Model Group':'F150','Runs/Drives':'Vehicle Starts'})]);
 const stats=catalog.upsertCatalogFromCsv(input);
 assert.equal(stats.totalInDb,3);assert.equal(stats.duplicates,1);assert.equal(stats.expired,1);assert.equal(stats.skipped,1);
 assert.equal(catalog.queryVehicles({q:'silverado 2023'}).total,2);
 assert.equal(catalog.queryVehicles({q:'2023 silverado',model:'SILVERADO',runAndDrive:'1'}).total,1);
 assert.equal(catalog.queryVehicles({model:'F150',make:'CHEVROLET'}).total,0);
 assert.equal(catalog.queryVehicles({favorites:'12345678,42345678'}).total,2);
 assert.equal(catalog.queryVehicles({favorites:''}).total,0);
 const f=catalog.getFilterMetadata();assert.equal(f.minYear,1950);assert.deepEqual(f.makes,['CHEVROLET','FORD']);assert.deepEqual(f.modelsByMake.FORD,['F150']);
 assert.equal(catalog.findVehicleByLotOrId('12345678').saleDate,'2099-01-01T12:00:00');
 assert.equal(catalog.upsertCatalogFromCsv(input).unchanged,true);
 assert.throws(()=>catalog.upsertCatalogFromCsv(csv([row('bad')])));assert.equal(catalog.getVehicleCount(),3);
 catalog.upsertCatalogFromCsv(csv([row('52345678')]));assert.equal(catalog.getVehicleCount(),1);assert.equal(catalog.findVehicleByLotOrId('12345678'),null);
});
test('sale time uses export timezone and rejects impossible dates',()=>{
 assert.equal(catalog.saleTimestamp('20260917','1200','PDT'),Date.parse('2026-09-17T19:00:00Z'));
 assert.equal(catalog.saleTimestamp('20260230','1200','EST'),null);
});
test('account favorites are isolated and repair bypasses hash without changing accounts or bids',()=>{
 const input=csv([row('62345678')]);
 catalog.upsertCatalogFromCsv(input);
 const db=catalog.initDatabase();
 db.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)').run('user-a','A','a@example.test');
 db.prepare('INSERT INTO bid_intents (id, userId, lot) VALUES (?, ?, ?)').run('bid-a','user-a','62345678');
 catalog.setFavorite('user-a','62345678',true);
 catalog.setFavorite('user-a','62345678',true);
 assert.deepEqual(catalog.getFavorites('user-a'),['62345678']);
 assert.deepEqual(catalog.getFavorites('user-b'),[]);
 assert.throws(()=>catalog.setFavorite('user-a','99999999',true),{statusCode:404});
 db.prepare('UPDATE vehicles SET make = ? WHERE lot = ?').run('BROKEN','62345678');
 assert.equal(catalog.upsertCatalogFromCsv(input).unchanged,true);
 const result=catalog.repairCatalogFromCsv(input);
 assert.equal(catalog.findVehicleByLotOrId('62345678').make,'CHEVROLET');
 assert.ok(fs.existsSync(path.join(dir,'backups',result.backup)));
 const {DatabaseSync}=require('node:sqlite');
 const backup=new DatabaseSync(path.join(dir,'backups',result.backup),{readOnly:true});
 assert.equal(backup.prepare('SELECT make FROM vehicles').get().make,'BROKEN');backup.close();
 assert.equal(catalog.findUserById('user-a').email,'a@example.test');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bid_intents').get().n,1);
 assert.deepEqual(catalog.getFavorites('user-a'),['62345678']);
 catalog.setFavorite('user-a','62345678',false);assert.deepEqual(catalog.getFavorites('user-a'),[]);
});

test('featured sample is unique, public and invalidated after expiry, imports and clear',()=>{
 const rows=Array.from({length:8},(_,i)=>row(String(70000000+i)));
 rows.push(row('80000000',{'Damage Description':'FRONT END'}),row('80000001',{'Runs/Drives':'DEFAULT'}));
 catalog.upsertCatalogFromCsv(csv(rows));
 const sample=catalog.getFeaturedVehicles();
 assert.equal(sample.items.length,6);
 assert.equal(new Set(sample.items.map(v=>v.lot)).size,6);
 assert.ok(sample.items.every(v=>v.lot.startsWith('7') && !('vin' in v) && !('rawJson' in v)));
 const db=catalog.initDatabase();
 db.prepare('UPDATE vehicles SET saleAt = ? WHERE lot = ?').run(Date.now()-1,'70000000');
 const originalNow=Date.now;
 try {
  Date.now=()=>originalNow()+61000;
  assert.ok(catalog.getFeaturedVehicles(12).items.every(v=>v.lot!=='70000000'));
  assert.equal(catalog.getFeaturedVehicles(12).items.length,7);
 } finally {Date.now=originalNow;}
 catalog.upsertCatalogFromCsv(csv([row('90000000')]));
 assert.deepEqual(catalog.getFeaturedVehicles().items.map(v=>v.lot),['90000000']);
 catalog.clearVehicles();assert.deepEqual(catalog.getFeaturedVehicles().items,[]);
});
