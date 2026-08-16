import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

// Shift4 SmartConnect EFTPOS terminal integration.
// Cloud-based API: the POS never talks to the terminal directly — it sends
// requests to the SmartConnect cloud, which forwards them to the paired
// EFTPOS device. See https://smartconnectdev.shift4.co.nz/integration-guide/
//
// Actions:
//   pair        — link this register to a terminal using a temporary code
//   transaction — initiate a purchase; returns a transaction ID for polling
//   status      — poll a transaction's status by ID
//
// NOTE: The exact endpoint paths and request/response field names are based on
// the public integration guide (smartconnectdev.shift4.co.nz/integration-guide).
// The full API reference is gated — confirm against it once Shift4 grants
// access (amanda.frith@shift4.com) and adjust the fetch calls accordingly.
//
// AUTH: The public guide does not mention API keys. Authentication appears to
// be based on the Register ID + pairing relationship itself. The API key is
// optional here — if set, it's sent as a Bearer token; if not, requests are
// sent without auth. If Shift4 returns a 401, we'll know auth is required and
// can adjust based on the gated API reference.

const DEFAULT_BASE_URL = 'https://smartconnectapi.shift4.co.nz';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // Load SmartConnect config from StoreSettings (service role — global config)
    const settingsList = await base44.asServiceRole.entities.StoreSettings.list();
    const settings: any = settingsList[0] || {};
    const sc: any = settings.smartconnect || {};
    const apiKey = secrets.get('SMARTCONNECT_API_KEY'); // optional — see AUTH note above
    const baseUrl = (sc.base_url || '').replace(/\/$/, '');
    const registerId = sc.register_id;

    if (!registerId) {
      return Response.json(
        { error: 'Register ID not configured. Set it in Settings → SmartConnect EFTPOS.' },
        { status: 400 }
      );
    }
    if (!baseUrl) {
      return Response.json(
        { error: 'SmartConnect API URL not configured. The correct URL is in Shift4\'s gated API reference — contact amanda.frith@shift4.com to get access, then enter it in Settings.' },
        { status: 400 }
      );
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // ── Pair a register to an EFTPOS terminal ──────────────────────────
    if (action === 'pair') {
      const { pairingCode } = body;
      if (!pairingCode) return Response.json({ error: 'Pairing code is required' }, { status: 400 });

      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/pairing`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ PosRegisterID: registerId, PairingCode: pairingCode }),
        });
      } catch (fetchErr: any) {
        return Response.json(
          { error: `Cannot reach SmartConnect API at ${baseUrl}. The API URL may be incorrect — verify it in Settings. (${fetchErr.message})` },
          { status: 502 }
        );
      }
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return Response.json(
          { error: data.error || data.message || `Pairing failed (${res.status})` },
          { status: res.status }
        );
      }

      // Persist paired status
      await base44.asServiceRole.entities.StoreSettings.update(settings.id, {
        smartconnect: {
          ...sc,
          paired: true,
          paired_device_name: data.deviceName || data.DeviceName || '',
        },
      });
      return Response.json({
        success: true,
        paired: true,
        deviceName: data.deviceName || data.DeviceName || '',
      });
    }

    // ── Initiate a purchase transaction ────────────────────────────────
    if (action === 'transaction') {
      const { amount, orderNumber } = body;
      if (!amount || amount <= 0) {
        return Response.json({ error: 'Amount must be greater than zero' }, { status: 400 });
      }

      const res = await fetch(`${baseUrl}/api/transaction`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          PosRegisterID: registerId,
          Amount: Math.round(Number(amount) * 100), // cents
          TransactionType: 'Purchase',
          Reference: orderNumber || '',
        }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return Response.json(
          { error: data.error || data.message || `Transaction failed (${res.status})` },
          { status: res.status }
        );
      }

      const transactionId = data.transactionId || data.TransactionId || data.id || '';
      const status = String(data.status || data.Status || 'pending').toLowerCase();
      return Response.json({ transactionId, status, raw: data });
    }

    // ── Poll a transaction's status by ID ──────────────────────────────
    if (action === 'status') {
      const { transactionId } = body;
      if (!transactionId) return Response.json({ error: 'Transaction ID is required' }, { status: 400 });

      const res = await fetch(`${baseUrl}/api/transaction/${transactionId}`, { headers });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return Response.json(
          { error: data.error || data.message || `Status check failed (${res.status})` },
          { status: res.status }
        );
      }

      const status = String(data.status || data.Status || 'pending').toLowerCase();
      return Response.json({
        status,
        approved: status === 'approved' || status === 'completed',
        declined: status === 'declined',
        raw: data,
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}