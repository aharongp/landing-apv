const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {createGoogleAnalytics}=require('../services/googleAnalytics');
const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const credentials=JSON.stringify({type:'service_account',client_email:'metrics@example.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'})});
const env={GA4_PROPERTY_ID:'123456',GOOGLE_APPLICATION_CREDENTIALS:'/private/test.json',PUBLIC_SITE_URL:'https://cars.example.test'};
const metricValues=n=>n.map(value=>({value:String(value)}));
test('GA4 stays explicitly unconfigured when only a measurement ID is available',async()=>{
 const service=createGoogleAnalytics({env:{GA4_MEASUREMENT_ID:'G-EXAMPLE'},fetchImpl:()=>{throw Error('must not fetch');}});assert.equal((await service.report(30)).status,'not_configured');await assert.rejects(service.report(100),RangeError);
});
test('GA4 uses readonly OAuth, hostname filter, property timezone and whole-period unique totals',async()=>{
 const calls=[];const service=createGoogleAnalytics({env,readFile:()=>credentials,now:()=>new Date('2026-09-29T01:00:00Z'),fetchImpl:async(url,options)=>{
  calls.push({url,options});if(url.includes('oauth2'))return {ok:true,json:async()=>({access_token:'fake-test-token',expires_in:3600})};
  const daily=JSON.parse(options.body).dimensions.length;
  return {ok:true,json:async()=>({metadata:{timeZone:'America/Los_Angeles'},rows:daily?[{dimensionValues:[{value:'20260927'}],metricValues:metricValues([5,6,8])},{dimensionValues:[{value:'20260928'}],metricValues:metricValues([5,4,4])}]:[{metricValues:metricValues([6,10,12])}]})};
 }});
 const data=await service.report(7);assert.equal(data.status,'ready');assert.equal(data.end,'2026-09-28');assert.equal(data.daily.length,7);assert.equal(data.totals.users,6);assert.equal(data.daily.reduce((n,r)=>n+r.users,0),10);
 const assertion=calls[0].options.body.get('assertion');const claims=JSON.parse(Buffer.from(assertion.split('.')[1],'base64url').toString());assert.equal(claims.scope,'https://www.googleapis.com/auth/analytics.readonly');
 const report=JSON.parse(calls[1].options.body);assert.equal(report.dimensionFilter.filter.stringFilter.value,'cars.example.test');assert.deepEqual(report.dateRanges,[{startDate:'6daysAgo',endDate:'today'}]);
 await service.report(7);assert.equal(calls.length,3);assert.doesNotMatch(JSON.stringify(data),/fake-test-token|private_key/);
});
test('GA4 permission failures remain distinct from zero traffic and expose no credential errors',async()=>{
 const service=createGoogleAnalytics({env,readFile:()=>credentials,fetchImpl:async url=>url.includes('oauth2')?{ok:true,json:async()=>({access_token:'fake'})}:{ok:false,status:403}});
 const result=await service.report(30);assert.equal(result.status,'error');assert.match(result.message,/Lector/);assert.equal(result.totals,undefined);
 const bad=createGoogleAnalytics({env,readFile:()=>{throw Error('PRIVATE MATERIAL');}});assert.doesNotMatch(JSON.stringify(await bad.report(7)),/PRIVATE MATERIAL/);
});
