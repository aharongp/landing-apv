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
