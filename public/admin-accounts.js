(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const key = $('key'), panel = $('accounts-panel'), status = $('accounts-status');
  const form = $('accounts-filters'), query = $('accounts-query'), verified = $('accounts-verified');
  const load = $('load-accounts'), download = $('export-accounts');
  const prev = $('accounts-prev'), next = $('accounts-next');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('es', {dateStyle:'short', timeStyle:'short', timeZone:'UTC'}).format(new Date(value)) : 'Sin datos';
  let controller, generation = 0, page = 1, pages = 1, total = 0, applied = new URLSearchParams();
  let busy = false, dirty = false;

  function message(text, error = false) {
    status.textContent = text;
    status.dataset.error = String(error);
  }
  function controls() {
    load.disabled = busy;
    for (const input of form.elements) input.disabled = busy;
    download.disabled = busy || dirty || !total;
    prev.disabled = busy || dirty || page <= 1;
    next.disabled = busy || dirty || page >= pages;
  }
  async function request(url, signal) {
    const response = await fetch(url, {headers:{'x-admin-key':key.value}, cache:'no-store', signal});
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo completar la operación. Inténtalo de nuevo.');
    }
    return response;
  }
  function clear() {
    generation++;
    controller?.abort();
    panel.hidden = true;
    $('accounts-rows').replaceChildren();
    $('accounts-count').textContent = '';
    total = 0;
    busy = false;
    controls();
  }
  async function update(targetPage = 1, filters = new URLSearchParams({q:query.value.trim(), status:verified.value})) {
    controller?.abort();
    controller = new AbortController();
    const current = ++generation;
    if (!key.value.trim()) { clear(); message('Introduce la clave de administración.', true); key.focus(); return; }
    busy = true;
    controls();
    message('Cargando cuentas…');
    const params = new URLSearchParams(filters);
    params.set('page', targetPage);
    try {
      const data = await (await request('/api/admin/accounts?' + params, controller.signal)).json();
      if (current !== generation) return;
      applied = new URLSearchParams(filters);
      page = data.page; pages = data.pages; total = data.total; dirty = false;
      $('accounts-count').textContent = `${total.toLocaleString('es')} ${total === 1 ? 'cuenta encontrada' : 'cuentas encontradas'}`;
      $('accounts-page').textContent = `Página ${page} de ${pages}`;
      $('accounts-rows').innerHTML = data.accounts.length ? data.accounts.map(account => `<tr>
        <td>${escape(account.name || 'Sin nombre')}</td>
        <td><span>${escape(account.email || 'Sin correo')}</span><span class="account-phone">${escape(account.phone || 'Sin teléfono')}</span></td>
        <td><span class="account-status ${account.verified ? 'is-verified' : ''}">${account.verified ? 'Verificada' : 'Pendiente'}</span></td>
        <td>${escape(account.provider)}</td><td>${escape(date(account.createdAt))}</td><td>${escape(date(account.lastLoginAt))}</td>
      </tr>`).join('') : '<tr><td colspan="6">No hay cuentas que coincidan con esta búsqueda.</td></tr>';
      panel.hidden = false;
      message('Cuentas actualizadas.');
    } catch (error) {
      if (current !== generation || error.name === 'AbortError') return;
      clear(); message(error.message, true);
    } finally {
      if (current === generation) { busy = false; controls(); }
    }
  }
  async function exportCsv() {
    busy = true; controls(); message('Preparando CSV…');
    controller = new AbortController();
    const current = ++generation;
    try {
      const response = await request('/api/admin/accounts/export?' + applied, controller.signal);
      const blob = await response.blob();
      if (current !== generation) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url;
      link.download = 'cuentas-apv-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message('CSV preparado. Revisa las descargas de tu navegador.');
    } catch (error) {
      if (current !== generation || error.name === 'AbortError') return;
      clear(); message(error.message, true);
    } finally {
      if (current === generation) { busy = false; controls(); }
    }
  }
  load.addEventListener('click', () => update());
  form.addEventListener('submit', event => { event.preventDefault(); void update(); });
  for (const input of [query, verified]) input.addEventListener('input', () => {
    dirty = true; controls(); message('Pulsa Buscar cuentas para aplicar los filtros.');
  });
  prev.addEventListener('click', () => update(page - 1, applied));
  next.addEventListener('click', () => update(page + 1, applied));
  download.addEventListener('click', exportCsv);
  key.addEventListener('input', () => { clear(); message('Pulsa Ver cuentas para consultar con esta clave.'); });
  controls();
})();
