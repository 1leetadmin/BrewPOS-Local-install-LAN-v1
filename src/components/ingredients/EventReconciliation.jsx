import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  // Split editor: how much of each ingredient's remaining quantity is being
  // written off as wastage — the rest is implicitly kept in stock. Editing
  // either field updates the other to the complement automatically.
  const [splitWasted, setSplitWasted] = useState({}); // { [ingredient_id]: string }
  const round2 = (n) => Math.round(n * 100) / 100;

  const getKeptValue = (s) => {
    const raw = splitWasted[s.ingredient_id];
    if (raw === undefined || raw === '') return s.remaining;
    const wasted = Math.max(0, Math.min(s.remaining, Number(raw) || 0));
    return round2(s.remaining - wasted);
  };

  const setWasted = (s, value) => {
    if (value === '') { setSplitWasted((prev) => ({ ...prev, [s.ingredient_id]: '' })); return; }
    const clamped = Math.max(0, Math.min(s.remaining, Number(value) || 0));
    setSplitWasted((prev) => ({ ...prev, [s.ingredient_id]: String(clamped) }));
  };
  const setKept = (s, value) => {
    if (value === '') { setSplitWasted((prev) => ({ ...prev, [s.ingredient_id]: '' })); return; }
    const kept = Math.max(0, Math.min(s.remaining, Number(value) || 0));
    setWasted(s, s.remaining - kept);
  };

  const handleApplySplit = (s) => {
    const wastedQty = round2(Math.max(0, Math.min(s.remaining, Number(splitWasted[s.ingredient_id]) || 0)));
    const keptQty = round2(s.remaining - wastedQty);

    if (wastedQty > 0) {
      onSave({
        ingredient_id: s.ingredient_id,
        ingredient_name: s.ingredient_name,
        category: s.category,
        unit: s.unit,
        quantity: wastedQty,
        transaction_type: 'wastage',
        cost_per_unit: s.cost_per_unit,
        total_cost: round2(wastedQty * s.cost_per_unit),
        date: new Date().toISOString(),
        event_id: event.id,
        event_name: event.name,
        notes: `Leftover wastage from ${event.name}`,
      });
    }
    if (keptQty > 0) {
      onSave({
        ingredient_id: s.ingredient_id,
        ingredient_name: s.ingredient_name,
        category: s.category,
        unit: s.unit,
        quantity: keptQty,
        transaction_type: 'adjustment',
        cost_per_unit: s.cost_per_unit,
        total_cost: round2(keptQty * s.cost_per_unit),
        date: new Date().toISOString(),
        event_id: event.id,
        event_name: event.name,
        notes: `Retained in stock after ${event.name}`,
      });
    }
    setSplitWasted((prev) => {
      const next = { ...prev };
      delete next[s.ingredient_id];
      return next;
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
                  <th className="px-3 py-2 font-medium text-center" colSpan={2}>Split remaining</th>
                  <th className="px-3 py-2 font-medium"></th>
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
                    {s.remaining > 0 ? (
                      <>
                        <td className="px-2 py-2">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] text-muted-foreground">Wastage</span>
                            <Input
                              type="number"
                              min="0"
                              max={s.remaining}
                              step="0.01"
                              placeholder="0"
                              value={splitWasted[s.ingredient_id] ?? ''}
                              onChange={e => setWasted(s, e.target.value)}
                              className="w-20 h-7 text-right text-xs"
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] text-muted-foreground">Keep in Stock</span>
                            <Input
                              type="number"
                              min="0"
                              max={s.remaining}
                              step="0.01"
                              value={getKeptValue(s)}
                              onChange={e => setKept(s, e.target.value)}
                              className="w-20 h-7 text-right text-xs"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Button size="sm" className="h-7 text-xs" onClick={() => handleApplySplit(s)}>
                            Apply
                          </Button>
                        </td>
                      </>
                    ) : (
                      <td className="px-3 py-2" colSpan={3}>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Reconciled
                        </span>
                      </td>
                    )}
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