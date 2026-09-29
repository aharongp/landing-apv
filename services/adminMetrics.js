'use strict';
const crypto=require('node:crypto');
const COOKIE='apv_metrics';
const validId=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
function visitorCookie(req){const value=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);return validId(value)?value:null;}
function cookie(req,id,maxAge=7776000){return `${COOKIE}=${id}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${req.socket.encrypted||req.headers['x-forwarded-proto']==='https'?'; Secure':''}`;}
function createMetrics(db,now=()=>new Date()){
 db.exec(`CREATE TABLE IF NOT EXISTS metric_visits (visitor TEXT NOT NULL, day TEXT NOT NULL, page TEXT NOT NULL, PRIMARY KEY(visitor,day,page));
 CREATE INDEX IF NOT EXISTS metric_visit_day ON metric_visits(day);
 CREATE TABLE IF NOT EXISTS metric_registrations (userId TEXT PRIMARY KEY, visitor TEXT NOT NULL, day TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS metric_registration_day ON metric_registrations(day);
 CREATE TABLE IF NOT EXISTS metric_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
 db.prepare('INSERT OR IGNORE INTO metric_metadata VALUES (?,?)').run('startedAt',now().toISOString());
 function visit(req,body){
  if(body.cookieConsent!=='all')return null;
  const page=body.path==='/vehiculo'||/^\/vehiculo\/\d{5,12}$/.test(body.path||'')?'/vehiculo':body.path;
  if(!['/','/lp','/catalogo','/vehiculo'].includes(page))return null;
  if(/bot|crawler|spider|headless/i.test(req.headers['user-agent']||''))return null;
  const visitor=visitorCookie(req)||crypto.randomUUID();
  db.prepare('INSERT OR IGNORE INTO metric_visits VALUES (?,?,?)').run(visitor,now().toISOString().slice(0,10),page);
  return cookie(req,visitor);
 }
 function registration(user,req,consent){
  const visitor=visitorCookie(req);
  if(consent!=='all'||!visitor||!user.emailVerified)return;
  // Only attribute browsers that have an actual recorded visit.
  if(!db.prepare('SELECT 1 FROM metric_visits WHERE visitor=? LIMIT 1').get(visitor))return;
  db.prepare('INSERT OR IGNORE INTO metric_registrations VALUES (?,?,?)').run(user.id,visitor,now().toISOString().slice(0,10));
 }
 function summary(days){
  if(![7,30,90].includes(days))throw new RangeError('Elige 7, 30 o 90 días.');
  const end=now().toISOString().slice(0,10),first=new Date(end+'T00:00:00Z');first.setUTCDate(first.getUTCDate()-days+1);const start=first.toISOString().slice(0,10);
  const startedAt=db.prepare('SELECT value FROM metric_metadata WHERE key=?').get('startedAt').value;
  const daily=new Map(Array.from({length:days},(_,i)=>{const d=new Date(first);d.setUTCDate(d.getUTCDate()+i);const day=d.toISOString().slice(0,10);return [day,{day,visitors:day<startedAt.slice(0,10)?null:0,accounts:0,verified:0}];}));
  for(const row of db.prepare('SELECT day, COUNT(DISTINCT visitor) visitors FROM metric_visits WHERE day BETWEEN ? AND ? GROUP BY day').all(start,end))daily.get(row.day).visitors=row.visitors;
  for(const row of db.prepare(`SELECT substr(createdAt,1,10) day, COUNT(*) accounts, SUM(CASE WHEN emailVerified=1 THEN 1 ELSE 0 END) verified FROM users WHERE substr(createdAt,1,10) BETWEEN ? AND ? GROUP BY day`).all(start,end))Object.assign(daily.get(row.day),row);
  const visitors=db.prepare('SELECT COUNT(DISTINCT visitor) n FROM metric_visits WHERE day BETWEEN ? AND ?').get(start,end).n;
  const converted=db.prepare(`SELECT COUNT(DISTINCT r.visitor) n FROM metric_registrations r WHERE r.day BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM metric_visits v WHERE v.visitor=r.visitor AND v.day BETWEEN ? AND ?)` ).get(start,end,start,end).n;
  const series=[...daily.values()],accounts=series.reduce((a,r)=>a+r.accounts,0),verified=series.reduce((a,r)=>a+r.verified,0);
  const pages=db.prepare('SELECT page,COUNT(DISTINCT visitor) visitors FROM metric_visits WHERE day BETWEEN ? AND ? GROUP BY page ORDER BY visitors DESC').all(start,end);
  return {start,end,days,timezone:'UTC',startedAt,totals:{visitors,accounts,verified,converted,conversion:visitors?converted/visitors*100:null},daily:series,pages};
 }
 return {visit,registration,summary};
}
module.exports={createMetrics,cookie};
