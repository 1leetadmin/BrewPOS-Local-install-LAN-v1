// Raw ESC/POS receipt builder for the XPrinter XP-365 (80mm thermal).
// Returns a JS string of ESC/POS control characters; QZ Tray sends it as a
// raw byte stream to the USB printer. ASCII content only (NZ / $ pricing).

import { groupOrderItemsForDisplay } from '@/lib/orderPrinting';

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
      case 'small':    return 0x01;  // Font B (compact)
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

export { buildReceipt, buildQrEscPosString };

export function buildDrinkTicket(order, orderItems = [], s = {}) {
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
  out.push(ESC + '@'); // initialize

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

export function buildTestReceipt(s = {}, qrEscposData = '') {
  return buildReceipt(
    {
      order_number: 'TEST',
      created_date: new Date().toISOString(),
      customer_name: 'Test Customer',
      subtotal: 14.0,
      tax_total: 2.1,
      total: 16.1,
      discount_amount: 0,
      payment_method: 'card',
      amount_paid: 16.1,
      change_due: 0,
    },
    [
      { name: 'Flat White', unit_price: 5.5, modifiers: [{ name: 'Alt Milk', option: 'Oat Milk' }], notes: '' },
      { name: 'Flat White', unit_price: 5.5, modifiers: [{ name: 'Alt Milk', option: 'Oat Milk' }], notes: '' },
      { name: 'Caramel Slice', unit_price: 5.0, modifiers: [], notes: 'Extra hot' },
    ],
    s,
    qrEscposData
  );
}