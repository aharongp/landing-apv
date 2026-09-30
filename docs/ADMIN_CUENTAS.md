# Cuentas creadas en el admin

1. Abre `/admin` e introduce la clave de administración existente.
2. En **Cuentas creadas**, pulsa **Ver cuentas**.
3. Busca por nombre, correo o teléfono y, si lo necesitas, elige correos verificados o pendientes. Pulsa **Buscar cuentas** para aplicar los filtros.
4. Pulsa **Exportar CSV**. Para exportar todas las cuentas, deja la búsqueda vacía y elige **Todas las cuentas**.

La lista muestra 25 cuentas por página, de más reciente a más antigua. La descarga incluye todos los resultados filtrados, aunque ocupen varias páginas. Los cambios en filtros desactivan temporalmente la exportación hasta aplicar la búsqueda. Si no hay resultados, no se habilita la descarga.

Datos disponibles: nombre, correo, teléfono, estado de verificación, acceso por correo/Google, fecha de registro y último acceso. El CSV incluye también el ID de cuenta. Fechas en UTC; los campos inexistentes se muestran como datos no disponibles. “Pendiente” indica correo sin verificar, no una cuenta bloqueada.

El CSV usa UTF-8 con BOM y comillas para conservar acentos, comas y saltos de línea. Se puede abrir o importar en Excel y Google Sheets; si solicita separador, elige coma. Los valores que podrían interpretarse como fórmulas, incluidos teléfonos con `+`, se exportan como texto.

## Acceso y protección

- Las rutas `GET /api/admin/accounts` y `GET /api/admin/accounts/export` requieren `x-admin-key` y una `ADMIN_KEY` configurada. No basta con tener una sesión de cliente.
- Parámetros comunes: `q` y `status` (`all`, `verified`, `pending`). La lista acepta `page`; la exportación ignora la paginación.
- Respuestas sin caché. No se exportan contraseñas, hashes, códigos de verificación, identificadores internos de Google ni tokens. No se guarda la clave en el navegador.
- La consulta utiliza las cuentas actuales de SQLite y no modifica registros. No requiere migración de datos ni dependencias adicionales.

## Validación

78 pruebas aprobadas, incluidas autorización, ausencia de clave configurada, campos permitidos, filtros, paginación, exportación completa y protección de fórmulas CSV. Revisión en Chrome con 28 cuentas ficticias aisladas: búsqueda, cambio de página, filtro sin resultados y descarga real de un CSV filtrado. Vista móvil de 390 px sin desbordamiento de la página; tabla desplazable dentro de su contenedor.

Evidencias con datos ficticios: [computadora](qa/admin-cuentas-2026-09-29/escritorio-datos-ficticios.png) y [móvil](qa/admin-cuentas-2026-09-29/movil-datos-ficticios.png).
