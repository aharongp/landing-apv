const {test} = require('node:test');
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const net = require('node:net'), {spawn} = require('node:child_process'), {once} = require('node:events');
const {listAccounts, exportAccounts} = require('../services/adminAccounts');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users(id TEXT, name TEXT, email TEXT, phone TEXT, createdAt TEXT, lastLoginAt TEXT,
    emailVerified INTEGER, googleSub TEXT, passwordHash TEXT, passwordSalt TEXT, verificationCode TEXT)`);
  const insert = db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  for (let i = 1; i <= 28; i++) insert.run(String(i).padStart(2,'0'), i === 28 ? '=HYPERLINK("danger")' : 'José ' + i,
    `buyer${i}@example.test`, i === 1 ? '+15551234567' : '', `2026-09-${String(i).padStart(2,'0')}T12:00:00Z`, '',
    i % 2, i === 1 ? 'private-google-id' : '', 'secret-hash', 'secret-salt', 'secret-code');
  return db;
}

test('accounts filter, paginate and return only approved contact fields', t => {
  const db = fixture(); t.after(() => db.close());
  const first = listAccounts(db, new URLSearchParams());
  assert.equal(first.total, 28); assert.equal(first.accounts.length,25); assert.equal(first.accounts[0].id,'28');
  assert.deepEqual(Object.keys(first.accounts[0]).sort(), ['id','name','email','phone','createdAt','lastLoginAt','verified','provider'].sort());
  const last = listAccounts(db, new URLSearchParams('page=999'));
  assert.equal(last.page,2); assert.equal(last.accounts.length,3);
  assert.equal(listAccounts(db,new URLSearchParams('status=verified')).total,14);
  assert.equal(listAccounts(db,new URLSearchParams('status=pending')).total,14);
  assert.equal(listAccounts(db,new URLSearchParams({q:'buyer1@example.test'})).accounts[0].provider,'Google');
  assert.equal(listAccounts(db,new URLSearchParams({q:'+15551234567'})).total,1);
  assert.equal(listAccounts(db,new URLSearchParams({q:'José'})).total,27);
  for (const q of ['%', '_', "' OR 1=1 --", 'missing']) assert.equal(listAccounts(db,new URLSearchParams({q})).total,0);
  assert.throws(() => listAccounts(db,new URLSearchParams('status=invalid')), {statusCode:400});
});

test('CSV exports every matching page, escapes cells and excludes authentication secrets', t => {
  const db = fixture(); t.after(() => db.close());
  const csv = exportAccounts(db,new URLSearchParams('page=2'));
  assert.equal(csv.charCodeAt(0),0xFEFF);
  assert.equal(csv.trimEnd().split('\r\n').length,29);
  assert.match(csv,/"'=HYPERLINK\(""danger""\)"/);
  assert.match(csv,/"'\+15551234567"/);
  assert.doesNotMatch(csv,/secret-|private-google|password|verificationCode/);
  const filtered = exportAccounts(db,new URLSearchParams('status=verified&q=buyer1%40example.test'));
  assert.equal(filtered.trimEnd().split('\r\n').length,2);
  assert.match(filtered,/buyer1@example.test/); assert.doesNotMatch(filtered,/buyer2@example.test/);
  assert.equal(exportAccounts(db,new URLSearchParams('q=missing')).trimEnd().split('\r\n').length,1);
});

async function startServer(t, adminKey) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'apv-admin-accounts-'));
  fs.writeFileSync(path.join(dir,'current_catalog.csv'),'Lot number,Year,Make,Model Group\n');
  const socket = net.createServer(); await new Promise(r => socket.listen(0,'127.0.0.1',r));
  const port = socket.address().port; await new Promise(r => socket.close(r));
  const child = spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,
    APV_DATA_DIR:dir, PORT:String(port), ADMIN_KEY:adminKey, SESSION_SECRET:'accounts-test-only',
    STRIPE_SECRET_KEY:'disabled-test-key', META_CAPI_TOKEN:'disabled-test-token'},stdio:'ignore'});
  t.after(async () => {if(child.exitCode === null){const done=once(child,'exit'); child.kill(); await done;} fs.rmSync(dir,{recursive:true,force:true});});
  const base = 'http://127.0.0.1:' + port;
  for (let i=0;i<100;i++) {try {if ((await fetch(base+'/api/health')).ok) return {base,dir};} catch {} await new Promise(r=>setTimeout(r,25));}
  throw new Error('Test server did not start');
}

test('account endpoints require the admin key, prevent caching and deliver CSV attachments', {timeout:15000}, async t => {
  const {base,dir} = await startServer(t,'test-accounts-key');
  const db = new DatabaseSync(path.join(dir,'catalog.db')); t.after(()=>db.close());
  db.prepare('INSERT INTO users(id,name,email,emailVerified,passwordHash,verificationCode) VALUES(?,?,?,?,?,?)')
    .run('fixture','Cuenta de prueba','fixture@example.test',1,'must-not-leak','must-not-leak');
  for (const route of ['/api/admin/accounts','/api/admin/accounts/export']) {
    assert.equal((await fetch(base+route)).status,401);
    assert.equal((await fetch(base+route,{headers:{'x-admin-key':'wrong'}})).status,401);
    const response=await fetch(base+route,{headers:{'x-admin-key':'test-accounts-key'}});
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.text(); assert.match(body,/fixture@example.test/); assert.doesNotMatch(body,/must-not-leak/);
    if(route.endsWith('export')) {
      assert.match(response.headers.get('content-type'),/text\/csv/);
      assert.match(response.headers.get('content-disposition'),/^attachment; filename="cuentas-apv-.*\.csv"$/);
    } else assert.equal(JSON.parse(body).total,1);
  }
  assert.equal((await fetch(base+'/api/admin/accounts?status=bad',{headers:{'x-admin-key':'test-accounts-key'}})).status,400);
});

test('accounts stay private when no usable admin key is configured', {timeout:15000}, async t => {
  const {base} = await startServer(t,' ');
  assert.equal((await fetch(base+'/api/admin/accounts')).status,401);
  assert.equal((await fetch(base+'/api/admin/accounts/export')).status,401);
});
