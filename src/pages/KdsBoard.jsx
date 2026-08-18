// ============================================================================
// src/pages/KdsBoard.jsx
//
// Staff-facing "order ready" board — designed for a touch tablet near
// pickup. Orders auto-appear (gray/queued) when checkout completes on the
// POS. Tap a ticket, or say its number, to advance it: queued -> ready
// (green, also shown on the customer-facing OrderReadyDisplay) -> done
// (red, auto-clears after ~2.5 minutes). Saying "wipe <number>" removes a
// ticket immediately, skipping the grace period, for when you want it gone
// right away.
//
// Fully touchless-capable: voice recognition runs continuously (no push-to-
// talk button) since a barista's hands are usually full. Uses the same Web
// Speech API as the POS voice ordering feature — works because this page is
// loaded in a real tablet browser, not Electron's own window.
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { parseSpokenNumber } from '@/lib/spokenNumber';
import { Mic, MicOff, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const POLL_MS = 1200;
const DONE_AUTO_CLEAR_MS = 150000; // 2.5 minutes

function debugLog(message) {
  try {
    fetch(`http://${window.location.hostname}:3001/api/debug-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `[kds] ${message}` }),
    }).catch(() => {});
  } catch { /* best effort */ }
}

const STATUS_STYLES = {
  queued: { bg: 'bg-slate-600', label: 'Queued', icon: Clock },
  ready: { bg: 'bg-green-600', label: 'Ready', icon: CheckCircle2 },
  done: { bg: 'bg-red-600', label: 'Done', icon: XCircle },
};

export default function KdsBoard() {
  const queryClient = useQueryClient();
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const ticketsRef = useRef([]);

  const { data: tickets = [] } = useQuery({
    queryKey: ['kdsTickets'],
    queryFn: () => base44.entities.KdsTicket.list('-created_date'),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });
  ticketsRef.current = tickets;

  const advanceMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.KdsTicket.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kdsTickets'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.KdsTicket.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kdsTickets'] }),
  });

  const advanceTicket = useCallback((ticket) => {
    if (ticket.status === 'queued') advanceMutation.mutate({ id: ticket.id, status: 'ready' });
    else if (ticket.status === 'ready') advanceMutation.mutate({ id: ticket.id, status: 'done' });
    // Tapping/saying an already-'done' ticket does nothing — it's already
    // on its way out.
  }, [advanceMutation]);

  const wipeTicket = useCallback((ticket) => {
    deleteMutation.mutate(ticket.id);
  }, [deleteMutation]);

  // Auto-clear 'done' tickets after the grace period. Any connected board
  // can notice and delete an aged-out ticket — duplicate delete attempts
  // from multiple tablets are harmless (the mutation just no-ops on a
  // missing record).
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const t of ticketsRef.current) {
        if (t.status === 'done' && now - new Date(t.updated_date).getTime() > DONE_AUTO_CLEAR_MS) {
          deleteMutation.mutate(t.id);
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [deleteMutation]);

  const handleVoiceNumber = useCallback((spokenText, isWipe) => {
    const parsed = parseSpokenNumber(spokenText);
    if (!parsed) return;
    const orderNumber = parsed.padStart(3, '0');
    const ticket = ticketsRef.current.find((t) => t.order_number === orderNumber && t.status !== 'done');
    if (!ticket) {
      debugLog(`voice: no active ticket found for order ${orderNumber} (heard: "${spokenText}")`);
      return;
    }
    if (isWipe) {
      wipeTicket(ticket);
      toast.success(`Order ${orderNumber} wiped`);
    } else {
      advanceTicket(ticket);
      toast.success(`Order ${orderNumber} → ${ticket.status === 'queued' ? 'ready' : 'done'}`);
    }
  }, [advanceTicket, wipeTicket]);

  // Continuous voice recognition — no push-to-talk, restarts itself on end
  // (Web Speech sessions time out after periods of silence).
  useEffect(() => {
    if (!voiceEnabled) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice control needs a browser with speech recognition support (Chrome).');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3;

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result.isFinal) return;
      const alternatives = Array.from(result).map((r) => r.transcript);
      debugLog(`heard: ${JSON.stringify(alternatives)}`);
      for (const text of alternatives) {
        const lower = text.toLowerCase();
        const isWipe = lower.includes('wipe') || lower.includes('clear') || lower.includes('remove');
        const parsed = parseSpokenNumber(text);
        if (parsed) {
          handleVoiceNumber(text, isWipe);
          break;
        }
      }
    };

    recognition.onerror = (event) => {
      debugLog(`onerror: ${event.error}`);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart to stay continuously listening, unless voice control
      // was turned off while we were mid-session.
      if (voiceEnabled) {
        try {
          recognition.start();
          setIsListening(true);
        } catch { /* already starting elsewhere */ }
      }
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch { /* ignore */ }
    recognitionRef.current = recognition;

    return () => {
      recognition.onend = null; // prevent the auto-restart firing during cleanup
      recognition.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);

  const active = tickets.filter((t) => t.status !== 'done');
  const done = tickets.filter((t) => t.status === 'done');
  const sorted = [...active, ...done];

  return (
    <div className="min-h-screen bg-[#0f172a] p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Order Board</h1>
        <button
          onClick={() => setVoiceEnabled((v) => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
            voiceEnabled && isListening ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'
          }`}
        >
          {voiceEnabled && isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          {voiceEnabled && isListening ? 'Listening' : 'Voice off'}
        </button>
      </div>

      {sorted.length === 0 && (
        <div className="text-center text-slate-500 mt-24 text-lg">No active orders</div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
        {sorted.map((ticket) => {
          const style = STATUS_STYLES[ticket.status] || STATUS_STYLES.queued;
          const Icon = style.icon;
          return (
            <button
              key={ticket.id}
              onClick={() => advanceTicket(ticket)}
              className={`${style.bg} rounded-2xl p-6 flex flex-col items-center justify-center gap-2 aspect-square active:scale-95 transition-transform shadow-lg`}
            >
              <span className="text-4xl font-bold text-white">#{ticket.order_number}</span>
              <span className="flex items-center gap-1 text-white/80 text-sm">
                <Icon className="w-4 h-4" /> {style.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
