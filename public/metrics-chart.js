(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.APVMetricsChart=api;})(typeof window==='undefined'?this:window,function(){
 'use strict';
 const width=460,height=190,left=40,right=10,top=12,bottom=30;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=n=>n===null?'Sin datos':Number(n).toLocaleString('es-US');
 const date=iso=>new Intl.DateTimeFormat('es',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(iso));
 const x=(i,length)=>left+i*(width-left-right)/Math.max(1,length-1);
 function nearest(clientX,rect,length){return Math.max(0,Math.min(length-1,Math.round(((clientX-rect.left)/rect.width*width-left)/(width-left-right)*Math.max(1,length-1))));}
 function description(row,field,label){return `${date(row.day)} · ${label}: ${number(row[field])}`;}
 function mount(root,rows,field,color,label){
  if(!rows.length){root.textContent='No hay datos para este período.';return;}
  const max=Math.ceil(Math.max(1,...rows.map(row=>row[field]))/2)*2,y=n=>height-bottom-n/max*(height-top-bottom);
  const ticks=[0,.5,1].map(r=>`<line x1="${left}" x2="${width-right}" y1="${y(max*r)}" y2="${y(max*r)}" stroke="#e2e8f0"/><text x="${left-7}" y="${y(max*r)+4}" text-anchor="end">${number(max*r)}</text>`).join('');
  const points=rows.flatMap((row,i)=>row[field]===null?[]:[`${x(i,rows.length)},${y(row[field])}`]).join(' ');
  root.innerHTML=`<div class="metrics-chart-frame" tabindex="0" role="group" aria-label="${escape(label)}. Usa las flechas para consultar cada día; Escape oculta el detalle."><svg class="metrics-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">${ticks}<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5"/>${rows.map((row,i)=>row[field]===null?'':`<circle cx="${x(i,rows.length)}" cy="${y(row[field])}" r="2.5" fill="${color}"/>`).join('')}<line class="metrics-chart-guide" x1="40" x2="40" y1="12" y2="160" stroke="#64748b" stroke-dasharray="3 3" visibility="hidden"/><circle class="metrics-chart-active" r="5" fill="${color}" stroke="white" stroke-width="2" visibility="hidden"/><text x="${left}" y="${height-5}">${escape(date(rows[0].day))}</text><text x="${width-right}" y="${height-5}" text-anchor="end">${escape(date(rows.at(-1).day))}</text></svg><div class="metrics-chart-tooltip" hidden role="status" aria-live="polite"></div></div><p class="metrics-chart-hint">Pasa el cursor, toca el gráfico o usa las flechas para ver cada día.</p>`;
  const frame=root.querySelector('.metrics-chart-frame'),svg=frame.querySelector('svg'),tip=frame.querySelector('.metrics-chart-tooltip'),guide=frame.querySelector('.metrics-chart-guide'),dot=frame.querySelector('.metrics-chart-active');let index=rows.length-1;
  function show(i){index=Math.max(0,Math.min(rows.length-1,i));const row=rows[index],cx=x(index,rows.length);tip.textContent=description(row,field,label);tip.hidden=false;guide.setAttribute('x1',cx);guide.setAttribute('x2',cx);guide.setAttribute('visibility','visible');dot.setAttribute('visibility',row[field]===null?'hidden':'visible');dot.setAttribute('cx',cx);dot.setAttribute('cy',y(row[field]||0));const w=frame.clientWidth,half=tip.offsetWidth/2;tip.style.left=Math.max(half+4,Math.min(w-half-4,cx/width*w))+'px';}
  function hide(){tip.hidden=true;guide.setAttribute('visibility','hidden');dot.setAttribute('visibility','hidden');}
  const point=event=>show(nearest(event.clientX,svg.getBoundingClientRect(),rows.length));
  frame.addEventListener('pointermove',point);frame.addEventListener('pointerdown',point);frame.addEventListener('pointerleave',hide);frame.addEventListener('focus',()=>show(index));frame.addEventListener('blur',hide);
  frame.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;event.preventDefault();if(event.key==='Escape')hide();else show(event.key==='Home'?0:event.key==='End'?rows.length-1:index+(event.key==='ArrowRight'?1:-1));});
 }
 return {mount,nearest,description};
});
