(() => {
 'use strict';
 const $=id=>document.getElementById(id),key=$('key'),panel=$('metrics-panel'),status=$('metrics-status'),load=$('load-metrics'),refresh=$('metrics-refresh'),days=$('metrics-days');
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=n=>n===null?'—':Number(n).toLocaleString('es-US'),date=iso=>new Intl.DateTimeFormat('es',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(iso));
 let version=0,controller;
 function chart(rows,field,color,label){
  const width=460,height=190,left=40,right=10,top=12,bottom=30,max=Math.ceil(Math.max(1,...rows.map(row=>row[field]))/2)*2;
  const x=i=>left+i*(width-left-right)/Math.max(1,rows.length-1),y=n=>height-bottom-n/max*(height-top-bottom);
  const ticks=[0,.5,1].map(r=>`<line x1="${left}" x2="${width-right}" y1="${y(max*r)}" y2="${y(max*r)}" stroke="#e2e8f0"/><text x="${left-7}" y="${y(max*r)+4}" text-anchor="end">${number(Math.ceil(max*r))}</text>`).join('');
  const points=rows.flatMap((row,i)=>row[field]===null?[]:[`${x(i)},${y(row[field])}`]).join(' ');
  return `<svg class="metrics-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(label)}. Datos disponibles en la tabla diaria.">${ticks}<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5"/>${rows.map((row,i)=>row[field]===null?'':`<circle cx="${x(i)}" cy="${y(row[field])}" r="2.5" fill="${color}"><title>${row.day}: ${number(row[field])}</title></circle>`).join('')}<text x="${left}" y="${height-5}">${escape(date(rows[0].day))}</text><text x="${width-right}" y="${height-5}" text-anchor="end">${escape(date(rows.at(-1).day))}</text></svg>`;
 }
 function render(data){
  const total=data.totals;
  const cards=[['Visitantes medidos',number(total.visitors),'Únicos en todo el período'],['Cuentas creadas',number(total.accounts),number(total.verified)+' verificadas actualmente'],['Visitantes registrados',number(total.converted),'Con visita medida y registro verificado'],['Conversión',total.conversion===null?'—':total.conversion.toLocaleString('es-US',{maximumFractionDigits:2})+' %','Registros de visitantes medidos']];
  $('metrics-kpis').innerHTML=cards.map(([label,value,note])=>`<div class="metrics-kpi"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
  $('metrics-period').textContent=`${data.start} a ${data.end} · UTC`;
  $('metrics-visitors-chart').innerHTML=chart(data.daily,'visitors','#2563eb','Visitantes diarios');
  $('metrics-accounts-chart').innerHTML=chart(data.daily,'accounts','#b7192e','Cuentas creadas diariamente');
  const labels={'/':'Inicio','/lp':'Landing','/catalogo':'Catálogo','/vehiculo':'Fichas de vehículos'};
  $('metrics-pages').innerHTML=data.pages.length?`<table><caption>Navegadores únicos por sección (no se suman entre secciones)</caption><thead><tr><th>Sección</th><th>Visitantes</th></tr></thead><tbody>${data.pages.map(row=>`<tr><td>${escape(labels[row.page]||row.page)}</td><td>${number(row.visitors)}</td></tr>`).join('')}</tbody></table>`:'<p class="metrics-empty">Todavía no hay visitas medidas en este período.</p>';
  $('metrics-table').innerHTML=`<table><thead><tr><th>Fecha UTC</th><th>Visitantes</th><th>Cuentas creadas</th><th>Verificadas actualmente</th></tr></thead><tbody>${data.daily.map(row=>`<tr><td>${escape(row.day)}</td><td>${number(row.visitors)}</td><td>${number(row.accounts)}</td><td>${number(row.verified)}</td></tr>`).join('')}</tbody></table>`;
  $('metrics-coverage').textContent=`Medición local disponible desde ${data.startedAt.slice(0,10)}. No existe historial local de visitas anterior; las cuentas sí usan su fecha de creación guardada. No se importan datos de Google Analytics. Los días anteriores al inicio no representan tráfico cero.`;
 }
 async function update(){
  const token=++version;controller?.abort();controller=new AbortController();panel.hidden=true;
  if(!key.value.trim()){status.textContent='Introduce la clave de administración para ver las métricas.';status.dataset.error='true';return;}
  load.disabled=refresh.disabled=true;status.dataset.error='false';status.textContent='Cargando métricas…';
  try{
   const response=await fetch('/api/admin/metrics?days='+days.value,{headers:{'x-admin-key':key.value},cache:'no-store',signal:controller.signal});
   const data=await response.json();if(token!==version)return;
   if(!response.ok)throw new Error(data.error||'No se pudieron cargar las métricas.');
   render(data);panel.hidden=false;status.textContent='Métricas actualizadas.';
  }catch(err){if(token!==version||err.name==='AbortError')return;status.dataset.error='true';status.textContent=err.message||'No se pudieron cargar las métricas.';}
  finally{if(token===version)load.disabled=refresh.disabled=false;}
 }
 key.addEventListener('input',()=>{version++;controller?.abort();panel.hidden=true;load.disabled=refresh.disabled=false;status.textContent='';});
 load.addEventListener('click',update);refresh.addEventListener('click',update);days.addEventListener('change',update);
})();
