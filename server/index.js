// Local offline print server for the POS app.
// Sends raw ESC/POS to the USB receipt printer (XPrinter XP-365) via libusb.
// The browser app calls these endpoints over http://localhost:3001 — no QZ
// Tray, no WebSocket, no certificate/mixed-content issues.

const express = require('express');
const cors = require('cors');
const { buildReceipt, buildDrinkTicket, buildLabelBytes, sendToPrinter, isPrinterConnected, getOsPrinterNames } = require('./printer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    const dir = path.join(__dirname, 'uploads', 'cds');
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
    const dir = path.join(__dirname, 'uploads', 'cds');
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
    const filepath = path.join(__dirname, 'uploads', 'cds', filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Local print server listening on http://localhost:${PORT}`);
});