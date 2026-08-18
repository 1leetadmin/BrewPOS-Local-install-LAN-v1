import { printerService } from '@/lib/bluetoothPrinter';
import { printDrinkLabels } from '@/components/pos/DrinkLabelPrint';
import { getPrinterConfig } from '@/lib/printerRouting';
import { printLabelGroup, effectiveConnectionType } from '@/lib/printerDriver';
import { resolveQrText } from '@/lib/qrCode';

function debugLog(message) {
  try {
    fetch('http://localhost:3001/api/debug-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `[order-print] ${message}` }),
    }).catch(() => {});
  } catch { /* best effort */ }
}

/**
 * Run a set of pre-numbered, per-printer label jobs through the multi-printer
 * router. USB/LAN printers print via the local Node server; Bluetooth
 * printers print via BLE (both fire onLabelPrinted per label as each is
 * confirmed printed). Any group without a usable connection or matching
 * config falls back to the browser print dialog.
 *
 * @param {Object} printerGroups - { [printerId]: [{ item, labelIndex, orderItemId }] }
 * @param {number} labelTotal - whole-order label count (denominator for label_count)
 * @param {object} settings - StoreSettings
 * @param {object} opts - { orderNumber, onLabelPrinted(job), onError(printerName, err) }
 * @returns {Promise<{sent: number, fallback: number}>}
 */
export async function printOrderLabelJobs(printerGroups, labelTotal, settings, { orderNumber, onLabelPrinted, onError }) {
  const qrText = settings?.label_qr_enabled ? resolveQrText(settings) : '';
  let sent = 0;
  let fallback = 0;
  debugLog(`printOrderLabelJobs: settings.label_printers=${JSON.stringify((settings?.label_printers || []).map(p => ({ id: p.id, name: p.name, width_mm: p.width_mm, height_mm: p.height_mm })))}`);
  for (const printerId of Object.keys(printerGroups)) {
    const jobs = printerGroups[printerId];
    const printer = getPrinterConfig(printerId, settings);
    debugLog(`  resolving printerId="${printerId}" -> ${printer ? `found: ${printer.name} (width_mm=${printer.width_mm}, height_mm=${printer.height_mm})` : 'NOT FOUND — falling back to browser print dialog'}`);
    if (!printer) {
      printDrinkLabels(jobs, orderNumber, settings, labelTotal);
      fallback++;
      continue;
    }

    const connectionType = effectiveConnectionType(printer);
    // Bluetooth printers must already be connected (a user gesture is required
    // to initiate a BLE connection, so we can't do it here). USB/LAN printers
    // have no such requirement — the local server owns the actual connection.
    const usable = connectionType === 'usb' || connectionType === 'lan'
      ? true
      : printerService.isConnectedTo(printerId);
    debugLog(`  connectionType=${connectionType}, usable=${usable}`);

    if (!usable) {
      printDrinkLabels(jobs, orderNumber, settings, labelTotal);
      fallback++;
      continue;
    }

    try {
      await printLabelGroup(printer, jobs, { orderNumber, labelTotal, onLabelPrinted, qrText });
      sent++;
    } catch (err) {
      if (onError) onError(printer.name, err);
      printDrinkLabels(jobs, orderNumber, settings, labelTotal);
      fallback++;
    }
  }
  return { sent, fallback };
}

/**
 * Group per-unit OrderItem records back into display lines (for receipts and
 * the order detail view). Identical items (same name + modifiers + unit price)
 * are aggregated with a quantity.
 */
export function groupOrderItemsForDisplay(orderItems) {
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