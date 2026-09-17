const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.APV_DATA_DIR || path.join(__dirname, '..', 'data');
const crypto = require('crypto');
let filterCache = null;
let featuredPool = null;
let lastPruned = 0;
const FEATURED_CLAUSES = [
  "imageUrl IS NOT NULL AND imageUrl != ''",
  "year >= 2016",
  "runsDrives = 'Run & Drive Verified'",
  "primaryDamage IN ('MINOR DENT/SCRATCHES', 'NORMAL WEAR', 'NO DAMAGE', 'HAIL', 'VANDALISM', 'CLEAN TITLE')",
  "make NOT IN ('OTHERS', 'OTHER', 'CLUB CAR', 'CUSHMAN', 'EZGO', 'YAMAHA', 'POLARIS', 'KAWASAKI', 'SEA-DOO', 'CAN-AM', 'KUBOTA', 'HINO', 'FREIGHTLINER', 'INTERNATIONAL', 'PETERBILT', 'KENWORTH')",
  "title NOT LIKE '%BOAT%' AND title NOT LIKE '%TRAILER%' AND title NOT LIKE '%VESSEL%' AND title NOT LIKE '%MOTORCYCLE%' AND title NOT LIKE '%BUS%' AND title NOT LIKE '%TRANSIT%' AND title NOT LIKE '%UNKNOWN%' AND title NOT LIKE '%MINI%' AND title NOT LIKE '%TRACTOR%' AND title NOT LIKE '%COMMERCIAL%' AND title NOT LIKE '%VAN%' AND title NOT LIKE '%BOX%' AND title NOT LIKE '%PROMASTER%' AND title NOT LIKE '%EXPRESS%' AND title NOT LIKE '%CUTAWAY%'"
];

function invalidateCatalogCaches() { filterCache = null; featuredPool = null; }

const DB_FILE = path.join(DATA_DIR, 'catalog.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = null;
let lastUpdatedAt = null;

function initDatabase() {
  if (db) return db;
  db = new DatabaseSync(DB_FILE);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      lot TEXT PRIMARY KEY,
      id TEXT,
      year INTEGER,
      make TEXT,
      model TEXT,
      title TEXT,
      vin TEXT,
      odometer INTEGER,
      locationCity TEXT,
      locationState TEXT,
      primaryDamage TEXT,
      secondaryDamage TEXT,
      runsDrives TEXT,
      buyNow REAL,
      currentBid REAL,
      retailValue REAL,
      repairCost REAL,
      saleDate TEXT,
      saleTime TEXT,
      timeZone TEXT,
      hasKeys TEXT,
      color TEXT,
      engine TEXT,
      drive TEXT,
      transmission TEXT,
      fuel TEXT,
      cylinders TEXT,
      itemNumber TEXT,
      yardName TEXT,
      saleTitleState TEXT,
      saleTitleType TEXT,
      lotCondCode TEXT,
      odometerBrand TEXT,
      specialNote TEXT,
      gridRow TEXT,
      trim TEXT,
      sellerName TEXT,
      saleStatus TEXT,
      imageThumbnail TEXT,
      imageUrl TEXT,
      rawJson TEXT,
      updatedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_v_make ON vehicles(make);
    CREATE INDEX IF NOT EXISTS idx_v_year ON vehicles(year);
    CREATE INDEX IF NOT EXISTS idx_v_state ON vehicles(locationState);
    CREATE INDEX IF NOT EXISTS idx_v_damage ON vehicles(primaryDamage);
    CREATE INDEX IF NOT EXISTS idx_v_runs ON vehicles(runsDrives);
    CREATE INDEX IF NOT EXISTS idx_v_buynow ON vehicles(buyNow);
    CREATE INDEX IF NOT EXISTS idx_v_keys ON vehicles(hasKeys);

    CREATE TABLE IF NOT EXISTS favorites (
      userId TEXT NOT NULL,
      lot TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (userId, lot)
    );

    CREATE TABLE IF NOT EXISTS catalog_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      passwordSalt TEXT,
      passwordHash TEXT,
      googleSub TEXT,
      picture TEXT,
      emailVerified INTEGER DEFAULT 0,
      verificationCode TEXT,
      createdAt TEXT,
      lastLoginAt TEXT
    );

    CREATE TABLE IF NOT EXISTS bid_intents (
      id TEXT PRIMARY KEY,
      userId TEXT,
      userEmail TEXT,
      lot TEXT,
      vin TEXT,
      maxBid REAL,
      vehicle TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS kommo_sync (
      key TEXT PRIMARY KEY,
      apvUserId TEXT,
      lot TEXT,
      chatKey TEXT,
      incomingLeadUid TEXT,
      leadId INTEGER,
      contactId INTEGER,
      syncedAt TEXT
    );
  `);

  try { db.exec("ALTER TABLE users ADD COLUMN emailVerified INTEGER DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN verificationCode TEXT;"); } catch (_) {}

  try { db.exec('ALTER TABLE vehicles ADD COLUMN saleAt INTEGER'); } catch (_) {}
  db.exec(`CREATE INDEX IF NOT EXISTS idx_v_sale ON vehicles(saleAt);
    CREATE INDEX IF NOT EXISTS idx_v_model ON vehicles(make, model);
    CREATE INDEX IF NOT EXISTS idx_v_featured_candidate ON vehicles(runsDrives, primaryDamage, year, lot);
    CREATE INDEX IF NOT EXISTS idx_v_upcoming ON vehicles(saleAt IS NULL, saleAt, year DESC, lot);
    CREATE INDEX IF NOT EXISTS idx_v_date ON vehicles(saleDate, year DESC);`);
  const metaRow = db.prepare("SELECT value FROM catalog_meta WHERE key = 'updatedAt'").get();
  if (metaRow && metaRow.value) {
    lastUpdatedAt = metaRow.value;
  }

  // Legacy files must never overwrite newer accounts or chats on restart.
  const legacyMigrated = db.prepare("SELECT value FROM catalog_meta WHERE key = 'legacyJsonMigrated'").get();
  if (!legacyMigrated) {
  // --- AUTOMATED DATA MIGRATIONS FROM LEGACY JSON FILES ---
  const usersJsonPath = path.join(DATA_DIR, 'users.json');
  if (fs.existsSync(usersJsonPath) && db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) {
    try {
      const raw = fs.readFileSync(usersJsonPath, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO users (id, name, email, phone, passwordSalt, passwordHash, googleSub, picture, createdAt, lastLoginAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, email=excluded.email, phone=excluded.phone,
            passwordSalt=excluded.passwordSalt, passwordHash=excluded.passwordHash,
            googleSub=excluded.googleSub, picture=excluded.picture,
            createdAt=excluded.createdAt, lastLoginAt=excluded.lastLoginAt
        `);
        db.exec('BEGIN TRANSACTION');
        for (const u of list) {
          stmt.run(u.id, u.name, u.email, u.phone || '', u.passwordSalt || '', u.passwordHash || '', u.googleSub || '', u.picture || '', u.createdAt, u.lastLoginAt);
        }
        db.exec('COMMIT');
        console.log(`[CATALOG DB] Migrated ${list.length} users from users.json into SQLite.`);
      }
    } catch (err) {
      console.error('[CATALOG DB] User migration error:', err.message);
    }
  }

  const bidIntentsPath = path.join(DATA_DIR, 'bid-intents.ndjson');
  if (fs.existsSync(bidIntentsPath)) {
    try {
      const raw = fs.readFileSync(bidIntentsPath, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      const stmt = db.prepare(`
        INSERT INTO bid_intents (id, userId, userEmail, lot, vin, maxBid, vehicle, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `);
      db.exec('BEGIN TRANSACTION');
      let count = 0;
      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          if (item.id) {
            stmt.run(item.id, item.userId, item.userEmail, item.lot, item.vin, item.maxBid, item.vehicle, item.createdAt);
            count++;
          }
        } catch (_) {}
      }
      db.exec('COMMIT');
      console.log(`[CATALOG DB] Migrated ${count} bid intents from bid-intents.ndjson into SQLite.`);
    } catch (err) {
      console.error('[CATALOG DB] Bid intent migration error:', err.message);
    }
  }

  const kommoSyncPath = path.join(DATA_DIR, 'kommo_sync.json');
  if (fs.existsSync(kommoSyncPath) && db.prepare('SELECT COUNT(*) AS n FROM kommo_sync').get().n === 0) {
    try {
      const raw = fs.readFileSync(kommoSyncPath, 'utf8');
      const store = JSON.parse(raw);
      if (store && typeof store === 'object') {
        const stmt = db.prepare(`
          INSERT INTO kommo_sync (key, apvUserId, lot, chatKey, incomingLeadUid, leadId, contactId, syncedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            apvUserId=excluded.apvUserId, lot=excluded.lot, chatKey=excluded.chatKey,
            incomingLeadUid=excluded.incomingLeadUid, leadId=excluded.leadId,
            contactId=excluded.contactId, syncedAt=excluded.syncedAt
        `);
        db.exec('BEGIN TRANSACTION');
        let count = 0;
        for (const [key, record] of Object.entries(store)) {
          stmt.run(key, record.apvUserId, record.lot, record.chatKey || '', record.incomingLeadUid || null, record.leadId || null, record.contactId || null, record.syncedAt || new Date().toISOString());
          count++;
        }
        db.exec('COMMIT');
        console.log(`[CATALOG DB] Migrated ${count} Kommo sync records from kommo_sync.json into SQLite.`);
      }
    } catch (err) {
      console.error('[CATALOG DB] Kommo sync migration error:', err.message);
    }
  }

  db.prepare("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('legacyJsonMigrated', '1')").run();
  }
  console.log(`[CATALOG DB] SQLite database initialized at ${DB_FILE}`);
  return db;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const cleanContent = content.startsWith('\uFEFF') ? content.slice(1) : content;
  const len = cleanContent.length;

  for (let i = 0; i < len; i++) {
    const c = cleanContent[i];
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < len && cleanContent[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"' && field.trim() === '') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field.trim());
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && i + 1 < len && cleanContent[i + 1] === '\n') {
          i++;
        }
        row.push(field.trim());
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
          rows.push(row);
        }
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
  }

  if (inQuotes) throw new Error('CSV inválido: comillas sin cerrar.');
  if (field || row.length > 0) {
    row.push(field.trim());
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

function str(val) {
  return String(val ?? '').trim();
}

function num(val) {
  if (val === null || val === undefined || val === '') return 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRecord(raw) {
  const lot = str(raw['Lot number']);
  const year = num(raw['Year']);
  const make = str(raw['Make']).toUpperCase().replace(/\s+/g, ' ').replace(/ TRUCK(?:\/VAN)?$/, '').replace(/^FORD - FORD$/, 'FORD');
  const model = str(raw['Model Group'] || raw['Model Detail'] || raw['Model']);
  const trim = str(raw['Trim']);
  const title = [year, make, model, trim].filter(Boolean).join(' ') || str(raw['Title']);
  const vin = str(raw['VIN']);

  return {
    lot,
    id: lot,
    year,
    make,
    model,
    trim,
    title,
    vin,
    odometer: num(raw['Odometer']),
    locationCity: str(raw['Location city']),
    locationState: str(raw['Location state']),
    primaryDamage: str(raw['Damage Description']),
    secondaryDamage: str(raw['Secondary Damage']),
    runsDrives: normalizeCondition(raw['Runs/Drives']),
    buyNow: num(raw['Buy-It-Now Price']),
    currentBid: num(raw['High Bid =non-vix,Sealed=Vix']),
    retailValue: num(raw['Est. Retail Value']),
    repairCost: num(raw['Repair cost']),
    saleDate: str(raw['Sale Date M/D/CY']) === '0' ? '' : str(raw['Sale Date M/D/CY']),
    saleTime: str(raw['Sale time (HHMM)']),
    timeZone: str(raw['Time Zone']),
    hasKeys: str(raw['Has Keys-Yes or No']).toUpperCase(),
    color: str(raw['Color']),
    engine: str(raw['Engine']),
    drive: str(raw['Drive']),
    transmission: str(raw['Transmission']),
    fuel: str(raw['Fuel Type']),
    cylinders: str(raw['Cylinders']),
    itemNumber: str(raw['Item#']),
    yardName: str(raw['Yard name']),
    saleTitleState: str(raw['Sale Title State']),
    saleTitleType: str(raw['Sale Title Type']),
    lotCondCode: str(raw['Lot Cond. Code']),
    odometerBrand: str(raw['Odometer Brand']),
    specialNote: str(raw['Special Note']),
    gridRow: str(raw['Grid/Row']),
    sellerName: str(raw['Seller Name']),
    saleStatus: str(raw['Sale Status']),
    imageThumbnail: str(raw['Image Thumbnail']),
    imageUrl: str(raw['Image URL']),
    rawJson: JSON.stringify(raw)
  };
}

function normalizeCondition(value) {
  const v = str(value).toLowerCase();
  if (['run & drive verified', 'run & drive', 'runs & drives', 'run and drive'].includes(v)) return 'Run & Drive Verified';
  if (['vehicle starts', 'engine start program', 'engine starts'].includes(v)) return 'Vehicle Starts';
  return 'Unverified';
}

function saleTimestamp(date, time, zone) {
  if (!/^\d{8}$/.test(date)) return null;
  const t = str(time).padStart(4, '0');
  if (!/^\d{4}$/.test(t) || +t.slice(0,2) > 23 || +t.slice(2) > 59) return null;
  const y = +date.slice(0,4), m = +date.slice(4,6), d = +date.slice(6);
  const check = new Date(Date.UTC(y, m-1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m-1 || check.getUTCDate() !== d) return null;
  const offsets = {EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7, AKST: -9, AKDT: -8, HST: -10, AST: -4, ADT: -3, UTC: 0, GMT: 0};
  const offset = offsets[str(zone).toUpperCase()];
  // Unknown zones: retain until the end of the sale day in UTC-12.
  return offset === undefined ? Date.UTC(y, m-1, d+1, 12) : Date.UTC(y, m-1, d, +t.slice(0,2)-offset, +t.slice(2));
}

function pruneExpired() {
  const database = initDatabase();
  if (Date.now() - lastPruned < 60000) return;
  const result = database.prepare('DELETE FROM vehicles WHERE saleAt <= ?').run(Date.now());
  lastPruned = Date.now();
  if (result.changes) invalidateCatalogCaches();
}

function upsertCatalogFromCsv(csvText, options = {}) {
  const database = initDatabase();
  const digest = crypto.createHash('sha256').update('catalog-v3:').update(csvText).digest('hex');
  if (!options.force && database.prepare("SELECT value FROM catalog_meta WHERE key = 'sourceHash'").get()?.value === digest) {
    pruneExpired();
    return { totalInDb: getVehicleCount(), unchanged: true, updatedAt: lastUpdatedAt };
  }
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('El CSV no contiene filas de datos válidas.');

  const headers = rows[0].map(h => str(h));
  const required = ['Lot number', 'Year', 'Make', 'VIN', 'Image Thumbnail'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(', ')}`);

  const nowIso = new Date().toISOString();
  let addedCount = 0;
  let updatedCount = 0;
  let skipped = 0, expired = 0, valid = 0, duplicates = 0;
  const seen = new Set();

  const previousLots = new Set(database.prepare('SELECT lot FROM vehicles').all().map(r=>r.lot));
  const countBefore = previousLots.size;
  const backup = options.backupBeforeReplace && countBefore ? backupDatabase() : undefined;

  const upsertStmt = database.prepare(`
    INSERT INTO vehicles (
      lot, id, year, make, model, title, vin, odometer,
      locationCity, locationState, primaryDamage, secondaryDamage, runsDrives,
      buyNow, currentBid, retailValue, repairCost, saleDate, saleTime, timeZone,
      hasKeys, color, engine, drive, transmission, fuel, cylinders,
      itemNumber, yardName, saleTitleState, saleTitleType, lotCondCode, odometerBrand,
      specialNote, gridRow, trim, sellerName, saleStatus, imageThumbnail, imageUrl, rawJson, updatedAt
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?
    ) ON CONFLICT(lot) DO UPDATE SET
      year=excluded.year,
      make=excluded.make,
      model=excluded.model,
      title=excluded.title,
      vin=excluded.vin,
      odometer=excluded.odometer,
      locationCity=excluded.locationCity,
      locationState=excluded.locationState,
      primaryDamage=excluded.primaryDamage,
      secondaryDamage=excluded.secondaryDamage,
      runsDrives=excluded.runsDrives,
      buyNow=excluded.buyNow,
      currentBid=excluded.currentBid,
      retailValue=excluded.retailValue,
      repairCost=excluded.repairCost,
      saleDate=excluded.saleDate,
      saleTime=excluded.saleTime,
      timeZone=excluded.timeZone,
      hasKeys=excluded.hasKeys,
      color=excluded.color,
      engine=excluded.engine,
      drive=excluded.drive,
      transmission=excluded.transmission,
      fuel=excluded.fuel,
      cylinders=excluded.cylinders,
      itemNumber=excluded.itemNumber,
      yardName=excluded.yardName,
      saleTitleState=excluded.saleTitleState,
      saleTitleType=excluded.saleTitleType,
      lotCondCode=excluded.lotCondCode,
      odometerBrand=excluded.odometerBrand,
      specialNote=excluded.specialNote,
      gridRow=excluded.gridRow,
      trim=excluded.trim,
      sellerName=excluded.sellerName,
      saleStatus=excluded.saleStatus,
      imageThumbnail=excluded.imageThumbnail,
      imageUrl=excluded.imageUrl,
      rawJson=excluded.rawJson,
      updatedAt=excluded.updatedAt
  `);

  database.exec('BEGIN TRANSACTION');
  try {
    database.exec('DELETE FROM vehicles');
    const setSaleAt = database.prepare('UPDATE vehicles SET saleAt = ? WHERE lot = ?');
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      if (!cells || cells.length !== headers.length || cells.some(c => c.length > 4000)) { skipped++; continue; }
      const raw = {};
      headers.forEach((h, idx) => { if (h) raw[h] = cells[idx] ?? ''; });
      const rec = normalizeRecord(raw);
      if (!/^\d{5,12}$/.test(rec.lot) || rec.year < 1900 || rec.year > new Date().getFullYear()+2 || !rec.make || rec.make.length > 60 || rec.model.length > 100 || /[\r\n]/.test(rec.make + rec.model) || rec.vin.length > 25) { skipped++; continue; }
      const saleAt = saleTimestamp(rec.saleDate, rec.saleTime, rec.timeZone);
      if (rec.saleDate && !saleAt) { skipped++; continue; }
      valid++;
      if (saleAt && saleAt <= Date.now()) { expired++; continue; }
      if (seen.has(rec.lot)) duplicates++;
      seen.add(rec.lot);

      upsertStmt.run(
        rec.lot, rec.id, rec.year, rec.make, rec.model, rec.title, rec.vin, rec.odometer,
        rec.locationCity, rec.locationState, rec.primaryDamage, rec.secondaryDamage, rec.runsDrives,
        rec.buyNow, rec.currentBid, rec.retailValue, rec.repairCost, rec.saleDate, rec.saleTime, rec.timeZone,
        rec.hasKeys, rec.color, rec.engine, rec.drive, rec.transmission, rec.fuel, rec.cylinders,
        rec.itemNumber, rec.yardName, rec.saleTitleState, rec.saleTitleType, rec.lotCondCode, rec.odometerBrand,
        rec.specialNote, rec.gridRow, rec.trim, rec.sellerName, rec.saleStatus, rec.imageThumbnail, rec.imageUrl, rec.rawJson, nowIso
      );
      setSaleAt.run(saleAt, rec.lot);
    }
    if (!valid) throw new Error('No hay vehículos válidos; se conserva el catálogo anterior.');
    database.prepare("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('sourceHash', ?)").run(digest);
    database.prepare("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('updatedAt', ?)").run(nowIso);
    database.exec('COMMIT');
    invalidateCatalogCaches();
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }

  const countAfter = database.prepare("SELECT COUNT(*) as count FROM vehicles").get().count;
  addedCount = [...seen].filter(lot => !previousLots.has(lot)).length;
  updatedCount = seen.size - addedCount;

  lastUpdatedAt = nowIso;
  database.prepare("INSERT INTO catalog_meta (key, value) VALUES ('updatedAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(nowIso);

  console.log(`[CATALOG DB] Upsert complete. Added: ${addedCount}, Total in DB: ${countAfter}, Updated: ${updatedCount}`);
  return {
    backup,
    totalInCsv: rows.length - 1,
    added: addedCount,
    skipped, expired, duplicates, updated: updatedCount,
    removed: [...previousLots].filter(lot => !seen.has(lot)).length,
    totalInDb: countAfter,
    updatedAt: nowIso
  };
}

function backupDatabase() {
  const database = initDatabase();
  const backupDir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const backup = `catalog-repair-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.db`;
  const backupPath = path.join(backupDir, backup);
  database.prepare('VACUUM INTO ?').run(backupPath);
  fs.chmodSync(backupPath, 0o600);
  return backup;
}

function repairCatalogFromCsv(csvText) {
  const database = initDatabase();
  const backup = backupDatabase();
  const stats = upsertCatalogFromCsv(csvText, { force: true });
  database.exec('PRAGMA optimize');
  return { ...stats, backup };
}

function getFavorites(userId) {
  return initDatabase().prepare('SELECT lot FROM favorites WHERE userId = ? ORDER BY createdAt DESC, lot').all(String(userId)).map(row => row.lot);
}

function setFavorite(userId, lot, favorite) {
  const database = initDatabase();
  if (!/^\d{5,12}$/.test(String(lot))) throw Object.assign(new Error('Lote inválido.'), { statusCode: 400 });
  if (favorite) {
    if (!findVehicleByLotOrId(lot)) throw Object.assign(new Error('Vehículo no disponible.'), { statusCode: 404 });
    const existing = getFavorites(userId);
    if (!existing.includes(String(lot)) && existing.length >= 500) throw Object.assign(new Error('Puedes guardar hasta 500 favoritos.'), { statusCode: 400 });
    database.prepare('INSERT OR IGNORE INTO favorites (userId, lot, createdAt) VALUES (?, ?, ?)').run(String(userId), String(lot), new Date().toISOString());
  } else database.prepare('DELETE FROM favorites WHERE userId = ? AND lot = ?').run(String(userId), String(lot));
  return getFavorites(userId);
}

function ensureHttps(url) {
  const v = str(url);
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v.replace(/^http:\/\//i, 'https://');
  if (v.startsWith('//')) return `https:${v}`;
  return `https://${v}`;
}

function rowToVehicle(row) {
  if (!row) return null;
  const raw = row.rawJson ? JSON.parse(row.rawJson) : {};
  const rawImg = ensureHttps(row.imageThumbnail);
  const image = rawImg ? rawImg.trim().replace(/_thb\.jpg$/i, '_ful.jpg') : '';

  return {
    lot: str(row.lot),
    id: str(row.id || row.lot),
    year: Number(row.year || 0),
    make: str(row.make),
    model: str(row.model),
    trim: str(row.trim),
    title: str(row.title),
    vin: str(row.vin),
    odometer: Number(row.odometer || 0),
    locationCity: str(row.locationCity),
    locationState: str(row.locationState),
    primaryDamage: str(row.primaryDamage),
    secondaryDamage: str(row.secondaryDamage),
    runsDrives: str(row.runsDrives),
    buyNow: Number(row.buyNow || 0),
    currentBid: Number(row.currentBid || 0),
    retailValue: Number(row.retailValue || 0),
    repairCost: Number(row.repairCost || 0),
    saleDate: /^\d{8}$/.test(row.saleDate) ? `${row.saleDate.slice(0,4)}-${row.saleDate.slice(4,6)}-${row.saleDate.slice(6,8)}T12:00:00` : '',
    saleTime: str(row.saleTime),
    timeZone: str(row.timeZone),
    hasKeys: str(row.hasKeys),
    color: str(row.color),
    engine: str(row.engine),
    drive: str(row.drive),
    transmission: str(row.transmission),
    fuel: str(row.fuel),
    cylinders: str(row.cylinders),
    itemNumber: str(row.itemNumber),
    yardName: str(row.yardName),
    saleTitleState: str(row.saleTitleState),
    saleTitleType: str(row.saleTitleType),
    lotCondCode: str(row.lotCondCode),
    odometerBrand: str(row.odometerBrand),
    specialNote: str(row.specialNote),
    gridRow: str(row.gridRow),
    sellerName: str(row.sellerName),
    saleStatus: str(row.saleStatus),
    imageThumbnail: rawImg,
    imageUrl: str(row.imageUrl),
    image,
    imageApi: str(row.imageUrl),
    copartUrl: row.lot ? `https://www.copart.com/lot/${encodeURIComponent(row.lot)}` : 'https://www.copart.com/',
    titleState: str(row.saleTitleState),
    titleType: str(row.saleTitleType),
    conditionCode: str(row.lotCondCode),
    modelGroup: str(raw['Model Group']), body: str(raw['Body Style']), vehicleType: str(raw['Vehicle Type']),
    item: str(row.itemNumber), locationCountry: str(raw['Location country']),
    announcements: str(raw.Announcements), lastUpdated: str(raw['Last Updated Time'])
  };
}

// Cache only public candidate data, not a randomized response or user details.
// Rebuild after imports, clears or expiry; each request still gets a new sample.
function getFeaturedVehicles(limit = 6) {
  const database = initDatabase();
  pruneExpired();
  if (!featuredPool) {
    featuredPool = database.prepare(`SELECT lot, title, imageThumbnail, currentBid, buyNow,
      locationCity, locationState FROM vehicles WHERE ${FEATURED_CLAUSES.join(' AND ')}`).all().map(row => ({
        lot: row.lot, title: row.title, currentBid: row.currentBid, buyNow: row.buyNow,
        locationCity: row.locationCity, locationState: row.locationState,
        image: ensureHttps(row.imageThumbnail).replace(/_thb\.jpg$/i, '_ful.jpg')
      }));
  }
  const count = Math.min(featuredPool.length, Math.max(1, Math.min(12, Number(limit) || 6)));
  const selected = new Set();
  while (selected.size < count) selected.add(Math.floor(Math.random() * featuredPool.length));
  return { items: [...selected].map(index => featuredPool[index]) };
}

function queryVehicles(params = {}) {
  const database = initDatabase();

  pruneExpired();
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(48, Math.max(6, Number(params.pageSize) || 18));
  const q = str(params.q).toLowerCase();
  const make = str(params.make);
  const state = str(params.state);
  const damage = str(params.damage);
  const runState = str(params.runState);
  const yearMin = Number(params.yearMin) || 0;
  const yearMax = Number(params.yearMax) || 0;
  const priceMax = Number(params.priceMax) || 0;
  const odometerMax = Number(params.odometerMax) || 0;
  const keysOnly = params.keysOnly === '1' || params.keysOnly === true;
  const buyNowOnly = params.buyNowOnly === '1' || params.buyNowOnly === true;
  const sort = str(params.sort) || 'saleSoon';

  const whereClauses = [];
  const bindings = [];

  for (const token of q.split(/\s+/).filter(Boolean).slice(0, 12)) {
    whereClauses.push("LOWER(title || ' ' || lot || ' ' || vin || ' ' || locationCity || ' ' || locationState) LIKE ? ESCAPE '\\'");
    bindings.push('%' + token.replace(/[\\%_]/g, '\\$&') + '%');
  }
  if (params.model) { whereClauses.push('model = ?'); bindings.push(str(params.model)); }
  if (params.runAndDrive === '1') whereClauses.push("runsDrives = 'Run & Drive Verified'");
  if (params.favorites !== undefined) {
    const lots = str(params.favorites).split(',').filter(x => /^\d{5,12}$/.test(x)).slice(0,500);
    whereClauses.push(lots.length ? `lot IN (${lots.map(() => '?').join(',')})` : '0');
    bindings.push(...lots);
  }

  if (make) {
    whereClauses.push("make = ?");
    bindings.push(make);
  }

  if (state) {
    whereClauses.push("locationState = ?");
    bindings.push(state);
  }

  if (damage) {
    whereClauses.push("primaryDamage = ?");
    bindings.push(damage);
  }

  if (runState) {
    whereClauses.push("runsDrives = ?");
    bindings.push(runState);
  }

  if (yearMin > 0) {
    whereClauses.push("year >= ?");
    bindings.push(yearMin);
  }

  if (yearMax > 0) {
    whereClauses.push("year <= ?");
    bindings.push(yearMax);
  }

  if (priceMax > 0) {
    whereClauses.push("(buyNow <= ? OR currentBid <= ? OR retailValue <= ?)");
    bindings.push(priceMax, priceMax, priceMax);
  }

  if (odometerMax > 0) {
    whereClauses.push("odometer <= ?");
    bindings.push(odometerMax);
  }

  if (keysOnly) {
    whereClauses.push("hasKeys = 'YES'");
  }

  if (buyNowOnly) {
    whereClauses.push("buyNow > 0");
  }

  if (sort === 'randomClean' || sort === 'featuredClean' || params.featured === '1' || params.featuredClean === '1') {
    whereClauses.push(...FEATURED_CLAUSES);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) as total FROM vehicles ${whereSql}`;
  const totalRow = database.prepare(countSql).get(...bindings);
  const total = totalRow ? totalRow.total : 0;

  const sortSqlMap = {
    saleSoon: "saleAt IS NULL, saleAt ASC, year DESC, lot ASC",
    newest: "year DESC",
    oldest: "year ASC",
    priceAsc: "COALESCE(NULLIF(buyNow, 0), NULLIF(currentBid, 0), retailValue) ASC",
    priceDesc: "COALESCE(NULLIF(buyNow, 0), NULLIF(currentBid, 0), retailValue) DESC",
    odometerAsc: "odometer ASC",
    randomClean: "RANDOM()",
    featuredClean: "RANDOM()"
  };

  const orderBy = sortSqlMap[sort] || sortSqlMap.saleSoon;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const offset = (safePage - 1) * pageSize;

  const dataSql = `SELECT * FROM vehicles ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  const rows = database.prepare(dataSql).all(...bindings, pageSize, offset);

  return {
    items: rows.map(rowToVehicle),
    total,
    page: safePage,
    pages,
    pageSize
  };
}

function getFilterMetadata() {
  const database = initDatabase();
  pruneExpired();
  if (filterCache) return filterCache;

  const totalRow = database.prepare("SELECT COUNT(*) as total FROM vehicles").get();
  const total = totalRow ? totalRow.total : 0;

  const makesRows = database.prepare("SELECT DISTINCT make FROM vehicles WHERE make IS NOT NULL AND make != '' ORDER BY make ASC").all();
  const statesRows = database.prepare("SELECT DISTINCT locationState FROM vehicles WHERE locationState IS NOT NULL AND locationState != '' ORDER BY locationState ASC").all();
  const damageRows = database.prepare("SELECT DISTINCT primaryDamage FROM vehicles WHERE primaryDamage IS NOT NULL AND primaryDamage != '' ORDER BY primaryDamage ASC").all();
  const runRows = database.prepare("SELECT DISTINCT runsDrives FROM vehicles WHERE runsDrives IS NOT NULL AND runsDrives != '' ORDER BY runsDrives ASC").all();

  const statsRow = database.prepare("SELECT MIN(year) as minYear, MAX(year) as maxYear, MAX(odometer) as maxOdometer, MAX(buyNow) as maxPrice FROM vehicles").get() || {};

  const cleanStates = statesRows
    .map(r => str(r.locationState))
    .filter(s => s && s.length <= 10 && !s.includes('*') && !/^\d+$/.test(s) && !/AUCTION|REGION|SAFETY|DEFAULT|MINIMUM/i.test(s));

  const modelsByMake = {};
  for (const row of database.prepare("SELECT DISTINCT make, model FROM vehicles WHERE model != '' ORDER BY model").all()) (modelsByMake[row.make] ||= []).push(row.model);
  return filterCache = {
    total,
    modelsByMake,
    makes: makesRows.map(r => r.make),
    states: cleanStates,
    damages: damageRows.map(r => r.primaryDamage),
    runStates: runRows.map(r => r.runsDrives),
    minYear: 1950,
    maxYear: Math.max(statsRow.maxYear || 0, new Date().getFullYear()+1),
    maxOdometer: Math.min(1000000, statsRow.maxOdometer || 1000000),
    maxPrice: statsRow.maxPrice || 100000,
    updatedAt: lastUpdatedAt
  };
}

function findVehicleByLotOrId(id) {
  const database = initDatabase();
  pruneExpired();
  const row = database.prepare("SELECT * FROM vehicles WHERE lot = ? OR id = ? LIMIT 1").get(String(id), String(id));
  return rowToVehicle(row);
}

function getRawRecordByLot(lot) {
  const database = initDatabase();
  const row = database.prepare("SELECT rawJson FROM vehicles WHERE lot = ? LIMIT 1").get(String(lot));
  if (!row || !row.rawJson) return null;
  try { return JSON.parse(row.rawJson); } catch (_) { return null; }
}

function getVehicleCount() {
  const database = initDatabase();
  const row = database.prepare("SELECT COUNT(*) as count FROM vehicles").get();
  return row ? row.count : 0;
}

function getUpdatedAt() {
  return lastUpdatedAt;
}

// --- USER DATABASE FUNCTIONS ---
function getUsers() {
  const database = initDatabase();
  return database.prepare("SELECT * FROM users ORDER BY createdAt ASC").all();
}

function findUserById(id) {
  const database = initDatabase();
  return database.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").get(String(id)) || null;
}

function findUserByEmail(email) {
  const database = initDatabase();
  return database.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1").get(String(email)) || null;
}

function saveUser(user) {
  const database = initDatabase();
  database.prepare(`
    INSERT INTO users (id, name, email, phone, passwordSalt, passwordHash, googleSub, picture, emailVerified, verificationCode, createdAt, lastLoginAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      email=excluded.email,
      phone=excluded.phone,
      passwordSalt=excluded.passwordSalt,
      passwordHash=excluded.passwordHash,
      googleSub=excluded.googleSub,
      picture=excluded.picture,
      emailVerified=excluded.emailVerified,
      verificationCode=excluded.verificationCode,
      createdAt=excluded.createdAt,
      lastLoginAt=excluded.lastLoginAt
  `).run(
    user.id, user.name, user.email, user.phone || '',
    user.passwordSalt || '', user.passwordHash || '',
    user.googleSub || '', user.picture || '',
    user.emailVerified ? 1 : 0, user.verificationCode || '',
    user.createdAt || new Date().toISOString(),
    user.lastLoginAt || new Date().toISOString()
  );
  return findUserById(user.id);
}

// --- BID INTENTS FUNCTIONS ---
function getBidIntents() {
  const database = initDatabase();
  return database.prepare("SELECT * FROM bid_intents ORDER BY createdAt DESC").all();
}

function saveBidIntent(intent) {
  const database = initDatabase();
  database.prepare(`
    INSERT INTO bid_intents (id, userId, userEmail, lot, vin, maxBid, vehicle, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      maxBid=excluded.maxBid,
      createdAt=excluded.createdAt
  `).run(
    intent.id, intent.userId, intent.userEmail,
    intent.lot, intent.vin, intent.maxBid,
    intent.vehicle, intent.createdAt || new Date().toISOString()
  );
  return intent;
}

// --- KOMMO SYNC FUNCTIONS ---
function getSyncRecord(apvUserId, lot) {
  const database = initDatabase();
  const key = `${apvUserId}:${lot}`;
  const row = database.prepare("SELECT * FROM kommo_sync WHERE key = ? LIMIT 1").get(key);
  if (!row) return null;
  return {
    apvUserId: row.apvUserId,
    lot: row.lot,
    chatKey: row.chatKey,
    incomingLeadUid: row.incomingLeadUid,
    leadId: row.leadId ? Number(row.leadId) : null,
    contactId: row.contactId ? Number(row.contactId) : null,
    syncedAt: row.syncedAt
  };
}

function saveSyncRecord(record) {
  const database = initDatabase();
  const key = `${record.apvUserId}:${record.lot}`;
  const nowIso = new Date().toISOString();
  database.prepare(`
    INSERT INTO kommo_sync (key, apvUserId, lot, chatKey, incomingLeadUid, leadId, contactId, syncedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      chatKey=excluded.chatKey,
      incomingLeadUid=excluded.incomingLeadUid,
      leadId=excluded.leadId,
      contactId=excluded.contactId,
      syncedAt=excluded.syncedAt
  `).run(
    key, record.apvUserId, record.lot, record.chatKey || '',
    record.incomingLeadUid || null, record.leadId || null, record.contactId || null, nowIso
  );
}

function getUserSyncRecords(apvUserId) {
  const database = initDatabase();
  const rows = database.prepare("SELECT * FROM kommo_sync WHERE apvUserId = ?").all(String(apvUserId));
  return rows.map(row => ({
    apvUserId: row.apvUserId,
    lot: row.lot,
    chatKey: row.chatKey,
    incomingLeadUid: row.incomingLeadUid,
    leadId: row.leadId ? Number(row.leadId) : null,
    contactId: row.contactId ? Number(row.contactId) : null,
    syncedAt: row.syncedAt
  }));
}

function clearUserSyncRecords(apvUserId) {
  const database = initDatabase();
  database.prepare("DELETE FROM kommo_sync WHERE apvUserId = ?").run(String(apvUserId));
}

function deleteUserSyncRecord(apvUserId, lot) {
  const database = initDatabase();
  const key = `${apvUserId}:${lot}`;
  database.prepare("DELETE FROM kommo_sync WHERE key = ?").run(key);
}

function clearVehicles() {
  const database = initDatabase();
  database.exec("DELETE FROM vehicles;");
  database.exec("DELETE FROM catalog_meta WHERE key = 'updatedAt';");
  lastUpdatedAt = null;
  invalidateCatalogCaches();
  database.exec("DELETE FROM catalog_meta WHERE key = 'sourceHash'");
  console.log("[CATALOG DB] All vehicles cleared from SQLite database.");
}

module.exports = {
  initDatabase,
  repairCatalogFromCsv,
  getFavorites,
  setFavorite,
  pruneExpired,
  parseCsv,
  saleTimestamp,
  upsertCatalogFromCsv,
  clearVehicles,
  queryVehicles,
  getFeaturedVehicles,
  getFilterMetadata,
  findVehicleByLotOrId,
  getRawRecordByLot,
  getVehicleCount,
  getUpdatedAt,
  getUsers,
  findUserById,
  findUserByEmail,
  saveUser,
  getBidIntents,
  saveBidIntent,
  getSyncRecord,
  saveSyncRecord,
  getUserSyncRecords,
  clearUserSyncRecords,
  deleteUserSyncRecord
};
