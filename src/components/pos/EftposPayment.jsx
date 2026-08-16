import { useState, useRef, useCallback, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Wifi, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 45; // 90 seconds total

// EFTPOS payment flow for the Shift4 SmartConnect integration.
// Sends the total to the paired terminal, polls for approval, then calls
// onComplete with the eftpos payment data.
export default function EftposPayment({ total, onComplete }) {
  const [status, setStatus] = useState('idle'); // idle | sending | waiting | approved | declined | timeout | error
  const [error, setError] = useState('');
  const pollTimerRef = useRef(null);
  const attemptRef = useRef(0);
  const completedRef = useRef(false);

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => { clearPoll(); }, [clearPoll]);

  const finishApproved = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setStatus('approved');
    clearPoll();
    setTimeout(() => onComplete({
      payment_method: 'eftpos',
      amount_paid: total,
      change_due: 0,
    }), 800);
  }, [clearPoll, onComplete, total]);

  const pollStatus = useCallback(async (txId) => {
    attemptRef.current += 1;
    try {
      const res = await base44.functions.invoke('smartconnect', {
        action: 'status',
        transactionId: txId,
      });
      const data = res.data || res;
      if (data.approved) {
        finishApproved();
        return;
      }
      if (data.declined) {
        clearPoll();
        setStatus('declined');
        setError('Payment declined on terminal');
        return;
      }
    } catch {
      // transient network error — keep polling
    }
    if (attemptRef.current >= MAX_POLL_ATTEMPTS) {
      clearPoll();
      setStatus('timeout');
      setError('Terminal did not respond in time');
      return;
    }
    pollTimerRef.current = setTimeout(() => pollStatus(txId), POLL_INTERVAL_MS);
  }, [clearPoll, finishApproved]);

  const sendToTerminal = useCallback(async () => {
    setStatus('sending');
    setError('');
    attemptRef.current = 0;
    completedRef.current = false;
    try {
      const res = await base44.functions.invoke('smartconnect', {
        action: 'transaction',
        amount: total,
      });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);

      if (data.status === 'approved' || data.status === 'completed') {
        finishApproved();
        return;
      }
      if (data.status === 'declined') {
        setStatus('declined');
        setError('Payment declined on terminal');
        return;
      }

      setStatus('waiting');
      pollTimerRef.current = setTimeout(() => pollStatus(data.transactionId), POLL_INTERVAL_MS);
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Failed to send to terminal');
    }
  }, [total, pollStatus, finishApproved]);

  const retry = useCallback(() => {
    clearPoll();
    setStatus('idle');
    setError('');
    attemptRef.current = 0;
    completedRef.current = false;
  }, [clearPoll]);

  if (status === 'approved') {
    return (
      <div className="text-center py-6 space-y-3">
        <CheckCircle2 className="w-16 h-16 mx-auto text-green-500" />
        <p className="text-lg font-bold text-green-600">Payment Approved</p>
      </div>
    );
  }

  if (status === 'sending' || status === 'waiting') {
    return (
      <div className="text-center py-6 space-y-3">
        <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
        <div>
          <p className="text-lg font-bold">{status === 'sending' ? 'Sending to terminal…' : 'Waiting for terminal…'}</p>
          <p className="text-sm text-muted-foreground mt-1">Follow the prompts on the EFTPOS device</p>
        </div>
        <Button variant="outline" onClick={retry}>Cancel</Button>
      </div>
    );
  }

  if (status === 'declined' || status === 'timeout' || status === 'error') {
    return (
      <div className="text-center py-6 space-y-3">
        <XCircle className="w-16 h-16 mx-auto text-destructive" />
        <div>
          <p className="text-lg font-bold text-destructive">
            {status === 'declined' ? 'Declined' : status === 'timeout' ? 'Timed Out' : 'Error'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
        <Button onClick={retry} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Try Again
        </Button>
      </div>
    );
  }

  // idle
  return (
    <div className="space-y-3">
      <div className="text-center py-4 bg-muted rounded-xl">
        <Wifi className="w-10 h-10 mx-auto text-primary mb-2" />
        <p className="text-sm text-muted-foreground">Send ${total.toFixed(2)} to the EFTPOS terminal</p>
      </div>
      <Button
        onClick={sendToTerminal}
        className="w-full h-12 text-base font-bold shadow-lg shadow-primary/25 gap-2"
      >
        <Wifi className="w-5 h-5" />
        Send to Terminal
      </Button>
    </div>
  );
}