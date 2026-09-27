# Changelog de conversión

Línea base comercial de referencia: 2026-08-16. Estos cambios no se han desplegado; sus fechas registran el trabajo local, no el inicio de exposición de tráfico.

## 2026-09-27T17:32:13+00:00 — Home P0

Orden de secciones, copy de marca, cuatro pasos, costos/depósito, reseñas y cookies compactas. Etiquetas españolas y mejoras de accesibilidad. Precios, pagos y bloqueo de calculadora sin cambios.

## 2026-09-27T17:32:13+00:00 — Campaña y atribución

Landing compartida /lp con tres variantes, chips y CTA móvil. /go A/B persistente. Primera fuente, UTM, consentimiento, eventos GA4 y Meta/CAPI opcionales. Datos de licencia y reseñas pendientes de configuración.

## 2026-09-27T17:32:13+00:00 — SEO y validación

Metadatos SSR por vehículo, imagen social, favicon, 404, robots y sitemap por fragmentos. 43 pruebas; Lighthouse móvil mediana de tres corridas: home 97/100, LP 99/100 (rendimiento/accesibilidad). Evidencias y pendientes en docs/REPORTE_CAMBIOS.md.

## 2026-09-27T19:19:47+00:00 — Landing según referencia móvil

Hero de /lp con mensaje directo de compra online y video existente. Accesos para primera compra y visitantes que conocen las subastas. Orden: explicación, presupuesto, destacados, cuatro pasos, costos/depósito, respaldo APV/evaluación, reseñas, FAQ y CTA. Reutiliza cálculo y reproductor; conserva atribución al pasar del presupuesto al catálogo. Sin cifras de confianza inventadas.

## 2026-09-27T19:24:18+00:00 — Validación Chrome de landing

Corrección de separación de «100 %» y CTA fijo superpuesto al hero móvil. Verificados video, presupuesto, carrusel, FAQ y apertura de ficha. Evidencias móvil/escritorio en docs/qa/lp-reference-*.jpg; 43 pruebas aprobadas. Cambios locales, sin push.

## 2026-09-27T19:33:55+00:00 — Corrección de alcance de los heroes

La simplificación corresponde a la página principal: «Compra tu vehículo en subastas de EE. UU. 100 % online.» y descripción breve. /lp recupera «Compra tu auto a precio de subasta, como los concesionarios.», con hero centrado y video debajo del título y subtítulo en móvil/escritorio. «Ya conozco las subastas» apunta a /. Validado en Chrome y 43 pruebas aprobadas. Cambios locales sin push. Las capturas anteriores reflejan el diseño previo a esta corrección.

## 2026-09-27T20:06:42+00:00 — Comparación visual basada en compra inmediata

Los destacados requieren Buy Now mayor que cero y valor al público válido, conservando los demás criterios de selección. Comparación en tarjetas con dos importes, barra proporcional y porcentaje solo si compra inmediata está por debajo del valor al público. Nunca se usa la puja actual para calcular la diferencia. Se aclara que tarifas, transporte y reparaciones no están incluidos. Catálogo general conserva sus filtros y no muestra comparación cuando falta Buy Now.

43 pruebas aprobadas, incluyendo exclusión de lotes con solo puja y rangos calculados por compra inmediata. Validación DOM en Chrome con lote 62681826: US$600 contra US$13.150, diferencia 95,4 %. Inventario local: cuatro lotes con Buy Now, ninguno cumple además los criterios de destacados; se muestra el estado vacío en lugar de sustituirlos por pujas. Sin push.
