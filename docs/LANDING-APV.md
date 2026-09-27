# Inicio y catálogo APV

## Estructura corregida

El inicio conserva el hero, los filtros, destacados y «Cómo comprar» de la versión `94ff47d`. Se verificó que el marcado de ambos bloques coincide exactamente con esa versión.

El catálogo completo vive en `/catalogo`. Su espacio en el inicio se sustituye por Evaluación APV, explicación de costos, ficha de Google y enlace a reseñas, canal de YouTube, preguntas frecuentes y CTA. Se conservan la ayuda, los planes funcionales, cuenta, idiomas y pie originales.

El menú y una barra de búsqueda permanecen fijos en ambas páginas, también en teléfono. La búsqueda del hero transfiere texto, marca, modelo, estado, rango de años, Run & Drive y compra inmediata. Los destacados abren `/vehiculo/:lote`. El inicio no consulta el listado completo. Los controles internos del catálogo se conservan ocultos e inertes para compatibilidad con el controlador compartido; no se renderizan resultados allí.

## Archivos

- `public/index.html`: inicio con la estructura original recuperada.
- `public/catalog.html`: catálogo y fichas compartibles.
- `public/app.js`, `styles.css`, `membership.js`, `kommo.js`: funciones y estilos compartidos.
- `public/landing.css`: estilos limitados a las secciones añadidas bajo «Cómo comprar».

Las reseñas se consultan directamente en la ficha oficial proporcionada por el propietario: https://maps.app.goo.gl/qYoCdegG9996wcyk6. No hay testimonios ni calificaciones inventados. Canal oficial: https://www.youtube.com/@apvmotorusa.

## Validación

- Suite Node: 29 pruebas aprobadas.
- Comprobación DOM del inicio: destacados, planes reales del módulo de membresías, búsqueda fija y ausencia de consulta al listado completo.
- Comprobación DOM del catálogo: filtros transferidos desde el hero, galería ampliada y ubicación móvil del botón de puja.
- HTTP local: el inicio responde 200.

## Revisión: hero con video y prueba social

La revisión posterior reemplaza el hero original por el diseño de dos columnas: propuesta, búsqueda y CTA a la izquierda; espacio de video a la derecha. Mantiene destacados y menú/buscador fijos. Orden: hero → confianza → destacados → reseñas → cómo comprar → evaluación → costos → planes → FAQ → CTA final. En teléfono, los destacados se recorren horizontalmente para evitar que tres tarjetas apiladas alejen el resto del contenido.

El carrusel contiene fragmentos breves verificados directamente en Chrome en la ficha oficial de Google el 27/09/2026: Gabriel Correa, Wolfgang Ramirez y Ynadsuy Anolacse. Cada reseña mostraba cinco estrellas. Se identifica que son fragmentos, se mantiene la fuente enlazada y no se afirma sincronización automática. Navegación por botones, indicadores, flechas del teclado y deslizamiento táctil; sin rotación automática.

El reproductor se activa al proporcionar un ID de YouTube en `data-video-id` del elemento `hero-video-stage`. Carga el iframe únicamente al pulsar reproducir. **Pendiente del propietario: elegir el video concreto.** Mientras no se configure, el espacio enlaza al canal oficial; no reproduce un video de ejemplo ajeno.

Validación de esta revisión: 29 pruebas Node aprobadas; revisión visual en Chrome de escritorio y teléfono, sin desbordamiento horizontal; navegación del carrusel probada con botones y teclado; planes y destacados visibles. El archivo temporal de comprobaciones jsdom de sesiones anteriores ya no está disponible; esta revisión usa Chrome real.

El catálogo ya no incluye las secciones de ayuda ni suscripciones. Los enlaces de navegación apuntan a `/#ayuda` y `/#planes`; «Mi plan» y «Comparar planes» también abren los planes del inicio. El módulo de membresías sigue disponible para los beneficios de cuenta y solicitudes de historial desde las fichas.

## Estructura combinada con la referencia móvil

La portada combina una oferta directa, video preparado, CTA al catálogo, orientador de presupuesto, destacados, compra en cuatro pasos, Evaluación APV, tabla de honorarios, explicación del depósito, Alexander Parra y reseñas, planes, FAQ y CTA final. Menú y búsqueda siguen fijos. El catálogo permanece separado.

El orientador pide presupuesto total y una reserva indicada por el visitante para gastos adicionales. Usa las funciones de tarifas de la calculadora de vehículos, con tarifa base APV y supuestos explícitos. Devuelve una puja máxima orientativa en dólares enteros. No afirma que el inventario quede filtrado por costo final; el enlace conserva únicamente marca/modelo. Prueba de ejemplo: US$10,000 totales y US$2,000 de reserva permiten una puja orientativa de US$6,637 y US$8,000 de compra con tarifas estimadas.

La tabla APV coincide con los tramos del código: 350/450/650/700 USD. No se publicaron las promesas «100% reembolsable» ni «solo cobramos si ganas» sin confirmación del propietario. El video concreto continúa pendiente. Foto de Alexander tomada de la página oficial: https://apvmotorusa.com/quienes-somos/ (archivo Fondo-Negro.png).

Validación: 33 pruebas aprobadas, incluidas tarifas por tramo, reserva, presupuesto insuficiente y consistencia entre cuentas. Revisión de escritorio y móvil de 390 px en Chrome; cuatro pasos, tres destacados y tres planes presentes, sin desbordamiento horizontal. Cálculo y carrusel probados en navegador.


## Ajuste de distribución solicitado

Los destacados aparecen antes de «Empieza por tus números». «Cómo comprar» recupera exactamente los seis pasos y el marcado de `2a21439`. Se eliminó la sección «Quién te acompaña» y la foto de Alexander; las reseñas permanecen.

## Video del hero

Integrado el archivo suministrado `cars-vsl.mp4` (1080p, 129.3 segundos, H.264/AAC). Video actualizado por el usuario; se conserva el archivo suministrado sin modificaciones. Portada extraída del propio video. Reproductor nativo con controles, playsinline y preload=none: sin descarga anticipada del video ni reproducción automática. Sustituye el marcador pendiente de YouTube.

El servidor entrega MP4 por streaming, con soporte HTTP Range para adelantar/retroceder, HEAD, ETag y revalidación. No guarda el video completo en la caché en memoria. Verificación: reproducción real en Chrome, respuesta 206 para rangos, y 34 pruebas aprobadas.
