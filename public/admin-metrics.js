(() => {
 'use strict';
 const $=id=>document.getElementById(id),key=$('key'),panel=$('metrics-panel'),status=$('metrics-status'),load=$('load-metrics'),refresh=$('metrics-refresh'),days=$('metrics-days');
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=n=>n===null?'—':Number(n).toLocaleString('es-US'),date=iso=>new Intl.DateTimeFormat('es',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(iso));
 let version=0,controller,autoRefresh;
 function stopAutoRefresh(){clearTimeout(autoRefresh);}
 function scheduleAutoRefresh(){
  stopAutoRefresh();
  autoRefresh=setTimeout(()=>{if(!document.hidden&&!panel.hidden)void update();else if(!panel.hidden)scheduleAutoRefresh();},300000);
 }
 function render(data){
  const total=data.totals;
  const cards=[['Visitantes medidos',number(total.visitors),'Únicos en todo el período'],['Cuentas creadas',number(total.accounts),number(total.verified)+' verificadas actualmente'],['Visitantes registrados',number(total.converted),'Con visita medida y registro verificado'],['Conversión',total.conversion===null?'—':total.conversion.toLocaleString('es-US',{maximumFractionDigits:2})+' %','Registros de visitantes medidos']];
  $('metrics-kpis').innerHTML=cards.map(([label,value,note])=>`<div class="metrics-kpi"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('');
  $('metrics-period').textContent=`${data.start} a ${data.end} · UTC`;
  window.APVMetricsChart.mount($('metrics-visitors-chart'),data.daily,'visitors','#2563eb','Visitantes');
  window.APVMetricsChart.mount($('metrics-accounts-chart'),data.daily,'accounts','#b7192e','Cuentas creadas');
  const labels={'/':'Inicio','/lp':'Landing','/catalogo':'Catálogo','/vehiculo':'Fichas de vehículos'};
  $('metrics-pages').innerHTML=data.pages.length?`<table><caption>Navegadores únicos por sección (no se suman entre secciones)</caption><thead><tr><th>Sección</th><th>Visitantes</th></tr></thead><tbody>${data.pages.map(row=>`<tr><td>${escape(labels[row.page]||row.page)}</td><td>${number(row.visitors)}</td></tr>`).join('')}</tbody></table>`:'<p class="metrics-empty">Todavía no hay visitas medidas en este período.</p>';
  $('metrics-table').innerHTML=`<table><thead><tr><th>Fecha UTC</th><th>Visitantes</th><th>Cuentas creadas</th><th>Verificadas actualmente</th></tr></thead><tbody>${data.daily.map(row=>`<tr><td>${escape(row.day)}</td><td>${number(row.visitors)}</td><td>${number(row.accounts)}</td><td>${number(row.verified)}</td></tr>`).join('')}</tbody></table>`;
  $('metrics-coverage').textContent=`Medición local disponible desde ${data.startedAt.slice(0,10)}. No existe historial local de visitas anterior; las cuentas sí usan su fecha de creación guardada. El historial de Google Analytics, cuando esté conectado, se muestra en su propio bloque. Los días anteriores al inicio no representan tráfico cero.`;
 }
 function renderGoogle(data){
  $('metrics-ga4-data').hidden=data.status!=='ready';
  if(data.status!=='ready'){$('metrics-ga4-status').textContent=data.message;return;}
  $('metrics-ga4-status').textContent=data.limited?'Google indica limitaciones o umbrales en este informe.':'Datos consultados en Google Analytics.';
  $('metrics-ga4-kpis').innerHTML=[['Usuarios',data.totals.users],['Visitas (sesiones)',data.totals.sessions],['Páginas vistas',data.totals.pageViews]].map(([label,value])=>`<div class="metrics-kpi"><span>${label}</span><strong>${number(value)}</strong></div>`).join('');
  window.APVMetricsChart.mount($('metrics-ga4-users'),data.daily,'users','#2563eb','Usuarios GA4');
  window.APVMetricsChart.mount($('metrics-ga4-sessions'),data.daily,'sessions','#08765c','Sesiones GA4');
  $('metrics-ga4-period').textContent=`${data.start} a ${data.end} · Zona: ${data.timezone} · Dominio: ${data.hostname} · Consultado: ${new Date(data.updatedAt).toLocaleString('es')}. Los ceros indican que GA4 no reportó actividad; no confirman que la etiqueta estuviera instalada.`;
  $('metrics-ga4-table').innerHTML=`<table><thead><tr><th>Fecha GA4</th><th>Usuarios</th><th>Sesiones</th><th>Páginas vistas</th></tr></thead><tbody>${data.daily.map(row=>`<tr><td>${escape(row.day)}</td><td>${number(row.users)}</td><td>${number(row.sessions)}</td><td>${number(row.pageViews)}</td></tr>`).join('')}</tbody></table>`;
 }
 async function loadGoogle(token,signal){
  $('metrics-ga4-data').hidden=true;$('metrics-ga4-status').textContent='Consultando Google Analytics…';
  try{const response=await fetch('/api/admin/metrics/ga4?days='+days.value,{headers:{'x-admin-key':key.value},cache:'no-store',signal});const data=await response.json();if(token!==version)return;if(!response.ok)throw new Error(data.error||'No se pudo consultar Google Analytics.');renderGoogle(data);}
  catch(error){if(token===version&&error.name!=='AbortError')$('metrics-ga4-status').textContent=error.message;}
 }
 async function update(){
  stopAutoRefresh();
  const token=++version;controller?.abort();controller=new AbortController();panel.hidden=true;
  if(!key.value.trim()){status.textContent='Introduce la clave de administración para ver las métricas.';status.dataset.error='true';return;}
  load.disabled=refresh.disabled=true;status.dataset.error='false';status.textContent='Cargando métricas…';
  try{
   const response=await fetch('/api/admin/metrics?days='+days.value,{headers:{'x-admin-key':key.value},cache:'no-store',signal:controller.signal});
   const data=await response.json();if(token!==version)return;
   if(!response.ok)throw new Error(data.error||'No se pudieron cargar las métricas.');
   render(data);panel.hidden=false;status.textContent='Métricas actualizadas. Actualización automática cada 5 minutos mientras el panel esté visible.';void loadGoogle(token,controller.signal);scheduleAutoRefresh();
  }catch(err){if(token!==version||err.name==='AbortError')return;status.dataset.error='true';status.textContent=err.message||'No se pudieron cargar las métricas.';}
  finally{if(token===version)load.disabled=refresh.disabled=false;}
 }
 key.addEventListener('input',()=>{stopAutoRefresh();version++;controller?.abort();panel.hidden=true;load.disabled=refresh.disabled=false;status.textContent='';});
 load.addEventListener('click',update);refresh.addEventListener('click',update);days.addEventListener('change',update);
})();
