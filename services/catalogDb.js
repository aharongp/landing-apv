const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
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

  const metaRow = db.prepare("SELECT value FROM catalog_meta WHERE key = 'updatedAt'").get();
  if (metaRow && metaRow.value) {
    lastUpdatedAt = metaRow.value;
  }

  // --- AUTOMATED DATA MIGRATIONS FROM LEGACY JSON FILES ---
  const usersJsonPath = path.join(DATA_DIR, 'users.json');
  if (fs.existsSync(usersJsonPath)) {
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
  if (fs.existsSync(kommoSyncPath)) {
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
      if (c === '"') {
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
  const make = str(raw['Make']);
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
    runsDrives: str(raw['Runs/Drives']),
    buyNow: num(raw['Buy-It-Now Price']),
    currentBid: num(raw['High Bid =non-vix,Sealed=Vix']),
    retailValue: num(raw['Est. Retail Value']),
    repairCost: num(raw['Repair cost']),
    saleDate: str(raw['Sale Date M/D/CY']),
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

function upsertCatalogFromCsv(csvText) {
  const database = initDatabase();
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('El CSV no contiene filas de datos válidas.');

  const headers = rows[0].map(h => str(h));
  const required = ['Lot number', 'Year', 'Make', 'VIN', 'Image Thumbnail'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(', ')}`);

  const nowIso = new Date().toISOString();
  let addedCount = 0;
  let updatedCount = 0;

  const countBefore = database.prepare("SELECT COUNT(*) as count FROM vehicles").get().count;

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
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      if (!cells || cells.length < 5) continue;
      const raw = {};
      headers.forEach((h, idx) => { if (h) raw[h] = cells[idx] ?? ''; });
      const rec = normalizeRecord(raw);
      if (!rec.lot || !rec.year) continue;

      upsertStmt.run(
        rec.lot, rec.id, rec.year, rec.make, rec.model, rec.title, rec.vin, rec.odometer,
        rec.locationCity, rec.locationState, rec.primaryDamage, rec.secondaryDamage, rec.runsDrives,
        rec.buyNow, rec.currentBid, rec.retailValue, rec.repairCost, rec.saleDate, rec.saleTime, rec.timeZone,
        rec.hasKeys, rec.color, rec.engine, rec.drive, rec.transmission, rec.fuel, rec.cylinders,
        rec.itemNumber, rec.yardName, rec.saleTitleState, rec.saleTitleType, rec.lotCondCode, rec.odometerBrand,
        rec.specialNote, rec.gridRow, rec.trim, rec.sellerName, rec.saleStatus, rec.imageThumbnail, rec.imageUrl, rec.rawJson, nowIso
      );
    }
    database.exec('COMMIT');
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }

  const countAfter = database.prepare("SELECT COUNT(*) as count FROM vehicles").get().count;
  addedCount = Math.max(0, countAfter - countBefore);
  updatedCount = (rows.length - 1) - addedCount;

  lastUpdatedAt = nowIso;
  database.prepare("INSERT INTO catalog_meta (key, value) VALUES ('updatedAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(nowIso);

  console.log(`[CATALOG DB] Upsert complete. Added: ${addedCount}, Total in DB: ${countAfter}, Updated: ${updatedCount}`);
  return {
    totalInCsv: rows.length - 1,
    added: addedCount,
    totalInDb: countAfter,
    updatedAt: nowIso
  };
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
    saleDate: str(row.saleDate),
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
    rawJson: row.rawJson ? JSON.parse(row.rawJson) : {}
  };
}

function queryVehicles(params = {}) {
  const database = initDatabase();

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

  if (q) {
    whereClauses.push("(LOWER(title) LIKE ? OR LOWER(lot) LIKE ? OR LOWER(vin) LIKE ? OR LOWER(make) LIKE ? OR LOWER(model) LIKE ? OR LOWER(locationCity) LIKE ? OR LOWER(locationState) LIKE ?)");
    const searchTerm = `%${q}%`;
    bindings.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
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

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) as total FROM vehicles ${whereSql}`;
  const totalRow = database.prepare(countSql).get(...bindings);
  const total = totalRow ? totalRow.total : 0;

  const sortSqlMap = {
    saleSoon: "saleDate ASC, year DESC",
    newest: "year DESC",
    oldest: "year ASC",
    priceAsc: "COALESCE(NULLIF(buyNow, 0), NULLIF(currentBid, 0), retailValue) ASC",
    priceDesc: "COALESCE(NULLIF(buyNow, 0), NULLIF(currentBid, 0), retailValue) DESC",
    odometerAsc: "odometer ASC"
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

  return {
    total,
    makes: makesRows.map(r => r.make),
    states: cleanStates,
    damages: damageRows.map(r => r.primaryDamage),
    runStates: runRows.map(r => r.runsDrives),
    minYear: statsRow.minYear || 1990,
    maxYear: statsRow.maxYear || new Date().getFullYear(),
    maxOdometer: statsRow.maxOdometer || 250000,
    maxPrice: statsRow.maxPrice || 100000,
    updatedAt: lastUpdatedAt
  };
}

function findVehicleByLotOrId(id) {
  const database = initDatabase();
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
  console.log("[CATALOG DB] All vehicles cleared from SQLite database.");
}

module.exports = {
  initDatabase,
  upsertCatalogFromCsv,
  clearVehicles,
  queryVehicles,
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
