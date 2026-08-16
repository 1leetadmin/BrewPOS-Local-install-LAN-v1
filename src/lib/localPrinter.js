// Client wrapper for the local Node print server (server/index.js).
// The app is served over HTTP on localhost, so plain fetch() to the local
// server works with no mixed-content or WebSocket/certificate issues.
//
// Printer configs passed here are objects: { name, connection_type, lan_address }
// (connection_type: 'usb' | 'lan'). A bare string is still accepted for
// backward compatibility and treated as a USB printer name.

import { useEffect, useState, useCallback } from 'react';

const BASE = 'http://localhost:3001';

function normalize(printer) {
  if (typeof printer === 'string') return { name: printer, connection_type: 'usb' };
  return printer || {};
}

// POST the order + settings; the server prints via the configured transport
// (named OS printer / raw USB / raw LAN socket) based on settings.receipt_printer.
export async function printReceipt(order, settings = {}) {
  const res = await fetch(`${BASE}/api/print-receipt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order, settings }),
  });
  return res.json();
}

// POST a batch of pre-numbered label jobs to a single printer.
// jobs: [{ item, labelIndex }]. Returns { success, printed, error? }.
export async function printLabelJobs(printer, jobs, orderNumber, labelTotal, qrText = '') {
  try {
    const res = await fetch(`${BASE}/api/print-label`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer: normalize(printer), jobs, orderNumber, labelTotal, qrText }),
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message || 'Local print server unreachable' };
  }
}

// GET /api/printer-list — all OS printer names for the dropdown (covers USB
// and any LAN printer already installed as a Windows printer).
export async function getPrinterList() {
  try {
    const res = await fetch(`${BASE}/api/printer-list`);
    return await res.json();
  } catch {
    return { printers: [], server: false };
  }
}

// { connected } — or { connected: false, server: false } if the local server
// isn't running (fetch throws). Accepts a printer config object or, for
// backward compatibility, a bare printer-name string.
export async function getPrinterStatus(printer) {
  const cfg = normalize(printer);
  try {
    const params = new URLSearchParams();
    if (cfg.name) params.set('name', cfg.name);
    if (cfg.os_printer_name) params.set('os_printer_name', cfg.os_printer_name);
    if (cfg.connection_type) params.set('connection_type', cfg.connection_type);
    if (cfg.lan_address) params.set('lan_address', cfg.lan_address);
    const qs = params.toString();
    const res = await fetch(`${BASE}/api/printer-status${qs ? `?${qs}` : ''}`);
    return await res.json();
  } catch {
    return { connected: false, server: false };
  }
}

// Polling hook used by the Printers button and Settings panel. Accepts a
// printer config object (or legacy name string); re-checks when its
// meaningful fields change.
export function usePrinterStatus(printer, intervalMs = 5000) {
  const cfg = normalize(printer);
  const depKey = `${cfg.name || ''}|${cfg.os_printer_name || ''}|${cfg.connection_type || ''}|${cfg.lan_address || ''}`;
  const [status, setStatus] = useState({ connected: false, loading: true });

  const check = useCallback(async () => {
    setStatus(s => ({ ...s, loading: true }));
    const s = await getPrinterStatus(cfg);
    setStatus({ ...s, loading: false });
  }, [depKey]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const s = await getPrinterStatus(cfg);
      if (alive) setStatus({ ...s, loading: false });
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [depKey, intervalMs]);

  return { ...status, check };
}