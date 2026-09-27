const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('catalog starts vehicle requests before account and filter requests resolve',async()=>{
 const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
 const start=source.indexOf('  async function boot(){');
 const end=source.indexOf('  boot();',start);
 const calls=[],resolvers=[];
 const wait=name=>()=>{calls.push(name);return new Promise(resolve=>resolvers.push(resolve));};
 const context=vm.createContext({initMotionEffects(){},initCookieBanner(){},$$:()=>[],setLanguage(){},currentLang:'es',isHome:false,
  loadFeaturedVehicles:wait('featured'),loadVehicles:wait('vehicles'),initAuth:wait('auth'),initFilters:wait('filters'),location:{pathname:'/catalogo',search:'?q=Silverado',hash:''},document:{body:{classList:{contains:()=>true}}},URLSearchParams,stickyInput:{value:''},dom:{search:{value:''},heroSearchInput:{value:''}},console});
 vm.runInContext(source.slice(start,end),context);
 const done=context.boot();
 assert.deepEqual(calls,['vehicles','auth','filters']);
 assert.equal(context.dom.search.value,'Silverado');
 resolvers.forEach(resolve=>resolve());await done;
});
