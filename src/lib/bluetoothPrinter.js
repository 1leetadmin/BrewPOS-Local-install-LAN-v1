/**
 * Bluetooth ESC/POS printer service for Eastroyce ER-5801 and compatible printers.
 * Uses Web Bluetooth API (Chrome on desktop/Android).
 *
 * Connection pool: multiple printers can be connected concurrently, each keyed by
 * its configured printer ID. The order-flow router groups items by printer ID and
 * sends each group to the matching connection via printOrderLabelsTo(printerId, ...).
 */

const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

const TX_CHAR_UUIDS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
  '0000ff02-0000-1000-8000-00805f9b34fb',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
];

import { sizeNameLine, buildModifierLines } from '@/lib/drinkLines';

// Best-effort debug logging to the local server, so a failure here shows up
// in the same %APPDATA%\BrewPOS Pilot\bluetooth-debug.log the main process
// writes to — useful since Web Bluetooth failures often happen before any
// error reaches the UI.
function debugLog(message) {
  try {
    fetch('http://localhost:3001/api/debug-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }).catch(() => {});
  } catch { /* best effort */ }
}

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];

// Persist paired BLE device names so we can auto-reconnect after a page refresh
// using navigator.bluetooth.getDevices() — without re-showing the picker.
const STORAGE_KEY = 'ble_printer_devices';
function loadStoredDevices() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveStoredDevice(printerId, name) {
  const stored = loadStoredDevices();
  stored[printerId] = name;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch {}
}

function escPos(commands) {
  return new Uint8Array(commands.flat(Infinity));
}

function textToBytes(str) {
  return Array.from(new TextEncoder().encode(str));
}

// ESC/POS QR code commands — generates a native QR code on the printer.
function buildQrEscPos(text, moduleSize = 4) {
  const dataBytes = textToBytes(text);
  const dataLen = dataBytes.length;
  const pL = (dataLen + 3) & 0xFF;
  const pH = ((dataLen + 3) >> 8) & 0xFF;
  return [
    0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, moduleSize,
    0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31,
    0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30, ...dataBytes,
    0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
}

class BluetoothPrinterService {
  constructor() {
    this.connections = {};        // printerId -> Connection
    this._listeners = [];
    this._lastPrinterId = null;   // for backward-compat single-connection getters
  }

  isSupported() {
    return 'bluetooth' in navigator;
  }

  onStatusChange(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  _emit(printerId, status, extra = {}) {
    this._listeners.forEach(fn => fn({ printerId, status, ...extra }));
  }

  // ---- Backward-compatible getters (reflect the most recently used connection) ----
  get isConnected() {
    return Object.values(this.connections).some(c => c.isConnected);
  }

  get device() {
    const c = this.connections[this._lastPrinterId];
    if (c?.device) return c.device;
    return Object.values(this.connections).find(c => c.device)?.device || null;
  }

  isConnectedTo(printerId) {
    const c = this.connections[printerId];
    return !!(c && c.isConnected);
  }

  getStatus(printerId) {
    const c = this.connections[printerId];
    if (!c) return 'disconnected';
    return c.isConnected ? 'connected' : (c.reconnecting ? 'reconnecting' : 'disconnected');
  }

  getDeviceName(printerId) {
    const c = this.connections[printerId];
    return c?.device?.name || '';
  }

  getReconnectAttempt(printerId) {
    return this.connections[printerId]?.reconnectAttempt || 0;
  }

  get canAutoReconnect() {
    return this.isSupported() && typeof navigator.bluetooth?.getDevices === 'function';
  }

  // ---- Connection management ----

  // Find the writable TX characteristic on a connected GATT server
  async _resolveCharacteristic(server) {
    let service = null;
    for (const uuid of PRINTER_SERVICE_UUIDS) {
      try { service = await server.getPrimaryService(uuid); break; } catch (_) {}
    }
    if (!service) {
      const services = await server.getPrimaryServices();
      service = services[0];
    }
    if (!service) throw new Error('No writable service found on printer');

    let char = null;
    for (const uuid of TX_CHAR_UUIDS) {
      try { char = await service.getCharacteristic(uuid); break; } catch (_) {}
    }
    if (!char) {
      const chars = await service.getCharacteristics();
      char = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
    }
    if (!char) throw new Error('No writable characteristic found on printer');
    return char;
  }

  _onDisconnected(printerId) {
    const c = this.connections[printerId];
    if (!c) return;
    c.isConnected = false;
    c.txCharacteristic = null;
    this._emit(printerId, 'disconnected');
    if (!c.userDisconnected) {
      this._scheduleReconnect(printerId);
    }
  }

  _scheduleReconnect(printerId) {
    const c = this.connections[printerId];
    if (!c) return;
    clearTimeout(c.reconnectTimer);
    const delay = RECONNECT_DELAYS[Math.min(c.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    c.reconnectAttempt++;
    c.reconnecting = true;
    this._emit(printerId, 'reconnecting', { attempt: c.reconnectAttempt });
    c.reconnectTimer = setTimeout(() => this._doReconnect(printerId), delay);
  }

  async _doReconnect(printerId) {
    const c = this.connections[printerId];
    if (!c || c.userDisconnected || !c.device) return;
    try {
      const server = await c.device.gatt.connect();
      const char = await this._resolveCharacteristic(server);
      c.server = server;
      c.txCharacteristic = char;
      c.isConnected = true;
      c.reconnecting = false;
      c.reconnectAttempt = 0;
      this._emit(printerId, 'connected');
    } catch (_) {
      if (!c.userDisconnected) this._scheduleReconnect(printerId);
    }
  }

  async requestDevice() {
    debugLog(`requestDevice() called — 'bluetooth' in navigator: ${'bluetooth' in navigator}`);
    if (!this.isSupported()) throw new Error('Web Bluetooth is not supported. Use Chrome.');
    debugLog('calling navigator.bluetooth.requestDevice() with acceptAllDevices...');
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PRINTER_SERVICE_UUIDS,
      });
      debugLog(`requestDevice() resolved: ${device?.name || device?.id || 'unnamed device'}`);
      return device;
    } catch (err) {
      debugLog(`acceptAllDevices attempt rejected: ${err.name}: ${err.message} — retrying with explicit service filters...`);
      // Some Electron versions have reported issues with the chooser UI
      // specifically when acceptAllDevices is used. Filters is a real,
      // different code path in Chromium's implementation — worth trying
      // as a distinct attempt, not just a retry of the same thing.
      try {
        const device = await navigator.bluetooth.requestDevice({
          filters: PRINTER_SERVICE_UUIDS.map((uuid) => ({ services: [uuid] })),
          optionalServices: PRINTER_SERVICE_UUIDS,
        });
        debugLog(`filters attempt resolved: ${device?.name || device?.id || 'unnamed device'}`);
        return device;
      } catch (err2) {
        debugLog(`filters attempt also rejected: ${err2.name}: ${err2.message}`);
        throw err2;
      }
    }
  }

  async connectDevice(printerId, device) {
    const existing = this.connections[printerId];
    if (existing) {
      existing.userDisconnected = false;
      existing.reconnectAttempt = 0;
      clearTimeout(existing.reconnectTimer);
    }

    const c = existing || {
      device: null,
      server: null,
      txCharacteristic: null,
      isConnected: false,
      userDisconnected: false,
      reconnectTimer: null,
      reconnectAttempt: 0,
      reconnecting: false,
    };
    c.device = device;
    c.deviceName = device.name;
    c.userDisconnected = false;
    c.reconnectAttempt = 0;
    c.reconnecting = false;
    clearTimeout(c.reconnectTimer);
    saveStoredDevice(printerId, device.name);

    if (!c._listenerBound) {
      device.addEventListener('gattserverdisconnected', () => this._onDisconnected(printerId));
      c._listenerBound = true;
    }

    this.connections[printerId] = c;
    this._lastPrinterId = printerId;

    c.server = await device.gatt.connect();
    c.txCharacteristic = await this._resolveCharacteristic(c.server);
    c.isConnected = true;
    this._emit(printerId, 'connected');
    return device.name || 'Printer';
  }

  async connect(printerId = '__legacy__') {
    const device = await this.requestDevice();
    return this.connectDevice(printerId, device);
  }

  /**
   * Smart connect: if this printerId was previously paired (stored in
   * localStorage), reconnect silently via getDevices() without showing the
   * device picker. Only falls back to requestDevice() (picker) when no
   * previously paired device is found.
   */
  async connectSmart(printerId = '__legacy__') {
    const existing = this.connections[printerId];
    if (existing?.isConnected) {
      return this.getDeviceName(printerId) || 'Printer';
    }

    if (this.canAutoReconnect) {
      const stored = loadStoredDevices();
      const storedName = stored[printerId];
      if (storedName) {
        try {
          const devices = await navigator.bluetooth.getDevices();
          const device = devices.find(d => d.name === storedName);
          if (device) {
            return await this.connectDevice(printerId, device);
          }
        } catch (_) {}
      }
    }

    const device = await this.requestDevice();
    return this.connectDevice(printerId, device);
  }

  async disconnect(printerId) {
    if (printerId === undefined) {
      // disconnect all
      for (const id of Object.keys(this.connections)) {
        await this.disconnect(id);
      }
      return;
    }
    const c = this.connections[printerId];
    if (!c) return;
    c.userDisconnected = true;
    clearTimeout(c.reconnectTimer);
    c.reconnectAttempt = 0;
    c.reconnecting = false;
    if (c.device?.gatt?.connected) c.device.gatt.disconnect();
    c.isConnected = false;
    this._emit(printerId, 'disconnected');
  }

  /**
   * Reconnect to all previously paired BLE printers without showing the device
   * picker. Uses navigator.bluetooth.getDevices() (Chrome 85+) to find devices
   * the user has already granted access to, matched by stored device name.
   * Returns { reconnected, unsupported }.
   */
  async reconnectAll(printers) {
    if (!this.canAutoReconnect) return { reconnected: 0, unsupported: true };
    const stored = loadStoredDevices();
    let count = 0;
    try {
      const devices = await navigator.bluetooth.getDevices();
      for (const p of printers) {
        if (p.connection_type && p.connection_type !== 'bluetooth') continue;
        const existing = this.connections[p.id];
        if (existing?.isConnected) { count++; continue; }
        const storedName = stored[p.id];
        if (!storedName) continue;
        const device = devices.find(d => d.name === storedName);
        if (!device) continue;

        const c = existing || {
          device: null, server: null, txCharacteristic: null,
          isConnected: false, userDisconnected: false,
          reconnectTimer: null, reconnectAttempt: 0, reconnecting: false,
        };
        c.device = device;
        c.deviceName = device.name;
        c.userDisconnected = false;
        if (!c._listenerBound) {
          device.addEventListener('gattserverdisconnected', () => this._onDisconnected(p.id));
          c._listenerBound = true;
        }
        this.connections[p.id] = c;
        this._lastPrinterId = p.id;
        try {
          c.server = await device.gatt.connect();
          c.txCharacteristic = await this._resolveCharacteristic(c.server);
          c.isConnected = true;
          c.reconnecting = false;
          c.reconnectAttempt = 0;
          this._emit(p.id, 'connected');
          count++;
        } catch (_) {
          this._scheduleReconnect(p.id);
        }
      }
    } catch (_) {}
    return { reconnected: count };
  }

  async _writeTo(printerId, data) {
    const c = this.connections[printerId];
    if (!c?.txCharacteristic) throw new Error('Printer not connected');
    const CHUNK = 512;
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, i + CHUNK);
      try {
        await c.txCharacteristic.writeValueWithoutResponse(chunk);
      } catch (_) {
        await c.txCharacteristic.writeValue(chunk);
      }
      await new Promise(r => setTimeout(r, 20));
    }
  }

  async printDrinkLabel({ item, orderNumber, printer }) {
    const printerId = printer?.id || this._lastPrinterId || '__legacy__';
    const bytes = this._buildLabelBytes({ item, orderNumber, labelIndex: 1, labelTotal: 1, printer });
    await this._writeTo(printerId, new Uint8Array(bytes));
  }

  _buildLabelBytes({ item, orderNumber, labelIndex, labelTotal, printer, qrText = '' }) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    // 203 dpi: 8 dots per mm. ESC/POS line spacing is set in dots (ESC 0x33 n).
    const DOT_MM        = 8;
    const PITCH_DEFAULT = 24;  // ~3mm per line feed (matches the previous fixed value)
    const PITCH_MIN     = 16;  // floor: normal-font char height — lines touch, no overlap
    const CHAR_MM_NORMAL = 1.5;
    const CHAR_MM_WIDE   = 3.0;

    const widthMm      = Number(printer.width_mm)  || 50;
    const heightMm     = Number(printer.height_mm) || 30;
    const paddingMm    = Number(printer.padding_mm) || 1.5;
    const printableWmm = Math.max(10, widthMm - paddingMm * 2);

    // QR code sizing — fit to label dimensions
    const QR_MODULE_COUNT = 25;
    const qrTargetMm = Math.min(widthMm * 0.8, heightMm * 0.8);
    const qrModuleSize = qrText ? Math.max(2, Math.min(16, Math.floor(qrTargetMm * DOT_MM / QR_MODULE_COUNT))) : 0;
    const qrHeightDots = qrText ? qrModuleSize * QR_MODULE_COUNT : 0;

    const setAlign = (align) =>
      align === 'center' ? [ESC, 0x61, 0x01]
      : align === 'right' ? [ESC, 0x61, 0x02]
      : [ESC, 0x61, 0x00];

    const setBold = (on) => [ESC, 0x45, on ? 0x01 : 0x00];

    // ESC/POS fonts are discrete (normal / double-height / double-width+height),
    // not continuously scalable. When content overflows height_mm, this steps
    // down one level at a time — full sizes, then double-height fields capped
    // at medium, then everything at the smallest mode with compressed line
    // pitch — rather than jumping straight from full size to smallest.
    const modeCmd = (pt, demoteLevel) => {
      if (demoteLevel >= 2) return [ESC, 0x21, 0x00];
      if (demoteLevel === 1) {
        if (pt >= 9) return [ESC, 0x21, 0x10];
        return [ESC, 0x21, 0x00];
      }
      if (pt >= 12) return [ESC, 0x21, 0x30];
      if (pt >= 9)  return [ESC, 0x21, 0x10];
      return [ESC, 0x21, 0x00];
    };
    const charMmFor = (pt, demoteLevel) => (demoteLevel >= 1 || pt < 12) ? CHAR_MM_NORMAL : CHAR_MM_WIDE;

    const wrapText = (text, charsPerLine) => {
      if (!text || charsPerLine <= 0) return text ? [text] : [];
      const words = text.split(' ');
      const lines = [];
      let current = '';
      for (const word of words) {
        if (current.length === 0) {
          current = word.slice(0, charsPerLine);
        } else if (current.length + 1 + word.length <= charsPerLine) {
          current += ' ' + word;
        } else {
          lines.push(current);
          current = word.slice(0, charsPerLine);
        }
      }
      if (current) lines.push(current);
      return lines.length ? lines : [''];
    };

    const printLine = (text, field, demoteLevel) => {
      if (!text) return [];
      const pt = Number(field.font_size_pt) || 7;
      const cmd = modeCmd(pt, demoteLevel);
      const charMm = charMmFor(pt, demoteLevel);
      const charsPerLine = Math.floor(printableWmm / charMm);
      const wrappedLines = wrapText(text, charsPerLine);
      const cmds = [];
      for (const line of wrappedLines) {
        cmds.push(
          ...setAlign(field.align || 'left'),
          ...cmd,
          ...setBold(field.bold),
          ...textToBytes(line),
          ...setBold(false),
          ESC, 0x21, 0x00,
          LF,
        );
      }
      return cmds;
    };

    // Returns string for most fields, array of strings for 'modifiers'
    const getContent = (key) => {
      switch (key) {
        case 'order_number': return `#${orderNumber}`;
        case 'time':         return timeStr;
        case 'size':
          // Size is merged into item_name (Line 1).
          return '';
        case 'item_name':
          return sizeNameLine(item);
        case 'modifiers': {
          return buildModifierLines(item);
        }
        case 'comments': {
          const c = item.notes || (item.modifiers || []).find(m => m.name === 'Comments')?.option;
          return c ? `* ${c}` : '';
        }
        case 'label_count': return `${labelIndex} / ${labelTotal}`;
        case 'qr_code':      return qrText || '';
        default: return '';
      }
    };

    const HEADER_KEYS = ['order_number', 'time'];
    const FOOTER_KEYS = ['label_count'];

    const fields = (printer.fields || []).filter(f => f.key !== 'customer');
    const visibleFields = fields
      .map(f => {
        if (f.key === 'label_count') return { ...f, visible: true };
        if (f.key === 'qr_code' && qrText) return { ...f, visible: true };
        return f;
      })
      .filter(f => f.visible !== false);

    const headerFields = visibleFields.filter(f => HEADER_KEYS.includes(f.key));
    const footerFields = visibleFields.filter(f => FOOTER_KEYS.includes(f.key));
    const bodyFields   = visibleFields.filter(f => !HEADER_KEYS.includes(f.key) && !FOOTER_KEYS.includes(f.key));

    // Count physical print lines (after wrapping) for a given demote setting.
    const measureLines = (fields, demote) => {
      let count = 0;
      for (const f of fields) {
        if (f.key === 'qr_code' && qrText) continue;
        const content = getContent(f.key);
        const lines = Array.isArray(content) ? content : (content ? [content] : []);
        const cpl = Math.floor(printableWmm / charMmFor(Number(f.font_size_pt) || 7, demote));
        for (const ln of lines) {
          const wrapped = wrapText(ln, cpl);
          count += wrapped.length || 1;
        }
      }
      return count;
    };

    // --- Fit-to-size ---
    // Measure total content height and compress only when it exceeds the
    // printable label area. When content already fits, behaviour is unchanged
    // (configured font modes + default 24-dot pitch). When it overflows, step
    // down one level at a time rather than jumping straight to smallest:
    //   1. cap double-height fields at medium mode AND tighten line spacing
    //      to a middle pitch — the pitch change matters because a mode/width
    //      change alone gives zero height relief for content that wasn't
    //      wrapping to begin with (the most common real overflow case)
    //   2. if still overflowing, demote every line to normal mode and
    //      reduce line-feed pitch (ESC 0x33) down to PITCH_MIN (16 dots),
    //      vertically centred via a leading dot feed (ESC J)
    const availableDots = Math.max(1, Math.round((heightMm - paddingMm * 2) * DOT_MM) - qrHeightDots);
    const PITCH_MID = Math.round((PITCH_DEFAULT + PITCH_MIN) / 2);
    let demote = 0;
    let pitch = PITCH_DEFAULT;
    let leadingDots = 0;
    if (measureLines(visibleFields, 0) * PITCH_DEFAULT > availableDots) {
      demote = 1;
      pitch = PITCH_MID;
      if (measureLines(visibleFields, 1) * PITCH_MID > availableDots) {
        demote = 2;
        const nLines = measureLines(visibleFields, 2);
        pitch = Math.max(PITCH_MIN, Math.floor(availableDots / Math.max(1, nLines)));
        leadingDots = Math.max(0, Math.floor((availableDots - nLines * pitch) / 2));
      }
    }

    const headerCmds = [];
    if (headerFields.length > 0) {
      // Render each header field independently on its own line
      for (const f of headerFields) {
        const content = getContent(f.key);
        if (content) headerCmds.push(...printLine(content, f, demote));
      }
    }

    const bodyCmds = bodyFields.flatMap(f => {
      if (f.key === 'qr_code' && qrText) {
        return [...setAlign('center'), ...buildQrEscPos(qrText, qrModuleSize)];
      }
      const content = getContent(f.key);
      if (Array.isArray(content)) {
        return content.flatMap(line => printLine(line, f, demote));
      }
      return printLine(content, f, demote);
    });
    const footerCmds = footerFields.flatMap(f => printLine(getContent(f.key), f, demote));

    // GS FF (0x1D 0x0C): feed media until the hardware gap sensor detects the next label boundary.
    const FF = 0x0C;

    const commands = escPos([
      [ESC, 0x40],
      [ESC, 0x33, pitch],
      leadingDots > 0 ? [ESC, 0x4A, Math.min(255, leadingDots)] : [],
      headerCmds,
      bodyCmds,
      footerCmds,
      [GS, FF],
    ]);

    return Array.from(commands);
  }

  /**
   * Print a group of pre-numbered jobs to a specific printer connection.
   * Each job already carries its whole-order labelIndex; labelTotal is the
   * total across the entire order (not this group). Keeps the existing
   * per-label gap-feed settling delay and ESC/POS generation unchanged.
   */
  async printOrderLabelsTo(printerId, { jobs, orderNumber, labelTotal, printer, onLabelPrinted, qrText = '' }) {
    const GAP_FEED_WAIT_MS = 2500;
    for (const job of jobs) {
      const labelBytes = this._buildLabelBytes({
        item: job.item,
        orderNumber,
        labelIndex: job.labelIndex,
        labelTotal,
        printer,
        qrText,
      });
      await this._writeTo(printerId, new Uint8Array(labelBytes));
      // Wait for the gap-feed motor to complete before sending the next label.
      // This settled wait is the printer's ready signal — the label is now
      // confirmed physically printed, so notify the caller to stamp printed_at.
      await new Promise(r => setTimeout(r, GAP_FEED_WAIT_MS));
      if (onLabelPrinted) onLabelPrinted(job);
    }
  }

  /**
   * Backward-compatible: route to the printer connection matching printer.id.
   * Builds jobs with whole-order numbering derived from the supplied items.
   */
  async printOrderLabels({ items, orderNumber, printer, qrText = '' }) {
    const printerId = printer?.id || this._lastPrinterId || '__legacy__';
    const jobs = [];
    let idx = 1;
    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      for (let i = 0; i < qty; i++) {
        jobs.push({ item: { ...item, quantity: 1 }, labelIndex: idx++ });
      }
    }
    return this.printOrderLabelsTo(printerId, { jobs, orderNumber, labelTotal: jobs.length, printer, qrText });
  }

  async printReceipt(text) {
    const printerId = '__receipt__';
    // Use latin1 encoding (not TextEncoder/UTF-8) so bytes 0x80-0xFF in
    // raster image data (QR codes, logos) are preserved as single bytes.
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i) & 0xFF;
    }
    await this._writeTo(printerId, bytes);
  }
}

export const printerService = new BluetoothPrinterService();