'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tls = require('tls');
const net = require('net');
const { URL } = require('url');
const kommoService = require('./services/kommo');
const catalogDb = require('./services/catalogDb');

const ROOT = __dirname;

function loadEnv() {
  try {
    const envPath = path.join(ROOT, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
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
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (_) {}
}
loadEnv();
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const CATALOG_FILE = path.join(DATA_DIR, 'current_catalog.csv');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSION_SECRET_FILE = path.join(DATA_DIR, '.session_secret');
const BID_LOG_FILE = path.join(DATA_DIR, 'bid-intents.ndjson');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const MAX_UPLOAD_BYTES = Math.max(20, Number(process.env.MAX_UPLOAD_MB || 250)) * 1024 * 1024;
const MAX_CHUNK_BYTES = Math.max(1, Number(process.env.MAX_UPLOAD_CHUNK_MB || 8)) * 1024 * 1024;
const SESSION_TTL_SECONDS = Math.max(1, Number(process.env.SESSION_TTL_DAYS || 30)) * 24 * 60 * 60;
const SESSION_COOKIE = 'apv_session';
const KNOWLEDGE_PAGE_SIZE = Math.min(250, Math.max(25, Number(process.env.KOMMO_KNOWLEDGE_PAGE_SIZE || 100)));
const KNOWLEDGE_TOKEN = String(process.env.KOMMO_KNOWLEDGE_TOKEN || '').replace(/[^a-zA-Z0-9_-]/g, '');
const KNOWLEDGE_BASE_PATH = KNOWLEDGE_TOKEN ? `/kommo-knowledge/${KNOWLEDGE_TOKEN}` : '/kommo-knowledge';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let catalog = [];
let catalogRawByLot = new Map();
let catalogUpdatedAt = null;
let filterCache = null;
let users = [];
let googleJwksCache = { expiresAt: 0, keys: [] };
const imageCache = new Map();
const uploadSessions = new Map();

function str(v) {
  return String(v ?? '').trim();
}

function num(v) {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function smartCase(value) {
  const raw = str(value);
  if (!raw) return '';
  return raw.toLowerCase().replace(/(^|[\s\-/])([a-z])/g, (_, s, c) => s + c.toUpperCase());
}

function ensureHttps(url) {
  const v = str(url);
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v.replace(/^http:\/\//i, 'https://');
  if (v.startsWith('//')) return `https:${v}`;
  return `https://${v}`;
}

function parseSaleDate(raw, time) {
  const v = str(raw);
  if (!/^\d{8}$/.test(v)) return null;
  const y = v.slice(0, 4);
  const m = v.slice(4, 6);
  const d = v.slice(6, 8);
  const t = str(time).padStart(4, '0');
  const hh = t.slice(0, 2);
  const mm = t.slice(2, 4);
  return `${y}-${m}-${d}T${hh}:${mm}:00`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

function normalizeRecord(obj) {
  const lot = str(obj['Lot number']);
  const year = num(obj.Year);
  const make = smartCase(obj.Make);
  const model = smartCase(obj['Model Detail'] || obj['Model Group']);
  const trim = smartCase(obj.Trim);
  const title = [year || '', make, model, trim && trim !== model ? trim : ''].filter(Boolean).join(' ');
  const rawImg = ensureHttps(obj['Image Thumbnail']);
  const image = rawImg ? rawImg.trim().replace(/_thb\.jpg$/i, '_ful.jpg') : '';

  return {
    id: lot || crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 12),
    lot,
    item: str(obj['Item#']),
    vin: str(obj.VIN),
    vehicleType: str(obj['Vehicle Type']),
    year,
    make,
    model,
    modelGroup: smartCase(obj['Model Group']),
    trim,
    title,
    body: smartCase(obj['Body Style']),
    color: smartCase(obj.Color),
    primaryDamage: smartCase(obj['Damage Description']),
    secondaryDamage: smartCase(obj['Secondary Damage']),
    lossType: smartCase(obj['Loss Type'] || obj['Loss type']),
    titleState: str(obj['Sale Title State']),
    titleType: str(obj['Sale Title Type']),
    hasKeys: str(obj['Has Keys-Yes or No']).toUpperCase(),
    conditionCode: str(obj['Lot Cond. Code']),
    odometer: num(obj.Odometer),
    odometerBrand: str(obj['Odometer Brand']),
    retailValue: num(obj['Est. Retail Value']),
    repairCost: num(obj['Repair cost']),
    engine: str(obj.Engine),
    drive: smartCase(obj.Drive),
    transmission: smartCase(obj.Transmission),
    fuel: smartCase(obj['Fuel Type']),
    cylinders: num(obj.Cylinders),
    runsDrives: smartCase(obj['Runs/Drives']),
    saleStatus: smartCase(obj['Sale Status']),
    currentBid: num(obj['High Bid =non-vix,Sealed=Vix']),
    buyNow: num(obj['Buy-It-Now Price']),
    makeOfferEligible: str(obj['Make-an-Offer Eligible']).toUpperCase() === 'Y',
    saleDate: parseSaleDate(obj['Sale Date M/D/CY'], obj['Sale time (HHMM)']),
    saleDateRaw: str(obj['Sale Date M/D/CY']),
    saleTime: str(obj['Sale time (HHMM)']),
    timeZone: str(obj['Time Zone']),
    yardNumber: str(obj['Yard number']),
    yardName: smartCase(obj['Yard name']),
    locationCity: smartCase(obj['Location city']),
    locationState: str(obj['Location state']),
    locationZip: str(obj['Location ZIP']),
    locationCountry: str(obj['Location country']),
    currency: str(obj['Currency Code']) || 'USD',
    image,
    // Preserve the exact API URL exported by Copart. Some inventory endpoints are
    // delivered as http:// URLs and forcing HTTPS can make the JSON request fail.
    imageApi: str(obj['Image URL']),
    copartUrl: lot ? `https://www.copart.com/lot/${encodeURIComponent(lot)}` : 'https://www.copart.com/',
    specialNote: str(obj['Special Note']),
    saleLight: str(obj['Sale Light']),
    autoGrade: str(obj.AutoGrade),
    announcements: str(obj.Announcements),
    sellerName: smartCase(obj['Seller Name']),
    lastUpdated: str(obj['Last Updated Time'])
  };
}

function loadCatalog() {
  catalogDb.initDatabase();
  if (fs.existsSync(CATALOG_FILE)) {
    try {
      const csvText = fs.readFileSync(CATALOG_FILE, 'utf8');
      const stats = catalogDb.upsertCatalogFromCsv(csvText);
      console.log(`[CATALOG] Database loaded. ${stats.totalInDb} vehicles available in catalog.db`);
    } catch (err) {
      console.error('[CATALOG] Error loading CSV into database:', err.message);
    }
  }
}

function buildFilters() {
  return catalogDb.getFilterMetadata();
}

function atomicWriteJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    users = [];
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    users = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('No se pudo cargar users.json:', err.message);
    users = [];
  }
}

function saveUsers() {
  atomicWriteJson(USERS_FILE, users);
}

function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (fs.existsSync(SESSION_SECRET_FILE)) return fs.readFileSync(SESSION_SECRET_FILE, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(SESSION_SECRET_FILE, secret, { encoding: 'utf8', mode: 0o600 });
  return secret;
}

const SESSION_SECRET = getSessionSecret();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const digest = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, digest };
}

function verifyPassword(password, user) {
  if (!user.passwordHash || !user.passwordSalt) return false;
  const digest = hashPassword(password, user.passwordSalt).digest;
  const a = Buffer.from(digest, 'hex');
  const b = Buffer.from(user.passwordHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function kommoUserId(user) {
  return crypto.createHash('sha256').update(`apv-motors:${user.id}`).digest('hex');
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    picture: user.picture || '',
    provider: user.googleSub ? 'google' : 'email',
    kommoUserId: kommoUserId(user)
  };
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signSession(userId) {
  const payload = base64urlJson({ uid: userId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function parseCookies(req) {
  const out = {};
  const raw = String(req.headers.cookie || '');
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function getAuthUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.uid || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return catalogDb.findUserById(data.uid);
  } catch (_) {
    return null;
  }
}

function sessionCookie(req, token, maxAge = SESSION_TTL_SECONDS) {
  const secure = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || process.env.NODE_ENV === 'production';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function normalizeEmail(value) {
  return str(value).toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getGoogleJwks() {
  if (googleJwksCache.expiresAt > Date.now() && googleJwksCache.keys.length) return googleJwksCache.keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('No se pudieron validar las credenciales de Google.');
  const data = await r.json();
  const cacheControl = r.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 60 * 60 * 1000;
  googleJwksCache = { keys: data.keys || [], expiresAt: Date.now() + Math.min(maxAge, 6 * 60 * 60 * 1000) };
  return googleJwksCache.keys;
}

function decodeJwtPart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

async function verifyGoogleCredential(credential) {
  if (!GOOGLE_CLIENT_ID) throw new Error('Inicio con Google no configurado.');
  const parts = str(credential).split('.');
  if (parts.length !== 3) throw new Error('Credencial de Google inválida.');
  const [head64, payload64, signature64] = parts;
  const header = decodeJwtPart(head64);
  const payload = decodeJwtPart(payload64);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Credencial de Google inválida.');
  const keys = await getGoogleJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    googleJwksCache.expiresAt = 0;
    const refreshed = await getGoogleJwks();
    const retry = refreshed.find((k) => k.kid === header.kid);
    if (!retry) throw new Error('No se pudo verificar la firma de Google.');
    return verifyGoogleCredentialWithKey(retry, head64, payload64, signature64, payload);
  }
  return verifyGoogleCredentialWithKey(jwk, head64, payload64, signature64, payload);
}

function verifyGoogleCredentialWithKey(jwk, head64, payload64, signature64, payload) {
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const valid = crypto.verify('RSA-SHA256', Buffer.from(`${head64}.${payload64}`), key, Buffer.from(signature64, 'base64url'));
  const now = Math.floor(Date.now() / 1000);
  if (!valid) throw new Error('Firma de Google inválida.');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new Error('Emisor de Google inválido.');
  if (payload.aud !== GOOGLE_CLIENT_ID) throw new Error('Credencial emitida para otro sitio.');
  if (!payload.exp || payload.exp < now - 30) throw new Error('La sesión de Google expiró.');
  if (payload.nbf && payload.nbf > now + 30) throw new Error('Credencial de Google todavía no válida.');
  if (!payload.sub || !payload.email || payload.email_verified === false) throw new Error('Google no confirmó este correo.');
  return payload;
}

function maskVin(vin) {
  const v = str(vin);
  if (!v) return 'N/D';
  return `${v.slice(0, 5)}${'•'.repeat(Math.max(8, v.length - 5))}`;
}

function serializeVehicle(vehicle, user) {
  if (user) return { ...vehicle, vinMasked: vehicle.vin };
  const { vin, ...publicData } = vehicle;
  return { ...publicData, vin: null, vinMasked: maskVin(vin), vinLocked: true };
}

function getVehicles(url, user) {
  const page = Math.max(1, num(url.searchParams.get('page')) || 1);
  const pageSize = Math.min(48, Math.max(6, num(url.searchParams.get('pageSize')) || 18));
  const q = str(url.searchParams.get('q'));
  const make = str(url.searchParams.get('make'));
  const state = str(url.searchParams.get('state'));
  const damage = str(url.searchParams.get('damage'));
  const runState = str(url.searchParams.get('runState'));
  const yearMin = num(url.searchParams.get('yearMin'));
  const yearMax = num(url.searchParams.get('yearMax'));
  const priceMax = num(url.searchParams.get('priceMax'));
  const odometerMax = num(url.searchParams.get('odometerMax'));
  const keysOnly = url.searchParams.get('keysOnly') === '1';
  const buyNowOnly = url.searchParams.get('buyNowOnly') === '1';
  const sort = str(url.searchParams.get('sort')) || 'saleSoon';

  const res = catalogDb.queryVehicles({
    page, pageSize, q, make, state, damage, runState,
    yearMin, yearMax, priceMax, odometerMax, keysOnly, buyNowOnly, sort
  });

  return {
    items: res.items.map((v) => serializeVehicle(v, user)),
    total: res.total,
    page: res.page,
    pages: res.pages,
    pageSize: res.pageSize
  };
}

function normalizeImageUrl(raw) {
  const value = str(raw).replace(/&amp;/g, '&');
  if (!value) return '';
  let url = value;
  if (url.startsWith('//')) url = `https:${url}`;
  else if (!/^https?:\/\//i.test(url)) {
    if (/^(?:[a-z0-9-]+\.)*copart\.com\//i.test(url) || /^(?:[a-z0-9-]+\.)*copartstatic\.com\//i.test(url)) url = `https://${url}`;
    else return '';
  }

  // Image assets should be served securely even when the JSON endpoint itself
  // uses http://. Copart's static/CDN image hosts support HTTPS.
  if (/copart\.(com|io)$/i.test((() => { try { return new URL(url).hostname; } catch (_) { return ''; } })()) || /(^|\.)copartstatic\.com$/i.test((() => { try { return new URL(url).hostname; } catch (_) { return ''; } })())) {
    url = url.replace(/^http:\/\//i, 'https://');
  }
  return url;
}

function parseCopartLotImages(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.lotImages)) return null;
  const sorted = [...payload.lotImages].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  const urls = [];
  for (const item of sorted) {
    if (!Array.isArray(item.link)) continue;
    const validLinks = item.link.filter((l) => l && l.url && !l.isEngineSound);
    const fullLink = validLinks.find((l) => l.url.includes('_ful.') || (l.isThumbNail === false && l.isHdImage))
      || validLinks.find((l) => l.isThumbNail === false)
      || validLinks.find((l) => !l.url.includes('_thb.'))
      || validLinks[0];
    if (fullLink && fullLink.url) {
      let u = String(fullLink.url).trim();
      if (u.startsWith('//')) u = 'https:' + u;
      else if (u.startsWith('http://')) u = u.replace(/^http:\/\//i, 'https://');
      urls.push(u);
    }
  }
  return urls.length ? [...new Set(urls)] : null;
}

function collectImageUrls(value, out = [], keyHint = '') {
  const directLotImages = parseCopartLotImages(value);
  if (directLotImages) {
    directLotImages.forEach((u) => out.push(u));
    return out;
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return out;

    const candidates = raw.match(/(?:https?:)?\/\/[^\s"'<>\\]+/gi) || [raw];
    for (const candidate of candidates) {
      const clean = candidate.trim().replace(/[),;\s]+$/, '');
      const normalized = normalizeImageUrl(clean);
      if (!normalized) continue;
      let pathname = '';
      let host = '';
      try {
        const parsed = new URL(normalized);
        pathname = parsed.pathname.toLowerCase();
        host = parsed.hostname.toLowerCase();
      } catch (_) {
        continue;
      }
      const looksLikeImage = /\.(jpe?g|png|webp|gif|avif)$/i.test(pathname)
        || /(?:_ful|_thb|_hrs|_lpp|\/images?\/)/i.test(pathname)
        || /image|photo|url|link/i.test(keyHint);
      const trustedImageHost = host === 'cs.copart.com'
        || host.endsWith('.copart.com')
        || host === 'c-static.copart.com'
        || host.endsWith('.copartstatic.com');
      if (looksLikeImage && trustedImageHost) out.push(normalized);
    }
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectImageUrls(v, out, keyHint));
    return out;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => collectImageUrls(nested, out, key));
  }
  return out;
}

function rankImageUrl(url) {
  const s = String(url || '').toLowerCase();
  if (s.includes('_ful.')) return 0;
  if (s.includes('_hrs.')) return 1;
  if (s.includes('_thb.')) return 4;
  return 2;
}

function imageEndpointCandidates(vehicle) {
  const candidates = [];
  const raw = str(vehicle.imageApi);
  if (raw) {
    candidates.push(raw);
    if (/^http:\/\//i.test(raw)) candidates.push(raw.replace(/^http:\/\//i, 'https://'));
    if (/^https:\/\//i.test(raw)) candidates.push(raw.replace(/^https:\/\//i, 'http://'));
  }
  if (vehicle.lot) candidates.push(`https://www.copart.com/public/data/lotdetails/solr/lotImages/${encodeURIComponent(vehicle.lot)}`);
  return [...new Set(candidates)];
}

async function fetchCopartImagePayload(targetUrl, controller) {
  let target;
  try { target = new URL(targetUrl); } catch (_) { throw new Error('URL de imágenes inválida'); }
  const allowed = target.hostname === 'inventoryv2.copart.io' || target.hostname === 'www.copart.com';
  if (!allowed) throw new Error('Host de imágenes no permitido');

  const r = await fetch(target, {
    signal: controller.signal,
    redirect: 'follow',
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'
    }
  });
  if (!r.ok) throw new Error(`Copart images ${r.status}`);
  const textBody = await r.text();
  try { return JSON.parse(textBody); }
  catch (_) {
    return { raw: textBody };
  }
}

async function fetchVehicleImages(vehicle) {
  const cached = imageCache.get(vehicle.lot);
  if (cached && cached.expiresAt > Date.now()) return cached.images;

  const highResCover = vehicle.image ? vehicle.image.replace(/_thb\./i, '_ful.') : null;
  const fallback = [...new Set([highResCover, vehicle.image].filter(Boolean))];
  const endpoints = imageEndpointCandidates(vehicle);
  if (!endpoints.length) return fallback;

  let lastError = null;
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const payload = await fetchCopartImagePayload(endpoint, controller);
      const urls = collectImageUrls(payload);
      const images = [...new Set([...urls, ...fallback])]
        .filter(Boolean)
        .sort((a, b) => rankImageUrl(a) - rankImageUrl(b));
      if (images.length) {
        imageCache.set(vehicle.lot, { expiresAt: Date.now() + 30 * 60 * 1000, images });
        return images;
      }
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError) console.warn(`Fotos lote ${vehicle.lot}:`, lastError.message);
  imageCache.set(vehicle.lot, { expiresAt: Date.now() + 2 * 60 * 1000, images: fallback });
  return fallback;
}

function json(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

function text(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
  }[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) return text(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store, max-age=0', 'Pragma': 'no-cache' });
    res.end(data);
  });
}

function readRequestBody(req, maxBytes = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes) {
        done = true;
        const err = new Error(`Archivo demasiado grande. Máximo ${Math.round(maxBytes / 1024 / 1024)} MB por solicitud.`);
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!done) resolve(Buffer.concat(chunks)); });
    req.on('error', (err) => { if (!done) reject(err); });
  });
}


function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function knowledgeResponse(res, html, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Robots-Tag': 'index, follow'
  });
  res.end(html);
}

function knowledgeLayout(title, body) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${htmlEscape(title)}</title>
  <meta name="description" content="Fuente de conocimiento de inventario APV Motors para Kommo AI.">
  <style>
    body{font-family:Arial,sans-serif;max-width:1180px;margin:32px auto;padding:0 20px;color:#111827;line-height:1.45}
    h1,h2{line-height:1.15} .meta{color:#4b5563}.pages{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}
    .pages a{padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;text-decoration:none;color:#111827}
    article{border-top:2px solid #e5e7eb;padding:24px 0}.vehicle-id{font-family:ui-monospace,monospace;background:#f3f4f6;padding:2px 6px;border-radius:5px}
    dl{display:grid;grid-template-columns:minmax(180px,260px) 1fr;gap:6px 18px;margin:14px 0}dt{font-weight:700;color:#374151}dd{margin:0;overflow-wrap:anywhere}
  </style>
</head><body>${body}</body></html>`;
}

function knowledgeIndexHtml() {
  const totalVehicles = catalogDb.getVehicleCount();
  const totalPages = Math.max(1, Math.ceil(totalVehicles / KNOWLEDGE_PAGE_SIZE));
  const links = Array.from({ length: totalPages }, (_, i) => `<a href="${KNOWLEDGE_BASE_PATH}/vehicles/page/${i + 1}">Inventario ${i + 1}</a>`).join('');
  return knowledgeLayout('APV Motors - Inventario para Kommo AI', `
    <h1>Inventario APV Motors</h1>
    <p class="meta">Fuente de conocimiento pública para Kommo AI. Vehículos: <strong>${totalVehicles}</strong>. Actualización del catálogo: <strong>${htmlEscape(catalogDb.getUpdatedAt() || 'N/D')}</strong>.</p>
    <p>Cada subpágina contiene los datos textuales exportados del CSV de Copart, agrupados para que Kommo pueda indexar el inventario completo sin crear una página por vehículo.</p>
    <div class="pages">${links}</div>
  `);
}

function knowledgeVehicleFields(vehicle) {
  const raw = catalogDb.getRawRecordByLot(vehicle.lot) || {};
  const entries = Object.entries(raw)
    .filter(([key, value]) => key && str(value))
    .filter(([key]) => !['Image Thumbnail', 'Image URL'].includes(key));
  const rows = entries.map(([key, value]) => `<dt>${htmlEscape(key)}</dt><dd>${htmlEscape(value)}</dd>`).join('');
  return `<article id="lot-${htmlEscape(vehicle.lot)}">
    <h2>${htmlEscape(vehicle.title || `${vehicle.year} ${vehicle.make} ${vehicle.model}`)}</h2>
    <p><strong>VIN:</strong> <span class="vehicle-id">${htmlEscape(vehicle.vin)}</span> · <strong>Lote:</strong> <span class="vehicle-id">${htmlEscape(vehicle.lot)}</span></p>
    <dl>${rows}</dl>
  </article>`;
}

function knowledgePageHtml(page) {
  const totalVehicles = catalogDb.getVehicleCount();
  const totalPages = Math.max(1, Math.ceil(totalVehicles / KNOWLEDGE_PAGE_SIZE));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const res = catalogDb.queryVehicles({ page: safePage, pageSize: KNOWLEDGE_PAGE_SIZE });
  const items = res.items;
  const start = (safePage - 1) * KNOWLEDGE_PAGE_SIZE;
  const prev = safePage > 1 ? `<a href="${KNOWLEDGE_BASE_PATH}/vehicles/page/${safePage - 1}">Anterior</a>` : '';
  const next = safePage < totalPages ? `<a href="${KNOWLEDGE_BASE_PATH}/vehicles/page/${safePage + 1}">Siguiente</a>` : '';
  return knowledgeLayout(`APV Motors - Inventario ${safePage}`, `
    <p><a href="${KNOWLEDGE_BASE_PATH}/">Índice del inventario</a></p>
    <h1>Inventario APV Motors - página ${safePage} de ${totalPages}</h1>
    <p class="meta">Registros ${items.length ? start + 1 : 0}-${start + items.length} de ${totalVehicles}. Actualizado: ${htmlEscape(catalogDb.getUpdatedAt() || 'N/D')}.</p>
    <div class="pages">${prev}${next}</div>
    ${items.map(knowledgeVehicleFields).join('\n')}
    <div class="pages">${prev}${next}</div>
  `);
}

function knowledgeVinHtml(vin) {
  const target = str(vin).toUpperCase();
  const res = catalogDb.queryVehicles({ q: target, pageSize: 1 });
  const vehicle = res.items.find(v => str(v.vin).toUpperCase() === target);
  if (!vehicle) return null;
  return knowledgeLayout(`APV Motors - VIN ${target}`, `<p><a href="${KNOWLEDGE_BASE_PATH}/">Inventario</a></p>${knowledgeVehicleFields(vehicle)}`);
}

function safePublicPath(pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (rel === 'admin' || rel === 'admin/') rel = 'admin.html';
  if (rel.startsWith('vehiculo/')) rel = 'index.html';
  const full = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!full.startsWith(PUBLIC_DIR)) return null;
  return full;
}

function adminAllowed(req) {
  return !ADMIN_KEY || req.headers['x-admin-key'] === ADMIN_KEY;
}

function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    json(res, 401, { error: 'Debes iniciar sesión para continuar.', authRequired: true });
    return null;
  }
  return user;
}

function findVehicle(id) {
  return catalogDb.findVehicleByLotOrId(id);
}

async function replaceCatalogFromFile(filePath) {
  const csvText = fs.readFileSync(filePath, 'utf8');
  const result = catalogDb.upsertCatalogFromCsv(csvText);
  const tmp = `${CATALOG_FILE}.tmp`;
  fs.copyFileSync(filePath, tmp);
  fs.renameSync(tmp, CATALOG_FILE);
  return result;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (req.method === 'GET' && (url.pathname === KNOWLEDGE_BASE_PATH || url.pathname === `${KNOWLEDGE_BASE_PATH}/`)) {
      return knowledgeResponse(res, knowledgeIndexHtml());
    }

    if (req.method === 'GET' && url.pathname.startsWith(`${KNOWLEDGE_BASE_PATH}/`)) {
      const knowledgeRelative = url.pathname.slice(KNOWLEDGE_BASE_PATH.length);
      const knowledgePageMatch = knowledgeRelative.match(/^\/vehicles\/page\/(\d+)\/?$/);
      if (knowledgePageMatch) {
        const page = Number(knowledgePageMatch[1]);
        const totalPages = Math.max(1, Math.ceil(catalog.length / KNOWLEDGE_PAGE_SIZE));
        if (!Number.isInteger(page) || page < 1 || page > totalPages) {
          return knowledgeResponse(res, knowledgeLayout('Página no encontrada', '<h1>Página no encontrada</h1>'), 404);
        }
        return knowledgeResponse(res, knowledgePageHtml(page));
      }

      const knowledgeVinMatch = knowledgeRelative.match(/^\/vin\/([^/]+)\/?$/);
      if (knowledgeVinMatch) {
        const html = knowledgeVinHtml(decodeURIComponent(knowledgeVinMatch[1]));
        if (!html) return knowledgeResponse(res, knowledgeLayout('VIN no encontrado', '<h1>VIN no encontrado</h1>'), 404);
        return knowledgeResponse(res, html);
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, { ok: true, vehicles: catalogDb.getVehicleCount(), users: catalogDb.getUsers().length, updatedAt: catalogDb.getUpdatedAt() });
    }

    if (req.method === 'GET' && url.pathname === '/api/kommo/health') {
      const health = await kommoService.checkHealth();
      const status = health.ok ? 200 : (health.status || 500);
      return json(res, status, health);
    }

    if (req.method === 'POST' && url.pathname === '/api/kommo/sync-bid') {
      const user = requireAuth(req, res);
      if (!user) return;

      const body = JSON.parse((await readRequestBody(req, 128 * 1024)).toString('utf8') || '{}');
      const lot = str(body.lot);
      const maxBid = num(body.maxBid);

      if (!lot) return json(res, 400, { ok: false, error: 'El número de lote es obligatorio.', code: 'INVALID_LOT' });
      if (maxBid <= 0) return json(res, 400, { ok: false, error: 'El tope de puja debe ser un número positivo.', code: 'INVALID_MAX_BID' });

      const vehicle = catalogDb.findVehicleByLotOrId(lot);
      if (!vehicle) return json(res, 404, { ok: false, error: 'Vehículo no encontrado en el catálogo.', code: 'VEHICLE_NOT_FOUND' });

      const userFull = {
        ...safeUser(user),
        phone: user.phone || ''
      };

      try {
        const syncResult = await kommoService.syncBid({
          user: userFull,
          vehicle,
          maxBid
        });
        return json(res, 200, syncResult);
      } catch (err) {
        console.error('[KOMMO SYNC ERROR]', err);
        return json(res, err.statusCode || 500, {
          ok: false,
          code: err.code || 'KOMMO_SYNC_ERROR',
          error: err.message,
          endpoint: err.endpoint || null,
          status: err.statusCode || 500
        });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/user/bids') {
      const user = requireAuth(req, res);
      if (!user) return;
      const apvUserId = kommoUserId(user);
      const records = kommoService.getUserSyncRecords(apvUserId);
      const bids = records.map((r) => {
        const vehicle = catalog.find((v) => String(v.lot) === String(r.lot));
        return {
          lot: r.lot,
          leadId: r.leadId,
          contactId: r.contactId,
          chatKey: r.chatKey,
          syncedAt: r.syncedAt,
          vehicle: vehicle ? serializeVehicle(vehicle, user) : null
        };
      });
      return json(res, 200, { ok: true, bids });
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/user/bids')) {
      const user = requireAuth(req, res);
      if (!user) return;
      const apvUserId = kommoUserId(user);
      const lotMatch = url.pathname.match(/^\/api\/user\/bids\/([^/]+)$/);
      if (lotMatch) {
        const lot = decodeURIComponent(lotMatch[1]);
        catalogDb.deleteUserSyncRecord(apvUserId, lot);
        const userFull = { ...safeUser(user), phone: user.phone || '' };
        await kommoService.updateActiveBidsSummary(userFull).catch(() => {});
        return json(res, 200, { ok: true, message: `Puja para el lote ${lot} eliminada.` });
      } else {
        kommoService.clearUserSyncRecords(apvUserId);
        const userFull = { ...safeUser(user), phone: user.phone || '' };
        await kommoService.updateActiveBidsSummary(userFull).catch(() => {});
        return json(res, 200, { ok: true, message: 'Historial de pujas limpiado.' });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return json(res, 200, {
        googleClientId: GOOGLE_CLIENT_ID,
        googleEnabled: Boolean(GOOGLE_CLIENT_ID),
        debugKommo: kommoService.isDebug() || process.env.NODE_ENV !== 'production'
      });
    }

async function sendVerificationEmail(toEmail, code) {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || `"APV Motors" <${user || 'no-reply@apvmotors.com'}>`;

  if (!host || !user || !pass) {
    console.log(`[APV EMAIL] SMTP no configurado en .env (requiere SMTP_HOST, SMTP_USER, SMTP_PASS). devCode=${code}`);
    return false;
  }

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"/></head>
    <body style="font-family: Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #dc2626; margin: 0; font-size: 28px; font-weight: 900;">APV MOTORS</h1>
          <p style="color: #64748b; font-size: 13px; margin-top: 4px;">Verificación de cuenta para subastas</p>
        </div>
        <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <p style="color: #475569; font-size: 14px; margin-bottom: 8px;">Tu código de verificación de 6 dígitos es:</p>
          <div style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #0f172a; margin: 12px 0;">${code}</div>
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">Ingresa este código en el sitio web para activar tu cuenta.</p>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5; text-align: center;">Si no solicitaste esta cuenta, puedes ignorar este mensaje.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;"/>
        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">© ${new Date().getFullYear()} APV Motors. Todos los derechos reservados.</p>
      </div>
    </body>
    </html>
  `;

  return new Promise((resolve) => {
    try {
      const socket = (port === 465)
        ? tls.connect(port, host, { rejectUnauthorized: false })
        : net.connect(port, host);

      let step = 0;

      const send = (cmd) => {
        socket.write(cmd + '\r\n');
      };

      socket.on('data', (data) => {
        const response = data.toString();

        if (port !== 465 && step === 0) {
          send(`EHLO ${host}`);
          step = 1;
          return;
        }

        if (response.startsWith('220') && step === 0) {
          send(`EHLO ${host}`);
          step = 1;
        } else if (response.startsWith('250') && step === 1) {
          send('AUTH LOGIN');
          step = 2;
        } else if (response.startsWith('334') && step === 2) {
          send(Buffer.from(user).toString('base64'));
          step = 3;
        } else if (response.startsWith('334') && step === 3) {
          send(Buffer.from(pass).toString('base64'));
          step = 4;
        } else if (response.startsWith('235') && step === 4) {
          send(`MAIL FROM:<${user}>`);
          step = 5;
        } else if (response.startsWith('250') && step === 5) {
          send(`RCPT TO:<${toEmail}>`);
          step = 6;
        } else if (response.startsWith('250') && step === 6) {
          send('DATA');
          step = 7;
        } else if (response.startsWith('354') && step === 7) {
          const mail = [
            `From: ${from}`,
            `To: ${toEmail}`,
            `Subject: APV Motors - Código de Verificación: ${code}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            '',
            htmlBody,
            '.'
          ].join('\r\n');
          send(mail);
          step = 8;
        } else if (response.startsWith('250') && step === 8) {
          send('QUIT');
          console.log(`[APV EMAIL SUCCESS] Correo de verificación enviado a ${toEmail}`);
          socket.end();
          resolve(true);
        }
      });

      socket.on('error', (err) => {
        console.error(`[APV EMAIL ERROR] ${err.message}`);
        resolve(false);
      });

      setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 10000);
    } catch (e) {
      console.error(`[APV EMAIL EXCEPTION] ${e.message}`);
      resolve(false);
    }
  });
}

    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      const user = getAuthUser(req);
      return json(res, 200, user ? { authenticated: true, user: safeUser(user) } : { authenticated: false, user: null });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/register-request') {
      const body = JSON.parse((await readRequestBody(req, 128 * 1024)).toString('utf8') || '{}');
      const name = str(body.name).slice(0, 120);
      const email = normalizeEmail(body.email);
      const phone = str(body.phone).slice(0, 40);
      const password = String(body.password || '');
      if (name.length < 2) return json(res, 400, { error: 'Escribe tu nombre completo.' });
      if (!validEmail(email)) return json(res, 400, { error: 'Escribe un correo válido.' });
      if (phone.replace(/\D/g, '').length < 7) return json(res, 400, { error: 'Escribe un teléfono válido.' });
      if (password.length < 8) return json(res, 400, { error: 'La contraseña debe tener al menos 8 caracteres.' });
      
      const existing = catalogDb.findUserByEmail(email);
      if (existing && existing.emailVerified) {
        return json(res, 409, { error: 'Ya existe una cuenta verificada con ese correo.' });
      }

      const pass = hashPassword(password);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const userId = existing ? existing.id : crypto.randomUUID();
      const user = {
        id: userId,
        name,
        email,
        phone,
        passwordSalt: pass.salt,
        passwordHash: pass.digest,
        googleSub: '',
        picture: '',
        emailVerified: 0,
        verificationCode: code,
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
      catalogDb.saveUser(user);

      console.log(`\n==============================================`);
      console.log(`[APV AUTH] CÓDIGO DE VERIFICACIÓN PARA ${email}: ${code}`);
      console.log(`==============================================\n`);

      const emailSent = await sendVerificationEmail(email, code);

      return json(res, 200, {
        ok: true,
        message: emailSent
          ? `Hemos enviado un código de 6 dígitos a ${email}. Revisa tu bandeja de entrada.`
          : `Hemos enviado el código de verificación a ${email}.`,
        email,
        devCode: code
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/verify-email') {
      const body = JSON.parse((await readRequestBody(req, 128 * 1024)).toString('utf8') || '{}');
      const email = normalizeEmail(body.email);
      const code = String(body.code || '').trim();
      if (!email || !validEmail(email)) return json(res, 400, { error: 'Correo no válido.' });
      if (!code || code.length !== 6) return json(res, 400, { error: 'Ingresa el código de 6 dígitos.' });

      const user = catalogDb.findUserByEmail(email);
      if (!user) return json(res, 404, { error: 'No se encontró la solicitud de registro.' });
      if (String(user.verificationCode).trim() !== code) {
        return json(res, 400, { error: 'El código ingresado es incorrecto.' });
      }

      user.emailVerified = 1;
      user.verificationCode = '';
      user.lastLoginAt = new Date().toISOString();
      catalogDb.saveUser(user);

      return json(res, 200, { ok: true, user: safeUser(user) }, { 'Set-Cookie': sessionCookie(req, signSession(user.id)) });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const body = JSON.parse((await readRequestBody(req, 128 * 1024)).toString('utf8') || '{}');
      const name = str(body.name).slice(0, 120);
      const email = normalizeEmail(body.email);
      const phone = str(body.phone).slice(0, 40);
      const password = String(body.password || '');
      if (name.length < 2) return json(res, 400, { error: 'Escribe tu nombre completo.' });
      if (!validEmail(email)) return json(res, 400, { error: 'Escribe un correo válido.' });
      if (phone.replace(/\D/g, '').length < 7) return json(res, 400, { error: 'Escribe un teléfono válido.' });
      if (password.length < 8) return json(res, 400, { error: 'La contraseña debe tener al menos 8 caracteres.' });
      if (catalogDb.findUserByEmail(email)) return json(res, 409, { error: 'Ya existe una cuenta con ese correo.' });
      const pass = hashPassword(password);
      const user = {
        id: crypto.randomUUID(),
        name,
        email,
        phone,
        passwordSalt: pass.salt,
        passwordHash: pass.digest,
        googleSub: '',
        picture: '',
        emailVerified: 1,
        verificationCode: '',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
      catalogDb.saveUser(user);
      return json(res, 201, { ok: true, user: safeUser(user) }, { 'Set-Cookie': sessionCookie(req, signSession(user.id)) });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = JSON.parse((await readRequestBody(req, 128 * 1024)).toString('utf8') || '{}');
      const email = normalizeEmail(body.email);
      const user = catalogDb.findUserByEmail(email);
      if (!user || !verifyPassword(String(body.password || ''), user)) return json(res, 401, { error: 'Correo o contraseña incorrectos.' });
      user.lastLoginAt = new Date().toISOString();
      catalogDb.saveUser(user);
      return json(res, 200, { ok: true, user: safeUser(user) }, { 'Set-Cookie': sessionCookie(req, signSession(user.id)) });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/google') {
      const body = JSON.parse((await readRequestBody(req, 256 * 1024)).toString('utf8') || '{}');
      const claims = await verifyGoogleCredential(body.credential);
      const email = normalizeEmail(claims.email);
      let user = catalogDb.findUserByEmail(email);
      if (!user) {
        user = {
          id: crypto.randomUUID(),
          name: str(claims.name || claims.given_name || email.split('@')[0]).slice(0, 120),
          email,
          phone: '',
          passwordSalt: '',
          passwordHash: '',
          googleSub: claims.sub,
          picture: str(claims.picture),
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        };
      } else {
        user.googleSub = user.googleSub || claims.sub;
        user.picture = str(claims.picture) || user.picture || '';
        user.name = user.name || str(claims.name);
        user.lastLoginAt = new Date().toISOString();
      }
      catalogDb.saveUser(user);
      return json(res, 200, { ok: true, user: safeUser(user) }, { 'Set-Cookie': sessionCookie(req, signSession(user.id)) });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
    }

    if (req.method === 'GET' && url.pathname === '/api/filters') {
      return json(res, 200, buildFilters());
    }

    if (req.method === 'GET' && url.pathname === '/api/vehicles') {
      return json(res, 200, getVehicles(url, getAuthUser(req)));
    }

    const imagesMatch = url.pathname.match(/^\/api\/vehicles\/([^/]+)\/images$/);
    if (req.method === 'GET' && imagesMatch) {
      const vehicle = findVehicle(decodeURIComponent(imagesMatch[1]));
      if (!vehicle) return json(res, 404, { error: 'Vehículo no encontrado' });
      const images = await fetchVehicleImages(vehicle);
      return json(res, 200, { lot: vehicle.lot, images, count: images.length });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/vehicles/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/vehicles/'.length));
      const vehicle = findVehicle(id);
      if (!vehicle) return json(res, 404, { error: 'Vehículo no encontrado' });
      return json(res, 200, serializeVehicle(vehicle, getAuthUser(req)));
    }

    if (req.method === 'POST' && url.pathname === '/api/catalog/upload') {
      if (!adminAllowed(req)) return json(res, 401, { error: 'Clave de administración inválida.' });
      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      if (!contentType.includes('text/csv') && !contentType.includes('application/vnd.ms-excel') && !contentType.includes('application/octet-stream')) {
        return json(res, 415, { error: 'Envía el archivo CSV como cuerpo raw con Content-Type: text/csv.' });
      }
      const body = await readRequestBody(req, MAX_UPLOAD_BYTES);
      const tmpUpload = path.join(UPLOAD_DIR, `direct-${crypto.randomUUID()}.csv`);
      fs.writeFileSync(tmpUpload, body);
      try {
        const count = await replaceCatalogFromFile(tmpUpload);
        return json(res, 200, { ok: true, count, updatedAt: catalogUpdatedAt });
      } finally {
        fs.rmSync(tmpUpload, { force: true });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/catalog/upload/start') {
      if (!adminAllowed(req)) return json(res, 401, { error: 'Clave de administración inválida.' });
      const body = JSON.parse((await readRequestBody(req, 64 * 1024)).toString('utf8') || '{}');
      const size = Math.max(0, Number(body.size || 0));
      const name = path.basename(str(body.name || 'catalog.csv')).replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!name.toLowerCase().endsWith('.csv')) return json(res, 400, { error: 'El archivo debe ser CSV.' });
      if (!size || size > MAX_UPLOAD_BYTES) return json(res, 413, { error: `El catálogo puede pesar hasta ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` });
      const id = crypto.randomUUID();
      const tmpPath = path.join(UPLOAD_DIR, `${id}.part`);
      fs.writeFileSync(tmpPath, Buffer.alloc(0));
      uploadSessions.set(id, { id, name, size, received: 0, tmpPath, createdAt: Date.now() });
      return json(res, 201, { ok: true, uploadId: id, chunkMaxBytes: MAX_CHUNK_BYTES });
    }

    if (req.method === 'POST' && url.pathname === '/api/catalog/upload/chunk') {
      if (!adminAllowed(req)) return json(res, 401, { error: 'Clave de administración inválida.' });
      const id = str(url.searchParams.get('id'));
      const session = uploadSessions.get(id);
      if (!session) return json(res, 404, { error: 'Carga no encontrada o expirada.' });
      const body = await readRequestBody(req, MAX_CHUNK_BYTES);
      if (session.received + body.length > session.size || session.received + body.length > MAX_UPLOAD_BYTES) {
        fs.rmSync(session.tmpPath, { force: true });
        uploadSessions.delete(id);
        return json(res, 413, { error: 'La carga excede el tamaño declarado.' });
      }
      fs.appendFileSync(session.tmpPath, body);
      session.received += body.length;
      session.createdAt = Date.now();
      return json(res, 200, { ok: true, received: session.received, size: session.size, progress: Math.min(1, session.received / session.size) });
    }

    if (req.method === 'POST' && url.pathname === '/api/catalog/upload/finish') {
      if (!adminAllowed(req)) return json(res, 401, { error: 'Clave de administración inválida.' });
      const body = JSON.parse((await readRequestBody(req, 64 * 1024)).toString('utf8') || '{}');
      const session = uploadSessions.get(str(body.uploadId));
      if (!session) return json(res, 404, { error: 'Carga no encontrada o expirada.' });
      if (session.received !== session.size) return json(res, 400, { error: `Carga incompleta: ${session.received} de ${session.size} bytes.` });
      try {
        const stats = await replaceCatalogFromFile(session.tmpPath);
        return json(res, 200, { ok: true, count: stats.totalInDb, stats, updatedAt: catalogDb.getUpdatedAt(), bytes: session.received });
      } finally {
        fs.rmSync(session.tmpPath, { force: true });
        uploadSessions.delete(session.id);
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/catalog/clear') {
      if (!adminAllowed(req)) return json(res, 401, { error: 'Clave de administración inválida.' });
      catalogDb.clearVehicles();
      return json(res, 200, { ok: true, message: 'Catálogo de vehículos vaciado.' });
    }

    if (req.method === 'POST' && url.pathname === '/api/catalog/sync') {
      if (!adminAllowed(req)) return json(res, 401, { error: 'Clave de administración inválida.' });
      if (!fs.existsSync(CATALOG_FILE)) return json(res, 404, { error: 'No se encontró el archivo CSV del catálogo para sincronizar.' });
      try {
        const csvText = fs.readFileSync(CATALOG_FILE, 'utf8');
        const stats = catalogDb.upsertCatalogFromCsv(csvText);
        return json(res, 200, { ok: true, stats });
      } catch (err) {
        return json(res, 500, { error: `Error en la sincronización: ${err.message}` });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/bid-intents') {
      const user = requireAuth(req, res);
      if (!user) return;
      const body = JSON.parse((await readRequestBody(req, 256 * 1024)).toString('utf8') || '{}');
      const vehicle = catalogDb.findVehicleByLotOrId(str(body.lot));
      const maxBid = num(body.maxBid);
      if (!vehicle || maxBid <= 0) return json(res, 400, { error: 'Solicitud de puja inválida.' });
      const intent = {
        id: crypto.randomUUID(),
        userId: user.id,
        userEmail: user.email,
        lot: vehicle.lot,
        vin: vehicle.vin,
        maxBid,
        vehicle: vehicle.title,
        createdAt: new Date().toISOString()
      };
      catalogDb.saveBidIntent(intent);
      return json(res, 201, intent);
    }

    if (req.method === 'GET') {
      const filePath = safePublicPath(url.pathname);
      if (!filePath) return text(res, 403, 'Forbidden');
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return serveFile(res, filePath);
      return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }

    return text(res, 405, 'Method not allowed');
  } catch (err) {
    console.error(err);
    return json(res, err.statusCode || 500, { error: err.statusCode ? err.message : 'Error interno del servidor.' });
  }
});

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, session] of uploadSessions.entries()) {
    if (session.createdAt < cutoff) {
      fs.rmSync(session.tmpPath, { force: true });
      uploadSessions.delete(id);
    }
  }
}, 15 * 60 * 1000).unref();

loadCatalog();

server.listen(PORT, () => {
  console.log(`APV Motors Auction Catalog: http://localhost:${PORT}`);
  console.log(`Vehículos en Base de Datos SQLite: ${catalogDb.getVehicleCount()}`);
  console.log(`Cuentas registradas en Base de Datos: ${catalogDb.getUsers().length}`);
  console.log(`Kommo AI knowledge: http://localhost:${PORT}${KNOWLEDGE_BASE_PATH}/`);
  console.log('Acceso: email y contraseña (Google Sign-In desactivado en la interfaz)');
});
