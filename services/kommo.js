'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SYNC_FILE = path.join(DATA_DIR, 'kommo_sync.json');

function readEnvFile() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const map = {};
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          map[key] = val;
        }
      }
      return map;
    }
  } catch (_) {}
  return {};
}

function getSubdomain() {
  const env = readEnvFile();
  return (process.env.KOMMO_SUBDOMAIN || env.KOMMO_SUBDOMAIN || 'apvmotorusa').trim();
}

function getToken() {
  const env = readEnvFile();
  return (process.env.KOMMO_TOKEN || env.KOMMO_TOKEN || '').trim();
}

function isEnabled() {
  const env = readEnvFile();
  const v = (process.env.KOMMO_ENABLED || env.KOMMO_ENABLED || '').toLowerCase().trim();
  if (v === 'false' || v === '0') return false;
  return Boolean(getToken());
}

function isDebug() {
  const env = readEnvFile();
  const v = (process.env.APV_DEBUG_KOMMO || env.APV_DEBUG_KOMMO || '').toLowerCase().trim();
  return v === 'true' || v === '1';
}

function getBaseUrl() {
  const subdomain = getSubdomain();
  return `https://${subdomain}.kommo.com`;
}

function sanitizeLogMessage(msg) {
  const token = getToken();
  if (!token) return msg;
  return String(msg).replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[REDACTED_TOKEN]');
}

function atomicWriteJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

const catalogDb = require('./catalogDb');

function getSyncRecord(apvUserId, lot) {
  return catalogDb.getSyncRecord(apvUserId, lot);
}

function saveSyncRecord(record) {
  return catalogDb.saveSyncRecord(record);
}

async function kommoFetch(endpoint, options = {}) {
  const token = getToken();
  if (!token) {
    const err = new Error('KOMMO_TOKEN no configurado en el servidor.');
    err.statusCode = 401;
    err.code = 'KOMMO_TOKEN_MISSING';
    throw err;
  }

  const url = `${getBaseUrl()}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const method = (options.method || 'GET').toUpperCase();
  const maxRetries = options.maxRetries ?? 3;
  let attempt = 0;

  while (true) {
    attempt += 1;
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 10000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'APV-Auction-Catalog/1.5',
        ...(options.headers || {})
      };

      const fetchOptions = {
        method,
        headers,
        signal: controller.signal
      };

      if (options.body) {
        fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timer);

      const status = response.status;
      let textBody = '';
      try {
        textBody = await response.text();
      } catch (_) {}

      let jsonBody = null;
      if (textBody) {
        try {
          jsonBody = JSON.parse(textBody);
        } catch (_) {}
      }

      if (response.ok) {
        return { status, data: jsonBody ?? textBody };
      }

      const sanitizedText = sanitizeLogMessage(textBody || '');

      // Retry logic for 429 (Rate Limit) and 5xx server errors
      if ((status === 429 || status >= 500) && attempt <= maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 400 + Math.floor(Math.random() * 200);
        console.warn(`[KOMMO RETRY] Attempt ${attempt}/${maxRetries} for ${method} ${endpoint} (HTTP ${status}). Retrying in ${backoffMs}ms...`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      const error = new Error(`Kommo API error (HTTP ${status}): ${sanitizedText.slice(0, 200)}`);
      error.statusCode = status;
      error.endpoint = endpoint;
      error.responseBody = jsonBody || sanitizedText;
      error.code = status === 401 ? 'KOMMO_AUTH_FAILED' : status === 404 ? 'KOMMO_NOT_FOUND' : 'KOMMO_API_ERROR';
      console.error(`[KOMMO ERROR] code=${error.code} status=${status} endpoint=${endpoint} response=${sanitizedText.slice(0, 300)}`);
      throw error;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        if (attempt <= maxRetries) {
          console.warn(`[KOMMO TIMEOUT] Request to ${endpoint} timed out. Retrying...`);
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        const timeoutErr = new Error(`Timeout al comunicarse con Kommo API (${endpoint})`);
        timeoutErr.statusCode = 504;
        timeoutErr.code = 'KOMMO_TIMEOUT';
        throw timeoutErr;
      }
      if (err.statusCode) throw err;

      if (attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }

      const networkErr = new Error(`Error de red al conectar con Kommo: ${err.message}`);
      networkErr.statusCode = 502;
      networkErr.code = 'KOMMO_NETWORK_ERROR';
      throw networkErr;
    }
  }
}

async function checkHealth() {
  if (!getToken()) {
    return { ok: false, enabled: false, error: 'KOMMO_TOKEN no configurado en .env' };
  }
  try {
    const res = await kommoFetch('/api/v4/account');
    const accountName = res.data?.name || res.data?.subdomain || getSubdomain();
    return {
      ok: true,
      enabled: isEnabled(),
      subdomain: getSubdomain(),
      account: accountName
    };
  } catch (err) {
    return {
      ok: false,
      enabled: isEnabled(),
      subdomain: getSubdomain(),
      status: err.statusCode || 500,
      code: err.code || 'HEALTH_CHECK_FAILED',
      error: err.message
    };
  }
}

async function findKommoIncomingLead(chatKey, options = {}) {
  const maxWaitMs = options.maxWaitMs || 20000;
  const pollIntervalMs = options.pollIntervalMs || 850;
  const startTime = Date.now();

  console.log(`[KOMMO] Starting polling for incoming lead with chatKey (visitor_uid): ${chatKey}`);

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const endpoint = '/api/v4/leads/unsorted?filter[category][]=chats&order[created_at]=desc&limit=50';
      const res = await kommoFetch(endpoint, { timeoutMs: 5000 });

      // In Kommo API v4, GET /api/v4/leads/unsorted returns HTTP 204 No Content if empty,
      // or HTTP 200 with _embedded.unsorted array.
      if (res.status === 204 || !res.data || !res.data._embedded || !Array.isArray(res.data._embedded.unsorted)) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        continue;
      }

      const items = res.data._embedded.unsorted;
      // 1. Pass 1: Exact visitorUid match
      for (const item of items) {
        const visitorUid = item.metadata?.origin?.visitor_uid || item.metadata?.visitor_uid || '';
        const chatId = item.metadata?.origin?.chat_id || item.metadata?.chat_id || '';

        if (visitorUid === chatKey) {
          const contacts = item._embedded?.contacts || [];
          const leads = item._embedded?.leads || [];
          const contactId = contacts[0]?.id || item.contact_id || null;
          const leadId = leads[0]?.id || item.lead_id || null;
          const incomingUid = item.uid || null;

          console.log(`[KOMMO] visitor_uid exact match! visitor_uid=${visitorUid} chat_id=${chatId} incoming_uid=${incomingUid} contact_id=${contactId} lead_id=${leadId}`);

          if (incomingUid && leadId) {
            return {
              incomingUid,
              leadId: Number(leadId),
              contactId: contactId ? Number(contactId) : null,
              chatId
            };
          }
        }
      }

      // 2. Pass 2: Fallback to recent onlinechat unsorted lead created within the last 3 minutes
      for (const item of items) {
        const category = item.category || '';
        const service = item.metadata?.service || '';
        const createdAtMs = (item.created_at || 0) * 1000;

        if ((category === 'chats' || service === 'onlinechat') && createdAtMs >= startTime - 180000) {
          const contacts = item._embedded?.contacts || [];
          const leads = item._embedded?.leads || [];
          const contactId = contacts[0]?.id || item.contact_id || null;
          const leadId = leads[0]?.id || item.lead_id || null;
          const incomingUid = item.uid || null;
          const chatId = item.metadata?.origin?.chat_id || item.metadata?.chat_id || '';

          if (incomingUid && leadId) {
            console.log(`[KOMMO] Matched recent onlinechat lead! created_at=${new Date(createdAtMs).toISOString()} incoming_uid=${incomingUid} contact_id=${contactId} lead_id=${leadId}`);
            return {
              incomingUid,
              leadId: Number(leadId),
              contactId: contactId ? Number(contactId) : null,
              chatId
            };
          }
        }
      }
    } catch (err) {
      // Don't fail the loop on transient 429/5xx, just wait for next tick
      console.warn(`[KOMMO POLL WARN] ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  console.warn(`[KOMMO] Incoming lead polling timed out after ${maxWaitMs}ms for chatKey: ${chatKey}`);
  return null;
}

async function updateContact(contactId, data) {
  const custom_fields_values = [];

  if (data.phone) {
    custom_fields_values.push({
      field_id: 479324,
      values: [
        {
          value: String(data.phone),
          enum_code: 'MOB'
        }
      ]
    });
  }

  if (data.email) {
    custom_fields_values.push({
      field_id: 479326,
      values: [
        {
          value: String(data.email),
          enum_code: 'PRIV'
        }
      ]
    });
  }

  if (data.apvUserId) {
    custom_fields_values.push({
      field_id: 1126783,
      values: [
        {
          value: String(data.apvUserId)
        }
      ]
    });
  }

  const payload = {
    name: data.name || undefined,
    custom_fields_values
  };

  const res = await kommoFetch(`/api/v4/contacts/${contactId}`, {
    method: 'PATCH',
    body: payload
  });

  console.log(`[KOMMO] contact PATCH ${res.status}`);
  return res.data;
}

let leadFieldCache = null;

async function getLeadFieldIds() {
  if (leadFieldCache) return leadFieldCache;
  const defaults = { vehicleModel: 1126777, vin: 1126779, lot: 1126781, maxBid: 1126785, formulario: 1099022, seEnvioMensaje: 1114916 };
  try {
    const res = await kommoFetch('/api/v4/leads/custom_fields');
    if (res.status === 200 && res.data && res.data._embedded && Array.isArray(res.data._embedded.custom_fields)) {
      const fields = res.data._embedded.custom_fields;
      const v = fields.find((f) => f.name && f.name.toLowerCase().includes('vehículo'));
      const vin = fields.find((f) => f.name && f.name.toLowerCase().includes('vin'));
      const lot = fields.find((f) => f.name && f.name.toLowerCase().includes('lote'));
      const maxBid = fields.find((f) => f.name && (f.name.toLowerCase().includes('presupuesto') || f.name.toLowerCase().includes('puja') || f.name.toLowerCase().includes('tope') || f.name.toLowerCase().includes('monto')));
      const form = fields.find((f) => f.name && f.name.toLowerCase().includes('formulario'));
      const msgSent = fields.find((f) => f.name && f.name.toLowerCase().includes('se_envio_mensaje'));

      leadFieldCache = {
        vehicleModel: v ? v.id : defaults.vehicleModel,
        vin: vin ? vin.id : defaults.vin,
        lot: lot ? lot.id : defaults.lot,
        maxBid: maxBid ? maxBid.id : defaults.maxBid,
        formulario: form ? form.id : defaults.formulario,
        seEnvioMensaje: msgSent ? msgSent.id : defaults.seEnvioMensaje
      };
      return leadFieldCache;
    }
  } catch (err) {
    console.warn('[KOMMO WARN] Error fetching lead custom fields:', err.message);
  }
  return defaults;
}

async function updateLead(leadId, data) {
  const vehicleTitle = data.vehicleModel || 'Vehículo';
  const fieldIds = await getLeadFieldIds();
  const custom_fields_values = [];

  if (data.vehicleModel && fieldIds.vehicleModel) {
    custom_fields_values.push({
      field_id: fieldIds.vehicleModel,
      values: [
        {
          value: String(data.vehicleModel)
        }
      ]
    });
  }

  if (data.vin && fieldIds.vin) {
    custom_fields_values.push({
      field_id: fieldIds.vin,
      values: [
        {
          value: String(data.vin)
        }
      ]
    });
  }

  if (data.lot && fieldIds.lot) {
    custom_fields_values.push({
      field_id: fieldIds.lot,
      values: [
        {
          value: String(data.lot)
        }
      ]
    });
  }

  const priceAmount = Math.max(0, Math.round(Number(data.maxBid || 0)));

  if (fieldIds.maxBid) {
    custom_fields_values.push({
      field_id: fieldIds.maxBid,
      values: [
        {
          value: String(priceAmount)
        }
      ]
    });
  }

  const formattedBudget = priceAmount > 0 ? `$${priceAmount.toLocaleString('en-US')} USD` : 'Sin definir';

  const targetPipelineId = Number(process.env.KOMMO_PIPELINE_ID || 14370344);

  const payload = {
    name: `Puja (${formattedBudget}) | ${vehicleTitle}`,
    price: priceAmount,
    sale: priceAmount,
    pipeline_id: targetPipelineId,
    custom_fields_values
  };

  const res = await kommoFetch(`/api/v4/leads/${leadId}`, {
    method: 'PATCH',
    body: payload
  });

  console.log(`[KOMMO] lead PATCH status ${res.status}`);

  // Create a timeline note on the lead so advisors immediately see the budget and vehicle specs
  try {
    const formattedDate = new Date().toLocaleString('es-US', { timeZone: 'America/New_York' });
    const noteText = [
      `🚗 SOLICITUD DE PUJA REGISTRADA`,
      `---------------------------------`,
      `• Vehículo: ${vehicleTitle}`,
      `• Tope de Oferta (Presupuesto): ${formattedBudget}`,
      `• N° Lote: ${data.lot || 'N/D'}`,
      `• VIN: ${data.vin || 'N/D'}`,
      `• Fecha: ${formattedDate}`,
      `---------------------------------`
    ].join('\n');

    await kommoFetch(`/api/v4/leads/${leadId}/notes`, {
      method: 'POST',
      body: [
        {
          note_type: 'common',
          params: { text: noteText }
        }
      ]
    });
    console.log(`[KOMMO] Lead note posted for leadId=${leadId}`);
  } catch (noteErr) {
    console.warn(`[KOMMO WARN] Error posting lead note:`, noteErr.message);
  }

  return res.data;
}

async function verifySync(leadId, contactId) {
  const leadRes = await kommoFetch(`/api/v4/leads/${leadId}`);
  const contactRes = await kommoFetch(`/api/v4/contacts/${contactId}`);

  const leadOk = Boolean(leadRes.status === 200 && leadRes.data && leadRes.data.id === leadId);
  const contactOk = Boolean(contactRes.status === 200 && contactRes.data && contactRes.data.id === contactId);

  if (leadOk && contactOk) {
    console.log(`[KOMMO] verification passed for leadId=${leadId} contactId=${contactId}`);
  } else {
    console.warn(`[KOMMO WARN] verification mismatch leadOk=${leadOk} contactOk=${contactOk}`);
  }

  return {
    contact: contactOk,
    lead: leadOk
  };
}

async function findLeadForContact(contactId) {
  if (!contactId) return null;
  try {
    const res = await kommoFetch(`/api/v4/contacts/${contactId}?with=leads`);
    if (res.status === 200 && res.data && res.data._embedded && Array.isArray(res.data._embedded.leads) && res.data._embedded.leads.length > 0) {
      const leads = res.data._embedded.leads;
      const latestLead = leads[leads.length - 1];
      if (latestLead && latestLead.id) {
        console.log(`[KOMMO] Found existing leadId=${latestLead.id} for contactId=${contactId}`);
        return Number(latestLead.id);
      }
    }
  } catch (err) {
    console.warn(`[KOMMO WARN] Error querying leads for contactId=${contactId}:`, err.message);
  }
  return null;
}

async function findOrCreateContact(user) {
  let contactId = null;
  if (user.email) {
    try {
      const res = await kommoFetch(`/api/v4/contacts?query=${encodeURIComponent(user.email)}`);
      if (res.status === 200 && res.data && res.data._embedded && Array.isArray(res.data._embedded.contacts) && res.data._embedded.contacts.length > 0) {
        contactId = res.data._embedded.contacts[0].id;
        console.log(`[KOMMO] Found existing contactId=${contactId} by email=${user.email}`);
      }
    } catch (_) {}
  }

  if (!contactId) {
    const contactPayload = [
      {
        name: user.name || 'Cliente APV',
        custom_fields_values: []
      }
    ];
    if (user.email) {
      contactPayload[0].custom_fields_values.push({
        field_code: 'EMAIL',
        values: [{ value: user.email, enum_code: 'WORK' }]
      });
    }
    if (user.phone) {
      contactPayload[0].custom_fields_values.push({
        field_code: 'PHONE',
        values: [{ value: user.phone, enum_code: 'WORK' }]
      });
    }
    const createContactRes = await kommoFetch('/api/v4/contacts', {
      method: 'POST',
      body: contactPayload
    });
    if (createContactRes.status === 200 && createContactRes.data && createContactRes.data._embedded && createContactRes.data._embedded.contacts.length > 0) {
      contactId = createContactRes.data._embedded.contacts[0].id;
      console.log(`[KOMMO] Created new contactId=${contactId} via REST API`);
    }
  }

  if (!contactId) throw new Error('No se pudo crear o resolver el contacto en Kommo.');
  return contactId;
}

async function findOrCreateLeadAndContactViaApi(user, vehicle, maxBid) {
  const apvUserId = user.kommoUserId;
  const vehicleTitle = vehicle.title || [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
  const priceAmount = Math.max(0, Math.round(Number(maxBid || 0)));
  const formattedBudget = priceAmount > 0 ? `$${priceAmount.toLocaleString('en-US')} USD` : 'Sin definir';

  const contactId = await findOrCreateContact(user);

  // 3. Create lead linked to contact
  const fieldIds = await getLeadFieldIds();
  const custom_fields_values = [];
  if (vehicleTitle && fieldIds.vehicleModel) {
    custom_fields_values.push({ field_id: fieldIds.vehicleModel, values: [{ value: String(vehicleTitle) }] });
  }
  if (vehicle.vin && fieldIds.vin) {
    custom_fields_values.push({ field_id: fieldIds.vin, values: [{ value: String(vehicle.vin) }] });
  }
  if (vehicle.lot && fieldIds.lot) {
    custom_fields_values.push({ field_id: fieldIds.lot, values: [{ value: String(vehicle.lot) }] });
  }
  if (fieldIds.maxBid) {
    custom_fields_values.push({ field_id: fieldIds.maxBid, values: [{ value: String(priceAmount) }] });
  }

  const targetPipelineId = Number(process.env.KOMMO_PIPELINE_ID || 14370344);

  const createLeadRes = await kommoFetch('/api/v4/leads', {
    method: 'POST',
    body: [
      {
        name: `Puja (${formattedBudget}) | ${vehicleTitle}`,
        price: priceAmount,
        sale: priceAmount,
        pipeline_id: targetPipelineId,
        custom_fields_values,
        _embedded: {
          contacts: [{ id: contactId }]
        }
      }
    ]
  });

  if (createLeadRes.status === 200 && createLeadRes.data && createLeadRes.data._embedded && createLeadRes.data._embedded.leads.length > 0) {
    const leadId = createLeadRes.data._embedded.leads[0].id;
    console.log(`[KOMMO] Created new leadId=${leadId} linked to contactId=${contactId} via REST API`);

    // Explicitly link contact to lead via /api/v4/leads/{leadId}/link endpoint
    try {
      await kommoFetch(`/api/v4/leads/${leadId}/link`, {
        method: 'POST',
        body: [{ to_entity_id: Number(contactId), to_entity_type: 'contacts' }]
      });
      console.log(`[KOMMO] Explicitly linked contactId=${contactId} to leadId=${leadId}`);
    } catch (linkErr) {
      console.warn(`[KOMMO WARN] Error linking contact to lead: ${linkErr.message}`);
    }

    return { leadId, contactId, incomingUid: null };
  }

  throw new Error('No se pudo crear la oportunidad (Lead) en Kommo CRM.');
}

async function acceptUnsortedLead(incomingUid, statusId) {
  if (!incomingUid) return null;
  try {
    const res = await kommoFetch(`/api/v4/leads/unsorted/${incomingUid}/accept`, {
      method: 'POST',
      body: {
        status_id: Number(statusId || 110996284)
      }
    });
    console.log(`[KOMMO] Accepted unsorted lead incomingUid=${incomingUid} status=${res.status}`);
    return res.data;
  } catch (err) {
    console.warn(`[KOMMO WARN] acceptUnsortedLead error for ${incomingUid}:`, err.message);
    return null;
  }
}

async function syncBid(params) {
  const { user, vehicle, maxBid } = params;

  if (!user || !user.kommoUserId) {
    throw new Error('Usuario no autenticado para la sincronización con Kommo.');
  }

  if (!vehicle || !vehicle.lot) {
    throw new Error('Vehículo no encontrado para la sincronización.');
  }

  const apvUserId = user.kommoUserId;
  const lot = String(vehicle.lot);
  const chatKey = `apv:${apvUserId}`;
  const vehicleModel = vehicle.title || [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
  const vin = vehicle.vin || '';
  const sale = Math.max(0, Math.round(Number(maxBid || 0)));
  const targetPipelineId = Number(process.env.KOMMO_PIPELINE_ID || 14370344);

  // 1. Resolve contactId first
  let contactId = await findOrCreateContact(user);

  // 2. Resolve leadId (Check lot record -> Check user records -> Check Contact's leads in Kommo API -> Poll Unsorted -> Create via API)
  let existingRecord = getSyncRecord(apvUserId, lot);
  let leadId = existingRecord ? existingRecord.leadId : null;
  let incomingLeadUid = existingRecord ? existingRecord.incomingLeadUid : null;

  if (!leadId) {
    const userRecords = getUserSyncRecords(apvUserId);
    if (Array.isArray(userRecords) && userRecords.length > 0) {
      const rec = userRecords.find(r => r.leadId);
      if (rec) {
        leadId = rec.leadId;
        console.log(`[KOMMO] Reusing existing leadId=${leadId} from user sync history for ${apvUserId}`);
      }
    }
  }

  if (!leadId && contactId) {
    leadId = await findLeadForContact(contactId);
  }

  if (!leadId) {
    console.log(`[KOMMO] No prior leadId found for ${apvUserId}. Polling incoming chat lead...`);
    const found = await findKommoIncomingLead(chatKey, { maxWaitMs: 3000 });
    if (found && found.leadId) {
      incomingLeadUid = found.incomingUid;
      leadId = found.leadId;
      if (found.contactId) contactId = found.contactId;

      if (incomingLeadUid) {
        await acceptUnsortedLead(incomingLeadUid, targetPipelineId);
      }
    }
  }

  if (!leadId) {
    console.log(`[KOMMO] Live chat lead not found. Creating Lead & Contact directly via REST API v4...`);
    const direct = await findOrCreateLeadAndContactViaApi(user, vehicle, sale);
    leadId = direct.leadId;
    contactId = direct.contactId;
  }

  // 3. Link contact to lead if needed
  if (leadId && contactId) {
    try {
      await kommoFetch(`/api/v4/leads/${leadId}/link`, {
        method: 'POST',
        body: [{ to_entity_id: Number(contactId), to_entity_type: 'contacts' }]
      });
    } catch (_) {}
  }

  // 4. Update Contact
  await updateContact(contactId, {
    name: user.name,
    phone: user.phone,
    email: user.email,
    apvUserId
  });

  // 5. Update Lead (patches custom fields and posts ONE single clean note on lead timeline)
  await updateLead(leadId, {
    vehicleModel,
    vin,
    lot,
    maxBid: sale
  });

  // 6. Mandatory verification GETs
  const verified = await verifySync(leadId, contactId);

  // 7. Save to sync log
  saveSyncRecord({
    apvUserId,
    lot,
    chatKey,
    incomingLeadUid,
    leadId,
    contactId
  });

  return {
    ok: true,
    incomingLeadUid,
    leadId,
    contactId,
    verified
  };
}

function getUserSyncRecords(apvUserId) {
  return catalogDb.getUserSyncRecords(apvUserId);
}

function clearUserSyncRecords(apvUserId) {
  return catalogDb.clearUserSyncRecords(apvUserId);
}

module.exports = {
  getSubdomain,
  getToken,
  isEnabled,
  isDebug,
  checkHealth,
  findKommoIncomingLead,
  updateContact,
  updateLead,
  verifySync,
  syncBid,
  getSyncRecord,
  getUserSyncRecords,
  clearUserSyncRecords
};
