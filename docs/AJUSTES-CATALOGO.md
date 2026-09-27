# Ajustes del catálogo solicitados en Ahron.pdf

Implementados en el código local:

- Destacados: se eligen al cargar o recargar la página, sin renovación por temporizador ni al volver a la pestaña. Se excluyen fechas vencidas y estados explícitos de venta/cierre/cancelación. La disponibilidad depende del CSV importado, no de una consulta en tiempo real a Copart.
- Fotografías: imágenes de resolución completa en listado y destacados (se revirtió el uso de miniaturas por su baja calidad); galería al abrir el vehículo. Visor ampliado con navegación, teclado y cierre.
- Búsqueda: combina términos de título, lote, VIN y ubicación, en cualquier orden; comprobada con “Silverado Austin”.
- Marcas: normalización de variantes y de marcas que incluyen modelos. Las opciones muestran fabricantes reconocidos; los registros con nombres no reconocidos siguen disponibles en el catálogo y por búsqueda, sin presentar sus etiquetas como marcas verificadas. La normalización también se aplica a bases existentes al iniciar.
- Años: barra con dos controles, mínimo y máximo, tanto arriba como en los filtros laterales. Los valores se sincronizan, no pueden cruzarse y “Limpiar” restaura todo el rango disponible.
- Ubicación: nombres completos de estados de EE. UU., ciudades vinculadas al estado y ZIP de cinco dígitos, conservando ceros iniciales.
- Odómetro: inicia en 0. “Limitar odómetro” permite filtrar hasta ese valor; mover el control activa el límite. Sin activar el límite se muestra todo el inventario.
- Se retira “Solo con llaves”. Se añade “Solo Clean Title”, basado en el documento del CSV, con exclusión de etiquetas salvage/rebuilt/reconstructed/flood/junk.
- Insignias COPART azules con letras blancas.
- Se retiran los botones “Ver ficha” y el buscador intermedio. Título e imagen abren la ficha; se conserva el buscador superior fijo al desplazarse.
- Ficha: encabezado modelo/marca/año, copia rápida del VIN autorizado, enlaces de WhatsApp y SMS y copia del enlace con alternativa si falla el portapapeles.
- Chat: invitación visible “¿Cuánto te gustaría ofertar o cómo te puedo ayudar?” y parámetro `welcome_message` en el contexto enviado a Kommo.

## Paso pendiente fuera del repositorio: Kommo

En el Salesbot de bienvenida asociado al widget de APV, reemplazar el saludo existente por:

> ¿Cuánto te gustaría ofertar o cómo te puedo ayudar?

La web transmite también `welcome_message` en español o inglés. Ese parámetro no modifica automáticamente el primer mensaje de un Salesbot ya configurado. La guía `KOMMO_BOT_KNOWLEDGE.txt` incluye el texto y el comportamiento esperado. No se modificó la configuración remota del CRM.

## Validación

`npm test`: 29 pruebas aprobadas, incluyendo búsquedas, filtros combinados por ciudad/ZIP/título/odómetro, fabricantes, fotos de resolución completa, caché, exclusión de vendidos y transporte HTTP de los filtros.

Comprobación adicional con DOM simulado: arranque completo, filtros, limpieza, apertura de ficha, visor, navegación de fotos, copia de VIN y enlace, y destinos WhatsApp/SMS. La ficha y el cálculo se comprobaron en Chrome con la sesión local existente.

Los cambios están en el proyecto local; no se desplegaron a producción. Antes de comprobar la disponibilidad real, importar un CSV vigente.


## Segunda revisión: rendimiento y calculadora

- Calculadora trasladada a la columna derecha, inmediatamente después de la tarjeta de puja, con controles y total adaptados al ancho disponible.
- Archivos CSS/JS con versión de contenido: caché de navegador de un año (`immutable`). HTML y URLs sin versión vigente siguen revalidándose.
- Filtros públicos con ETag/304: se valida su vigencia sin retransmitirlos si no cambiaron.
- Caché interna del catálogo de 15 segundos y hasta 64 consultas; se limpia al importar, reparar, vaciar o depurar vehículos. Las respuestas se copian para que un consumidor no modifique los datos guardados.
- El orden aleatorio inicial comparte una semilla por intervalos de cinco minutos, conservada durante la navegación, para reutilizar consultas entre visitantes sin repetir o saltar páginas.
- Las respuestas de vehículos y las cuentas conservan `no-store`; los VIN se serializan según la sesión después de recuperar los datos de la caché interna.
- Una nueva búsqueda cancela la anterior; las consultas de listado tienen un máximo de espera de 15 segundos.
- Medición HTTP local: una consulta de listado pasó de unos 65 ms sin caché a 1–2 ms al repetirse con caché. Esto mide la respuesta del servidor, no el tiempo completo de descarga de fotos de Copart. La caché del navegador beneficia visitas posteriores; la caché del servidor puede beneficiar también a visitantes nuevos.

La ficha separa la galería y los datos en una columna de contenido independiente de la columna de puja/calculadora. Expandir el cálculo no desplaza las tarjetas de daños e información técnica. En teléfono, la tarjeta de puja se coloca inmediatamente debajo de las fotos; la calculadora permanece después de la información. Al volver a escritorio, la tarjeta regresa a la columna derecha.

Visor de fotos: abrir tocando la imagen principal o “Ampliar foto”, controles de zoom, desplazamiento de la imagen ampliada, contador, flechas y cambio mediante deslizamiento horizontal cuando el zoom está desactivado.

ZIP comprobado mediante HTTP contra el catálogo local: 60120 coincide con 4.307 vehículos de Elgin y 03034 con 853 de Candia; 00000 no devuelve vehículos. Los totales corresponden al inventario al momento de la comprobación. El filtro identifica el ZIP del vehículo, no un radio de distancia.
