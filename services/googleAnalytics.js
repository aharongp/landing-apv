'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const SCOPE='https://www.googleapis.com/auth/analytics.readonly';
const TOKEN_URL='https://oauth2.googleapis.com/token';
function createGoogleAnalytics({env=process.env,fetchImpl=(...args)=>fetch(...args),now=()=>new Date(),readFile=file=>fs.readFileSync(file,'utf8')}={}){
 let token=null,tokenExpires=0,tokenPending=null;const cache=new Map(),pending=new Map();
 async function accessToken(file){
  if(token&&tokenExpires>now().getTime()+60000)return token;
  if(tokenPending)return tokenPending;
  tokenPending=(async()=>{
   const credentials=JSON.parse(readFile(file));
   if(credentials.type!=='service_account'||!credentials.client_email||!credentials.private_key)throw Error('credentials');
   const time=Math.floor(now().getTime()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
   const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:credentials.client_email,scope:SCOPE,aud:TOKEN_URL,iat:time,exp:time+3600});
   const assertion=unsigned+'.'+crypto.sign('RSA-SHA256',Buffer.from(unsigned),credentials.private_key).toString('base64url');
   const response=await fetchImpl(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(8000)});
   const data=await response.json();if(!response.ok||!data.access_token)throw Error('authorization');
   token=data.access_token;tokenExpires=now().getTime()+Math.min(Number(data.expires_in)||3600,3600)*1000;return token;
  })();try{return await tokenPending;}finally{tokenPending=null;}
 }
 async function report(days){
  if(![7,30,90].includes(days))throw new RangeError('Elige 7, 30 o 90 días.');
  const property=env.GA4_PROPERTY_ID,file=env.GOOGLE_APPLICATION_CREDENTIALS;
  if(!property||!file){const missing=[!property?'el ID numérico de propiedad':null,!file?'el archivo de credenciales con acceso de lectura':null].filter(Boolean).join(' y ');return {status:'not_configured',message:`Para consultar el historial de GA4 falta configurar ${missing}. El código G- de la web no permite leer informes.`};}
  if(!/^\d+$/.test(property)||path.resolve(file).startsWith(path.resolve(__dirname,'../public')+path.sep))return {status:'error',message:'Revisa el ID numérico de propiedad y guarda las credenciales fuera de la carpeta pública.'};
  let hostname;try{hostname=env.GA4_HOSTNAME||new URL(env.PUBLIC_SITE_URL||'https://cars.apvmotorusa.com').hostname;}catch{return {status:'error',message:'Revisa el dominio configurado para los informes.'};}
  const key=JSON.stringify([property,file,hostname,days]),saved=cache.get(key);if(saved&&saved.expires>now().getTime())return saved.data;
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
   try{
    const access=await accessToken(file);
    const base={dateRanges:[{startDate:(days-1)+'daysAgo',endDate:'today'}],metrics:[{name:'totalUsers'},{name:'sessions'},{name:'screenPageViews'}],dimensionFilter:{filter:{fieldName:'hostName',stringFilter:{matchType:'EXACT',value:hostname}}},keepEmptyRows:true};
    async function run(dimensions){
     const response=await fetchImpl(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({...base,dimensions,limit:'100',...(dimensions.length?{orderBys:[{dimension:{dimensionName:'date'}}]}:{})}),signal:AbortSignal.timeout(10000)});
     if(!response.ok){if(response.status===401){token=null;tokenExpires=0;}throw Error(response.status===403?'permission':'report');}
     return response.json();
    }
    // Unique users must come from the whole-period report, never a sum of daily users.
    const [dailyReport,totalReport]=await Promise.all([run([{name:'date'}]),run([])]);
    if(!dailyReport.metadata?.timeZone)throw Error('report');
    const timezone=dailyReport.metadata.timeZone,parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now());
    const get=type=>parts.find(p=>p.type===type).value,end=`${get('year')}-${get('month')}-${get('day')}`;
    const startDate=new Date(end+'T00:00:00Z');startDate.setUTCDate(startDate.getUTCDate()-days+1);
    const values=row=>{const numbers=(row?.metricValues||[]).map(v=>Number(v.value));if(numbers.some(n=>!Number.isFinite(n)||n<0))throw Error('report');return {users:numbers[0]||0,sessions:numbers[1]||0,pageViews:numbers[2]||0};};
    const rows=new Map((dailyReport.rows||[]).map(row=>{const d=row.dimensionValues?.[0]?.value;if(!/^\d{8}$/.test(d||''))throw Error('report');return [`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`,values(row)];}));
    const daily=Array.from({length:days},(_,i)=>{const day=new Date(startDate);day.setUTCDate(day.getUTCDate()+i);const iso=day.toISOString().slice(0,10);return {day:iso,...(rows.get(iso)||{users:0,sessions:0,pageViews:0})};});
    const data={status:'ready',property,hostname,timezone,start:daily[0].day,end,updatedAt:now().toISOString(),totals:values(totalReport.rows?.[0]),daily,limited:Boolean(dailyReport.metadata.subjectToThresholding||dailyReport.metadata.dataLossFromOtherRow||totalReport.metadata?.subjectToThresholding)};
    cache.set(key,{expires:now().getTime()+300000,data});return data;
   }catch(error){return {status:'error',message:error.message==='permission'?'Google rechazó el acceso. Comprueba que la cuenta de servicio tenga permiso de Lector en la propiedad y que Google Analytics Data API esté habilitada.':'No se pudo consultar Google Analytics. Revisa las credenciales de lectura y la configuración de la propiedad; puedes reintentar.'};}
  })();pending.set(key,task);try{return await task;}finally{pending.delete(key);}
 }
 return {report};
}
module.exports={createGoogleAnalytics};
