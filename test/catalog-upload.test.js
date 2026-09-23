const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
test('catalog upload replaces previous lots and repairs even an identical CSV', {timeout:15000},async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apv-http-perf-'));
 const fixture='Lot number,Year,Make,Model Group,VIN,Image Thumbnail,Sale Date M/D/CY,Image URL,Runs/Drives,Damage Description\n'+Array.from({length:20},(_,i)=>`${71000000+i},2023,CHEVROLET,SILVERADO,1ABCDEFGHI2345678,cs.copart.com/car_thb.jpg,0,https://inventoryv2.copart.io/test,Run & Drive Verified,NORMAL WEAR`).join('\n');
 fs.writeFileSync(path.join(dir,'current_catalog.csv'),fixture);
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,APV_DATA_DIR:dir,PORT:String(port),SESSION_SECRET:'isolated-performance-test',ADMIN_KEY:'isolated-test'},stdio:'ignore'});
 t.after(async()=>{if(child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,25));}
 const headers={'x-admin-key':'isolated-test','Content-Type':'application/json'};
 const source='Lot number,Year,Make,Model Group,VIN,Image Thumbnail,Sale Date M/D/CY\n72000000,2024,FORD,F150,1ABCDEFGHI2345678,https://cs.copart.com/test.jpg,20990101';
 async function upload(text){
  const started=await (await fetch(base+'/api/catalog/upload/start',{method:'POST',headers,body:JSON.stringify({name:'catalog.csv',size:Buffer.byteLength(text)})})).json();
  const chunk=await fetch(base+'/api/catalog/upload/chunk?id='+started.uploadId,{method:'POST',headers:{'x-admin-key':'isolated-test'},body:text});assert.equal(chunk.status,200);
  return fetch(base+'/api/catalog/upload/finish',{method:'POST',headers,body:JSON.stringify({uploadId:started.uploadId})});
 }
 const loaded=await upload(source);assert.equal(loaded.status,200);const first=await loaded.json();
 assert.equal(first.count,1);assert.equal(first.stats.removed,20);assert.equal(first.stats.repaired,true);assert.equal(first.stats.integrity,'ok');
 assert.ok(fs.existsSync(path.join(dir,'backups',first.stats.backup)));
 const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(path.join(dir,'catalog.db'));
 db.prepare('INSERT INTO vehicles (lot, make) VALUES (?, ?)').run('99999999','STALE');db.close();
 const repeated=await (await upload(source)).json();assert.equal(repeated.stats.removed,1);assert.equal(repeated.count,1);assert.equal(repeated.stats.repaired,true);
 const synced=await (await fetch(base+'/api/catalog/sync',{method:'POST',headers})).json();assert.equal(synced.stats.repaired,true);assert.equal(synced.stats.integrity,'ok');
 const invalid=await upload('not,a,catalog\ninvalid,data,here');assert.equal(invalid.status,500);
 assert.equal((await (await fetch(base+'/api/vehicles')).json()).total,1);
 assert.equal(fs.readFileSync(path.join(dir,'current_catalog.csv'),'utf8'),source);
});
