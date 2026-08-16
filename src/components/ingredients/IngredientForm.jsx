import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { CATEGORY_LABELS } from '@/lib/ingredientReports';

export default function IngredientForm({ open, onClose, onSave, ingredient, events = [] }) {
  const isEdit = !!ingredient;
  const [form, setForm] = useState({
    name: '', category: 'milk', unit: 'L', cost_per_unit: '', current_stock: '',
    min_stock: '', supplier: '', event_id: '', custom_fields: [],
  });

  useEffect(() => {
    if (ingredient) {
      setForm({
        name: ingredient.name || '', category: ingredient.category || 'milk',
        unit: ingredient.unit || 'L', cost_per_unit: ingredient.cost_per_unit || '',
        current_stock: ingredient.current_stock || '', min_stock: ingredient.min_stock || '',
        supplier: ingredient.supplier || '', event_id: ingredient.event_id || '', custom_fields: ingredient.custom_fields || [],
      });
    } else {
      setForm({ name: '', category: 'milk', unit: 'L', cost_per_unit: '', current_stock: '', min_stock: '', supplier: '', event_id: '', custom_fields: [] });
    }
  }, [ingredient, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addCustomField = () => setForm(f => ({ ...f, custom_fields: [...f.custom_fields, { name: '', value: '' }] }));
  const updateCustomField = (i, k, v) => setForm(f => ({
    ...f, custom_fields: f.custom_fields.map((cf, idx) => idx === i ? { ...cf, [k]: v } : cf),
  }));
  const removeCustomField = (i) => setForm(f => ({ ...f, custom_fields: f.custom_fields.filter((_, idx) => idx !== i) }));

  const handleSubmit = () => {
    if (!form.name || !form.cost_per_unit) return;
    onSave({
      ...form,
      event_name: events.find(e => e.id === form.event_id)?.name || '',
      cost_per_unit: Number(form.cost_per_unit) || 0,
      current_stock: Number(form.current_stock) || 0,
      min_stock: Number(form.min_stock) || 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Ingredient' : 'Add Ingredient'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Whole Milk" />
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Unit *</Label>
              <Input value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="L, kg, ea" />
            </div>
            <div className="space-y-1.5">
              <Label>Cost/Unit *</Label>
              <Input type="number" step="0.01" value={form.cost_per_unit} onChange={e => set('cost_per_unit', e.target.value)} placeholder="2.50" />
            </div>
            <div className="space-y-1.5">
              <Label>Current Stock</Label>
              <Input type="number" step="0.01" value={form.current_stock} onChange={e => set('current_stock', e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Min Stock (reorder)</Label>
              <Input type="number" step="0.01" value={form.min_stock} onChange={e => set('min_stock', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Supplier name" />
            </div>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Custom Fields</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addCustomField} className="gap-1 h-7">
                <Plus className="w-3.5 h-3.5" /> Add Field
              </Button>
            </div>
            {form.custom_fields.map((cf, i) => (
              <div key={i} className="flex gap-2">
                <Input value={cf.name} onChange={e => updateCustomField(i, 'name', e.target.value)} placeholder="Field name" className="flex-1" />
                <Input value={cf.value} onChange={e => updateCustomField(i, 'value', e.target.value)} placeholder="Value" className="flex-1" />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeCustomField(i)} className="shrink-0">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!form.name?.trim()}>{isEdit ? 'Update' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}