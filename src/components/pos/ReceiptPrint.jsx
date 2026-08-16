import { toast } from 'sonner';
import { groupOrderItemsForDisplay } from '@/lib/orderPrinting';
import { printerService } from '@/lib/bluetoothPrinter';
import { buildReceipt, buildTestReceipt, buildDrinkTicket } from '@/lib/receiptEscpos';
import { resolveQrEscpos } from '@/lib/qrToEscpos';

const TEST_ORDER = {
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
  items: [
    { name: 'Flat White', unit_price: 5.5, quantity: 1, modifiers: [{ name: 'Alt Milk', option: 'Oat Milk' }] },
    { name: 'Mochaccino', unit_price: 5.5, quantity: 1, modifiers: [] },
    { name: 'Slushy', unit_price: 3.0, quantity: 1, modifiers: [] },
  ],
};

export function isLocalInstall() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

export function getAuthToken() {
  for (const key of Object.keys(localStorage)) {
    const val = localStorage.getItem(key);
    if (val && val.length > 20 && !key.includes('theme') && !key.includes('color')) {
      return val;
    }
  }
  return '';
}

const PRINT_SERVER_URL = 'http://localhost:3001';

// Only the settings fields the server needs to build the receipt ESC/POS and
// route it to the right printer — avoids sending the full settings object
// (CDS config, theme, label printers, etc.) which is unnecessary payload.
function slimSettings(settings = {}) {
  return {
    store_name: settings.store_name,
    address: settings.address,
    phone: settings.phone,
    website: settings.website,
    gst_number: settings.gst_number,
    currency_symbol: settings.currency_symbol,
    tax_label: settings.tax_label,
    tax_rate: settings.tax_rate,
    tax_inclusive: settings.tax_inclusive,
    receipt_footer: settings.receipt_footer,
    receipt_printer: settings.receipt_printer,
    label_qr_enabled: settings.label_qr_enabled,
    label_qr_id: settings.label_qr_id,
    qr_codes: settings.qr_codes,
  };
}

async function printViaLocalServer(order, settings = {}, qrEscposData = '') {
  const res = await fetch(`${PRINT_SERVER_URL}/api/print-receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order, orderItems: order.items || [], settings: slimSettings(settings), qrEscposData }),
  });
  if (!res.ok) throw new Error(`Print server error (${res.status})`);
  return res.json();
}

function buildDrinkTicketHtml(order, settings = {}) {
  const rp = settings?.receipt_printer || {};
  const ticketText = rp.drink_ticket_text || 'Please present to the barista\nto collect your order';
  const pxFor = (size) => ({ normal: 14, double: 20, large: 28, xlarge: 36 }[size] || 36);
  const orderPx = pxFor(rp.drink_ticket_order_size || 'xlarge');
  const textPx = pxFor(rp.drink_ticket_text_size || 'normal');

  const items = groupOrderItemsForDisplay(order.items || []);
  const itemRows = items.map(line => {
    const modText = (line.modifiers || [])
      .filter(m => m.name !== 'Comments')
      .map(m => m.option || m.name)
      .join(', ');
    const notes = line.notes ? `<div style="font-size:11px;color:#666;margin-left:16px;">${line.notes}</div>` : '';
    const mods = modText ? `<div style="font-size:11px;color:#666;margin-left:16px;">${modText}</div>` : '';
    return `<div style="padding:2px 0;font-size:14px;">${line.quantity}× ${line.name}</div>${mods}${notes}`;
  }).join('');

  const textHtml = ticketText.split('\n').map(line =>
    `<div style="text-align:center;font-size:${textPx}px;font-weight:bold;word-wrap:break-word;overflow-wrap:break-word;">${line}</div>`
  ).join('');

  return `<div style="page-break-before: always;"></div>
    <div style="text-align:center;font-size:${orderPx}px;font-weight:bold;margin-top:8px;word-wrap:break-word;overflow-wrap:break-word;">ORDER #${order.order_number || ''}</div>
    <div class="divider"></div>
    ${textHtml}
    <div class="divider"></div>
    ${itemRows}
    <div class="divider"></div>`;
}

function printViaBrowser(order, settings = {}) {
  const items = groupOrderItemsForDisplay(order.items || []);
  const currency = settings?.currency_symbol || '$';
  const storeName = settings?.store_name || '';
  const taxLabel = settings?.tax_label || 'Tax';
  const footer = settings?.receipt_footer || 'Thank you for your visit!';

  const itemRows = items.map(line => {
    const lineTotal = (line.unit_price * line.quantity).toFixed(2);
    const modText = (line.modifiers || [])
      .filter(m => m.name !== 'Comments')
      .map(m => m.option || m.name)
      .join(', ');
    const notes = line.notes ? `<div style="font-size:11px;color:#666;margin-left:16px;">${line.notes}</div>` : '';
    const mods = modText ? `<div style="font-size:11px;color:#666;margin-left:16px;">${modText}</div>` : '';
    return `<div style="display:flex;justify-content:space-between;padding:2px 0;">
      <div><span>${line.quantity}×</span> ${line.name}</div>
      <div>${currency}${lineTotal}</div>
    </div>${mods}${notes}`;
  }).join('');

  const taxInclusive = settings?.tax_inclusive;
  const taxRate = settings?.tax_rate || 0;
  const discountRow = order.discount_amount > 0
    ? `<div style="display:flex;justify-content:space-between;padding:2px 0;"><div>Discount</div><div>-${currency}${order.discount_amount.toFixed(2)}</div></div>`
    : '';
  const subtotalRow = taxInclusive
    ? `<div style="display:flex;justify-content:space-between;padding:2px 0;"><div>Subtotal (incl ${taxLabel})</div><div>${currency}${(order.total || 0).toFixed(2)}</div></div>
       <div style="display:flex;justify-content:space-between;padding:2px 0;"><div>&nbsp;&nbsp;incl ${taxLabel} ${taxRate}%</div><div>${currency}${(order.tax_total || 0).toFixed(2)}</div></div>`
    : `<div style="display:flex;justify-content:space-between;padding:2px 0;"><div>Subtotal</div><div>${currency}${(order.subtotal || 0).toFixed(2)}</div></div>
       <div style="display:flex;justify-content:space-between;padding:2px 0;"><div>${taxLabel}</div><div>${currency}${(order.tax_total || 0).toFixed(2)}</div></div>`;

  const dateStr = new Date(order.completed_at || order.created_date || Date.now()).toLocaleString();

  const drinkTicketHtml = settings?.receipt_printer?.print_drink_ticket
    ? buildDrinkTicketHtml(order, settings)
    : '';

  const html = `<!DOCTYPE html>
<html><head><title>Receipt ${order.order_number || ''}</title>
<style>
  @page { margin: 0; }
  body { font-family: 'Courier New', monospace; width: ${settings?.receipt_printer?.width_mm || 80}mm; margin: 0 auto; padding: 8px; font-size: 13px; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .total { font-size: 16px; font-weight: bold; }
</style>
</head><body>
  <div class="center bold" style="font-size:16px;">${storeName}</div>
  ${settings?.address ? `<div class="center">${settings.address}</div>` : ''}
  ${settings?.phone ? `<div class="center">${settings.phone}</div>` : ''}
  ${settings?.website ? `<div class="center">${settings.website}</div>` : ''}
  ${settings?.gst_number ? `<div class="center">${settings.gst_number}</div>` : ''}
  <div class="center" style="font-size:11px;margin-top:4px;">${dateStr}</div>
  ${order.order_number ? `<div class="center bold">Order #${order.order_number}</div>` : ''}
  <div class="divider"></div>
  ${itemRows}
  <div class="divider"></div>
  ${subtotalRow}
  ${discountRow}
  <div class="divider"></div>
  <div class="total" style="display:flex;justify-content:space-between;"><div>TOTAL</div><div>${currency}${(order.total || 0).toFixed(2)}</div></div>
  <div class="divider"></div>
  ${order.payment_method ? `<div style="display:flex;justify-content:space-between;padding:2px 0;"><div>Payment</div><div>${order.payment_method.toUpperCase()}</div></div>` : ''}
  ${order.amount_paid ? `<div style="display:flex;justify-content:space-between;padding:2px 0;"><div>Paid</div><div>${currency}${Number(order.amount_paid).toFixed(2)}</div></div>` : ''}
  ${order.change_due ? `<div style="display:flex;justify-content:space-between;padding:2px 0;"><div>Change</div><div>${currency}${Number(order.change_due).toFixed(2)}</div></div>` : ''}
  ${order.cash_amount ? `<div style="display:flex;justify-content:space-between;padding:2px 0;"><div>Cash</div><div>${currency}${Number(order.cash_amount).toFixed(2)}</div></div>` : ''}
  ${order.card_amount ? `<div style="display:flex;justify-content:space-between;padding:2px 0;"><div>Card</div><div>${currency}${Number(order.card_amount).toFixed(2)}</div></div>` : ''}
  <div class="divider"></div>
  <div class="center" style="margin-top:8px;font-size:12px;">${footer}</div>
  ${drinkTicketHtml}
  <script>window.onload = function() { window.print(); }</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=380,height=600');
  if (!w) {
    toast.error('Popup blocked — allow popups to print receipts');
    return false;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
}

async function printViaBluetooth(order, settings = {}, qrEscposData = '') {
  try {
    const receiptEscpos = buildReceipt(order, order.items || [], settings, qrEscposData);
    await printerService.printReceipt(receiptEscpos);

    if (settings?.receipt_printer?.print_drink_ticket) {
      // Give the auto-cutter time to physically finish (retract blade, settle)
      // before sending more data — sending immediately after a cut command
      // can stall/confuse the printer's firmware for ~30s.
      await new Promise(r => setTimeout(r, 2000));
      const ticketEscpos = buildDrinkTicket(order, order.items || [], settings);
      await printerService.printReceipt(ticketEscpos);
    }
    return true;
  } catch (err) {
    toast.error(`Receipt print failed: ${err.message}`);
    return false;
  }
}

export async function printReceipt(order, settings = {}) {
  const qrEscposData = await resolveQrEscpos(settings);
  if (settings?.receipt_printer?.connection_type === 'bluetooth') {
    return printViaBluetooth(order, settings, qrEscposData);
  }
  // All receipt printing goes through the local print server (localhost:3001).
  // No browser popup fallback — if the server is unreachable or the printer
  // fails, surface the error as a toast so the user can fix the connection.
  try {
    const r = await printViaLocalServer(order, settings, qrEscposData);
    if (r.success) return true;
    toast.error(r.error || 'Receipt print failed — check printer connection');
    return false;
  } catch (err) {
    toast.error(`Receipt print server unreachable — ${err.message}`);
    return false;
  }
}

export async function printTestReceipt(settings = {}) {
  const qrEscposData = await resolveQrEscpos(settings);
  if (settings?.receipt_printer?.connection_type === 'bluetooth') {
    try {
      const escpos = buildTestReceipt(settings, qrEscposData);
      await printerService.printReceipt(escpos);
      return true;
    } catch (err) {
      toast.error(`Receipt print failed: ${err.message}`);
      return false;
    }
  }
  return printReceipt(TEST_ORDER, settings);
}

export default printReceipt;