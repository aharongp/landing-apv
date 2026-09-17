const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../server'),'utf8');
function harness(fetch) {
 const context=vm.createContext({URL,AbortController,setTimeout,clearTimeout,console,fetch,str:v=>String(v??'').trim(),imageCache:new Map()});
 vm.runInContext(source.slice(source.indexOf('function normalizeImageUrl('),source.indexOf('function json(')),context);
 return context;
}
test('gallery tries next endpoint when first response contains no photos',async()=>{
 let calls=0;
 const ctx=harness(async()=>({ok:true,text:async()=>JSON.stringify(++calls===1?{}:{data:{lotImages:[{sequence:2,link:[{url:'https://cs.copart.com/2_ful.jpg',isThumbNail:false}]},{sequence:1,link:[{url:'https://cs.copart.com/1_thb.jpg',isThumbNail:true},{url:'https://cs.copart.com/1_ful.jpg',isThumbNail:false}]}]}})}));
 const images=await ctx.fetchVehicleImages({lot:'12345678',image:'https://cs.copart.com/cover_ful.jpg',imageApi:'http://inventoryv2.copart.io/v1/lotImages/12345678'});
 assert.equal(calls,2);assert.equal(images.length,3);assert.equal(images[0],'https://cs.copart.com/1_ful.jpg');assert.equal(images[1],'https://cs.copart.com/2_ful.jpg');
 await ctx.fetchVehicleImages({lot:'12345678'});assert.equal(calls,2);
});
test('gallery keeps cover if provider unavailable',async()=>{
 const ctx=harness(async()=>{throw Error('offline');});
 const images=await ctx.fetchVehicleImages({lot:'12345678',image:'https://cs.copart.com/cover_ful.jpg'});
 assert.deepEqual(Array.from(images),['https://cs.copart.com/cover_ful.jpg']);
});
