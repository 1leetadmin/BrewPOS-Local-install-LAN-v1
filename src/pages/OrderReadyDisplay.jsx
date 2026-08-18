// ============================================================================
// src/pages/OrderReadyDisplay.jsx
//
// Customer-facing screen: shows the store name/title and a big list of
// order numbers currently ready for pickup. Read-only — all control (mark
// ready, wipe) happens from the staff KDS board (KdsBoard.jsx); this page
// just reflects whatever's marked 'ready' there, live, via the same
// KdsTicket records both screens poll.
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const POLL_MS = 1200;

export default function OrderReadyDisplay() {
  const { data: settingsList } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: () => base44.entities.StoreSettings.list(),
    refetchInterval: POLL_MS,
  });
  const settings = settingsList?.[0];

  const { data: tickets = [] } = useQuery({
    queryKey: ['kdsTickets'],
    queryFn: () => base44.entities.KdsTicket.list('-created_date'),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  const ready = tickets.filter((t) => t.status === 'ready');

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center px-8 py-12">
      <h1 className="text-4xl font-bold text-white mb-2">{settings?.store_name || 'Order Ready'}</h1>
      <p className="text-lg text-slate-400 mb-12">Your order number will appear below when ready</p>

      {ready.length === 0 ? (
        <div className="text-slate-500 text-2xl mt-16">No orders ready right now</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 w-full max-w-4xl">
          {ready.map((ticket) => (
            <div
              key={ticket.id}
              className="bg-green-600 rounded-3xl aspect-square flex items-center justify-center shadow-xl animate-pulse"
            >
              <span className="text-6xl font-bold text-white">#{ticket.order_number}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
