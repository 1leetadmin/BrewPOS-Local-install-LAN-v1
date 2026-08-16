import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function PrepaidAlert({ discounts = [] }) {
  const [dismissed, setDismissed] = useState([]);

  const alerts = useMemo(() => {
    return discounts
      .filter(d => (d.prepaid_amount || 0) > 0)
      .map(d => {
        const used = d.used_amount || 0;
        const threshold = d.prepaid_amount * 0.9;
        return {
          id: d.id,
          name: d.name,
          prepaid: d.prepaid_amount,
          used,
          remaining: d.prepaid_amount - used,
          pct: Math.min(100, (used / d.prepaid_amount) * 100),
          isAlert: used >= threshold,
        };
      })
      .filter(a => a.isAlert && !dismissed.includes(a.id));
  }, [discounts, dismissed]);

  if (alerts.length === 0) return null;

  const current = alerts[0];

  return (
    <Dialog open={true} onOpenChange={(open) => {
      if (!open) setDismissed(prev => [...prev, current.id]);
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" /> Prepaid Discount Running Low
          </DialogTitle>
          <DialogDescription className="pt-2">
            <span className="text-sm font-medium text-foreground block mb-2">
              "{current.name}" has used {current.pct.toFixed(0)}% of its prepaid balance.
            </span>
            <span className="text-sm block">Used: ${current.used.toFixed(2)} of ${current.prepaid.toFixed(2)}</span>
            <span className="text-sm block">Remaining: ${current.remaining.toFixed(2)}</span>
          </DialogDescription>
        </DialogHeader>
        <Button onClick={() => setDismissed(prev => [...prev, current.id])}>
          Acknowledge
        </Button>
      </DialogContent>
    </Dialog>
  );
}