# Métricas del administrador

En `/admin`, introducir la clave existente en el campo de administración y pulsar **Ver métricas**. El panel permite elegir 7, 30 o 90 días y actualizar los datos. La clave permanece en el campo de contraseña; no se almacena en localStorage ni se envía por URL. Cambiarla oculta el panel y cancela cualquier petición pendiente.

## Datos mostrados

- Visitantes medidos: navegadores únicos en el período, identificados mediante una cookie aleatoria HttpOnly, SameSite=Lax, de hasta 90 días. Recargas, distintas secciones o distintos días del mismo navegador no duplican este total.
- Cuentas creadas: cuentas existentes en `users`, agrupadas por fecha de creación, incluyendo pendientes de verificación. Se muestra también cuántas de esas cuentas están verificadas actualmente.
- Visitantes registrados: navegadores medidos en el período con al menos un registro verificado durante ese período. Varios registros del mismo navegador cuentan como un visitante convertido. Las verificaciones por correo y los registros completados con Google se atribuyen desde el servidor; iniciar sesión con una cuenta ya verificada no crea una conversión.
- Conversión: visitantes registrados / visitantes medidos × 100. Sin visitantes, se muestra «—».
- Gráficos diarios de visitantes y cuentas, visitantes por sección y tabla diaria accesible. Los días se agrupan en UTC; el día actual es parcial.

## Cobertura y consentimiento

Las cuentas aportan el historial disponible en la base de datos. Las visitas comienzan a medirse con esta funcionalidad; no se importan datos históricos de Google Analytics. El inicio de cobertura queda guardado y los días anteriores muestran visitantes sin datos, no cero. La fecha exacta se registra cuando se inicializa el servicio en la primera petición.

La medición de visitas solo se envía después de aceptar todas las cookies. Al rechazar la medición se elimina la cookie del navegador; no se borran los agregados históricos. No se registran IP, correos, teléfonos, parámetros de búsqueda ni identificadores de lotes en las visitas. Se agrupan las fichas bajo `/vehiculo`. Son navegadores medidos, no un censo de personas; varios dispositivos, bloqueadores o visitas sin consentimiento afectan la cobertura. La información de privacidad ES/EN explica esta medición.

## Implementación

- `GET /api/admin/metrics?days=7|30|90`: requiere `ADMIN_KEY` configurada y cabecera `x-admin-key` válida. Devuelve agregados con `Cache-Control: no-store`; no devuelve identificadores de usuarios ni visitantes.
- `POST /api/metrics/visit`: página permitida y consentimiento explícito; rechaza peticiones marcadas como cross-site, limita el cuerpo a 2 KB y omite agentes identificados como bots. No sustituye un servicio de detección de fraude/bots.
- Tablas SQLite `metric_visits`, `metric_registrations`, `metric_metadata`, conservadas junto con las cuentas durante las actualizaciones del catálogo. Las visitas se deduplican por navegador, día y sección.
- Gráficos SVG locales, sin dependencias de terceros. Recursos incluidos en el versionado del frontend.

## Validación

57 pruebas aprobadas: consentimiento del cliente y servidor, cookies, deduplicación, días sin cobertura, atribución de registros verificados, ventanas de fechas, rechazo de claves incorrectas, cabeceras sin caché y eliminación de cookie al rechazar medición. Comprobaciones de sintaxis y `git diff --check` correctas. La validación visual en navegador no se realizó en este cambio.

Cambios locales; sin push ni despliegue.
