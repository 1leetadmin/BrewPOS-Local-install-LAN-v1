import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Receipt, FileSpreadsheet, Upload, Loader2, Check, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS } from '@/lib/ingredientReports';

const TX_TYPES = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'usage', label: 'Usage' },
  { value: 'wastage', label: 'Wastage' },
  { value: 'adjustment', label: 'Adjustment' },
];

function autoMatch(name, ingredients) {
  if (!name) return '';
  const lower = name.toLowerCase();
  let match = ingredients.find(i => i.name.toLowerCase() === lower);
  if (match) return match.id;
  match = ingredients.find(i => {
    const n = i.name.toLowerCase();
    return lower.includes(n) || n.includes(lower);
  });
  return match?.id || '';
}

function safeDate(d) {
  try {
    const dt = new Date(d);
    return isNaN(dt) ? new Date().toISOString() : dt.toISOString();
  } catch { return new Date().toISOString(); }
}

function dateInputValue(d) {
  try {
    const dt = d ? new Date(d) : new Date();
    if (isNaN(dt)) return new Date().toISOString().slice(0, 10);
    return dt.toISOString().slice(0, 10);
  } catch { return new Date().toISOString().slice(0, 10); }
}

export default function ImportDialog({ open, onClose, ingredients, events, suppliers = [] }) {
  const queryClient = useQueryClient();
  const [importType, setImportType] = useState('receipt');
  const [file, setFile] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('upload');

  const reset = () => {
    setImportType('receipt'); setFile(null); setItems([]); setSelectedEvent('');
    setDate(new Date().toISOString().slice(0, 10)); setSupplier('');
    setStep('upload'); setLoading(false);
  };
  const handleClose = () => { reset(); onClose(); };

  const handleProcess = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      if (importType === 'receipt') {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `Extract all product line items from this receipt. For each: name (product name), quantity (number, default 1), unit (if mentioned like L, kg, ea), total_price (the line item total). Also extract the merchant/store/supplier name (e.g. GILMOURS, COUNTDOWN, PAKNSAVE) and receipt date (YYYY-MM-DD format). Exclude subtotals, tax, tips, and change.`,
          file_urls: [file_url],
          response_json_schema: {
            type: 'object',
            properties: {
              merchant: { type: 'string' },
              date: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    quantity: { type: 'number' },
                    unit: { type: 'string' },
                    total_price: { type: 'number' },
                  },
                },
              },
            },
          },
        });
        const extracted = result.items || [];
        if (!extracted.length) { toast.error('No items found in receipt'); return; }
        if (result.date) { try { setDate(dateInputValue(result.date)); } catch {} }
        if (result.merchant) setSupplier(result.merchant);
        setItems(extracted.map((item, i) => ({
          id: i, name: item.name || '', quantity: item.quantity || 1, unit: item.unit || '',
          total_price: item.total_price || 0, mapped_ingredient_id: autoMatch(item.name, ingredients),
          included: true, date: dateInputValue(result.date || date), transaction_type: 'purchase',
          supplier: result.merchant || '',
        })));
      } else {
        const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: {
            type: 'object',
            properties: {
              transactions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: 'string' },
                    description: { type: 'string' },
                    amount: { type: 'number' },
                  },
                },
              },
            },
          },
        });
        const extracted = result.output?.transactions || (Array.isArray(result.output) ? result.output : []);
        if (!extracted.length) { toast.error('No transactions found in file'); return; }
        setItems(extracted.map((item, i) => ({
          id: i, name: item.description || '', quantity: 1, unit: '',
          total_price: Math.abs(item.amount || 0), date: dateInputValue(item.date),
          mapped_ingredient_id: autoMatch(item.description, ingredients), included: true,
          transaction_type: 'purchase', supplier: '',
        })));
      }
      setStep('review');
    } catch (err) {
      toast.error(`Processing failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (id, field, value) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const handleImport = async () => {
    const included = items.filter(i => i.included && i.mapped_ingredient_id);
    if (!included.length) { toast.error('Map at least one item to an ingredient'); return; }
    if (!supplier.trim()) { toast.error('Please enter a supplier name'); return; }
    setLoading(true);
    try {
      const event = events.find(e => e.id === selectedEvent);
      const txData = included.map(item => {
        const ing = ingredients.find(i => i.id === item.mapped_ingredient_id);
        const qty = Number(item.quantity) || 1;
        const totalPrice = Number(item.total_price) || 0;
        return {
          ingredient_id: item.mapped_ingredient_id,
          ingredient_name: ing?.name || item.name,
          category: ing?.category || 'other',
          unit: ing?.unit || item.unit || '',
          quantity: qty,
          transaction_type: item.transaction_type || 'purchase',
          cost_per_unit: ing?.cost_per_unit || (totalPrice / qty),
          total_cost: totalPrice || (ing?.cost_per_unit || 0) * qty,
          date: safeDate(item.date || date),
          event_id: selectedEvent || undefined,
          event_name: event?.name || '',
          supplier: (item.supplier || supplier).trim(),
          notes: `Imported from ${importType === 'receipt' ? 'receipt scan' : 'bank statement'}`,
        };
      });

      await base44.entities.IngredientTransaction.bulkCreate(txData);

      const stockChanges = new Map();
      for (const tx of txData) {
        const sign = tx.transaction_type === 'purchase' ? 1 : (tx.transaction_type === 'usage' || tx.transaction_type === 'wastage') ? -1 : 0;
        if (sign !== 0) stockChanges.set(tx.ingredient_id, (stockChanges.get(tx.ingredient_id) || 0) + sign * tx.quantity);
      }
      for (const [ingId, delta] of stockChanges) {
        const ing = ingredients.find(i => i.id === ingId);
        if (ing) try { await base44.entities.Ingredient.update(ingId, { current_stock: (ing.current_stock || 0) + delta }); } catch {}
      }

      queryClient.invalidateQueries({ queryKey: ['ingredientTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success(`Imported ${txData.length} transactions`);
      handleClose();
    } catch (err) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs";
  const labelClass = "text-xs text-muted-foreground font-medium mb-0.5 block";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Import Purchases</DialogTitle></DialogHeader>
        <datalist id="supplier-list">
          {suppliers.map(s => <option key={s} value={s} />)}
        </datalist>

        {step === 'upload' && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setImportType('receipt')} className={cn('flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors', importType === 'receipt' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50')}>
                <Receipt className="w-8 h-8 text-primary" />
                <span className="text-sm font-medium">Scan Receipt</span>
                <span className="text-xs text-muted-foreground">Photo or PDF</span>
              </button>
              <button onClick={() => setImportType('statement')} className={cn('flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors', importType === 'statement' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50')}>
                <FileSpreadsheet className="w-8 h-8 text-primary" />
                <span className="text-sm font-medium">Bank Statement</span>
                <span className="text-xs text-muted-foreground">CSV or Excel</span>
              </button>
            </div>
            <div className="space-y-1.5">
              <Label>File</Label>
              <Input type="file" onChange={e => setFile(e.target.files[0])} accept={importType === 'receipt' ? 'image/*,application/pdf' : '.csv,.xlsx,.xls'} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Event (optional)</Label>
                <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">None</option>
                  {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            </div>
            <Button onClick={handleProcess} disabled={!file || loading} className="w-full gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><Upload className="w-4 h-4" /> Process File</>}
            </Button>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-3 py-2">
            {/* Supplier prompt */}
            <div className={cn('rounded-lg border-2 p-3 flex items-start gap-3', !supplier.trim() ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-muted/30')}>
              <Store className={cn('w-5 h-5 mt-0.5 shrink-0', supplier.trim() ? 'text-primary' : 'text-destructive')} />
              <div className="flex-1">
                <Label className="text-sm font-semibold">Supplier</Label>
                <p className="text-xs text-muted-foreground mb-1.5">
                  {supplier.trim() ? 'Detected — applied to all items. Override per item below if needed.' : 'Could not detect supplier. Please enter it (e.g. GILMOURS, COUNTDOWN, PAKNSAVE).'}
                </p>
                <Input
                  list="supplier-list"
                  value={supplier}
                  onChange={e => setSupplier(e.target.value)}
                  placeholder="Enter or select supplier..."
                  className="h-8"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} className="flex h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs">
                <option value="">No event</option>
                {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">applies to all items</span>
            </div>

            <p className="text-sm text-muted-foreground">All fields are editable. Click a field to change it.</p>

            {/* Item cards */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {items.map(item => (
                <div key={item.id} className={cn('rounded-lg border border-border bg-card p-3', !item.included && 'opacity-40')}>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="checkbox" checked={item.included} onChange={e => updateItem(item.id, 'included', e.target.checked)} />
                    <Input value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)} className="h-8 flex-1 text-sm font-medium" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <label className={labelClass}>Date</label>
                      <Input type="date" value={item.date || date} onChange={e => updateItem(item.id, 'date', e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className={labelClass}>Type</label>
                      <select value={item.transaction_type} onChange={e => updateItem(item.id, 'transaction_type', e.target.value)} className={inputClass}>
                        {TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Qty</label>
                      <Input type="number" step="0.01" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className={labelClass}>Price</label>
                      <Input type="number" step="0.01" value={item.total_price} onChange={e => updateItem(item.id, 'total_price', e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className={labelClass}>Supplier</label>
                      <input list="supplier-list" value={item.supplier || supplier} onChange={e => updateItem(item.id, 'supplier', e.target.value)} className={inputClass} placeholder="Override supplier" />
                    </div>
                    <div>
                      <label className={labelClass}>Map to Ingredient</label>
                      <select value={item.mapped_ingredient_id} onChange={e => updateItem(item.id, 'mapped_ingredient_id', e.target.value)} className={inputClass}>
                        <option value="">— Skip —</option>
                        {ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name} ({CATEGORY_LABELS[ing.category] || ing.category})</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={handleImport} disabled={loading || !supplier.trim()} className="gap-2">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : <><Check className="w-4 h-4" /> Import {items.filter(i => i.included && i.mapped_ingredient_id).length} Items</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}