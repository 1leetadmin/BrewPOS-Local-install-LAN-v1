import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CATEGORY_LABELS } from '@/lib/ingredientReports';
import { Package, CheckCircle2, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function EventReconciliation({ open, onClose, event, transactions, ingredients, onSave }) {
  const eventTxs = useMemo(() =>
    transactions.filter(t => t.event_id === event?.id),
    [transactions, event]
  );

  const summary = useMemo(() => {
    if (!event) return [];
    const map = {};
    eventTxs.forEach(t => {
      if (!map[t.ingredient_id]) {
        const ing = ingredients.find(i => i.id === t.ingredient_id);
        map[t.ingredient_id] = {
          ingredient_id: t.ingredient_id,
          ingredient_name: t.ingredient_name,
          category: t.category,
          unit: t.unit,
          cost_per_unit: ing?.cost_per_unit || t.cost_per_unit || 0,
          purchased: 0,
          used: 0,
          wasted: 0,
          kept: 0,
          purchase_cost: 0,
        };
      }
      const s = map[t.ingredient_id];
      if (t.transaction_type === 'purchase') {
        s.purchased += t.quantity;
        s.purchase_cost += t.total_cost || 0;
      } else if (t.transaction_type === 'usage') {
        s.used += t.quantity;
      } else if (t.transaction_type === 'wastage') {
        s.wasted += t.quantity;
      } else if (t.transaction_type === 'adjustment') {
        s.kept += t.quantity;
      }
    });
    return Object.values(map).map(s => ({
      ...s,
      remaining: s.purchased - s.used - s.wasted - s.kept,
      remaining_cost: (s.purchased - s.used - s.wasted - s.kept) * s.cost_per_unit,
    }));
  }, [eventTxs, ingredients, event]);

  const totals = useMemo(() => {
    const totalCost = summary.reduce((s, r) => s + r.purchase_cost, 0);
    const totalRemaining = summary.reduce((s, r) => s + (r.remaining > 0 ? r.remaining_cost : 0), 0);
    const totalWasted = summary.reduce((s, r) => s + r.wasted * r.cost_per_unit, 0);
    return { totalCost, totalRemaining, totalWasted };
  }, [summary]);

  const handleKeep = (s) => {
    onSave({
      ingredient_id: s.ingredient_id,
      ingredient_name: s.ingredient_name,
      category: s.category,
      unit: s.unit,
      quantity: s.remaining,
      transaction_type: 'adjustment',
      cost_per_unit: s.cost_per_unit,
      total_cost: s.remaining_cost,
      date: new Date().toISOString(),
      event_id: event.id,
      event_name: event.name,
      notes: `Retained in stock after ${event.name}`,
    });
  };

  const handleWriteOff = (s) => {
    onSave({
      ingredient_id: s.ingredient_id,
      ingredient_name: s.ingredient_name,
      category: s.category,
      unit: s.unit,
      quantity: s.remaining,
      transaction_type: 'wastage',
      cost_per_unit: s.cost_per_unit,
      total_cost: s.remaining_cost,
      date: new Date().toISOString(),
      event_id: event.id,
      event_name: event.name,
      notes: `Leftover wastage from ${event.name}`,
    });
  };

  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-primary" /> Reconcile: {event.name}
          </DialogTitle>
        </DialogHeader>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Total Event Cost</p>
            <p className="text-xl font-bold">${totals.totalCost.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-border bg-amber-500/10 p-3">
            <p className="text-xs text-muted-foreground">Remaining Value</p>
            <p className="text-xl font-bold text-amber-600">${totals.totalRemaining.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-border bg-destructive/10 p-3">
            <p className="text-xs text-muted-foreground">Wasted</p>
            <p className="text-xl font-bold text-destructive">${totals.totalWasted.toFixed(2)}</p>
          </div>
        </div>

        {/* Ingredient table */}
        {summary.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Package className="w-10 h-10 mb-2 opacity-40" />
            <p>No transactions logged for this event yet</p>
            <p className="text-xs mt-1">Log purchases with this event tagged to see reconciliation here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Ingredient</th>
                  <th className="px-3 py-2 font-medium text-right">Purchased</th>
                  <th className="px-3 py-2 font-medium text-right">Used</th>
                  <th className="px-3 py-2 font-medium text-right">Wasted</th>
                  <th className="px-3 py-2 font-medium text-right">Remaining</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(s => (
                  <tr key={s.ingredient_id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{s.ingredient_name}</td>
                    <td className="px-3 py-2 text-right font-mono">{s.purchased} {s.unit}</td>
                    <td className="px-3 py-2 text-right font-mono">{s.used} {s.unit}</td>
                    <td className="px-3 py-2 text-right font-mono text-destructive">{s.wasted} {s.unit}</td>
                    <td className={cn('px-3 py-2 text-right font-mono font-bold', s.remaining > 0 && 'text-amber-600')}>{s.remaining} {s.unit}</td>
                    <td className="px-3 py-2">
                      {s.remaining > 0 ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleKeep(s)}>
                            Keep in Stock
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleWriteOff(s)}>
                            Write Off
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Reconciled
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}