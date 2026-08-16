import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function EventUsageForm({ open, onClose, event, transactions, ingredients, onSave }) {
  const eventTxs = useMemo(() =>
    transactions.filter(t => t.event_id === event?.id),
    [transactions, event]
  );

  const rows = useMemo(() => {
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
        };
      }
      if (t.transaction_type === 'purchase') map[t.ingredient_id].purchased += t.quantity;
      else if (t.transaction_type === 'usage') map[t.ingredient_id].used += t.quantity;
    });
    return Object.values(map);
  }, [eventTxs, ingredients, event]);

  const [usage, setUsage] = useState({});

  const handleSave = () => {
    let count = 0;
    rows.forEach(r => {
      const totalUsed = Number(usage[r.ingredient_id]) || 0;
      const delta = totalUsed - r.used;
      if (delta > 0) {
        count++;
        onSave({
          ingredient_id: r.ingredient_id,
          ingredient_name: r.ingredient_name,
          category: r.category,
          unit: r.unit,
          quantity: delta,
          transaction_type: 'usage',
          cost_per_unit: r.cost_per_unit,
          total_cost: delta * r.cost_per_unit,
          date: new Date().toISOString(),
          event_id: event.id,
          event_name: event.name,
          notes: `Usage logged for ${event.name}`,
        });
      }
    });
    if (count > 0) toast.success(`Logged usage for ${count} ingredient(s)`);
    else toast.info('No new usage to log');
    setUsage({});
    onClose();
  };

  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log Usage: {event.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Enter the total quantity used at this event for each ingredient. Already-logged usage is shown — only the difference is saved.
        </p>
        {rows.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>No ingredients purchased for this event yet.</p>
            <p className="text-xs mt-1">Log purchases tagged to this event first.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Ingredient</th>
                  <th className="px-3 py-2 font-medium text-right">Purchased</th>
                  <th className="px-3 py-2 font-medium text-right">Already Used</th>
                  <th className="px-3 py-2 font-medium text-right">Total Used</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.ingredient_id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{r.ingredient_name}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.purchased} {r.unit}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">{r.used} {r.unit}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={String(r.used)}
                        value={usage[r.ingredient_id] ?? ''}
                        onChange={e => setUsage(u => ({ ...u, [r.ingredient_id]: e.target.value }))}
                        className="w-24 h-8 text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={rows.length === 0}>Save Usage</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}