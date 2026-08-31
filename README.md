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
