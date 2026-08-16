// ============================================================================
// server/local-db.js
//
// A dependency-free local "database" for BrewPOS. Stores every entity as a
// plain JSON file under server/data/. No native modules (no SQLite, no
// better-sqlite3) so `npm install` never needs a C++ build toolchain — it
// just works on a fresh Windows PC.
//
// This is a PROTECTED file (see .gitattributes) — Base44 exports never
// touch it.
// ============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_ROOT } = require('./data-root');

const DATA_DIR = path.join(DATA_ROOT, 'entities');

function entityFile(entityName) {
  return path.join(DATA_DIR, `${entityName}.json`);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    bootstrapFromMigrationSeed();
  }
}

// First-ever launch on this machine: copy the Base44 data snapshot that was
// bundled into this build into the live local database. Only runs once —
// after that, DATA_DIR exists and this is skipped, so it never clobbers
// data you've since created or changed on this machine.
function bootstrapFromMigrationSeed() {
  const seedDir = path.join(__dirname, 'migration-seed');
  if (!fs.existsSync(seedDir)) return;
  const port = process.env.PORT || 3001;
  const uploadsBase = `http://localhost:${port}/uploads/files`;

  const files = fs.readdirSync(seedDir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    try {
      const src = path.join(seedDir, file);
      const dest = path.join(DATA_DIR, file);
      let contents = fs.readFileSync(src, 'utf8');
      contents = contents.split('{LOCAL_UPLOADS_BASE}').join(uploadsBase);
      fs.writeFileSync(dest, contents);
      console.log(`[local-db] Seeded ${file} from Base44 export`);
    } catch (err) {
      console.error(`[local-db] Could not seed ${file}:`, err.message);
    }
  }

  // Copy bundled photos (menu item images pulled from Base44 at build time)
  // into the same folder LocalUploads serves from, so the URLs above resolve.
  const seedUploadsDir = path.join(seedDir, 'uploads');
  if (fs.existsSync(seedUploadsDir)) {
    const destUploadsDir = path.join(DATA_ROOT_UPLOADS_FILES());
    fs.mkdirSync(destUploadsDir, { recursive: true });
    for (const imgFile of fs.readdirSync(seedUploadsDir)) {
      fs.copyFileSync(path.join(seedUploadsDir, imgFile), path.join(destUploadsDir, imgFile));
    }
    console.log(`[local-db] Seeded ${fs.readdirSync(seedUploadsDir).length} bundled photos`);
  }
}

function DATA_ROOT_UPLOADS_FILES() {
  // Mirrors server/local-uploads.js's UPLOADS_DIR without creating a circular
  // require — both derive from the same DATA_ROOT.
  return path.join(require('./data-root').DATA_ROOT, 'uploads', 'files');
}

function loadEntity(entityName) {
  ensureDataDir();
  const file = entityFile(entityName);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return raw.trim() ? JSON.parse(raw) : [];
  } catch (err) {
    console.error(`[local-db] Failed to read ${entityName}.json, treating as empty:`, err.message);
    return [];
  }
}

// Atomic-ish write: write to a temp file then rename, so a crash mid-write
// never corrupts the real file (important — this runs unattended at a café).
function saveEntity(entityName, records) {
  ensureDataDir();
  const file = entityFile(entityName);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

// Very small MongoDB-style query matcher — covers what BrewPOS actually uses
// ($gt, $gte, $lt, $lte, $ne, $in) plus plain equality.
function matchesQuery(record, query) {
  if (!query) return true;
  return Object.entries(query).every(([key, cond]) => {
    const val = record[key];
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
      return Object.entries(cond).every(([op, opVal]) => {
        switch (op) {
          case '$gt': return val > opVal;
          case '$gte': return val >= opVal;
          case '$lt': return val < opVal;
          case '$lte': return val <= opVal;
          case '$ne': return val !== opVal;
          case '$in': return Array.isArray(opVal) && opVal.includes(val);
          default: return true;
        }
      });
    }
    return val === cond;
  });
}

function applySort(records, sort) {
  if (!sort) return records;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return [...records].sort((a, b) => {
    if (a[field] < b[field]) return desc ? 1 : -1;
    if (a[field] > b[field]) return desc ? -1 : 1;
    return 0;
  });
}

const LocalDB = {
  list(entityName, { sort, limit, skip = 0 } = {}) {
    let records = loadEntity(entityName);
    records = applySort(records, sort);
    if (skip) records = records.slice(skip);
    if (limit) records = records.slice(0, limit);
    return records;
  },

  filter(entityName, query, { sort, limit, skip = 0 } = {}) {
    let records = loadEntity(entityName).filter((r) => matchesQuery(r, query));
    records = applySort(records, sort);
    if (skip) records = records.slice(skip);
    if (limit) records = records.slice(0, limit);
    return records;
  },

  create(entityName, data) {
    const records = loadEntity(entityName);
    const record = {
      id: data.id || newId(),
      ...data,
      created_date: data.created_date || nowIso(),
      updated_date: nowIso(),
    };
    records.push(record);
    saveEntity(entityName, records);
    return record;
  },

  bulkCreate(entityName, dataArray) {
    const records = loadEntity(entityName);
    const created = dataArray.map((data) => ({
      id: data.id || newId(),
      ...data,
      created_date: data.created_date || nowIso(),
      updated_date: nowIso(),
    }));
    saveEntity(entityName, [...records, ...created]);
    return created;
  },

  update(entityName, id, data) {
    const records = loadEntity(entityName);
    const idx = records.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`${entityName} record ${id} not found`);
    records[idx] = { ...records[idx], ...data, id, updated_date: nowIso() };
    saveEntity(entityName, records);
    return records[idx];
  },

  bulkUpdate(entityName, updates) {
    // updates: [{ id, data }, ...]
    const records = loadEntity(entityName);
    const byId = new Map(records.map((r) => [r.id, r]));
    for (const { id, data } of updates) {
      const existing = byId.get(id);
      if (existing) byId.set(id, { ...existing, ...data, id, updated_date: nowIso() });
    }
    const merged = [...byId.values()];
    saveEntity(entityName, merged);
    return merged;
  },

  delete(entityName, id) {
    const records = loadEntity(entityName);
    const filtered = records.filter((r) => r.id !== id);
    saveEntity(entityName, filtered);
    return { success: true };
  },

  // Used only by the one-time migration script to seed data pulled from Base44.
  seed(entityName, records) {
    saveEntity(entityName, records);
  },

  DATA_DIR,
};

module.exports = LocalDB;
