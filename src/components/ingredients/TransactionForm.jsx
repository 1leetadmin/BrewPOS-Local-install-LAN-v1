import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CATEGORY_LABELS } from '@/lib/ingredientReports';

const TX_TYPES = [
  { value: 'purchase', label: 'Purchase (Stock In)', sign: 1 },
  { value: 'usage', label: 'Usage (Stock Out)', sign: -1 },
  { value: 'wastage', label: 'Wastage', sign: -1 },
  { value: 'adjustment', label: 'Adjustment', sign: 0 },
];

export default function TransactionForm({ open, onClose, onSave, ingredients, events, transaction }) {
  const isEdit = !!transaction;
  const [form, setForm] = useState({
    ingredient_id: '', transaction_type: 'purchase', quantity: '', date: '',
    event_id: '', notes: '',
  });

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      const d = new Date(transaction.date);
      const tzOffset = d.getTimezoneOffset() * 60000;
      setForm({
        ingredient_id: transaction.ingredient_id || '',
        transaction_type: transaction.transaction_type || 'purchase',
        quantity: String(transaction.quantity || ''),
        date: new Date(d - tzOffset).toISOString().slice(0, 16),
        event_id: transaction.event_id || '',
        notes: transaction.notes || '',
      });
    } else {
      const now = new Date();
      const tzOffset = now.getTimezoneOffset() * 60000;
      setForm(f => ({
        ...f, date: new Date(now - tzOffset).toISOString().slice(0, 16),
        ingredient_id: f.ingredient_id || (ingredients[0]?.id || ''),
      }));
    }
  }, [open, transaction, ingredients]);

  const selected = ingredients.find(i => i.id === form.ingredient_id);
  const txType = TX_TYPES.find(t => t.value === form.transaction_type);
  const costPerUnit = selected?.cost_per_unit || 0;
  const qty = Number(form.quantity) || 0;
  const totalCost = qty * costPerUnit;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.ingredient_id || !form.quantity) return;
    onSave({
      ingredient_id: form.ingredient_id,
      ingredient_name: selected?.name || '',
      category: selected?.category || 'other',
      unit: selected?.unit || '',
      quantity: qty,
      transaction_type: form.transaction_type,
      cost_per_unit: costPerUnit,
      total_cost: totalCost,
      date: new Date(form.date).toISOString(),
      event_id: form.event_id || undefined,
      event_name: events.find(e => e.id === form.event_id)?.name || '',
      notes: form.notes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Transaction' : 'Log Transaction'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Ingredient *</Label>
            <select value={form.ingredient_id} onChange={e => set('ingredient_id', e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({CATEGORY_LABELS[i.category] || i.category}) — ${i.cost_per_unit?.toFixed(2)}/{i.unit}</option>)}
            </select>
            {selected && (
              <p className="text-xs text-muted-foreground">Stock: {selected.current_stock} {selected.unit} · Cost: ${costPerUnit.toFixed(2)}/{selected.unit}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <select value={form.transaction_type} onChange={e => set('transaction_type', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                {TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity *</Label>
              <Input type="number" step="0.01" value={form.quantity} onChange={e => set('quantity', e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Date & Time</Label>
            <Input type="datetime-local" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          {events.length > 0 && (
            <div className="space-y-1.5">
              <Label>Event (optional)</Label>
              <select value={form.event_id} onChange={e => set('event_id', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="">None</option>
                {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Optional notes..." />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
            <span className="text-sm text-muted-foreground">Total Cost</span>
            <span className="text-lg font-bold text-primary">${totalCost.toFixed(2)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!form.ingredient_id || !form.quantity}>{isEdit ? 'Update' : 'Save'} Transaction</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}