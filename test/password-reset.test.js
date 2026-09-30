const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createPasswordReset } = require('../services/passwordReset');
function fixture() {
 const db = new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,emailVerified INTEGER,passwordSalt TEXT,passwordHash TEXT,sessionVersion INTEGER DEFAULT 0); CREATE TABLE password_resets(email TEXT PRIMARY KEY,codeHash TEXT,expiresAt INTEGER,attempts INTEGER,requestedAt INTEGER); INSERT INTO users(id,email,emailVerified,passwordSalt,passwordHash) VALUES('u','owner@example.test',1,'old','old'),('unverified','pending@example.test',0,'old','old')`);
 let time=1000000;const mail=[];
 const service=createPasswordReset({db,sendEmail:async(email,code)=>mail.push({email,code}),hashPassword:password=>({salt:'new-salt',digest:'hashed-'+password}),now:()=>time,generateCode:()=> '123456'});
 return {db,mail,service,tick:ms=>{time+=ms;}};
}
test('recovery is generic, stores no plaintext code and sends only to verified accounts',async()=>{
 const f=fixture();
 assert.equal(await f.service.request('owner@example.test','a'),undefined);
 assert.equal(await f.service.request('missing@example.test','b'),undefined);
 await f.service.request('pending@example.test','c');
 assert.deepEqual(f.mail,[{email:'owner@example.test',code:'123456'}]);
 assert.notEqual(f.db.prepare('SELECT codeHash FROM password_resets WHERE email=?').get('owner@example.test').codeHash,'123456');
 await f.service.request('owner@example.test','a');assert.equal(f.mail.length,1);
 f.db.close();
});
test('successful recovery consumes the code and revokes all previous sessions',async()=>{
 const f=fixture();await f.service.request('OWNER@example.test');
 f.service.confirm('owner@example.test','123456','new-password');
 const u=f.db.prepare('SELECT * FROM users WHERE id=?').get('u');
 assert.equal(u.passwordHash,'hashed-new-password');assert.equal(u.passwordSalt,'new-salt');assert.equal(u.sessionVersion,1);
 assert.throws(()=>f.service.confirm('owner@example.test','123456','another-password'));
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM password_resets').get().n,0);f.db.close();
});
test('expired codes, invalid passwords and too many guesses cannot change credentials',async()=>{
 const f=fixture();await f.service.request('owner@example.test');
 assert.throws(()=>f.service.confirm('owner@example.test','123456','short'));
 for(let i=0;i<5;i++)assert.throws(()=>f.service.confirm('owner@example.test','000000','new-password'));
 assert.throws(()=>f.service.confirm('owner@example.test','123456','new-password'));
 f.tick(61000);await f.service.request('owner@example.test');f.tick(15*60*1000);
 assert.throws(()=>f.service.confirm('owner@example.test','123456','new-password'));
 assert.equal(f.db.prepare('SELECT passwordHash FROM users WHERE id=?').get('u').passwordHash,'old');f.db.close();
});
test('recovery rate limiting applies to unknown addresses too',async()=>{
 const f=fixture();for(let i=0;i<20;i++)await f.service.request('missing'+i+'@example.test','same-ip');
 await assert.rejects(f.service.request('another@example.test','same-ip'),e=>e.statusCode===429);f.tick(15*60*1000);await f.service.request('another@example.test','same-ip');f.db.close();
});
