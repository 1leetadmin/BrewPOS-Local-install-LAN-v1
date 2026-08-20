// Local offline print server for the POS app.
// Sends raw ESC/POS to the USB receipt printer (XPrinter XP-365) via libusb.
// The browser app calls these endpoints over http://localhost:3001 — no QZ
// Tray, no WebSocket, no certificate/mixed-content issues.

const express = require('express');
const cors = require('cors');
const { buildReceipt, buildDrinkTicket, buildLabelBytes, sendToPrinter, isPrinterConnected, getOsPrinterNames } = require('./printer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const LocalDB = require('./local-db');
const LocalAuth = require('./local-auth');
const LocalUploads = require('./local-uploads');
const CacheFallback = require('./local-cache-fallback');
const LocalLicense = require('./local-license');
const { DATA_ROOT } = require('./data-root');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
// Served from DATA_ROOT (a stable per-machine folder), NOT __dirname —
// __dirname lives inside the app's install folder, which gets replaced on
// every reinstall/update. Uploaded photos and CDS media must survive that.
app.use('/uploads', express.static(path.join(DATA_ROOT, 'uploads')));

function getToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// ============================================================================
// License gate — checked by electron/main.cjs before it decides whether to
// show the app or the "enter your license key" screen. Fully offline;
// see server/local-license.js for how keys are verified.
// ============================================================================

// ============================================================================
// Renderer-side debug logging — lets the browser-side code (which can't
// write files directly) append to the same bluetooth-debug.log the main
// process writes to, so a single file shows the whole picture end to end.
// ============================================================================

app.post('/api/debug-log', (req, res) => {
  try {
    const { message } = req.body || {};
    const logPath = path.join(DATA_ROOT, 'bluetooth-debug.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [renderer] ${message}\n`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Network info — lets Settings show the actual URLs to type into other
// devices on the same WiFi (the KDS staff tablet, the order-ready customer
// screen), instead of Peter needing to hunt down this PC's IP address
// manually via Windows network settings.
// ============================================================================

const archiver = require('archiver');

// ============================================================================
// Backup export — bundles selected categories of local data into a
// downloadable zip. Deliberately local-file-only: this app has zero
// internet dependency by design, so this is the one backup method
// guaranteed to work every time, anywhere, regardless of connectivity.
// Excludes admin credentials, the license file, and Bluetooth pairing
// data — none of that is meaningful to back up (security-sensitive or
// tied to this specific PC).
// ============================================================================

const BACKUP_CATEGORIES = {
  core: ['MenuItem', 'ModifierPreset', 'Discount', 'MenuPageLayout', 'Ingredient', 'StoreSettings'],
  staff: ['StaffUser'],
  transactions: ['Order', 'OrderItem', 'IngredientTransaction', 'TimeEntry', 'Event'],
};

app.get('/api/backup/export', (req, res) => {
  try {
    const selected = String(req.query.categories || '').split(',').filter(Boolean);
    const entityNames = selected.flatMap((c) => BACKUP_CATEGORIES[c] || []);
    if (entityNames.length === 0) {
      return res.status(400).json({ error: 'No valid backup categories selected' });
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="BrewPOS-Backup-${dateStr}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[backup] archive error:', err.message);
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);

    archive.append(
      JSON.stringify({
        exported_at: new Date().toISOString(),
        categories: selected,
        entities: entityNames,
      }, null, 2),
      { name: 'backup-manifest.json' }
    );

    for (const name of entityNames) {
      const records = LocalDB.list(name);
      archive.append(JSON.stringify(records, null, 2), { name: `entities/${name}.json` });
    }

    // Core also bundles the actual uploaded photo files (menu items,
    // staff, CDS media) — a data-only backup would otherwise restore to
    // broken image links.
    if (selected.includes('core')) {
      const uploadsDir = path.join(DATA_ROOT, 'uploads', 'files');
      if (fs.existsSync(uploadsDir)) {
        archive.directory(uploadsDir, 'uploads');
      }
    }

    archive.finalize();
  } catch (err) {
    console.error('[backup] export failed:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// Restore from a backup zip (see /api/backup/export above) — for setting
// a fresh install back to a known state after a hardware failure/
// reinstall. Replaces whichever entity files are present in the zip
// wholesale (this is a disaster-recovery restore, not a merge — a fresh
// install has nothing to merge with anyway) and restores any bundled
// uploaded photos. Entities not present in the backup (e.g. importing a
// staff-only backup) are left untouched.
app.post('/api/backup/import', express.raw({ type: 'application/zip', limit: '200mb' }), (req, res) => {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(req.body);
    const entries = zip.getEntries();

    const restored = { entities: [], uploads: 0 };

    for (const entry of entries) {
      if (entry.entryName.startsWith('entities/') && entry.entryName.endsWith('.json')) {
        const entityName = entry.entryName.slice('entities/'.length, -'.json'.length);
        try {
          const records = JSON.parse(entry.getData().toString('utf8'));
          if (Array.isArray(records)) {
            LocalDB.seed(entityName, records);
            restored.entities.push({ name: entityName, count: records.length });
          }
        } catch (parseErr) {
          console.warn(`[backup] Skipping ${entry.entryName}: ${parseErr.message}`);
        }
      } else if (entry.entryName.startsWith('uploads/') && !entry.isDirectory) {
        const filename = entry.entryName.slice('uploads/'.length);
        const destDir = path.join(DATA_ROOT, 'uploads', 'files');
        fs.mkdirSync(destDir, { recursive: true });
        fs.writeFileSync(path.join(destDir, filename), entry.getData());
        restored.uploads++;
      }
    }

    if (restored.entities.length === 0 && restored.uploads === 0) {
      return res.status(400).json({ error: 'No recognizable backup data found in this file — is it a BrewPOS backup zip?' });
    }

    res.json({ success: true, restored });
  } catch (err) {
    console.error('[backup] import failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/network-info', (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(iface.address);
        }
      }
    }
    res.json({ addresses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/license/status', async (req, res) => {
  try {
    res.json(await LocalLicense.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/license/activate', async (req, res) => {
  try {
    const { key } = req.body || {};
    res.json(await LocalLicense.activate(key || ''));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// Local auth — replaces Base44 email/password + Google login entirely.
// ============================================================================

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    const result = LocalAuth.login(email || '', password || '');
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message || 'Login failed' });
  }
});

app.get('/api/auth/me', (req, res) => {
  try {
    const user = LocalAuth.me(getToken(req));
    res.json(user);
  } catch (err) {
    res.status(401).json({ error: err.message || 'Not authenticated' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.json(LocalAuth.logout(getToken(req)));
});

app.post('/api/auth/change-password', (req, res) => {
  try {
    const { newPassword } = req.body || {};
    res.json(LocalAuth.changePassword(getToken(req), newPassword || ''));
  } catch (err) {
    res.status(401).json({ error: err.message || 'Could not change password' });
  }
});

// ============================================================================
// Local entities — generic CRUD backing every base44.entities.<Name> call.
// Mirrors the shape the app already expects (list/filter/create/update/
// bulkCreate/bulkUpdate/delete) so the frontend needs zero changes beyond
// swapping the client (see src/api/base44Client.js).
// ============================================================================

app.get('/api/entities/:entity', (req, res) => {
  try {
    const { entity } = req.params;
    const { sort, limit, skip, query } = req.query;
    const parsedQuery = query ? JSON.parse(query) : undefined;
    const opts = { sort, limit: limit ? Number(limit) : undefined, skip: skip ? Number(skip) : undefined };
    const records = parsedQuery ? LocalDB.filter(entity, parsedQuery, opts) : LocalDB.list(entity, opts);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/entities/:entity', (req, res) => {
  try {
    const { entity } = req.params;
    if (Array.isArray(req.body)) {
      res.json(LocalDB.bulkCreate(entity, req.body));
    } else {
      res.json(LocalDB.create(entity, req.body || {}));
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/entities/:entity/bulk', (req, res) => {
  try {
    const { entity } = req.params;
    res.json(LocalDB.bulkUpdate(entity, req.body || []));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/entities/:entity/:id', (req, res) => {
  try {
    const { entity, id } = req.params;
    res.json(LocalDB.update(entity, id, req.body || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/entities/:entity/:id', (req, res) => {
  try {
    const { entity, id } = req.params;
    res.json(LocalDB.delete(entity, id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Local implementation of the Base44 "customerDisplay" function — pure local
// data (StoreSettings), reshaped exactly like the Base44 version did. Unlike
// smartconnect (real EFTPOS hardware/internet), this never needed the
// internet in the first place — it was only reachable through Base44's
// cloud because that's where the app used to run. This is the local
// equivalent, reading straight from the local database instead.
// ============================================================================

app.get('/api/functions/customerDisplay', (req, res) => {
  try {
    const list = LocalDB.list('StoreSettings');
    const s = list[0] || {};
    res.json({
      store_name: s.store_name || 'Our Store',
      receipt_footer: s.receipt_footer || '',
      currency_symbol: s.currency_symbol || '$',
      display_state: s.display_state || 'idle',
      active_cart: Array.isArray(s.active_cart) ? s.active_cart : [],
      active_order_number: s.active_order_number || '',
      active_total: Number(s.active_total) || 0,
      theme: s.theme || null,
      cds_config: s.cds_config || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Local file uploads — replaces Base44's UploadFile integration for photos
// (menu items, staff, customer-display slides).
// ============================================================================

app.post('/api/uploads', express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
  try {
    const filename = req.query.filename || 'upload';
    const result = LocalUploads.save(req.body, filename, PORT);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Internet-only features (AI image gen, AI file import, EFTPOS): local cache
// checked first; only falls back to a real network call on a cache miss.
// These currently return a clear "needs internet" response since there is no
// online counterpart wired up in the local build yet — cached results (once
// any exist) are served instantly with no network involved.
// ============================================================================

app.post('/api/ai/generate-image', async (req, res) => {
  try {
    const result = await CacheFallback.run('generate-image', req.body, async () => {
      throw new Error('No internet connection available for AI image generation.');
    });
    res.json(result);
  } catch (err) {
    res.status(503).json({ error: err.message, offline: true });
  }
});

app.post('/api/ai/invoke-llm', async (req, res) => {
  try {
    const result = await CacheFallback.run('invoke-llm', req.body, async () => {
      throw new Error('No internet connection available for AI processing.');
    });
    res.json(result);
  } catch (err) {
    res.status(503).json({ error: err.message, offline: true });
  }
});

app.post('/api/ai/extract-file', async (req, res) => {
  try {
    const result = await CacheFallback.run('extract-file', req.body, async () => {
      throw new Error('No internet connection available for AI file import.');
    });
    res.json(result);
  } catch (err) {
    res.status(503).json({ error: err.message, offline: true });
  }
});

// Print a receipt. Body: { order, orderItems, settings }.
app.post('/api/print-receipt', async (req, res) => {
  try {
    const { order, orderItems, settings, qrEscposData } = req.body || {};
    if (!order) return res.json({ success: false, error: 'Missing order data' });
    const escpos = buildReceipt(order, orderItems || [], settings || {}, qrEscposData || '');
    const printer = settings?.receipt_printer || {};
    let fullEscpos = escpos;
    if (settings?.receipt_printer?.print_drink_ticket) {
      fullEscpos += buildDrinkTicket(order, orderItems || [], settings || {});
    }
    await sendToPrinter(Buffer.from(fullEscpos, 'latin1'), printer);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message || 'Print failed' });
  }
});

// Print one or more drink labels to a single printer. Body:
// { printer, jobs: [{ item, labelIndex }], orderNumber, labelTotal }.
// Prints jobs in order, waiting for each label's gap-feed motor to settle
// before sending the next — same pacing as the previous Bluetooth path.
const LABEL_GAP_FEED_WAIT_MS = 1500;

app.post('/api/print-label', async (req, res) => {
  try {
    const { printer, jobs, orderNumber, labelTotal, qrText } = req.body || {};
    if (!printer) return res.json({ success: false, error: 'Missing printer config' });
    if (!Array.isArray(jobs) || jobs.length === 0) return res.json({ success: false, error: 'No label jobs to print' });

    let printed = 0;
    for (const job of jobs) {
      const bytes = buildLabelBytes({
        item: job.item,
        orderNumber,
        labelIndex: job.labelIndex,
        labelTotal: labelTotal || jobs.length,
        printer,
        qrText,
      });
      await sendToPrinter(Buffer.from(bytes), printer);
      printed++;
      if (printed < jobs.length) {
        await new Promise((r) => setTimeout(r, LABEL_GAP_FEED_WAIT_MS));
      }
    }
    res.json({ success: true, printed });
  } catch (err) {
    res.json({ success: false, error: err.message || 'Label print failed' });
  }
});

// Is the configured printer connected/reachable? Query params: name,
// connection_type, lan_address (or just `name` for the legacy USB-only form).
app.get('/api/printer-status', async (req, res) => {
  const { name, os_printer_name, connection_type, lan_address } = req.query;
  const printer = { name, os_printer_name, connection_type, lan_address };
  const connected = await isPrinterConnected(printer);
  res.json({ connected });
});

// All named OS printers (Printers & Scanners) — covers USB-installed and
// LAN printers that have been installed as a Windows printer.
app.get('/api/printer-list', (req, res) => {
  try {
    res.json({ printers: getOsPrinterNames() });
  } catch (err) {
    res.json({ printers: [], error: err.message });
  }
});

const PORT = process.env.PORT || 3001;

// --- CDS Media Library ---
// List all files in uploads/cds/
app.get('/api/cds-media', (req, res) => {
  try {
    const dir = path.join(DATA_ROOT, 'uploads', 'cds');
    if (!fs.existsSync(dir)) return res.json({ files: [] });
    const files = fs.readdirSync(dir)
      .filter(f => !f.startsWith('.'))
      .map(filename => ({
        filename,
        url: `http://localhost:${PORT}/uploads/cds/${encodeURIComponent(filename)}`,
      }));
    res.json({ files });
  } catch (err) {
    res.json({ files: [], error: err.message });
  }
});

// Upload a file to uploads/cds/ (raw binary body, filename in query)
app.post('/api/cds-media/upload', express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
  try {
    const filename = req.query.filename;
    if (!filename) return res.json({ success: false, error: 'Missing filename' });
    const dir = path.join(DATA_ROOT, 'uploads', 'cds');
    fs.mkdirSync(dir, { recursive: true });
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, req.body);
    res.json({ success: true, url: `http://localhost:${PORT}/uploads/cds/${encodeURIComponent(filename)}` });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Delete a file from uploads/cds/
app.delete('/api/cds-media', (req, res) => {
  try {
    const filename = req.query.filename;
    if (!filename) return res.json({ success: false, error: 'Missing filename' });
    const filepath = path.join(DATA_ROOT, 'uploads', 'cds', filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============================================================================
// One-time additive data migrations — run on every server startup, but each
// one checks for its own marker first so it only ever applies once per
// machine, even across many restarts. This is how new default data (like a
// new discount) reaches installs that were already running, since the
// first-run migration-seed only applies to brand-new installs.
//
// The whole block is skipped on a vanilla build — these add real business
// data, which has no place in a build meant to be a completely blank
// canvas for testing the new-customer first-run experience. Computed once
// here rather than checked inside each migration individually, so a future
// migration added to this file can't accidentally skip the check the way
// this one originally did.
// ============================================================================

const IS_VANILLA_BUILD = fs.existsSync(path.join(__dirname, 'VANILLA_BUILD'));

function ensureDefaultDiscounts() {
  const discounts = LocalDB.list('Discount');
  const hasTenDollarVoucher = discounts.some((d) => d.name === '$10 Off Voucher');
  if (!hasTenDollarVoucher) {
    LocalDB.create('Discount', {
      name: '$10 Off Voucher',
      discount_type: 'fixed_amount',
      fixed_amount: 10,
      percentage: 0,
      is_active: true,
      prepaid_amount: 0,
    });
    console.log('[migration] Added default discount: $10 Off Voucher');
  }
}

if (!IS_VANILLA_BUILD) {
  ensureDefaultDiscounts();
  // Add any future startup migrations here — they'll automatically be
  // skipped for vanilla builds along with this one.
} else {
  console.log('[migration] Vanilla build — skipping all default-data migrations');
}

app.listen(PORT, () => {
  console.log(`Local print server listening on http://localhost:${PORT}`);
});