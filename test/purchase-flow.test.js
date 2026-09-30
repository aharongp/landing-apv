const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');
const net=require('node:net');const {spawn}=require('node:child_process');const {once}=require('node:events');const {DatabaseSync}=require('node:sqlite');
test('purchase mode is validated, stored and protected by session version after recovery',{timeout:15000},async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apv-purchase-flow-'));
 fs.writeFileSync(path.join(dir,'current_catalog.csv'),'Lot number,Year,Make,Model Group,VIN,Image Thumbnail,Sale Date M/D/CY,Image URL,Buy-It-Now Price\n71000001,2023,TOYOTA,COROLLA,1ABCDEFGHI2345678,cs.copart.com/car_thb.jpg,0,https://example.test/car,600');
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const secret='test-only-purchase-flow';const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,APV_DATA_DIR:dir,PORT:String(port),SESSION_SECRET:secret,STRIPE_SECRET_KEY:'disabled-test-key',META_CAPI_TOKEN:'disabled-test-token',KOMMO_ENABLED:'false'},stdio:'ignore'});
 t.after(async()=>{if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+port;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,25));}
 const db=new DatabaseSync(path.join(dir,'catalog.db'));t.after(()=>db.close());
 db.prepare('INSERT INTO users(id,name,email,emailVerified,sessionVersion,passwordHash,passwordSalt) VALUES(?,?,?,?,?,?,?)').run('test-user','Test Buyer','buyer@example.test',1,0,'old','old');
 const payload=Buffer.from(JSON.stringify({uid:'test-user',sv:0,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
 const signature=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
 const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');const cookieName=source.match(/const SESSION_COOKIE = ['"]([^'"]+)['"]/)[1];
 const headers={'Content-Type':'application/json',cookie:cookieName+'='+payload+'.'+signature};
 const handoff=()=>fetch(base+'/api/kommo/whatsapp-transfer',{method:'POST',headers,body:JSON.stringify({leadId:999,apvUserId:'another-user'})});
 assert.equal((await fetch(base+'/api/kommo/whatsapp-transfer',{method:'POST'})).status,401);
 const unavailable=await handoff();assert.equal(unavailable.status,409);assert.equal((await unavailable.json()).code,'WHATSAPP_UNAVAILABLE');
 const post=body=>fetch(base+'/api/bid-intents',{method:'POST',headers,body:JSON.stringify({...body,cookieConsent:'essential'})});
 assert.equal((await post({lot:'71000001',purchaseMode:'buy',maxBid:200})).status,409);
 const staleSync=await fetch(base+'/api/kommo/sync-bid',{method:'POST',headers,body:JSON.stringify({lot:'71000001',purchaseMode:'buy',maxBid:200})});assert.equal(staleSync.status,409);
 assert.equal((await post({lot:'71000001',purchaseMode:'unknown',maxBid:600})).status,400);
 const request=await post({lot:'71000001',purchaseMode:'buy',maxBid:600});assert.equal(request.status,201);
 const intent=await request.json();assert.equal(intent.purchaseMode,'buy');assert.equal(intent.maxBid,600);
 assert.equal(db.prepare('SELECT purchaseMode FROM bid_intents WHERE id=?').get(intent.id).purchaseMode,'buy');
 db.prepare('UPDATE vehicles SET buyNow=0 WHERE lot=?').run('71000001');
 // Lookup is uncached so stale UI quotes cannot submit a purchase after availability changes.
 assert.equal((await post({lot:'71000001',purchaseMode:'buy',maxBid:600})).status,409);
 const email='buyer@example.test',code='234567';db.prepare('INSERT INTO password_resets VALUES(?,?,?,0,?)').run(email,crypto.createHash('sha256').update(email+':'+code).digest('hex'),Date.now()+60000,Date.now());
 const changed=await fetch(base+'/api/auth/password-reset/confirm',{method:'POST',headers,body:JSON.stringify({email,code,password:'isolated-new-password'})});assert.equal(changed.status,200);
 assert.equal((await post({lot:'71000001',purchaseMode:'bid',maxBid:600})).status,401);
 assert.equal((await handoff()).status,401);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'isolated-new-password'})});assert.equal(login.status,200);assert.ok(login.headers.get('set-cookie'));
});
