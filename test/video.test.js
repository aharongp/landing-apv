const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const serveVideo=require('../services/videoFile');
test('video delivery supports playback, seeking, revalidation and invalid ranges',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apv-video-'));
 const file=path.join(dir,'test.mp4');const bytes=Buffer.from('0123456789');fs.writeFileSync(file,bytes);
 const server=http.createServer((req,res)=>serveVideo(req,res,file));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
 const url=`http://127.0.0.1:${server.address().port}/test.mp4`;
 const full=await fetch(url);assert.equal(full.status,200);assert.equal(full.headers.get('content-type'),'video/mp4');assert.equal(await full.text(),'0123456789');
 for(const [range,body,contentRange] of [['bytes=2-5','2345','bytes 2-5/10'],['bytes=7-','789','bytes 7-9/10'],['bytes=-3','789','bytes 7-9/10']]){
  const r=await fetch(url,{headers:{range}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),contentRange);assert.equal(await r.text(),body);
 }
 for(const range of ['bytes=10-','bytes=7-2','bytes=-0','bytes=abc','bytes=0-1,4-5']){const r=await fetch(url,{headers:{range}});assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */10');}
 const head=await fetch(url,{method:'HEAD'});assert.equal(head.headers.get('content-length'),'10');assert.equal(await head.text(),'');
 const unchanged=await fetch(url,{headers:{'if-none-match':full.headers.get('etag')}});assert.equal(unchanged.status,304);
 const stale=await fetch(url,{headers:{range:'bytes=0-1','if-range':'"old"'}});assert.equal(stale.status,200);assert.equal(await stale.text(),'0123456789');
});

test('Spanish and English captions have readable, ordered cues within each video',()=>{
 for(const [name,duration] of [['cars-vsl',129],['cars-vsl-en',142.2]]){
  const vtt=fs.readFileSync(path.join(__dirname,'../public/assets',name+'.vtt'),'utf8');assert.ok(vtt.startsWith('WEBVTT\n'));
  const stamp=s=>s.split(':').reduce((total,value)=>total*60+Number(value),0);let last=0;const blocks=vtt.trim().split(/\n\n+/).slice(1);assert.ok(blocks.length>30);
  for(const block of blocks){const [id,timing,...lines]=block.split('\n');const [a,b]=timing.split(' --> ').map(stamp);assert.ok(a>=last && b>a && b<=duration,`${name} cue ${id}: ${timing}`);assert.ok(lines.length<=2 && lines.every(line=>line.length<=42));last=b;}
 }
});
