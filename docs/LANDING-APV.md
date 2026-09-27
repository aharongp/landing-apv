# Portada y catálogo APV

- `/`: portada orientada a búsqueda y decisión de compra, en `public/index.html`, `landing.css` y `landing.js`.
- `/catalogo`: catálogo anterior, en `public/catalog.html`, con filtros, cuenta, planes y fichas conservados. Las secciones comerciales antiguas quedan ocultas para evitar duplicarlas.
- `/vehiculo/:lote`: mantiene las fichas compartibles. Cerrarlas devuelve a `/catalogo`.
- La búsqueda de portada usa `/catalogo?q=...`; el catálogo aplica la búsqueda antes de consultar el inventario.
- Los enlaces antiguos `/#catalogo` y `/#planes` siguen funcionando. Se conserva la query del retorno de Stripe.

## Contenido y confianza

La portada incluye inventario real, proceso en seis pasos, Evaluación APV, componentes del presupuesto, ficha oficial de Google Maps, canal oficial de YouTube, siete preguntas frecuentes y CTA al inventario. No pide registro antes de explorar. No promete ahorros, disponibilidad ni garantías mecánicas.

Fuentes oficiales proporcionadas por el propietario:
- Google: https://maps.app.goo.gl/qYoCdegG9996wcyk6
- YouTube: https://www.youtube.com/@apvmotorusa
- Datos de contacto: https://apvmotorusa.com/contactos/

**Reseñas:** la sección presenta la ficha de Google Maps y acceso directo para leer las opiniones actuales en Google. No copia reseñas, no inventa autores ni muestra una calificación fija. No es un feed de testimonios renderizado dentro del sitio. YouTube enlaza al canal oficial; no se eligieron videos específicos sin verificar su contenido.

## Rendimiento

La portada consulta solamente `/api/featured`, una vez por carga. No carga el JavaScript del catálogo, cuenta, membresías ni Kommo. Hay un enlace de respaldo y reintento si falla el inventario. Las imágenes secundarias y el mapa tienen carga diferida. Las fuentes Manrope son locales, con font-display: swap y licencia OFL incluida. CSS y JS usan hashes de contenido y la caché existente. Google Analytics mantiene el consentimiento compartido con el catálogo.

## Validación

- `npm test`: 29 pruebas aprobadas, incluyendo rutas portada/catálogo/ficha y caché de los nuevos recursos.
- Comprobaciones DOM con jsdom: búsqueda de entrada, filtros, ZIP, galería ampliada, reubicación móvil del botón de puja, destacados, escape de contenido, FAQ, fallback y reintento. Herramientas temporales fuera del repositorio; no se añadió una dependencia de producción.
- HTTP local: portada, catálogo, búsqueda y ficha real responden 200 y entregan la página correcta.
- No se pudo realizar inspección visual en Chrome: la conexión del navegador no estaba disponible.
