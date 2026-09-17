# APV Auction Catalog - Integración Kommo CRM REST API v4

Aplicación web de catálogo de subastas para **APV Motors** integrada con **Kommo CRM** mediante la API REST oficial v4 en el backend.

---

## 🚀 Novedades de Arquitectura (Backend CRM REST API v4)

Anteriormente, la aplicación intentaba sincronizar datos de Leads y Contactos desde el navegador usando `crm_plugin.setMeta()`. En la presente versión:

1. **Escritura Segura desde el Backend**: Todas las actualizaciones de Contactos y Leads se ejecutan desde el servidor Node.js utilizando la API REST v4 oficial de Kommo (`/api/v4/contacts/{id}` y `/api/v4/leads/{id}`).
2. **Protección de Credenciales**: El token de acceso de Kommo (`KOMMO_TOKEN`) reside exclusivamente en variables de entorno del servidor. Jamás se envía al frontend, se expone en respuestas ni se registra en logs.
3. **Correlación de Chats y Polling de Incoming Leads**: El chat embebido inicializa la sesión con la clave estable `apv:{APV_USER_ID}:vehicle:{LOT}` (`visitor_uid`). Al solicitar una puja, el backend realiza un polling en `GET /api/v4/leads/unsorted` para localizar el Lead entrante creado por el Website Chat Button y actualiza inmediatamente las entidades correspondientes.
4. **Verificación de Persistencia**: Cada actualización realiza llamadas de verificación `GET` a Kommo para confirmar la persistencia de datos.
5. **Idempotencia**: Los identificadores de Lead y Contacto sincronizados se registran en `data/kommo_sync.json` para evitar consultas redundantes en futuras actualizaciones.
6. **Experiencia de Usuario Discreta**: El usuario recibe una retroalimentación limpia ("Preparando tu solicitud..." -> "Solicitud registrada") sin botones técnicos expuestos.
7. **Fuente de Conocimiento para Agente de IA**: Server-rendered HTML en `/kommo-knowledge/...` paginado a 100 vehículos por página con todos los atributos del CSV.

---

## 🛠️ Configuración de Variables de Entorno (.env)

Crea o actualiza el archivo `.env` en la raíz del proyecto:

```env
PORT=3000
ADMIN_KEY=clave_de_administrador
SESSION_SECRET=secret_largo_y_seguro

# Kommo CRM REST API v4
KOMMO_ENABLED=true
KOMMO_SUBDOMAIN=apvmotorusa
KOMMO_TOKEN=tu_long_lived_token_de_kommo
APV_DEBUG_KOMMO=false

# Kommo AI Agent Knowledge Base
KOMMO_KNOWLEDGE_TOKEN=token_secreto_para_conocimiento
KOMMO_KNOWLEDGE_PAGE_SIZE=100
```

---

## 🗝️ Configuración de Integración Privada en Kommo

1. Inicia sesión en tu cuenta de Kommo (`apvmotorusa.kommo.com`).
2. Dirígete a **Ajustes** → **Integraciones** → **Crear Integración Privada**.
3. Asigna un nombre (ej. `APV Auction Catalog Backend`).
4. Selecciona los permisos requeridos:
   - **Leads**: Leer, Editar, Crear.
   - **Contactos**: Leer, Editar, Crear.
5. Genera y copia el **Long-lived Token**.
6. Pega el token en la variable `KOMMO_TOKEN` de tu archivo `.env`.

### Rotación de Token
Si necesitas rotar el token de Kommo:
1. Genera un nuevo token privado desde el panel de Kommo.
2. Actualiza la variable `KOMMO_TOKEN` en el archivo `.env` en tu servidor.
3. Reinicia el servidor Node.js (`systemctl restart apv-app` o `npm start`).

---

## 📡 Endpoints Backend de Kommo

### 1. Health Check (`GET /api/kommo/health`)
Verifica la conectividad y validez del token con la API de Kommo llamando a `/api/v4/account`.

**Respuesta de éxito (200 OK):**
```json
{
  "ok": true,
  "enabled": true,
  "subdomain": "apvmotorusa",
  "account": "APV Motors USA"
}
```

### 2. Sincronización de Puja (`POST /api/kommo/sync-bid`)
Endpoint protegido (requiere sesión de usuario autenticada).

**Payload Request:**
```json
{
  "lot": "41633106",
  "maxBid": 4000
}
```

**Flujo Backend:**
1. Obtiene los datos verificados del usuario desde la sesión (`name`, `email`, `phone`, `apvUserId`).
2. Obtiene los datos del vehículo desde el catálogo CSV (`vin`, `title` / marca / modelo).
3. Busca el Incoming Lead en `/api/v4/leads/unsorted` usando la clave `apv:{APV_USER_ID}:vehicle:{LOT}`.
4. Actualiza el Contacto via `PATCH /api/v4/contacts/{contact_id}`:
   - Nombre: `contact.name`
   - Teléfono: Field `479324` (Enum `MOB`)
   - Email: Field `479326` (Enum `PRIV`)
   - APV User ID: Field `1126783`
5. Actualiza el Lead via `PATCH /api/v4/leads/{lead_id}`:
   - Nombre: `Puja | {vehicleModel}`
   - Presupuesto / Tope: `lead.sale`
   - Vehículo solicitado: Field `1126777`
   - VIN solicitado: Field `1126779`
   - Lote solicitado: Field `1126781`
6. Realiza verificación GET.
7. Almacena en `data/kommo_sync.json`.

**Respuesta Response (200 OK):**
```json
{
  "ok": true,
  "incomingLeadUid": "unsorted_uid...",
  "leadId": 21445449,
  "contactId": 12345678,
  "verified": {
    "contact": true,
    "lead": true
  }
}
```

---

## 🤖 Fuente de Conocimiento para Kommo AI Agent

El servidor genera automáticamente páginas HTML renderizadas para indexar el catálogo en Kommo AI:

- **Ruta de acceso**: `/kommo-knowledge/{KOMMO_KNOWLEDGE_TOKEN}/`
- **Índice general**: `/kommo-knowledge/{KOMMO_KNOWLEDGE_TOKEN}/`
- **Páginas paginadas**: `/kommo-knowledge/{KOMMO_KNOWLEDGE_TOKEN}/vehicles/page/1` (100 vehículos por página).

### Configuración en Kommo:
1. Ve al apartado de **Agentes de IA** en Kommo.
2. Agrega una nueva fuente de conocimiento tipo **URL → Añadir subpáginas**.
3. Introduce la URL completa (ej. `https://tu-dominio.com/kommo-knowledge/tu-token-secreto/`).

---

## 🧪 Verificación y Pruebas

Para verificar la integración de extremo a extremo:

1. **Comprobar Health Check**:
   ```bash
   curl -X GET http://localhost:3000/api/kommo/health
   ```
2. **Iniciar Sesión en la Web**:
   - Inicia sesión como usuario registrado.
3. **Solicitar Puja**:
   - Selecciona un vehículo (ej. Lote `41633106`).
   - Define un tope de puja (ej. `$4,000`).
   - Haz clic en **Continuar por chat**.
4. **Verificar en Kommo CRM**:
   - Ingresa al panel de Kommo CRM (`apvmotorusa.kommo.com`).
   - Abre la sección de Leads / Unsorted / Chats.
   - Confirma que el Lead se llama `Puja | 2013 Acura Tsx Tech`.
   - Confirma que el valor de **Presupuesto / Sale** es `$4,000`.
   - Revisa que los campos personalizados (**Vehículo**, **VIN**, **Lote**, **Teléfono**, **Email**, **APV User ID**) contengan la información correspondiente.

---

## 💻 Ejecución en Desarrollo y Producción

```bash
# Desarrollo
npm start

# Producción con modo debug activado
APV_DEBUG_KOMMO=true PORT=3000 npm start
```


## Correcciones del catálogo

Requiere Node.js 22.13 o superior (`node:sqlite`). Ejecuta `npm test` para verificar importación, filtros y recuperación de imágenes; reinicia el servidor con `npm start` para cargar los cambios.

La carga CSV es un reemplazo completo y transaccional del inventario: usa siempre un export completo. Valida columnas y registros, deduplica por lote y excluye subastas cuya hora programada ya pasó, usando la zona horaria del export. La limpieza se repite cada minuto. Fecha `0` o vacía significa subasta por anunciar; se conserva. Un archivo sin registros válidos conserva el inventario anterior. Las filas inválidas se contabilizan en el resultado de carga. El mismo archivo no se reprocesa al reiniciar.

Los filtros separan marca y modelo, incluyen todos los modelos del inventario, años desde 1950, condición normalizada y Run & Drive. La búsqueda permite combinar palabras en cualquier orden, por ejemplo `Silverado 2023`. Los favoritos se guardan en la cuenta (hasta 500) y se consultan desde **♥ Mis favoritos**, junto a Mis Pujas. Requieren iniciar sesión y están disponibles desde otros dispositivos.

La galería consulta las fotos bajo demanda y permite navegar con flechas y miniaturas. Si Copart no responde, conserva la portada. Los metadatos de filtros se almacenan en caché y las consultas usan índices de marca/modelo y fecha de subasta.

`APV_DATA_DIR` permite usar un directorio de datos aislado para pruebas. Los respaldos locales de la reparación están en `data/backups/` y se excluyen de Git.


### Reparar el catálogo del servidor

En `/admin`, introduce la clave de administración y pulsa **Reparar base de datos**. La operación crea un respaldo privado en `data/backups/`, fuerza la lectura del último CSV aunque no haya cambiado, reconstruye los vehículos y muestra el resultado. Conserva cuentas, favoritos y pujas. Requiere `ADMIN_KEY` configurada; sin el CSV original no se puede reconstruir el inventario. También se respalda el catálogo antes de reemplazarlo automáticamente al arrancar con un CSV nuevo o una nueva versión del importador. La reparación corrige registros del catálogo; no sustituye una restauración de SQLite si el archivo está físicamente dañado.


### Carga de la página principal

La portada solicita destacados, catálogo, sesión y filtros en paralelo. `/api/featured` devuelve únicamente los campos de las tarjetas y selecciona seis lotes distintos de una lista de candidatos preparada al iniciar. La lista se invalida cuando se importa, repara o vacía el catálogo, o cuando se eliminan subastas vencidas; cada visita sigue recibiendo una selección aleatoria.

El catálogo inicial no aplica un rango de años implícito: usa directamente el índice de próximas subastas. Las fotos del catálogo usan carga diferida del navegador, y las tres fotos visibles de destacados tienen prioridad. JSON y archivos de texto se comprimen con gzip; CSS, JavaScript y HTML se revalidan con ETag. Las respuestas de vehículos y cuentas mantienen `Cache-Control: no-store`.
