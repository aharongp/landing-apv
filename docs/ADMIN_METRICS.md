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

La propiedad indicada por el usuario es **555122977** (APV landing), asociada a la etiqueta instalada `G-B488MP56L8`. Se configuró el ID de propiedad en el `.env` local, no versionado. El acceso inicial falló, pero el usuario abrió la cuenta correcta y el 29 de septiembre se pudo consultar y exportar la propiedad **apv motors landing** desde Chrome. La API todavía no está conectada: no hay archivo de credenciales de lectura disponible para el servidor.

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
- No se validó una respuesta de la Data API real porque faltan credenciales de servidor. La lectura real desde la interfaz de GA4 sí se completó después de resolver el acceso. La captura de pantalla de Chrome falló por tiempo de espera; la validación de interacción se hizo leyendo el DOM visible después de las acciones.
- Sin push ni despliegue en esta ampliación.

Referencias oficiales: [Google Analytics Data API, runReport](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport), [configuración del acceso](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart), [OAuth de servidor](https://developers.google.com/identity/protocols/oauth2/service-account).

## Extracción real desde Chrome — 29 de septiembre de 2026

Propiedad **555122977**, «apv motors landing», informe Adquisición de tráfico, **1–28 de septiembre de 2026**, segmento Todos los usuarios, sin filtro de hostname:

- 131 sesiones; 83 sesiones con interacción; 951 eventos. Son sesiones, no personas únicas.
- Se descargaron CSV de canales y canales por fecha. Se leyeron los totales diarios directamente de los tooltips visibles: su suma coincide con las 131 sesiones del informe.
- La suma de las filas por canal da 132; se conserva el total de 131 mostrado por Google, sin corregirlo artificialmente ni derivarlo sumando canales.
- Archivos privados locales fuera del repositorio: `/home/aharon/Downloads/apv-ga4-2026-09-01_a_2026-09-28/` (`sesiones-diarias.csv`, `canales.csv`, `canales-por-dia.csv`, `fuente.json` con evidencia y procedencia).
- Es una extracción puntual. No se importó como visitas locales ni se conectó automáticamente al panel: la sesión de Chrome no sustituye la credencial de lectura del servidor. Los cero de GA4 indican ausencia de sesiones registradas, no prueban ausencia de visitantes reales.

## Configuración del acceso automático — 29 de septiembre de 2026

Se creó el proyecto **APV Analytics Reports** (`annular-climate-510119-e1`) en la cuenta indicada por el usuario y se habilitó **Google Analytics Data API**. Se creó la cuenta de servicio `apv-ga4-reader@annular-climate-510119-e1.iam.gserviceaccount.com`, sin roles IAM adicionales sobre el proyecto. Su JSON se movió a `/home/aharon/.config/apv/ga4-reader.json`, fuera del repositorio, con permisos 600. No se dejó copia en Descargas. El `.env` local apunta a esa ruta y a la propiedad 555122977 / dominio cars.apvmotorusa.com.

**Pendiente en Google:** al intentar añadir esta cuenta como Lector de la propiedad (sin notificación por correo y sin métricas de costes/ingresos), GA4 devuelve «Este correo electrónico no coincide con ninguna cuenta de Google». No se ha concedido el permiso; la consulta real todavía devuelve acceso denegado. No se debe presentar esta conexión como activa. Reintentar el alta de esa misma cuenta cuando Google la reconozca, sin crear credenciales adicionales.

**Pendiente en producción:** falta conocer el servidor/plataforma de despliegue e instalar allí la credencial. No se hizo push ni despliegue.

### Despliegue Docker preparado

1. Instalar el JSON privado fuera del repositorio en el servidor, con permisos limitados al proceso/contenedor.
2. Configurar `GA4_PROPERTY_ID=555122977`, `GA4_HOSTNAME=cars.apvmotorusa.com` y `GA4_CREDENTIALS_HOST_PATH` con la ruta absoluta del JSON en el host Docker.
3. Ejecutar `docker compose -f docker-compose.yml -f docker-compose.ga4.yml up -d --build`. El override monta el archivo en `/run/secrets/apv-ga4.json` como solo lectura; si falta el archivo, no crea un directorio vacío en su lugar.
4. Validar con `docker compose -f docker-compose.yml -f docker-compose.ga4.yml exec apv-catalog node scripts/check-ga4.js`. Debe devolver `status: ready` y agregados reales. El script no imprime claves ni tokens.

Para desarrollo local: `node --env-file=.env scripts/check-ga4.js`. Reiniciar el servidor después de cambiar las variables. `.dockerignore` excluye `.env`, claves PEM y carpetas de credenciales del contexto de construcción; las credenciales reales permanecen fuera del proyecto.

El panel autenticado se actualiza cada cinco minutos mientras está visible; pausa las consultas en pestañas ocultas y cancela la actualización al cambiar la clave. La caché del servidor también dura cinco minutos. GA4 puede procesar los datos con demora; la actualización no implica información en tiempo real.

Validación: 63 pruebas aprobadas, incluida la actualización periódica, la pausa en segundo plano y la cancelación al cambiar la clave. La conexión real sigue pendiente del permiso de GA4 descrito arriba.

El override Docker pasó `config --quiet` usando un entorno aislado con la ruta de la credencial. La validación con el `.env` existente detectó además un formato de comillas inválido en `SMTP_FROM` (línea 23); debe corregirse antes de usar ese archivo con Docker Compose. No se modificó esa configuración de correo.

### EasyPanel

El usuario confirmó que producción usa EasyPanel y cargará las variables personalmente. Además de las variables, instalar el JSON privado como archivo persistente fuera de `/app/public` y del repositorio, por ejemplo `/run/secrets/apv-ga4.json`, usando un montaje de archivo de solo lectura. Establecer `GOOGLE_APPLICATION_CREDENTIALS` a esa ruta **dentro del contenedor**; la ruta local `/home/aharon/.config/apv/ga4-reader.json` no existe automáticamente en EasyPanel. Configurar también `GA4_PROPERTY_ID=555122977` y `GA4_HOSTNAME=cars.apvmotorusa.com`. `GA4_CREDENTIALS_HOST_PATH` solo se usa si se despliega con el override Docker Compose.

Tras desplegar, ejecutar `node scripts/check-ga4.js` en la consola del contenedor. La conexión solo estará operativa cuando el resultado sea `ready`; sigue pendiente que Google acepte el permiso de Lector de la cuenta de servicio. No subir el JSON a GitHub ni incorporarlo a la imagen Docker.

## Permiso resuelto y conexión validada — 29 de septiembre de 2026

Google aceptó la cuenta `apv-ga4-reader@annular-climate-510119-e1.iam.gserviceaccount.com` como **Lector** de la propiedad **555122977**, con restricciones de costes e ingresos y sin notificación por correo. Esto resuelve el bloqueo de permisos descrito en las secciones anteriores.

La consulta real `node --env-file=.env scripts/check-ga4.js` devolvió **ready**: dominio `cars.apvmotorusa.com`, zona `America/New_York`, período 23–29 de septiembre de 2026, 19 usuarios, 85 sesiones y 244 páginas vistas. La validación se realizó desde el entorno local usando la credencial privada; la instalación del archivo y las variables en EasyPanel queda a cargo del usuario, según indicó. No se verificó el contenedor de producción.
