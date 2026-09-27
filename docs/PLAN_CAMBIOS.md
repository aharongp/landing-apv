# Plan de cambios — home P0 y landing

Fecha: 2026-09-27. Rama: `feat/home-p0-y-landing`. Sin push, merge ni despliegue.

## Arquitectura comprobada
- Node.js 22, servidor HTTP nativo en `server.js`, HTML/CSS/JavaScript sin bundler. SQLite (`services/catalogDb.js`). Pruebas con `node --test`.
- `public/index.html`: hero y video, hooks ocultos de registro/buscador, franja, destacados, presupuesto, seis pasos, catálogo oculto, evaluación, costos, depósito, reseñas, planes, FAQ, CTA, pie, modales y cookies.
- `public/catalog.html`: catálogo, filtros, mismos modales/cuenta/ficha. `safePublicPath` sirve este HTML tanto para `/catalogo` como `/vehiculo/{lote}`; app.js abre el lote y usa pushState. Actualmente no hay metadatos individuales y las rutas desconocidas devuelven home con 200.
- `public/app.js`: diccionarios TRANSLATIONS ES/EN y atributos data-i18n; también existen textos hardcodeados y secciones nuevas sin traducir. `membership.js` usa `copy(es,en)`. Se ampliará el diccionario, sin sustituir el modelo de idioma.
- `public/home.js`: presupuesto, carrusel, reproductor. `landing.css`: estilos de home. `budget.js`: estimación compartida. No se modificará el MP4.
- Cookies: `initCookieBanner` en app.js, `localStorage.apv_cookie_consent` (`all`/`essential`), elementos en ambos HTML. GA4 se carga mediante script inline en ambos HTML solo tras consentimiento. Se centralizará la medición y su configuración pública servida desde variables de entorno.
- Rutas API y estáticas en `http.createServer` de server.js. Registro solicita/verifica código por correo; Google OAuth es un camino adicional. Puja registra `/api/bid-intents` y sincroniza `/api/kommo/sync-bid`.
- Kommo en `services/kommo.js` y `public/kommo.js`; atribución se añadirá como metadato/nota sin cambiar su flujo.
- `services/billing.js` + `public/membership.js` conservan precios, condiciones, Checkout y portal Stripe. Plus sin sesión abre registro; con sesión inicia Checkout (o portal si ya tiene suscripción). No se cambiará este comportamiento.

## Adaptaciones necesarias
- Los hooks ocultos SÍ tienen consumidores directos (por ejemplo hero-register-form.addEventListener y referencias de filtros). Se conservan documentados; eliminarlos requeriría desacoplar app.js y sería un cambio funcional innecesario.
- No hay fuente web del titular: se usa la pila del sistema (Inter si está instalado). No se inventará una descarga/preload inexistente: CSS crítico con font-family del sistema y sin espera de fuente. Reportar esta diferencia respecto al diagnóstico externo.
- No existe `/lp`. Se compondrá en servidor a partir de secciones compartidas de la home; reutilizará app.js y modales, con presentación de campaña y configuración de variantes única.
- `/en/` no se creará: idioma es estado cliente, con numerosas plantillas dinámicas. Separarlo requiere renderizado multilingüe y auditoría de URLs/canonical; estimación inicial 2–4 días adicionales.
- Las restricciones de Chrome no permiten leer cookies/almacenamiento ni crear contextos desde su API. La evidencia de atribución se obtendrá por pruebas HTTP locales y unitarias; se documentará cualquier parte del protocolo visual que la herramienta no permita. Lighthouse se intentará con CLI en local; no se fabricarán métricas.
- Reseñas: fallback actual sin fecha ni rating agregado inventado; Places opcional desde servidor y caché 24 h. Datos de licencia y depósito provisional en configuración. Sin claves no habrá peticiones de Pixel/CAPI/Places.

## Orden de implementación
1. Captura inicial y configuración/diccionario compartido; estructura/copy/cookies/accesibilidad.
2. SSR metadatos, 404, robots/sitemap/favicon, destacados elegibles y filtros por presupuesto; `/lp` y `/go`.
3. Atribución, consentimiento, eventos y proveedores opcionales con pruebas aisladas (sin formularios de producción).
4. Validación funcional/visual/SEO/Lighthouse y reporte exacto de pendientes legales y técnicos.

## Invariantes
No cambiar autenticación/verificación, bloqueo de calculadora, precios/beneficios/acciones de planes, cobros, lógica de puja ni contratos Kommo. Solo se añaden metadatos opcionales de medición. D-082, D-148, D-153 y D-006 siguen pendientes.
