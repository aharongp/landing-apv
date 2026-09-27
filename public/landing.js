(() => {
  'use strict';
  // Keep legacy bookmarks useful after moving the catalog off the home page.
  if (['#catalogo', '#planes', '#terminos', '#privacidad'].includes(location.hash)) {
    location.replace('/catalogo' + location.search + location.hash);
    return;
  }
  const cookieNotice = document.getElementById('cookie-notice');
  try { cookieNotice.hidden = Boolean(localStorage.getItem('apv_cookie_consent')); } catch { cookieNotice.hidden = false; }
  document.querySelectorAll('[data-consent]').forEach(button => button.addEventListener('click', () => {
    try { localStorage.setItem('apv_cookie_consent', button.dataset.consent); } catch {}
    cookieNotice.hidden = true;
    if (button.dataset.consent === 'all') window.apvStartAnalytics?.();
  }));
  document.getElementById('copyright-year').textContent = String(new Date().getFullYear());
  const grid = document.getElementById('featured');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const imageUrl = value => {
    try { const url = new URL(value, location.origin); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
  };
  const load = async () => {
    try {
      const response = await fetch('/api/featured', { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('No se pudo cargar el inventario');
      const data = await response.json();
      const vehicles = (data.items || []).slice(0, 3);
      if (!vehicles.length) throw new Error('Sin vehículos destacados');
      grid.innerHTML = vehicles.map(v => {
        const href = '/vehiculo/' + encodeURIComponent(v.lot);
        const image = imageUrl(v.image);
        const price = Number(v.currentBid);
        return `<a class="vehicle-card" href="${href}"><div class="vehicle-photo">${image ? `<img src="${escape(image)}" alt="${escape(v.title)}" loading="lazy" decoding="async">` : ''}<span>LOTE ${escape(v.lot)}</span></div><div class="vehicle-copy"><h3>${escape(v.title)}</h3><p>${escape(v.location || [v.locationCity, v.locationState].filter(Boolean).join(', ') || 'Ver ubicación en la ficha')}</p><div class="vehicle-meta"><span>${price > 0 ? 'Puja actual · $' + price.toLocaleString('en-US') + ' USD' : 'Consulta precio y condiciones'}</span><strong>Ver vehículo ↗</strong></div></div></a>`;
      }).join('');
      grid.querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.hidden = true; }));
      const first = vehicles.find(v => imageUrl(v.image));
      if (first) {
        const img = document.createElement('img');
        img.alt = first.title || 'Vehículo del catálogo APV';
        img.fetchPriority = 'high';
        img.addEventListener('load', () => document.getElementById('hero-image').replaceChildren(img));
        img.src = imageUrl(first.image);
        document.getElementById('hero-vehicle-title').textContent = first.title;
        for (const id of ['hero-vehicle', 'hero-detail-link']) document.getElementById(id).href = '/vehiculo/' + encodeURIComponent(first.lot);
      }
    } catch {
      grid.innerHTML = '<div class="loading"><p>Explora el catálogo para consultar los vehículos disponibles.</p><a class="text-link" href="/catalogo">Ir al catálogo ↗</a> <button type="button" class="button small" id="retry-featured">Reintentar</button></div>';
      document.getElementById('retry-featured').addEventListener('click', load, { once: true });
    }
  };
  load(); // One selection per page load, no timed refresh.
})();
