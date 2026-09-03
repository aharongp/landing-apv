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
      for (const item of items) {
        const embeddedLead = item._embedded?.leads?.[0] || null;
        const metadataLead = item.metadata?.data?.leads?.[0] || item.data?.leads?.[0] || null;
        const visitorUid = item.metadata?.origin?.visitor_uid ||
          item.metadata?.visitor_uid ||
          item.visitor_uid ||
          metadataLead?.visitor_uid ||
          embeddedLead?.visitor_uid ||
          '';
        const chatId = item.metadata?.origin?.chat_id || item.metadata?.chat_id || '';

        if (visitorUid === chatKey) {
          const contacts = item._embedded?.contacts || [];
          const leads = item._embedded?.leads || [];
          const contactId = contacts[0]?.id || item.contact_id || null;
          const leadId = leads[0]?.id || item.lead_id || null;
          const incomingUid = item.uid || null;

          if (incomingUid) {
            console.log(`[KOMMO] visitor_uid exact match! visitor_uid=${visitorUid} chat_id=${chatId} incoming_uid=${incomingUid} contact_id=${contactId} lead_id=${leadId}`);
            return {
              incomingUid,
              leadId: leadId ? Number(leadId) : null,
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
    pipeline_id: targetPipelineId,
    custom_fields_values
  };

  const res = await kommoFetch(`/api/v4/leads/${leadId}`, {
    method: 'PATCH',
    body: payload
  });

  console.log(`[KOMMO] lead PATCH status ${res.status}`);

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

async function findContactByIdentity(user) {
  const queries = [user?.email, user?.phone].filter(Boolean);
  for (const query of queries) {
    try {
      const res = await kommoFetch(`/api/v4/contacts?query=${encodeURIComponent(query)}&limit=10`);
      const contacts = res.data?._embedded?.contacts;
      if (res.status === 200 && Array.isArray(contacts) && contacts[0]?.id) {
        const contactId = Number(contacts[0].id);
        console.log(`[KOMMO] Found existing contactId=${contactId} by verified identity`);
        return contactId;
      }
    } catch (_) {}
  }
  return null;
}

async function createContact(user) {
  const contactPayload = [{ name: user.name || 'Cliente APV', custom_fields_values: [] }];
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
  const res = await kommoFetch('/api/v4/contacts', { method: 'POST', body: contactPayload });
  const contactId = res.data?._embedded?.contacts?.[0]?.id;
  if (!contactId) throw new Error('No se pudo crear el contacto en Kommo.');
  console.log(`[KOMMO] Created new contactId=${contactId} via REST API`);
  return Number(contactId);
}

async function findContactForLead(leadId) {
  if (!leadId) return null;
  try {
    const res = await kommoFetch(`/api/v4/leads/${leadId}?with=contacts`);
    const contactId = res.data?._embedded?.contacts?.[0]?.id;
    return contactId ? Number(contactId) : null;
  } catch (err) {
    console.warn(`[KOMMO WARN] Error querying contact for leadId=${leadId}:`, err.message);
    return null;
  }
}

async function acceptUnsortedLead(incomingUid, statusId) {
  if (!incomingUid) return null;
  try {
    const body = { status_id: Number(statusId || process.env.KOMMO_STATUS_ID || 70685710) };
    const res = await kommoFetch(`/api/v4/leads/unsorted/${incomingUid}/accept`, {
      method: 'POST',
      body
    });
    console.log(`[KOMMO] Accepted unsorted lead incomingUid=${incomingUid} status=${res.status}`);
    return res.data;
  } catch (err) {
    console.warn(`[KOMMO WARN] acceptUnsortedLead error for ${incomingUid}:`, err.message);
    throw err;
  }
}

async function linkUnsortedLead(incomingUid, leadId, contactId) {
  if (!incomingUid || !leadId) return null;
  try {
    const link = {
      entity_id: Number(leadId),
      entity_type: 'leads'
    };
    if (contactId) {
      link.metadata = { contact_id: Number(contactId) };
    }
    const res = await kommoFetch(`/api/v4/leads/unsorted/${incomingUid}/link`, {
      method: 'POST',
      body: { link }
    });
    console.log(`[KOMMO] Linked incoming chat uid=${incomingUid} to existing leadId=${leadId}`);
    return res.data;
  } catch (err) {
    console.warn(`[KOMMO WARN] linkUnsortedLead error for ${incomingUid}:`, err.message);
    throw err;
  }
}

const bidSyncLocks = new Map();

async function syncBidInternal(params) {
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

  // The Website Chat Button owns conversation creation. The REST fallback must
  // never create a lead/contact before that conversation exists.
  const existingRecord = getSyncRecord(apvUserId, lot);
  let leadId = existingRecord ? existingRecord.leadId : null;
  let contactId = existingRecord ? existingRecord.contactId : null;
  let incomingLeadUid = existingRecord ? existingRecord.incomingLeadUid : null;
  const userRecords = getUserSyncRecords(apvUserId);
  const priorRecord = userRecords.find((record) => record.leadId);

  if (!leadId && priorRecord) {
    leadId = Number(priorRecord.leadId);
    contactId = priorRecord.contactId ? Number(priorRecord.contactId) : null;
    console.log(`[KOMMO] Reusing conversation leadId=${leadId} for APV user ${apvUserId}`);
  }

  // Only an exact visitor_uid is accepted. A recent-chat fallback can attach a
  // different customer's conversation and is intentionally forbidden.
  const found = await findKommoIncomingLead(chatKey, { maxWaitMs: 3000 });
  if (found && found.incomingUid) {
    incomingLeadUid = found.incomingUid;
    if (leadId) {
      contactId = contactId || await findContactForLead(leadId) || await findContactByIdentity(user);
      const linked = await linkUnsortedLead(incomingLeadUid, leadId, contactId);
      contactId = contactId || Number(linked?._embedded?.contacts?.[0]?.id || found.contactId || 0) || null;
    } else {
      console.log(`[KOMMO] Accepting exact incoming chat uid=${incomingLeadUid}`);
      const accepted = await acceptUnsortedLead(incomingLeadUid);
      leadId = Number(accepted?._embedded?.leads?.[0]?.id || accepted?.lead_id || found.leadId || 0) || null;
      contactId = Number(accepted?._embedded?.contacts?.[0]?.id || accepted?.contact_id || found.contactId || 0) || null;
    }
  }

  // No chat lead yet: retain the bid intent and let the browser retry after
  // onConversationsChange. Creating anything here is what caused duplicates.
  if (!leadId) {
    saveSyncRecord({ apvUserId, lot, chatKey });
    return { ok: true, pendingChat: true, contactId: null };
  }

  contactId = contactId || await findContactForLead(leadId) || await findContactByIdentity(user);
  if (!contactId) {
    // This fallback is safe only now: the conversation/lead already exists.
    contactId = await createContact(user);
  }

  // Linking from the lead is sufficient. Kommo does not support a reverse
  // contact->lead link through the generic contacts/{id}/link endpoint.
  if (contactId) {
    try {
      await kommoFetch(`/api/v4/leads/${leadId}/link`, {
        method: 'POST',
        body: [{ to_entity_id: Number(contactId), to_entity_type: 'contacts' }]
      });
    } catch (err) {
      console.warn(`[KOMMO WARN] Contact/lead link was not updated: ${err.message}`);
    }
  }

  await updateContact(contactId, {
    name: user.name,
    phone: user.phone,
    email: user.email,
    apvUserId
  });

  await updateLead(leadId, {
    vehicleModel,
    vin,
    lot,
    maxBid: sale
  });

  saveSyncRecord({
    apvUserId,
    lot,
    chatKey,
    incomingLeadUid,
    leadId,
    contactId
  });

  try {
    await updateActiveBidsSummary(user);
  } catch (sumErr) {
    console.warn(`[KOMMO WARN] Error updating active bids summary: ${sumErr.message}`);
  }

  return {
    ok: true,
    incomingLeadUid,
    leadId,
    contactId
  };
}

async function syncBid(params) {
  const lockKey = `${params?.user?.kommoUserId || 'guest'}:${params?.vehicle?.lot || 'unknown'}`;
  const active = bidSyncLocks.get(lockKey);
  if (active) return active;
  const task = syncBidInternal(params).finally(() => bidSyncLocks.delete(lockKey));
  bidSyncLocks.set(lockKey, task);
  return task;
}

function summaryFingerprint(activeBids) {
  const seed = activeBids
    .map((bid) => `${bid.lot}:${Number(bid.maxBid || 0)}`)
    .sort()
    .join('|');
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function postLeadNoteOnce(leadId, text, marker) {
  try {
    const res = await kommoFetch(`/api/v4/leads/${leadId}/notes?limit=50&order[created_at]=desc`);
    const notes = res.data?._embedded?.notes || [];
    if (notes.some((note) => String(note.params?.text || '').includes(marker))) {
      console.log(`[KOMMO] Summary ${marker} already exists on leadId=${leadId}`);
      return false;
    }
  } catch (err) {
    console.warn(`[KOMMO WARN] Could not check existing lead notes: ${err.message}`);
  }

  await kommoFetch(`/api/v4/leads/${leadId}/notes`, {
    method: 'POST',
    body: [{ note_type: 'common', params: { text } }]
  });
  console.log(`[KOMMO] Active bids summary note posted for leadId=${leadId}`);
  return true;
}

async function updateActiveBidsSummary(user) {
  if (!user || !user.kommoUserId) return null;

  const apvUserId = user.kommoUserId;
  const userRecords = catalogDb.getUserSyncRecords(apvUserId);
  const leadRecord = userRecords.find((record) => record.leadId);
  const leadId = leadRecord?.leadId ? Number(leadRecord.leadId) : null;
  if (!leadId) return null;
  const contactId = leadRecord.contactId ? Number(leadRecord.contactId) : await findContactForLead(leadId);

  const allIntents = catalogDb.getBidIntents();
  const activeBids = [];
  for (const r of userRecords) {
    if (!r.lot) continue;
    const vehicle = catalogDb.findVehicleByLotOrId(r.lot);
    const intent = allIntents.find(i => String(i.userId) === String(user.id) && String(i.lot) === String(r.lot));
    const title = vehicle ? vehicle.title : (intent ? intent.vehicle : `Lote ${r.lot}`);
    const vin = vehicle ? vehicle.vin : (intent ? intent.vin : 'N/D');
    const maxBid = intent ? intent.maxBid : 0;
    activeBids.push({
      lot: r.lot,
      title,
      vin,
      maxBid
    });
  }

  const formattedDate = new Date().toLocaleString('es-US', { timeZone: 'America/New_York' });
  const marker = `[APV_BIDS_SUMMARY:${summaryFingerprint(activeBids)}]`;

  let summaryText = '';
  if (activeBids.length === 0) {
    summaryText = [
      marker,
      `📋 RESUMEN DE PUJAS ACTIVAS DEL CLIENTE`,
      `----------------------------------------`,
      `El cliente no tiene vehículos activos en su lista de pujas actualmente.`,
      `----------------------------------------`,
      `🕒 Última actualización: ${formattedDate}`
    ].join('\n');
  } else {
    const lines = activeBids.map((b, idx) => {
      const budget = b.maxBid > 0 ? `$${Number(b.maxBid).toLocaleString('en-US')} USD` : 'Sin definir';
      return `${idx + 1}. ${b.title}\n   • Lote: ${b.lot} | VIN: ${b.vin || 'N/D'}\n   • Tope de Oferta: ${budget}`;
    });

    const totalVal = activeBids.reduce((sum, b) => sum + (Number(b.maxBid) || 0), 0);
    const totalValFormatted = totalVal > 0 ? `$${totalVal.toLocaleString('en-US')} USD` : 'Sin definir';

    summaryText = [
      marker,
      `📋 RESUMEN DE PUJAS ACTIVAS DEL CLIENTE`,
      `========================================`,
      lines.join('\n\n'),
      `========================================`,
      `📊 Total de vehículos a subastar: ${activeBids.length}`,
      `💰 Suma de topes de oferta: ${totalValFormatted}`,
      `🕒 Última actualización: ${formattedDate}`
    ].join('\n');
  }

  const lastBid = activeBids[activeBids.length - 1];
  const lastTitle = lastBid ? lastBid.title : 'Sin pujas activas';
  const lastPrice = lastBid ? Number(lastBid.maxBid || 0) : 0;

  const fieldIds = await getLeadFieldIds();
  const custom_fields_values = [];
  if (lastBid) {
    if (fieldIds.vehicleModel) custom_fields_values.push({ field_id: fieldIds.vehicleModel, values: [{ value: String(lastTitle) }] });
    if (lastBid.vin && fieldIds.vin) custom_fields_values.push({ field_id: fieldIds.vin, values: [{ value: String(lastBid.vin) }] });
    if (lastBid.lot && fieldIds.lot) custom_fields_values.push({ field_id: fieldIds.lot, values: [{ value: String(lastBid.lot) }] });
    if (fieldIds.maxBid) custom_fields_values.push({ field_id: fieldIds.maxBid, values: [{ value: String(lastPrice) }] });
  }

  const targetPipelineId = Number(process.env.KOMMO_PIPELINE_ID || 14370344);
  const payload = {
    name: activeBids.length > 0 ? `Pujas (${activeBids.length} autos) | ${user.name}` : `Cliente | ${user.name}`,
    price: lastPrice,
    pipeline_id: targetPipelineId,
    custom_fields_values
  };

  try {
    await kommoFetch(`/api/v4/leads/${leadId}`, {
      method: 'PATCH',
      body: payload
    });
  } catch (pErr) {
    console.warn(`[KOMMO WARN] Error patching lead: ${pErr.message}`);
  }

  try {
    await postLeadNoteOnce(leadId, summaryText, marker);
  } catch (noteErr) {
    console.warn(`[KOMMO WARN] Error posting lead summary note:`, noteErr.message);
  }

  return { leadId, contactId, summaryText };
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
  updateActiveBidsSummary,
  getSyncRecord,
  getUserSyncRecords,
  clearUserSyncRecords
};
