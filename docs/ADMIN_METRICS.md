# Métricas del administrador

En `/admin`, introducir la clave existente en el campo de administración y pulsar **Ver métricas**. El panel permite elegir 7, 30 o 90 días y actualizar los datos. La clave permanece en el campo de contraseña; no se almacena en localStorage ni se envía por URL. Cambiarla oculta el panel y cancela cualquier petición pendiente.

## Datos mostrados

- Visitantes medidos: navegadores únicos en el período, identificados mediante una cookie aleatoria HttpOnly, SameSite=Lax, de hasta 90 días. Recargas, distintas secciones o distintos días del mismo navegador no duplican este total.
- Cuentas creadas: cuentas existentes en `users`, agrupadas por fecha de creación, incluyendo pendientes de verificación. Se muestra también cuántas de esas cuentas están verificadas actualmente.
- Visitantes registrados: navegadores medidos en el período con al menos un registro verificado durante ese período. Varios registros del mismo navegador cuentan como un visitante convertido. Las verificaciones por correo y los registros completados con Google se atribuyen desde el servidor; iniciar sesión con una cuenta ya verificada no crea una conversión.
- Conversión: visitantes registrados / visitantes medidos × 100. Sin visitantes, se muestra «—».
- Gráficos diarios de visitantes y cuentas, visitantes por sección y tabla diaria accesible. Los días se agrupan en UTC; el día actual es parcial.

## Cobertura y consentimiento

Las cuentas aportan el historial disponible en la base de datos. Las visitas comienzan a medirse con esta funcionalidad; Google Analytics tiene ahora un bloque independiente que consulta su historial cuando se configura acceso de lectura. El inicio de cobertura queda guardado y los días anteriores muestran visitantes sin datos, no cero. La fecha exacta se registra cuando se inicializa el servicio en la primera petición.

La medición de visitas solo se envía después de aceptar todas las cookies. Al rechazar la medición se elimina la cookie del navegador; no se borran los agregados históricos. No se registran IP, correos, teléfonos, parámetros de búsqueda ni identificadores de lotes en las visitas. Se agrupan las fichas bajo `/vehiculo`. Son navegadores medidos, no un censo de personas; varios dispositivos, bloqueadores o visitas sin consentimiento afectan la cobertura. La información de privacidad ES/EN explica esta medición.

## Implementación

- `GET /api/admin/metrics?days=7|30|90`: requiere `ADMIN_KEY` configurada y cabecera `x-admin-key` válida. Devuelve agregados con `Cache-Control: no-store`; no devuelve identificadores de usuarios ni visitantes.
- `POST /api/metrics/visit`: página permitida y consentimiento explícito; rechaza peticiones marcadas como cross-site, limita el cuerpo a 2 KB y omite agentes identificados como bots. No sustituye un servicio de detección de fraude/bots.
- Tablas SQLite `metric_visits`, `metric_registrations`, `metric_metadata`, conservadas junto con las cuentas durante las actualizaciones del catálogo. Las visitas se deduplican por navegador, día y sección.
- Gráficos SVG locales, sin dependencias de terceros. Recursos incluidos en el versionado del frontend.

## Validación

57 pruebas aprobadas: consentimiento del cliente y servidor, cookies, deduplicación, días sin cobertura, atribución de registros verificados, ventanas de fechas, rechazo de claves incorrectas, cabeceras sin caché y eliminación de cookie al rechazar medición. Comprobaciones de sintaxis y `git diff --check` correctas. La validación visual en navegador no se realizó en este cambio.

Cambios locales; sin push ni despliegue.


## Google Analytics e interacción de los gráficos

La propiedad indicada por el usuario es **555122977** (APV landing), asociada a la etiqueta instalada `G-B488MP56L8`. Se configuró el ID de propiedad en el `.env` local, no versionado. No se extrajeron ni inventaron cifras: el Chrome conectado devolvió **«Faltan permisos»** al abrir el enlace de la propiedad suministrado por el usuario. Quedó pendiente cambiar a una cuenta con acceso. La API tampoco está conectada todavía: no hay archivo de credenciales de lectura disponible.

El panel tiene una sección GA4 independiente con usuarios únicos, visitas/sesiones, páginas vistas, gráficos y tabla diaria. No mezcla esos datos con visitantes locales ni calcula conversión con denominadores de otra fuente. Los usuarios únicos del período provienen de un informe agregado; no se suman los usuarios diarios. Los días siguen la zona horaria de la propiedad de Google, que se muestra en el panel. Los errores de acceso y la configuración pendiente se muestran expresamente, sin convertirlos en cero visitas.

### Activar la consulta automática

1. Habilitar Google Analytics Data API en el proyecto de Google Cloud correspondiente.
2. Usar una cuenta de servicio y darle acceso **Lector** a la propiedad GA4 **555122977** desde la administración de acceso de Google Analytics.
3. Guardar su JSON privado fuera del repositorio y de `public/`, con permisos de lectura limitados al proceso del servidor. No pegar claves en el chat ni subirlas a GitHub.
4. Configurar `GA4_PROPERTY_ID=555122977` y `GOOGLE_APPLICATION_CREDENTIALS=/ruta/privada/ga4-service-account.json`. `GA4_HOSTNAME` permite indicar el dominio exacto; por defecto usa el hostname de `PUBLIC_SITE_URL` o `cars.apvmotorusa.com`.
5. Reiniciar el servidor. En Docker, las variables ya se transmiten; el archivo debe montarse además como volumen de solo lectura y la variable debe apuntar a la ruta **dentro del contenedor**. No se añadió un montaje obligatorio sin disponer del archivo.

La API privada `GET /api/admin/metrics/ga4?days=7|30|90` requiere la misma clave de administración. Los tokens se mantienen en memoria y solicitan únicamente `analytics.readonly`. Los informes se guardan en caché cinco minutos. El navegador recibe agregados, nunca claves ni tokens. La lectura inicial del navegador de Google Analytics no sustituye las credenciales que necesita el servidor para actualizar el panel automáticamente.

### Gráficos interactivos

Todos los gráficos (locales y GA4) muestran fecha, serie y cifra exacta al pasar el cursor o tocar cualquier posición del gráfico. Una guía vertical y un punto resaltado indican el día seleccionado. Con teclado: Tab para enfocar, flechas para recorrer días, Home/End para extremos y Escape para cerrar el tooltip. Los datos sin cobertura muestran «Sin datos»; el cero real se conserva como cero. Las tablas siguen disponibles.

### Validación de esta ampliación

- 62 pruebas aprobadas: autenticación de endpoints, acceso GA4 de solo lectura simulado, filtros de dominio, zonas horarias, usuarios únicos del período, caché, estados sin credenciales/permisos y selección de días del tooltip.
- Chrome, con datos sintéticos aislados del sitio real: tooltip al pasar el mouse sobre el gráfico mostró «27 sept 2026 · Visitantes: 7»; End mostró «29 sept 2026 · Visitantes: 9» y flecha izquierda «28 sept 2026 · Visitantes: 8».
- No se validó una respuesta GA4 real porque Google rechazó el acceso. La captura de pantalla de Chrome falló por tiempo de espera; la validación de interacción se hizo leyendo el DOM visible después de las acciones.
- Sin push ni despliegue en esta ampliación.

Referencias oficiales: [Google Analytics Data API, runReport](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport), [configuración del acceso](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart), [OAuth de servidor](https://developers.google.com/identity/protocols/oauth2/service-account).
