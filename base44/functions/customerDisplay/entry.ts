import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Public Customer Display Screen endpoint. No auth check — any internet-
// connected tablet can poll this to render the current order state. It only
// returns display-facing data (branding, live cart, totals, theme) — no
// operator or sensitive info. Reads via the service role since there is no
// logged-in user on the CDS device.
Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  try {
    const base44 = createClientFromRequest(req);
    const list = await base44.asServiceRole.entities.StoreSettings.list();
    const s = list[0] || {};

    return Response.json({
      store_name: s.store_name || 'Our Store',
      receipt_footer: s.receipt_footer || '',
      currency_symbol: s.currency_symbol || '$',
      display_state: s.display_state || 'idle',
      active_cart: Array.isArray(s.active_cart) ? s.active_cart : [],
      active_order_number: s.active_order_number || '',
      active_total: Number(s.active_total) || 0,
      theme: s.theme || null,
      cds_config: s.cds_config || null,
    }, { headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }
});