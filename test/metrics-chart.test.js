const {test}=require('node:test');const assert=require('node:assert/strict');const chart=require('../public/metrics-chart');
test('hover selects the nearest day at desktop and mobile widths with clamped boundaries',()=>{
 for(const width of [460,280]){const rect={left:20,width};assert.equal(chart.nearest(-100,rect,30),0);assert.equal(chart.nearest(1000,rect,30),29);assert.equal(chart.nearest(20+(40+(410*15/29))/460*width,rect,30),15);}
 assert.equal(chart.nearest(100,{left:0,width:460},1),0);
});
test('tooltips distinguish missing data from a measured zero and include the exact date and value',()=>{
 assert.match(chart.description({day:'2026-09-29',visitors:null},'visitors','Visitantes'),/Sin datos/);
 assert.match(chart.description({day:'2026-09-29',visitors:0},'visitors','Visitantes'),/Visitantes: 0/);
 assert.match(chart.description({day:'2026-09-29',visitors:123},'visitors','Visitantes'),/2026.*Visitantes: 123/);
});
