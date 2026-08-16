// Shared printer driver — the single interface the rest of the app calls to
// print a drink label, regardless of how that printer is physically reached.
// Callers never branch on connection_type themselves; they call
// printLabelGroup() and this module routes to the right transport.
//
// Today (Windows local install) there are two real transports:
//   - 'usb' / 'lan'  -> the local Node print server (server/index.js), which
//                       itself picks OS-printer / raw-libusb / raw-TCP-socket.
//   - 'bluetooth'    -> legacy Web Bluetooth path (browser-only), kept for
//                       printers not yet migrated off Bluetooth.
// Printers saved before this feature have no `connection_type` at all —
// those default to 'usb' so they route through the local print server.
//
// Android/iOS builds will add their own transports here later (native
// USB/socket bridges, vendor SDKs) behind this same printLabelGroup() call.

import { printerService } from '@/lib/bluetoothPrinter';
import { printLabelJobs as printLabelJobsLocal } from '@/lib/localPrinter';

function effectiveConnectionType(printer) {
  return printer?.connection_type || 'usb';
}

/**
 * Print a pre-numbered batch of label jobs to one printer.
 *
 * @param {object} printer - normalized printer config (has .connection_type)
 * @param {Array<{item, labelIndex, orderItemId?}>} jobs
 * @param {object} opts - { orderNumber, labelTotal, onLabelPrinted(job) }
 * @returns {Promise<void>} resolves on success, throws on failure (caller decides fallback)
 */
export async function printLabelGroup(printer, jobs, { orderNumber, labelTotal, onLabelPrinted, qrText = '' }) {
  const connectionType = effectiveConnectionType(printer);

  if (connectionType === 'usb' || connectionType === 'lan') {
    const result = await printLabelJobsLocal(
      printer,
      jobs.map(({ item, labelIndex }) => ({ item, labelIndex })),
      orderNumber,
      labelTotal,
      qrText,
    );
    if (!result.success) throw new Error(result.error || 'Label print failed');
    // The local server prints the whole batch in one request, so we don't get
    // per-label progress the way BLE's incremental writes do — fire the
    // callback for every job once the batch is confirmed printed.
    if (onLabelPrinted) jobs.forEach((job) => onLabelPrinted(job));
    return;
  }

  // Legacy Bluetooth path — caller must have already confirmed connection
  // via printerService.isConnectedTo(printer.id) before calling this.
  await printerService.printOrderLabelsTo(printer.id, { jobs, orderNumber, labelTotal, printer, onLabelPrinted, qrText });
}

/**
 * Is this printer currently reachable? For usb/lan this means the local
 * server + transport are up right now (a real-time check, not cached status);
 * for bluetooth it's the existing GATT connection state.
 */
export async function isPrinterReady(printer) {
  const connectionType = effectiveConnectionType(printer);
  if (connectionType === 'usb' || connectionType === 'lan') {
    const { getPrinterStatus } = await import('@/lib/localPrinter');
    const status = await getPrinterStatus(printer);
    return !!status.connected;
  }
  return printerService.isConnectedTo(printer.id);
}

export { effectiveConnectionType };