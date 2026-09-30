# Correcciones para revisión — APV Motors

Fecha: 29 de septiembre de 2026. Trabajo realizado en `fix/auditoria-ui-ux-local`. Vista previa: <http://localhost:3015>. El propietario aprobó integrar y subir todos los cambios a `main`. Las notas de “sin push” de las secciones anteriores describen su estado durante la revisión.

## Lista simplificada para revisar

- [ ] **Catálogo adaptable:** tarjetas utilizables en móvil, tablet y computadora; ficha móvil sin desbordamiento lateral general.
- [ ] **Una búsqueda y filtros coherentes:** buscador único, borrado sincronizado, modelos dependientes de la marca, tipo de vehículo y orden recomendado.
- [ ] **Datos del vehículo más claros:** fecha/hora unificadas, contador fiable, tarjetas compactas y daños, millaje y documento dentro de la ficha; corrección de errores conocidos de modelos.
- [ ] **Compra inmediata diferenciada:** conserva vehículo, modalidad y precio al pedir acceso; verifica de nuevo el precio al registrar la solicitud.
- [ ] **Registro obligatorio conservado:** las dos calculadoras requieren cuenta; sus mensajes explican el beneficio y conservan los importes para continuar.
- [ ] **Alertas comerciales conservadas:** promoción de Plus/Premium antes de la solicitud, descuentos y precios anuales visibles, con una salida clara para continuar. Comparación de precio visible con exclusiones.
- [ ] **Depósito con el asesor:** se retiraron porcentaje y mínimo provisionales; el asesor explica monto, condiciones y aplicación antes del pago. Licencia incompleta oculta.
- [ ] **Cuenta más sencilla:** recuperación de contraseña, indicación de ocho caracteres, mostrar/ocultar contraseña, ayuda de teléfono, foco contenido y mejores etiquetas/contraste.
- [ ] **Portada más limpia:** beneficios comunes de planes una sola vez, condiciones ampliables, evaluación sin controles decorativos, reseñas seleccionadas y enlaces de campaña al catálogo.
- [ ] **Acabado:** cookies legibles, textos ES/EN, compartir agrupado, página 404, subtítulos seleccionables y transcripciones del video.

## Decisiones indicadas por el usuario

La recomendación original de publicar la calculadora sin registro **no se aplicó**. Tanto presupuesto como calculadora de ficha requieren cuenta. La recomendación de retirar el modal comercial **se adaptó**: se conserva como oportunidad de venta con descuentos, precio de suscripción y acción para continuar la solicitud.

El depósito se consulta con el asesor. No se inventó una licencia ni se publicaron nuevas condiciones de devolución. Los porcentajes comparan compra inmediata contra una referencia estimada del vehículo; no prometen un ahorro final después de transporte, impuestos o reparación.

## Trazabilidad de los 32 hallazgos

| Hallazgo | Corrección aplicada |
|---|---|
| H01 | Instante de subasta normalizado por zona; mismo formato en tarjeta/ficha; contador actualizado; sin inferir que un lote fue vendido. |
| H02 | Destacados incluyen fecha, hora y zona del lote. Si el origen no informa una fecha fiable, se muestra una única indicación pendiente. |
| H03 | Cuadrícula y filtros coordinados en 768/769 px; tarjetas con ancho mínimo utilizable. |
| H04 | Anchos de la ficha sujetos al contenedor; galería horizontal limitada a sus miniaturas. |
| H05 | Número de licencia oculto cuando falta o tiene formato provisional. Campo preparado para un número verificado. |
| H06 | Restricciones de acceso explicadas según lote; se elimina la exclusividad absoluta en la landing. |
| H07 | Depósito explicado por asesor, sin 10 % ni US$600 publicados como regla confirmada. |
| H08 | Buscador único visible y un acceso a filtros por tamaño; limpieza de búsqueda sincronizada. |
| H09 | Orden recomendado estable que prioriza vehículos con datos útiles; filtro de autos/pickups y otros vehículos. |
| H10 | Alias conocidos de modelos corregidos; combinaciones incoherentes dejan de ofrecerse como modelos; estados y documentos con etiquetas contextualizadas. Datos originales conservados. |
| H11 | Daño principal, millaje y documento visibles sin abrir la ficha. |
| H12 | Modalidad de compra inmediata y precio conservados en autenticación, solicitud persistida y contexto comercial; rechaza cotizaciones desactualizadas. |
| H13 | Comparación comercial conservada, referencia identificada y exclusiones legibles junto al porcentaje. |
| H14 | Adaptado a tu instrucción: registro obligatorio en ambas calculadoras, mensaje de beneficio y continuidad de datos. |
| H15 | Estimación de compra y exclusiones explícitas; parámetros fijos se presentan como información, sin aparentar controles configurables. |
| H16 | Adaptado a tu instrucción: alerta de membresía conservada, con precio anual, descuento y continuación clara. |
| H17 | Recuperación con código por correo, expiración, límite de intentos y revocación de sesiones anteriores. |
| H18 | Acceso contextual para calculadora, presupuesto, favorito, plan y solicitud de compra/puja. |
| H19 | Ayuda para contraseña y teléfono; ejemplo según prefijo; mostrar/ocultar contraseña. |
| H20 | Etiquetas explícitas para teléfono, país y ordenación; pestañas de acceso identificadas. |
| H21 | Foco contenido en diálogos, fondo inerte y retorno al control de origen; Escape respeta diálogos anidados. |
| H22 | Textos de ayuda y pestañas con colores de mayor contraste. |
| H23 | Navegación, idioma y controles principales con áreas táctiles ampliadas. |
| H24 | Beneficios comunes una vez; diferencias de planes resumidas; detalles secundarios ampliables. |
| H25 | Evaluación con un argumento y una acción reales; retirada la simulación decorativa de controles. |
| H26 | Recorrido experto enlaza al catálogo; CTA antes del video; explicación y pasos con propósitos distintos. |
| H27 | Traducción del plan gratuito, tarifas, estados y textos nuevos en ES/EN; preservados nombres de modelos. |
| H28 | Etiqueta “Reseñas seleccionadas”; retiradas falsas pestañas y duplicación del enlace general. |
| H29 | Texto de cookies sin truncamiento; opciones legibles; CTA fijo de campaña no compite con el aviso. |
| H30 | Fragmentos de depósito/costos separados; espaciado de frases y pie corregido. |
| H31 | Pistas VTT ES/EN, control CC y transcripciones accesibles; cambio de idioma selecciona el video y la pista correspondientes. |
| H32 | 404 con buscador, botones y espaciado coherentes. |

Adicionalmente: encabezado principal del catálogo H1, nombres de paginación y opción “Compartir vehículo” agrupada.

## Validación y evidencias

- **72 pruebas automatizadas aprobadas.** [Resultado completo](qa/correcciones-2026-09-29/pruebas-automaticas.txt) y [comprobaciones finales](qa/correcciones-2026-09-29/validacion-final.json). Cubren fechas/zona, catálogo y tarjetas, recuperación (código inválido, vencido, consumido, límites y sesiones), compra inmediata válida/cambiada/no disponible y entrega de video/subtítulos. Las solicitudes de prueba usan una base desechable.
- Chrome: catálogo comprobado en anchos 320, 360, 390, 700, 701, 767, 768, 769, 820, 1024 y 1440 px. [Mediciones](qa/correcciones-2026-09-29/catalogo-anchos.json). A 768 px las tarjetas miden aproximadamente 355 px, frente a 102 px en la auditoría.
- Revisión adicional: a 320 px, contenido de 305 px y tarjetas de 277 px sin desbordamiento. [Móvil pequeño](qa/correcciones-2026-09-29/catalogo-320.png). Planes reducidos de aproximadamente 2.550 a 1.952 px de alto en móvil; portada de 10.220 a 9.208 px, incluyendo la transcripción añadida.
- Ficha a 390 px: contenedor y contenido de 375 px, sin desbordamiento general. [Ficha móvil](qa/correcciones-2026-09-29/ficha-movil.png).
- [Catálogo móvil](qa/correcciones-2026-09-29/catalogo-movil.png), [catálogo de computadora](qa/correcciones-2026-09-29/catalogo-escritorio.png), [registro desde calculadora](qa/correcciones-2026-09-29/registro-calculadora-movil.png), [recuperación](qa/correcciones-2026-09-29/recuperar-cuenta-movil.png).
- Con la sesión local existente: estimación de US$5.000, promoción de membresía y continuación al formulario, sin envío final. Sin sesión: registro contextual y bloqueo de calculadoras.
- Compra inmediata en Chrome: inventario ficticio aislado de US$600, porque los lotes locales disponibles ya no ofrecían compra inmediata al cerrar esta revisión. [Evidencia identificada como prueba](qa/correcciones-2026-09-29/compra-inmediata-registro-prueba.png). No se añadió ese vehículo al inventario real.
- Campaña: el enlace de usuario experto conserva `utm_source` y variante al llegar a `/catalogo`; CTA principal visible antes del video. [Captura](qa/correcciones-2026-09-29/campana-movil.png).
- Presupuesto anónimo: US$10.000 y reserva US$2.000 conservados al cerrar el registro; resultado permanece bloqueado. [Captura](qa/correcciones-2026-09-29/registro-presupuesto-movil.png).
- Subtítulos generados desde los videos existentes y corregidos en nombres y texto; validación de tiempos ordenados, máximo dos líneas y cambio ES/EN. El material ya contiene texto incrustado: CC comienza desactivado para evitar duplicarlo y puede activarse. Conviene una revisión editorial completa de sincronización antes de publicar.

## Configuración externa y límites de esta entrega

Estos elementos necesitan información real o validación de los proveedores; no pueden darse por configurados por modificar la interfaz:

- **Licencia:** falta el número verificado. La interfaz ya no publica el marcador provisional. Configurar `DEALER_LICENSE_NO` cuando se confirme.
- **Google Places y Meta:** permanecen opcionales y sin credenciales nuevas. Las reseñas seleccionadas conservan su fecha; no se presentan como una consulta en vivo.
- **Dominio público:** confirmar `PUBLIC_SITE_URL` para el despliegue y su correspondencia con `PUBLIC_APP_URL`; no se cambió el dominio del negocio.
- **Correo, CRM, Stripe y analítica:** se validó código y flujos locales. No se enviaron mensajes comerciales, correos reales de prueba, solicitudes finales de puja ni cobros; no se acredita entrega externa, atribución en GA4/Meta ni renovación de pagos.
- **Datos:** se corrigen alias conocidos, no todo el inventario por inferencia. Los códigos de documento sin correspondencia confirmada mantienen una etiqueta explícita; disponibilidad y condiciones finales las confirma el asesor.
- La revisión usa Chrome con tamaños de pantalla simulados. No acredita pruebas en teléfonos físicos, Safari ni lector de pantalla, ni una mejora medida de conversión.

## Orden sugerido de revisión local

1. Abrir <http://localhost:3015/catalogo> en computadora y móvil; buscar, limpiar, filtrar y abrir una ficha.
2. En una ventana sin sesión, probar presupuesto y calculadora de ficha: ambos deben pedir cuenta. Abrir “Olvidé mi contraseña”.
3. Con sesión, calcular un importe y pulsar “Quiero ofertar”: debe conservarse la alerta comercial y permitir continuar. No es necesario enviar la solicitud para revisar la interfaz.
4. Revisar planes, depósito, video/CC/transcripción, cookies y la variante <http://localhost:3015/lp?v=primera-vez>.
5. Aprobar visualmente estos cambios antes de decidir su integración o despliegue.

## Ajuste solicitado: hero y navegación móvil

- En pantallas de hasta 768 px, el hero de inicio muestra únicamente título, video y el CTA “Ver autos en subasta”, en ese orden visual y de navegación.
- Se ocultan en ese hero el texto introductorio, honorarios, enlace de presupuesto, indicadores de confianza y textos secundarios del reproductor. En teléfono se ocultan también el enlace de transcripción y la nota del asesor junto al video.
- Al bajar por inicio o catálogo en móvil, el encabezado se retrae y la búsqueda permanece fija arriba. Al subir reaparece el menú; el contenido conserva su posición. La apertura de diálogos o del menú de cuenta evita retracciones durante esas interacciones.
- La vista de computadora mantiene su disposición y contenido. Registro obligatorio y alertas comerciales permanecen.
- Validación en Chrome: 390 px, 320 px y 1440 px; hero móvil en el orden solicitado, sin desbordamiento, búsqueda a 0 px del borde superior al retraer el menú y regreso del encabezado al subir. 72/72 pruebas aprobadas, sintaxis y diff correctos.
- Evidencias: [hero simplificado](qa/correcciones-2026-09-29/hero-movil-simplificado.png), [menú retraído](qa/correcciones-2026-09-29/menu-movil-retraido.png).

## Ajuste solicitado: menos texto en las demás secciones móviles

- Versiones breves en español e inglés para reseñas, presupuesto, evaluación, honorarios, depósito, planes, preguntas frecuentes y cierre comercial. Al pasar a computadora se recupera el texto completo.
- Títulos directos como “Calcula tu presupuesto”, “Honorarios claros” y “Elige tu plan”. Se retiran de móvil los antetítulos y subtítulos que repetían el mensaje de la sección o los beneficios del plan.
- Reseñas originales intactas; su introducción conserva la fuente, la fecha y la aclaración de que son una selección.
- El depósito conserva el contacto con asesor y la aceptación de condiciones antes de pagar. Los tres casos se pueden abrir en “Si ganas, no ganas o no pagas”; en computadora siguen desplegados.
- Precios, descuentos, asesoría incluida, renovación anual, exclusiones de costos y condiciones de las calculadoras se conservan. Registro obligatorio y alertas comerciales permanecen sin cambios.
- Verificado en Chrome: español/inglés, apertura del desplegable, cambio entre móvil y computadora y ausencia de desbordamiento. 72/72 pruebas aprobadas. Evidencias: [presupuesto](qa/correcciones-2026-09-29/textos-presupuesto-movil.png), [depósito desplegado](qa/correcciones-2026-09-29/textos-deposito-movil.png).

## Ajuste solicitado: mostrar vehículos caducados

- Se conserva el lote cuando pasa la fecha de subasta. El contador muestra **Caducado** (EN: **Expired**) y la ficha muestra el mismo aviso, con indicación de confirmar disponibilidad y precio con el asesor.
- Etiqueta ámbar para distinguirlo del contador activo. La etiqueta y el aviso se actualizan al pasar la hora, sin recargar la página.
- Los caducados aparecen en catálogo, búsquedas, filtro Buy Now y destacados; los lotes identificados expresamente como vendidos, cerrados, cancelados o retirados siguen excluidos. En el orden recomendado se priorizan próximas subastas y se ordenan los caducados del más reciente al más antiguo.
- Recuperación desde el CSV original con respaldo previo: **142.207 vehículos**, de los cuales **22.997 tienen precio Buy Now registrado**. Son precios del inventario importado, sujetos a confirmación cuando la fecha está caducada. Los lotes 64228046 y 62681826 vuelven a mostrar US$600.
- Se conservaron cuentas, favoritos, solicitudes y registros comerciales. [Comprobación de recuperación y respaldo](qa/correcciones-2026-09-29/caducados-recuperacion.json).
- Se actualizó el resumen administrativo para distinguir “Caducados conservados” de “Cerrados excluidos”. El nuevo criterio de importación también recupera los lotes eliminados al volver a cargar un CSV que ya se había importado.
- **74/74 pruebas aprobadas**, incluyendo recuperación de una base importada con la política anterior, persistencia tras la limpieza, filtro Buy Now, exclusión de vendidos y avisos ES/EN. [Pruebas](qa/correcciones-2026-09-29/pruebas-caducados.txt). Chrome: [tarjeta móvil](qa/correcciones-2026-09-29/caducado-tarjeta-movil.png), [ficha móvil](qa/correcciones-2026-09-29/caducado-ficha-movil.png).

Esta decisión reemplaza las referencias anteriores de este documento al inventario local sin Buy Now y a la retirada automática por fecha.

## Ajuste solicitado: tarjetas compactas como antes

- Inicio y catálogo recuperan la comparación verde breve de Buy Now: porcentaje, valor de referencia y barra, sin el párrafo explicativo en la tarjeta.
- Las tarjetas muestran foto, origen/contador, favorito, título, lote/ubicación, fecha, puja actual y botones. Daños, millaje y documento se consultan dentro de la ficha.
- La explicación de la comparación y sus exclusiones queda en “Análisis de precio” dentro de la ficha. Se conservan “Caducado”, la alerta de ficha, compra inmediata y “Quiero ofertar”.
- Este ajuste sustituye la recomendación anterior de añadir la condición y la explicación extensa a las tarjetas. No modifica inventario, registro obligatorio ni alertas comerciales.
- Validación: 74/74 pruebas aprobadas; Chrome a 390 y 1440 px sin desbordamiento horizontal. Revisados el Lexus del ejemplo (lote 62063896), su ficha y los destacados de inicio.
- Evidencias: [tarjeta móvil](qa/correcciones-2026-09-29/tarjeta-compacta-movil.png), [destacados en computadora](qa/correcciones-2026-09-29/tarjetas-compactas-escritorio.png).
- Cambios locales en `fix/auditoria-ui-ux-local`, pendientes de revisión; sin push ni merge a main.

## 2026-09-30 — Acceso a WhatsApp desde conversaciones existentes

El enlace de WhatsApp estaba en la bienvenida del Salesbot; no existía un control en el chat de la aplicación y la bienvenida no se vuelve a ejecutar al reabrir una conversación.

- Se añadió «Continuar por WhatsApp» en el encabezado del chat tanto en la portada como en el catálogo, con estados e instrucciones en español e inglés.
- El botón solicita al servidor ejecutar el Salesbot web configurado en el lead ya vinculado al usuario autenticado. El cliente abre después el enlace recibido en el chat y envía el mensaje prellenado. No se construye un `wa.me` con un identificador inventado ni se crean leads o contactos durante esta solicitud.
- `POST /api/kommo/whatsapp-transfer` no acepta IDs de clientes ni de leads del navegador. Rechaza registros sin identidad de chat coincidente o con varios leads distintos y limita solicitudes al mismo lead durante un minuto por proceso. No reintenta automáticamente errores ambiguos de Kommo.
- Configuración inicial: bot de bienvenida `92269` en `apvmotorusa`, con URL `https://wa.me/13462048308?text=ID:%20{{session_id}}`. La prueba posterior de entrega obligó a sustituirlo por el bot dedicado `93029`; ver corrección siguiente. Puede reemplazarse con `KOMMO_WHATSAPP_BOT_ID` en el servidor.
- Validación: sintaxis JS, pruebas de autorización de la ruta, selección de conversación, concurrencia, errores, estados del botón, traducciones y entrega de recursos HTTP. No se enviaron mensajes a clientes para probarlo.
- Pendiente: publicar estos cambios, comprobar el aspecto en la instancia utilizada por el usuario y realizar una transferencia real controlada. La aceptación de la solicitud por la API no confirma la entrega del enlace ni la vinculación final del canal. Para esta última, el cliente debe enviar el ID prellenado y deben estar activas las reglas de duplicados correspondientes en Kommo.

### Vista compacta del chat

- Se eliminó la cabecera de logo duplicada durante el chat. El título, WhatsApp y minimizar quedan en una sola fila.
- Se sustituyó la distribución por filas fijas por una columna flexible: solo la conversación recibe el espacio restante. El selector de pujas deja de estirarse en escritorio.
- Las pujas se muestran en un desplegable nativo, cerrado inicialmente, con desplazamiento horizontal para varios vehículos; se mantienen los controles para cambiar y borrar pujas.
- Se corrigió el texto blanco sobre fondo claro del vehículo activo y se reservaron 44 px para minimizar.
- Revisión visual local en Chrome con el HTML/CSS del modal y conversación de muestra, sin conexión a Kommo: a 425 × 879 el área de chat mide 773 px (88 %); con el aviso de WhatsApp visible, 735 px (84 %). Revisadas también la vista de escritorio y las pujas desplegadas. La prueba no valida el contenido interno del iframe de Kommo ni el teclado del dispositivo.
- Pasaron las nueve pruebas seleccionadas de WhatsApp, idiomas y entrega de recursos HTTP. Pendiente comprobar el despliegue en `cars.apvmotorusa.com` después de actualizar EasyPanel.

### Corrección tras la prueba real del botón

- Se reprodujo el aviso «Envía primero un mensaje» incluso después de enviar el mensaje de prueba autorizado. El widget había creado el contacto y el lead en Kommo, pero la sincronización local había agotado sus intentos antes del primer mensaje.
- Si falta el lead local, el servidor consulta el contacto por el identificador APV derivado de la sesión y verifica su coincidencia exacta en el campo `1126783`. Solo continúa con un contacto y un lead inequívocos; rechaza resultados paginados o ambiguos. No crea contactos ni leads. Las solicitudes simultáneas comparten la consulta y conservan el límite de un lanzamiento por minuto.
- El bot de bienvenida `92269` aceptaba la petición API sin entregar el enlace a la conversación existente. Se creó y guardó `93029`, «APV - Continuar por WhatsApp», dirigido al contacto principal en los canales de Chats, sin disparadores automáticos. Es ahora el valor predeterminado de la aplicación para esta cuenta. Si EasyPanel tiene `KOMMO_WHATSAPP_BOT_ID` definido, debe valer `93029`.
- Prueba real desde el servicio corregido: el bot entregó el enlace dentro del chat existente, sustituyó `{{session_id}}` por un ID real y abrió la página de WhatsApp de «broker apvmotors» con ese ID prellenado. No se envió el mensaje final desde WhatsApp; la vinculación entre canales y ausencia de duplicados tras ese envío siguen pendientes de verificar.
- La vista compacta ya está desplegada: el área de conversación ocupa aproximadamente el 85 % del modal en la ventana de escritorio revisada. Esto no sustituye una prueba del teclado en un teléfono real.
- Validación: 9/9 pruebas de WhatsApp, membresía y autorización/recuperación de sesión; el servidor del test de compra tiene Kommo deshabilitado para evitar consultas externas. La corrección del servidor requiere un nuevo despliegue en EasyPanel.

### Asociación automática entre chat web y WhatsApp en Kommo

- La prueba posterior recibió el ID en WhatsApp, pero creó otra ficha. Había varios leads históricos con el teléfono de prueba, y la regla «No cambiar los datos del lead existente» mantenía separadas las coincidencias con conflictos. La detección manual incluso proponía una venta antigua. Esto no permite atribuir todo el fallo exclusivamente a una sola regla.
- Con autorización expresa se fusionaron únicamente los leads `21880249` (Silverado) y `21880259` (WhatsApp). Se conservó `21880249`, la puja de 4.000 USD en el campo personalizado, VIN, lote, ambos contactos y ambos historiales, en Prueba → Contacto inicial. La API confirmó la ficha conservada y la desaparición del duplicado; la interfaz mostró las conversaciones web y WhatsApp en la misma ficha.
- A petición del usuario se configuraron las reglas nativas de duplicados de VENTAS (`12442255`) y Prueba (`14370344`). Fuentes incluidas: WhatsApp «broker apvmotors» (`62880`) y los dos canales de Chats (`73181`, `73183`) respectivamente. Las demás fuentes permanecieron como estaban.
- Ambos pipelines detectan coincidencias por píxel, correo y teléfono; Big Data sigue desactivado. Ante conflictos se seleccionó «Actualizar el lead existente con nuevos datos»; ante varias coincidencias, «Actualizar el duplicado más reciente». La actualización puede modificar datos existentes con los de la solicitud entrante.
- La búsqueda se limitó a las diez etapas abiertas de VENTAS y Prueba, incluidas las etapas de leads entrantes. Se excluyeron etapas ganadas/perdidas y los otros pipelines para no asociar solicitudes del catálogo con ventas históricas o procesos ajenos. No se modificaron las reglas propias de esos otros pipelines.
- Verificación: se recargó cada página y se reabrió el formulario para comprobar que fuentes, métodos, política de conflictos y diez etapas seleccionadas persistían. Son cambios de configuración de Kommo; no requieren despliegue en EasyPanel.
- Pendiente: transferencia nueva desde un contacto de prueba que no haya sido fusionado manualmente, enviando el ID prellenado y verificando la conservación del lead, presupuesto e historiales. La configuración guardada no demuestra por sí sola el resultado de esa prueba. Kommo documenta que no fusiona cuando encuentra más de tres duplicados; con varias coincidencias dentro del límite, la política de recencia tampoco garantiza elegir la oportunidad deseada en todos los casos.
- Referencias: [Control de duplicados](https://support.kommo.com/docs/set-up-duplicate-control) y [Transferencia desde Live chat](https://support.kommo.com/docs/es/set-up-live-chat-with-website-chat-button).

## Recuperación de conversación y traspaso — 30 de septiembre de 2026

Se reprodujo el caso reportado con la cuenta de prueba indicada por el propietario. Kommo conservaba el contacto y los mensajes, pero el lead original `21880225` estaba eliminado. Los eventos muestran su eliminación a las 13:27 (hora de la interfaz CRM); los intentos posteriores volvieron a utilizar el contexto de esa conversación. Se restauró únicamente ese lead mediante la papelera de Kommo y se verificó por UI y API: Prueba → Contacto inicial, Mustang 2021, lote 60157996, presupuesto personalizado 3000. No se restauraron los duplicados descartados por las fusiones.

El contacto recuperado tampoco tenía `APV User ID`. Con la sesión que abrió el propietario se confirmó un mensaje visible y la respuesta incorrecta del botón «Envía primero un mensaje». La restauración del lead por sí sola no acredita la reparación del botón.

Cambios de aplicación:

- Reenviar contacto, identificador APV y datos de solicitud juntos al quedar listo el widget; al reabrir, incluir identidad sin reemplazar el presupuesto por cero.
- Recuperar el lead existente durante la sincronización mediante coincidencia exacta del campo APV, ya que `onlinechat.user_id` y el `visitor_uid` nativo observado no son iguales. Mantener el contacto que coincidió, incluso si otro es el principal del lead.
- Comprobar que el lead existe antes de sincronizar o ejecutar el Salesbot. Si fue eliminado y no hay una asociación exacta recuperable, mostrar el motivo correspondiente. No crear leads de reemplazo ni restaurar automáticamente registros eliminados.
- Corregir la etapa predeterminada de aceptación de entrantes a Contacto inicial de Prueba (`110996284`).
- Reconstruir el contexto de «Mis Pujas» antes de abrir el chat en un dispositivo sin memoria local. El fallo se reprodujo en Chrome después de iniciar sesión en la cuenta reportada.

Validación: 15 pruebas de Kommo aprobadas (identidad, recuperación, registros eliminados, concurrencia, metadatos al iniciar/reabrir y solicitudes guardadas en otro dispositivo); sintaxis de los tres archivos JavaScript y `git diff --check` correctos. Se retomó la consulta del mismo lote e importe para reproducir el botón en producción. El código nuevo requiere despliegue en EasyPanel; todavía falta confirmar que aparezca el enlace en esa conversación tras desplegar. No se acredita aún el recorrido completo de recepción por WhatsApp y asociación automática.

### Validación posterior al despliegue: contactos antiguos sin APV User ID

Se confirmó que `df19974` estaba publicado. Reabrir el chat y retomar la misma solicitud no repuso el identificador APV del contacto antiguo, incluso después de enviar un mensaje nuevo. Por ello la corrección anterior no resuelve por sí sola la recuperación de este contacto.

Se añadió una recuperación exclusivamente para cuentas cuyo correo está verificado en el servidor: exige coincidencia exacta de correo y teléfono normalizados, un solo contacto y lead, contacto principal, lead abierto en Prueba/VENTAS y conversación nativa onlinechat de las fuentes APV. Se rechazan contactos con múltiples correos/teléfonos, resultados paginados o ambiguos, otra identidad APV y cambios detectados al releer el contacto. Solo entonces se escribe el identificador derivado por el servidor. El endpoint no toma estas identidades del cuerpo de la petición.

Pruebas: 17 casos de Kommo aprobados, incluidos rechazo de identidades no verificadas, contactos ambiguos, otro propietario, lead cerrado/eliminado y chats ajenos. No se eliminó ningún lead para repetir la prueba. Se ejecutó el bot sobre el lead de prueba identificado para verificar por separado la entrega del enlace mientras se prepara este ajuste; no se presenta esa ejecución directa como validación del botón de la aplicación.
