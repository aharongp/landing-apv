const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
test('public assets revalidate and compress; vehicle data remains uncached', {timeout:15000},async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apv-http-perf-'));
 const fixture='Lot number,Year,Make,Model Group,VIN,Image Thumbnail,Sale Date M/D/CY,Image URL,Runs/Drives,Damage Description,Location city,Location state,Location ZIP,Odometer,Sale Title Type\n'+Array.from({length:20},(_,i)=>`${71000000+i},2023,CHEVROLET,SILVERADO,1ABCDEFGHI2345678,cs.copart.com/car_thb.jpg,0,https://inventoryv2.copart.io/test,Run & Drive Verified,NORMAL WEAR,AUSTIN,TX,78701,${i===0?'0':'45000'},${i===0?'CT':'ST'}`).join('\n');
 fs.writeFileSync(path.join(dir,'current_catalog.csv'),fixture);
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,APV_DATA_DIR:dir,PORT:String(port),SESSION_SECRET:'isolated-performance-test',ADMIN_KEY:'isolated-test'},stdio:'ignore'});
 t.after(async()=>{if(child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,25));}
 const asset=await fetch(base+'/app.js',{headers:{'accept-encoding':'gzip'}});
 assert.equal(asset.status,200);assert.equal(asset.headers.get('content-encoding'),'gzip');
 const content=await asset.text();assert.ok(content.includes("api('/api/featured')"));assert.ok(Number(asset.headers.get('content-length'))<Buffer.byteLength(content));
 const revalidated=await fetch(base+'/app.js',{headers:{'if-none-match':asset.headers.get('etag')}});
 assert.equal(revalidated.status,304);assert.equal(await revalidated.text(),'');
 const plain=await fetch(base+'/app.js',{headers:{'accept-encoding':'gzip;q=0'}});
 assert.equal(plain.headers.get('content-encoding'),null);assert.equal(await plain.text(),content);
 const html=await (await fetch(base+'/')).text();
 const crypto=require('node:crypto');
 for(const name of ['app.js','styles.css','membership.js','kommo.js']){
   const bytes=fs.readFileSync(path.join(__dirname,'../public',name));
   const version=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,16);
   assert.ok(html.includes('/'+name+'?v='+version),name+' must have a content-specific URL');
   const versioned=await fetch(base+'/'+name+'?v='+version);
   assert.equal(versioned.headers.get('cache-control'),'public, max-age=31536000, immutable');
   assert.equal(await versioned.text(),bytes.toString());
   assert.equal((await fetch(base+'/'+name+'?v=obsolete')).headers.get('cache-control'),'public, max-age=0, must-revalidate');
 }
 assert.equal((html.match(/app\.js\?v=[a-f0-9]{16}/g)||[]).length,2,'preload and script must match');
 const filters=await fetch(base+'/api/filters');assert.equal(filters.status,200);assert.ok(filters.headers.get('etag'));
 const filtersAgain=await fetch(base+'/api/filters',{headers:{'if-none-match':filters.headers.get('etag')}});assert.equal(filtersAgain.status,304);assert.equal(await filtersAgain.text(),'');
 const featured=await fetch(base+'/api/featured');assert.equal(featured.headers.get('cache-control'),'no-store');
 const items=(await featured.json()).items;assert.equal(items.length,6);assert.equal(new Set(items.map(x=>x.lot)).size,6);assert.ok(items.every(x=>!('vin' in x)));
 const filtered=await (await fetch(base+'/api/vehicles?q=silverado+austin&city=austin&state=TX&zip=78701&cleanTitle=1&odometerMax=0')).json();
 assert.equal(filtered.total,1);assert.equal(filtered.items[0].lot,'71000000');assert.ok(filtered.items[0].image.endsWith('_ful.jpg'));assert.equal(filtered.items[0].vin,null);
 const vehicles=await fetch(base+'/api/vehicles');assert.equal(vehicles.headers.get('content-encoding'),'gzip');assert.equal(vehicles.headers.get('cache-control'),'no-store');assert.equal((await vehicles.json()).total,20);
});
