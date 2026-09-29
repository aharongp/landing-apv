'use strict';
const {createGoogleAnalytics}=require('../services/googleAnalytics');
(async()=>{
 const report=await createGoogleAnalytics().report(7);
 if(report.status!=='ready'){
  console.error(report.message);process.exitCode=1;return;
 }
 // Print aggregates only; never print the credential, JWT or access token.
 console.log(JSON.stringify({status:report.status,property:report.property,hostname:report.hostname,timezone:report.timezone,start:report.start,end:report.end,totals:report.totals},null,2));
})().catch(()=>{console.error('No se pudo validar la conexión de GA4.');process.exitCode=1;});
