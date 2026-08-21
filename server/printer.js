// Local offline print server — ESC/POS receipt + label builders, and raw
// transport over USB (libusb / named OS printer) or LAN (raw socket).
//
// buildReceipt() is ported verbatim from src/lib/receiptEscpos.js and
// buildLabelBytes() from src/lib/bluetoothPrinter.js's _buildLabelBytes, so
// the local server prints exactly the same output the browser used to send
// via QZ Tray / Web Bluetooth. Transport is now shared by both receipts and
// labels: a named OS printer (USB, or a LAN printer installed as a Windows
// printer), raw libusb (USB auto-discovery, no install needed), or a raw TCP
// socket to the printer's IP address (LAN, port 9100 by default, no install
// needed either).

const usb = require('usb');
const net = require('net');
const { sizeNameLine, buildModifierLines } = require('./drinkLines');

// OS-level printer support — sends raw data to a named printer via the
// Windows/macOS/Linux print spooler (the name from Printers & Scanners).
// Falls back to raw libusb when the module isn't installed or no name given.
let osPrinter;
try {
  osPrinter = require('@thiagoelg/node-printer');
} catch {
  osPrinter = null;
}

const ESC = '\x1B';
const GS = '\x1D';
const LF = '\n';
let COLS = 42; // column count — updated per receipt based on paper width

const align = (a) =>
  ESC + 'a' + (a === 'center' ? '\x01' : a === 'right' ? '\x02' : '\x00');
const reset = ESC + '!' + '\x00';     // clear all font modes
const bigBold = ESC + '!' + '\x38';   // double width/height + bold
const boldOn = ESC + 'E' + '\x01';
const boldOff = ESC + 'E' + '\x00';

// Font size commands for the drink ticket (ESC ! n print mode bits).
const sizeCmd = (size, font) => {
  const base = (() => {
    switch (size) {
      case 'small':    return 0x01;
      case 'normal':   return 0x00;
      case 'bold':     return 0x08;
      case 'double':   return 0x10;
      case 'tall':     return 0x18;
      case 'large':    return 0x30;
      case 'xlarge':   return 0x38;
      case 'xxlarge':  return 0xB8;
      default:         return 0x38;
    }
  })();
  const n = font === 'B' ? (base | 0x01) : (font === 'A' ? (base & ~0x01) : base);
  return ESC + '!' + String.fromCharCode(n);
};

// Auto-cut commands (GS V B n). Function B feeds then cuts.
const cutCmd = (mode) => {
  switch (mode) {
    case 'none':   return '';
    case 'full':   return GS + 'V' + '\x42' + '\x00';
    case 'partial':
    default:       return GS + 'V' + '\x42' + '\x01';
  }
};

// Effective column count for a font size — double-width modes halve the columns.
const colsForSize = (size, cols, font) => {
  const isFontB = font === 'B' || size === 'small';
  let factor = isFontB ? 1.5 : 1;
  if (size === 'large' || size === 'xlarge' || size === 'xxlarge') factor *= 0.5;
  return Math.max(1, Math.floor(cols * factor));
};

// Auto-fit: find the largest font size (at or below maxSize) that fits text on
// one line within the receipt width. Steps down through sizes until it fits.
const SIZE_ORDER = ['xxlarge', 'xlarge', 'large', 'tall', 'double', 'bold', 'normal', 'small'];
const fitSize = (text, maxSize, cols, font) => {
  const startIdx = SIZE_ORDER.indexOf(maxSize);
  const idx = startIdx >= 0 ? startIdx : SIZE_ORDER.indexOf('xlarge');
  for (let i = idx; i < SIZE_ORDER.length; i++) {
    const size = SIZE_ORDER[i];
    if (text.length <= colsForSize(size, cols, font)) return size;
  }
  return 'small';
};

// Word-wrap text to fit within maxCols characters.
function wrapText(text, maxCols) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) current = word;
    else if (current.length + 1 + word.length <= maxCols) current += ' ' + word;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

// ESC/POS QR code commands as a string (GS ( k ...). Raw bytes as latin1
// characters so the output concatenates into the ESC/POS string.
function buildQrEscPosString(text, moduleSize = 4) {
  const dataBytes = Array.from(new TextEncoder().encode(text));
  const dataLen = dataBytes.length;
  const pL = (dataLen + 3) & 0xFF;
  const pH = ((dataLen + 3) >> 8) & 0xFF;
  const bytes = [
    0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x32, 0x02, 0x00,  // Set QR model 2, version auto
    0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, moduleSize,
    0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31,
    0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30, ...dataBytes,
    0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
  return bytes.map(b => String.fromCharCode(b)).join('');
}

// ESC/POS CODE128 barcode command (GS k function B). Prints data as a
// CODE128 barcode with the human-readable text below the bars.
function buildBarcodeEscPosString(data, height = 80, width = 2) {
  const dataBytes = Array.from(new TextEncoder().encode('{B' + data));
  const bytes = [
    0x1D, 0x68, height,        // GS h n — barcode height in dots
    0x1D, 0x77, width,         // GS w n — barcode module width (1-6)
    0x1D, 0x48, 0x02,          // GS H n — HRI text position (2 = below barcode)
    0x1D, 0x66, 0x00,          // GS f n — HRI font (0 = font A)
    0x1D, 0x6B, 0x49, 0x02,    // GS k 73 2 — CODE128, module width 2
    ...dataBytes,               // {B prefix + data (Code B = ASCII)
    0x00,                      // NUL terminator
  ];
  return bytes.map(b => String.fromCharCode(b)).join('');
}

function rowLine(left, right, cols = COLS) {
  const gap = cols - left.length - right.length;
  if (gap < 1) return left.slice(0, Math.max(0, cols - right.length - 1)) + ' ' + right;
  return left + ' '.repeat(gap) + right;
}

function money(currency, n) {
  return `${currency}${Number(n || 0).toFixed(2)}`;
}

function divider() {
  return '-'.repeat(COLS) + LF;
}

function groupOrderItemsForDisplay(orderItems) {
  const keyOf = (oi) =>
    `${oi.name}|${(oi.modifiers || []).filter(m => m.name !== 'Comments').map(m => m.option).sort().join(',')}|${oi.unit_price}`;
  const map = new Map();
  for (const oi of orderItems || []) {
    const k = keyOf(oi);
    if (!map.has(k)) {
      map.set(k, {
        name: oi.name,
        quantity: 0,
        unit_price: oi.unit_price,
        modifiers: oi.modifiers || [],
        notes: oi.notes || '',
      });
    }
    const line = map.get(k);
    line.quantity += 1;
  }
  return [...map.values()];
}

function buildReceipt(order, orderItems = [], s = {}, qrEscposData = '') {
  const rp = s.receipt_printer || {};
  COLS = Math.max(8, Math.floor((Number(rp.width_mm) || 80) * 0.5));
  const currency = s.currency_symbol || '$';
  const taxLabel = s.tax_label || 'GST';
  const taxRate = s.tax_rate || 0;
  const taxInclusive = s.tax_inclusive || false;
  const showTax = rp.show_tax !== false;
  const showFooter = rp.show_footer !== false;
  const showLogo = rp.show_logo !== false;
  const storeName = s.store_name || 'My Store';
  const footer = s.receipt_footer || 'Thank you for your visit!';
  const gstNumber = s.gst_number || '';
  const la = rp.line_alignments || {};
  const aln = (section, def) => align(la[section] || def);

  const ts = order?.completed_at || order?.created_date;
  const d = ts ? new Date(ts) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const out = [];
  out.push(ESC + '@'); // initialize

  if (showLogo) out.push(aln('header', 'center'), bigBold, storeName, reset, LF);
  if (s.address) out.push(aln('header', 'center'), s.address, LF);
  if (s.phone) out.push(aln('header', 'center'), s.phone, LF);
  if (s.website) out.push(aln('header', 'center'), s.website, LF);
  out.push(divider());

  out.push(aln('order_info', 'left'), `Order #${order?.order_number || ''}`, LF);
  out.push(dateStr, LF);
  if (order?.customer_name) out.push(`Customer: ${order.customer_name}`, LF);
  out.push(divider());

  const lines = groupOrderItemsForDisplay(orderItems);
  for (const it of lines) {
    const price = money(currency, (it.unit_price || 0) * (it.quantity || 1));
    out.push(aln('items', 'left'), rowLine(`${it.quantity}x ${it.name}`, price), LF);
    const mods = (it.modifiers || []).filter((m) => m.name !== 'Comments').map((m) => `  + ${m.option}`);
    for (const m of mods) {
      for (const w of wrapText(m, COLS)) out.push(aln('items', 'left'), w, LF);
    }
    const comment = it.notes || (it.modifiers || []).find((m) => m.name === 'Comments')?.option;
    if (comment) {
      for (const w of wrapText(`  * ${comment}`, COLS)) out.push(aln('items', 'left'), w, LF);
    }
  }
  out.push(divider());

  const subtotal = Number(order?.subtotal) || 0;
  const taxTotal = Number(order?.tax_total) || 0;
  const total = Number(order?.total) || 0;
  const discount = Number(order?.discount_amount) || 0;

  if (taxInclusive) {
    out.push(aln('totals', 'left'), rowLine(`Subtotal (incl ${taxLabel})`, money(currency, total)), LF);
    if (showTax) out.push(aln('totals', 'left'), rowLine(`  incl ${taxLabel} ${taxRate}%`, money(currency, taxTotal)), LF);
  } else {
    out.push(aln('totals', 'left'), rowLine('Subtotal', money(currency, subtotal)), LF);
    if (showTax) out.push(aln('totals', 'left'), rowLine(`${taxLabel} ${taxRate}%`, money(currency, taxTotal)), LF);
  }
  if (discount > 0) out.push(aln('totals', 'left'), rowLine('Discount', '-' + money(currency, discount)), LF);
  out.push(aln('totals', 'left'), bigBold, rowLine('TOTAL', money(currency, total)), reset, LF);

  const pm = order?.payment_method || 'cash';
  if (pm === 'split') {
    out.push(aln('payment', 'left'), rowLine('Cash', money(currency, order?.cash_amount || 0)), LF);
    out.push(aln('payment', 'left'), rowLine('Card', money(currency, order?.card_amount || 0)), LF);
  } else {
    const pmLabel = pm === 'mobile' ? 'Card' : pm.charAt(0).toUpperCase() + pm.slice(1);
    out.push(aln('payment', 'left'), rowLine(`Paid (${pmLabel})`, money(currency, order?.amount_paid || 0)), LF);
    if ((order?.change_due || 0) > 0) out.push(aln('payment', 'left'), rowLine('Change', money(currency, order.change_due)), LF);
  }
  out.push(divider());

  // QR code on customer receipt
  if (rp.qr_enabled && rp.qr_id) {
    if (qrEscposData) {
      out.push(aln('qr_code', 'center'), qrEscposData, LF, LF);
    } else {
      const qr = (s.qr_codes || []).find(q => q.id === rp.qr_id);
      if (qr && qr.type === 'text' && qr.text) {
        out.push(aln('qr_code', 'center'), buildQrEscPosString(qr.text, 4), LF, LF);
      }
    }
    if (rp.qr_caption) {
      for (const w of wrapText(rp.qr_caption, COLS)) out.push(aln('qr_code', 'center'), w, LF);
    }
  }

  if (showFooter) out.push(aln('footer', 'center'), footer, LF, LF);
  if (gstNumber) out.push(aln('footer', 'center'), `${taxLabel} No: ${gstNumber}`, LF);

  // Feed 4 lines then auto-cut (configurable).
  out.push(LF, LF, LF, LF, cutCmd(rp.auto_cut || 'partial'));

  return out.join('');
}

// --- Drink Ticket builder -----------------------------------------------
// A second receipt section: large order number, "present to the barista"
// message, and an item breakdown (no prices). Appended to the receipt
// ESC/POS when receipt_printer.print_drink_ticket is enabled.
function buildDrinkTicket(order, orderItems = [], s = {}) {
  const rp = s.receipt_printer || {};
  const ticketText = rp.drink_ticket_text || 'Please present to the barista\nto collect your order';
  const orderSize = rp.drink_ticket_order_size || 'xlarge';
  const textSize = rp.drink_ticket_text_size || 'normal';
  const orderAlign = rp.drink_ticket_order_align || 'center';
  const textAlign = rp.drink_ticket_text_align || 'center';
  const orderFont = rp.drink_ticket_order_font || 'A';
  const textFont = rp.drink_ticket_text_font || 'A';
  const autoCut = rp.auto_cut || 'partial';
  COLS = Math.max(8, Math.floor((Number(rp.width_mm) || 80) * 0.5));

  const out = [];
  out.push(ESC + '@');

  // Feed to separate from the receipt above
  out.push(LF, LF);

  // Order number — auto-scale to fit within the receipt width on one line
  const orderText = `ORDER #${order?.order_number || ''}`;
  const fittedSize = fitSize(orderText, orderSize, COLS, orderFont);
  out.push(align(orderAlign), sizeCmd(fittedSize, orderFont), orderText, reset, LF);
  out.push(divider());

  // Custom message — wrap each line to fit within effective cols for the size
  const textCols = colsForSize(textSize, COLS, textFont);
  for (const line of ticketText.split('\n')) {
    for (const wrapped of wrapText(line, textCols)) {
      out.push(align(textAlign), sizeCmd(textSize, textFont), boldOn, wrapped, boldOff, reset, LF);
    }
  }
  out.push(divider());

  // Item breakdown — names and quantities, with modifiers (no prices)
  const itemsSize = rp.drink_ticket_items_size || 'large';
  const itemsFont = rp.drink_ticket_items_font || 'A';
  const itemsCols = colsForSize(itemsSize, COLS, itemsFont);
  const lines = groupOrderItemsForDisplay(orderItems);
  for (const it of lines) {
    for (const w of wrapText(`${it.quantity}x ${it.name}`, itemsCols)) {
      out.push(align('left'), sizeCmd(itemsSize, itemsFont), w, reset, LF);
    }
    const mods = (it.modifiers || []).filter((m) => m.name !== 'Comments').map((m) => `  + ${m.option}`);
    for (const m of mods) {
      for (const w of wrapText(m, COLS)) out.push(align('left'), w, LF);
    }
    const comment = it.notes || (it.modifiers || []).find((m) => m.name === 'Comments')?.option;
    if (comment) {
      for (const w of wrapText(`  * ${comment}`, COLS)) out.push(align('left'), w, LF);
    }
  }
  out.push(divider());

  // Feed 4 lines then auto-cut (configurable)
  out.push(LF, LF, LF, LF, cutCmd(autoCut));

  return out.join('');
}

// --- Label ESC/POS builder ---------------------------------------------
// Ported from src/lib/bluetoothPrinter.js's _buildLabelBytes so USB/LAN
// output matches the Bluetooth path exactly. Returns a plain byte array.

const ESC_B = 0x1B;
const GS_B = 0x1D;
const LF_B = 0x0A;

// Strips control characters (0x00-0x1F, 0x7F) before encoding to bytes.
// Without this, a literal ESC byte (0x1B) embedded in ANY printed text —
// a staff name, item name, comment, discount name, store name — would be
// interpreted by the printer hardware as the start of a real ESC/POS
// command sequence rather than printed as text, since ESC/POS commands
// are themselves just specific control-byte sequences. This is the single
// choke point every printed string passes through, so fixing it here
// protects every current and future text field at once, rather than
// needing to remember to validate each one individually at every input
// field across the app.
function textToBytes(str) {
  const cleaned = String(str).replace(/[\x00-\x1F\x7F]/g, '');
  return Array.from(new TextEncoder().encode(cleaned));
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

function buildLabelBytes({ item, orderNumber, labelIndex, labelTotal, printer, qrText = '' }) {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const DOT_MM = 8;
  const PITCH_DEFAULT = 24;
  const PITCH_MIN = 16;
  const CHAR_MM_NORMAL = 1.5;
  const CHAR_MM_WIDE = 3.0;

  const widthMm = Number(printer.width_mm) || 50;
  const heightMm = Number(printer.height_mm) || 30;
  const paddingMm = Number(printer.padding_mm) || 1.5;
  const printableWmm = Math.max(10, widthMm - paddingMm * 2);

  // QR code sizing — fit to label dimensions
  const QR_MODULE_COUNT = 25;
  const qrTargetMm = Math.min(widthMm * 0.8, heightMm * 0.8);
  const qrModuleSize = qrText ? Math.max(2, Math.min(16, Math.floor(qrTargetMm * DOT_MM / QR_MODULE_COUNT))) : 0;
  const qrHeightDots = qrText ? qrModuleSize * QR_MODULE_COUNT : 0;

  // ESC/POS's own justify command (ESC a n) aligns relative to the PRINTER's
  // own internal notion of page width — which is fixed by its own firmware/
  // configuration, not by our width_mm setting. That's why right/center
  // alignment never moved when width_mm changed, even though text wrapping
  // did (wrapping is computed entirely in software from printableWmm).
  // Fixed by computing alignment ourselves — padding with literal spaces
  // sized to our own charsPerLine — and always sending left-justify to the
  // printer, so alignment is fully under our control and genuinely scales
  // with width_mm like everything else.
  const setAlign = () => [ESC_B, 0x61, 0x00];
  const padForAlign = (line, align, charsPerLine) => {
    const gap = Math.max(0, charsPerLine - line.length);
    if (align === 'right') return ' '.repeat(gap) + line;
    if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + line;
    return line;
  };
  const setBold = (on) => [ESC_B, 0x45, on ? 0x01 : 0x00];

  const modeCmd = (pt, demoteLevel) => {
    // Level 2: everything collapses to the smallest ESC/POS text mode.
    if (demoteLevel >= 2) return [ESC_B, 0x21, 0x00];
    // Level 1: caps the largest tier at medium — double-height fields drop
    // to medium, medium/normal fields are unaffected. A real intermediate
    // step instead of jumping straight from "full size" to "smallest".
    if (demoteLevel === 1) {
      if (pt >= 9) return [ESC_B, 0x21, 0x10];
      return [ESC_B, 0x21, 0x00];
    }
    // Level 0: each field at its own configured tier.
    if (pt >= 12) return [ESC_B, 0x21, 0x30];
    if (pt >= 9) return [ESC_B, 0x21, 0x10];
    return [ESC_B, 0x21, 0x00];
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
      const aligned = padForAlign(line, field.align || 'left', charsPerLine);
      cmds.push(
        ...setAlign(),
        ...cmd,
        ...setBold(field.bold),
        ...textToBytes(aligned),
        ...setBold(false),
        ESC_B, 0x21, 0x00,
        LF_B,
      );
    }
    return cmds;
  };

  const getContent = (key) => {
    switch (key) {
      case 'order_number': return `#${orderNumber}`;
      case 'time': return timeStr;
      case 'size': return '';
      case 'item_name': return sizeNameLine(item);
      case 'modifiers': return buildModifierLines(item);
      case 'comments': {
        const c = item.notes || (item.modifiers || []).find(m => m.name === 'Comments')?.option;
        return c ? `* ${c}` : '';
      }
      case 'label_count': return `${labelIndex} / ${labelTotal}`;
      case 'qr_code': return qrText || '';
      default: return '';
    }
  };

  const HEADER_KEYS = ['order_number', 'time'];
  const FOOTER_KEYS = ['label_count'];

  const fields = (printer.fields || []).filter((f) => f.key !== 'customer');
  const visibleFields = fields
    .map((f) => {
      if (f.key === 'label_count') return { ...f, visible: true };
      if (f.key === 'qr_code' && qrText) return { ...f, visible: true };
      return f;
    })
    .filter((f) => f.visible !== false);

  const headerFields = visibleFields.filter((f) => HEADER_KEYS.includes(f.key));
  const footerFields = visibleFields.filter((f) => FOOTER_KEYS.includes(f.key));
  const bodyFields = visibleFields.filter((f) => !HEADER_KEYS.includes(f.key) && !FOOTER_KEYS.includes(f.key));

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

  const availableDots = Math.max(1, Math.round((heightMm - paddingMm * 2) * DOT_MM) - qrHeightDots);
  const PITCH_MID = Math.round((PITCH_DEFAULT + PITCH_MIN) / 2);
  // Graduated fit: try full configured sizes first; if content overflows,
  // step down one level at a time rather than jumping straight from full
  // size to smallest:
  //   1. cap double-height/width fields to medium mode (narrower text can
  //      mean fewer wrapped lines) AND tighten line spacing to PITCH_MID
  //   2. if still overflowing, drop everything to the smallest mode with
  //      spacing compressed down to PITCH_MIN
  // Level 1 always applies its own pitch, not just a mode/width change —
  // otherwise it provides no height relief at all for content that wasn't
  // wrapping to begin with (only genuinely helps overflow that's purely
  // "too many fields", the most common real case).
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
    for (const f of headerFields) {
      const content = getContent(f.key);
      if (content) headerCmds.push(...printLine(content, f, demote));
    }
  }

  const setLeftMargin = (dots) => [0x1D, 0x4C, dots & 0xFF, (dots >> 8) & 0xFF];

  const bodyCmds = bodyFields.flatMap((f) => {
    if (f.key === 'qr_code' && qrText) {
      // The printer renders the QR itself (GS ( k) rather than us sending a
      // raster image, so centering it also can't rely on the printer's own
      // justify state (same reason text alignment needed fixing above) — set
      // an absolute left margin computed from our own printableWmm instead.
      const leftMarginDots = Math.max(0, Math.floor((printableWmm * DOT_MM - qrHeightDots) / 2));
      return [...setLeftMargin(leftMarginDots), ...buildQrEscPos(qrText, qrModuleSize), ...setLeftMargin(0)];
    }
    const content = getContent(f.key);
    if (Array.isArray(content)) return content.flatMap((line) => printLine(line, f, demote));
    return printLine(content, f, demote);
  });
  const footerCmds = footerFields.flatMap((f) => printLine(getContent(f.key), f, demote));

  const FF = 0x0C; // GS FF: feed media until the hardware gap sensor detects the next label boundary.

  const bytes = [
    ESC_B, 0x40,
    ESC_B, 0x33, pitch,
    ...(leadingDots > 0 ? [ESC_B, 0x4A, Math.min(255, leadingDots)] : []),
    ...headerCmds,
    ...bodyCmds,
    ...footerCmds,
    GS_B, FF,
  ];

  return bytes;
}

// --- USB transport (libusb via the `usb` package) ---------------------------

// Opens and returns { device, iface, endpoint } for the first USB device that
// exposes an OUT endpoint, or null. The device is left OPEN; caller closes it.
function findPrinter() {
  const list = usb.getDeviceList();
  for (const d of list) {
    let opened = false;
    try { d.open(); opened = true; } catch { continue; }
    const iface = (d.interfaces || []).find((i) =>
      (i.endpoints || []).some((e) => e.direction === 'out'));
    if (iface) {
      const endpoint = iface.endpoints.find((e) => e.direction === 'out');
      return { device: d, iface, endpoint };
    }
    if (opened) { try { d.close(); } catch {} }
  }
  return null;
}

// Check if a named OS printer exists in the print spooler.
function findOsPrinter(name) {
  if (!osPrinter || !name) return false;
  try {
    const printers = osPrinter.getPrinters();
    return printers.some(p => p.name === name);
  } catch {
    return false;
  }
}

// The exact OS print-spooler target for a printer config. Label printers
// have a separate `os_printer_name` (selected from a live list) distinct
// from `name` (a free-text display label) — receipts have no such split, so
// `name` there already *is* the OS printer name. Falling back to `name`
// keeps older configs saved before this split working unchanged.
function osTargetName(cfg) {
  return cfg.os_printer_name || cfg.name;
}

// All OS printer names, for the Settings dropdown (also covers LAN printers
// that have been installed as a Windows printer).
function getOsPrinterNames() {
  if (!osPrinter) return [];
  try {
    return osPrinter.getPrinters().map((p) => p.name);
  } catch {
    return [];
  }
}

// Send raw bytes to a named OS printer via the print spooler.
function sendToOsPrinter(buffer, name) {
  return new Promise((resolve, reject) => {
    if (!osPrinter) return reject(new Error('OS printer module not installed — run npm install in the server directory'));
    osPrinter.printDirect({
      data: buffer,
      printer: name,
      type: 'RAW',
      success: () => resolve(true),
      error: (err) => reject(new Error(err.message || 'Print failed')),
    });
  });
}

// --- LAN transport (raw TCP socket, standard ESC/POS "9100" protocol) ------

const LAN_DEFAULT_PORT = 9100;
const LAN_CONNECT_TIMEOUT_MS = 4000;

// Parse "192.168.1.50" or "192.168.1.50:9100" into { host, port }.
function parseLanAddress(address) {
  const raw = String(address || '').trim();
  if (!raw) return null;
  const [host, portStr] = raw.split(':');
  if (!host) return null;
  const port = portStr ? parseInt(portStr, 10) : LAN_DEFAULT_PORT;
  return { host, port: Number.isNaN(port) ? LAN_DEFAULT_PORT : port };
}

// Open a raw TCP socket, write the buffer, then close. No printer install
// needed — this is the standard "JetDirect"/9100 raw protocol most network
// receipt/label printers speak natively.
function sendToLan(buffer, address) {
  return new Promise((resolve, reject) => {
    const parsed = parseLanAddress(address);
    if (!parsed) return reject(new Error('Missing or invalid printer IP address'));

    const socket = new net.Socket();
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err); else resolve(true);
    };

    socket.setTimeout(LAN_CONNECT_TIMEOUT_MS);
    socket.once('timeout', () => finish(new Error(`Timed out connecting to printer at ${parsed.host}:${parsed.port}`)));
    socket.once('error', (err) => finish(new Error(`LAN printer error: ${err.message}`)));

    socket.connect(parsed.port, parsed.host, () => {
      socket.write(buffer, (err) => {
        if (err) return finish(new Error('Print failed: ' + err.message));
        // Give the printer a moment to accept the full buffer before closing.
        socket.end();
        finish(null);
      });
    });
  });
}

// Quick reachability check for a LAN printer — just opens and immediately
// closes a TCP connection, no data sent.
function checkLanReachable(address) {
  return new Promise((resolve) => {
    const parsed = parseLanAddress(address);
    if (!parsed) return resolve(false);
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(2500);
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(parsed.port, parsed.host, () => finish(true));
  });
}

// --- Unified dispatch, shared by receipts and labels ------------------------
// `printer` is a printer config object: { connection_type, name, lan_address }.
// Back-compat: a bare string is treated as { connection_type: 'usb', name }.

function normalizePrinterConfig(printer) {
  if (typeof printer === 'string') return { connection_type: 'usb', name: printer };
  return printer || {};
}

// Write raw ESC/POS bytes to whichever transport the printer config selects.
function sendToPrinter(buffer, printer) {
  const cfg = normalizePrinterConfig(printer);

  if (cfg.connection_type === 'lan') {
    return sendToLan(buffer, cfg.lan_address);
  }

  const targetName = osTargetName(cfg);
  if (targetName && osPrinter) {
    return sendToOsPrinter(buffer, targetName);
  }

  // USB auto-discovery fallback (no OS printer name / node-printer module).
  return new Promise((resolve, reject) => {
    let found = null;
    try {
      found = findPrinter();
      if (!found) throw new Error('Printer not found — check USB connection');
      const { device, iface, endpoint } = found;
      iface.claim();
      endpoint.transfer(buffer, (err) => {
        const finish = (e) => {
          try { iface.release(() => { try { device.close(); } catch {} }); }
          catch { try { device.close(); } catch {} }
          if (e) reject(new Error('Print failed: ' + (e.message || e)));
          else resolve(true);
        };
        finish(err);
      });
    } catch (err) {
      if (found) { try { found.device.close(); } catch {} }
      reject(err);
    }
  });
}

// Lightweight reachability check across whichever transport is configured.
async function isPrinterConnected(printer) {
  const cfg = normalizePrinterConfig(printer);

  if (cfg.connection_type === 'lan') {
    return checkLanReachable(cfg.lan_address);
  }

  const targetName = osTargetName(cfg);
  if (targetName && osPrinter) {
    return findOsPrinter(targetName);
  }

  let found = null;
  try {
    found = findPrinter();
    return !!found;
  } catch {
    return false;
  } finally {
    if (found) { try { found.device.close(); } catch {} }
  }
}

module.exports = {
  buildReceipt,
  buildDrinkTicket,
  buildLabelBytes,
  sendToPrinter,
  isPrinterConnected,
  getOsPrinterNames,
};