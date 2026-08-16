import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, TrendingDown, Trash2, RotateCcw, ShoppingCart, CalendarRange, Plus, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BwSelect } from '@/components/ingredients/BwSelect';
import { CATEGORY_LABELS, getSummary, aggregateByCategory } from '@/lib/ingredientReports';
import ExportButtons from '@/components/reports/ExportButtons';
import { exportCSV, exportPDF, exportDOCX, exportEmail } from '@/lib/ingredientExports';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function EventCenter({ events, transactions, ingredients, onLogTransaction, onCreateEvent }) {
  const [selectedEventId, setSelectedEventId] = useState('');
  const [actionType, setActionType] = useState({});
  const [actionQty, setActionQty] = useState({});

  const selectedEvent = events.find(e => e.id === selectedEventId);

  const eventTxs = useMemo(() =>
    transactions.filter(t => t.event_id === selectedEventId),
    [transactions, selectedEventId]
  );

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['timeEntries'],
    queryFn: () => base44.entities.TimeEntry.list('-clock_in', 500),
  });

  const eventLabor = useMemo(() =>
    timeEntries.filter(t => t.event_id === selectedEventId && t.status === 'completed'),
    [timeEntries, selectedEventId]
  );

  const laborCost = useMemo(() =>
    eventLabor.reduce((s, e) => s + (Number(e.total_cost) || 0), 0),
    [eventLabor]
  );

  const rows = useMemo(() => {
    if (!selectedEventId) return [];
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
          purchased: 0, used: 0, wasted: 0, kept: 0,
          purchase_cost: 0,
        };
      }
      const s = map[t.ingredient_id];
      if (t.transaction_type === 'purchase') { s.purchased += t.quantity; s.purchase_cost += t.total_cost || 0; }
      else if (t.transaction_type === 'usage') s.used += t.quantity;
      else if (t.transaction_type === 'wastage') s.wasted += t.quantity;
      else if (t.transaction_type === 'adjustment') s.kept += t.quantity;
    });
    return Object.values(map).map(s => ({
      ...s,
      remaining: s.purchased - s.used - s.wasted - s.kept,
      used_cost: s.used * s.cost_per_unit,
      wasted_cost: s.wasted * s.cost_per_unit,
      remaining_cost: Math.max(0, s.remaining) * s.cost_per_unit,
    }));
  }, [eventTxs, ingredients, selectedEventId]);

  const totals = useMemo(() => ({
    purchased: rows.reduce((s, r) => s + r.purchase_cost, 0),
    used: rows.reduce((s, r) => s + r.used_cost, 0),
    wasted: rows.reduce((s, r) => s + r.wasted_cost, 0),
    remaining: rows.reduce((s, r) => s + r.remaining_cost, 0),
    labor: laborCost,
  }), [rows, laborCost]);

  const handleLog = (row) => {
    const qty = Number(actionQty[row.ingredient_id]) || 0;
    const type = actionType[row.ingredient_id] || 'usage';
    if (qty <= 0) { toast.error('Enter a quantity'); return; }
    onLogTransaction({
      ingredient_id: row.ingredient_id,
      ingredient_name: row.ingredient_name,
      category: row.category,
      unit: row.unit,
      quantity: qty,
      transaction_type: type,
      cost_per_unit: row.cost_per_unit,
      total_cost: qty * row.cost_per_unit,
      date: new Date().toISOString(),
      event_id: selectedEvent.id,
      event_name: selectedEvent.name,
      notes: `${type} for ${selectedEvent.name}`,
    });
    setActionQty(q => ({ ...q, [row.ingredient_id]: '' }));
  };

  const handleEventExport = (type) => {
    if (eventTxs.length === 0) { toast.error('No data to export'); return; }
    const summary = getSummary(eventTxs);
    const byCategory = aggregateByCategory(eventTxs);
    const label = selectedEvent?.name || 'Event';
    try {
      if (type === 'csv') exportCSV(eventTxs, summary, label);
      else if (type === 'pdf') exportPDF(eventTxs, summary, byCategory, label);
      else if (type === 'docx') exportDOCX(eventTxs, summary, byCategory, label);
      else if (type === 'email') exportEmail(eventTxs, summary, label);
      toast.success(`Exported to ${type.toUpperCase()}`);
    } catch (err) { toast.error(`Export failed: ${err.message}`); }
  };

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <CalendarRange className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-lg font-medium">No events yet</p>
        <p className="text-sm mt-1">Create an event to start managing ingredient usage.</p>
        <Button size="sm" className="mt-4 gap-1.5" onClick={onCreateEvent}><Plus className="w-4 h-4" /> Create Event</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <CalendarRange className="w-5 h-5 text-primary" />
        <BwSelect
          value={selectedEventId}
          onChange={setSelectedEventId}
          placeholder="Select an event..."
          className="w-64"
          options={events.map(e => ({ value: e.id, label: e.name }))}
        />
        {selectedEvent && (
          <span className="text-sm text-muted-foreground">
            {format(new Date(selectedEvent.start_date), 'dd MMM')} — {format(new Date(selectedEvent.end_date), 'dd MMM yyyy')}
          </span>
        )}
        {selectedEvent && (
          <ExportButtons onExport={handleEventExport} disabled={eventTxs.length === 0} />
        )}
      </div>

      {!selectedEventId ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <CalendarRange className="w-12 h-12 mb-3 opacity-40" />
          <p>Select an event above to view and manage ingredient usage</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryCard label="Purchased" value={`$${totals.purchased.toFixed(2)}`} icon={ShoppingCart} color="text-green-600" />
            <SummaryCard label="Used" value={`$${totals.used.toFixed(2)}`} icon={TrendingDown} color="text-blue-600" />
            <SummaryCard label="Wasted" value={`$${totals.wasted.toFixed(2)}`} icon={Trash2} color="text-destructive" />
            <SummaryCard label="Remaining" value={`$${totals.remaining.toFixed(2)}`} icon={RotateCcw} color="text-amber-600" />
            <SummaryCard label="Labor" value={`$${totals.labor.toFixed(2)}`} icon={Clock} color="text-purple-600" />
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="w-10 h-10 mb-2 opacity-40" />
              <p>No ingredients purchased for this event yet</p>
              <p className="text-xs mt-1">Log a purchase with this event tagged to see it here.</p>
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
                    <th className="px-3 py-2 font-medium text-right">Cost/Unit</th>
                    <th className="px-3 py-2 font-medium text-right">Total Cost</th>
                    <th className="px-3 py-2 font-medium">Log Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.ingredient_id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">
                        {r.ingredient_name}
                        <span className="block text-xs text-muted-foreground">{CATEGORY_LABELS[r.category] || r.category}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{r.purchased} {r.unit}</td>
                      <td className="px-3 py-2 text-right font-mono text-blue-600">{r.used} {r.unit}</td>
                      <td className="px-3 py-2 text-right font-mono text-destructive">{r.wasted} {r.unit}</td>
                      <td className={cn('px-3 py-2 text-right font-mono font-bold', r.remaining > 0 && 'text-amber-600')}>{r.remaining} {r.unit}</td>
                      <td className="px-3 py-2 text-right font-mono">${(r.cost_per_unit || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">${(r.purchase_cost || 0).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Qty"
                            value={actionQty[r.ingredient_id] ?? ''}
                            onChange={e => setActionQty(q => ({ ...q, [r.ingredient_id]: e.target.value }))}
                            className="w-16 h-7 text-xs"
                          />
                          <BwSelect
                            value={actionType[r.ingredient_id] || 'usage'}
                            onChange={(v) => setActionType(t => ({ ...t, [r.ingredient_id]: v }))}
                            className="w-28"
                            options={[
                              { value: 'usage', label: 'Usage' },
                              { value: 'wastage', label: 'Wastage' },
                              { value: 'adjustment', label: 'Return' },
                            ]}
                          />
                          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleLog(r)}>Log</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {eventLabor.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted/50 px-3 py-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-semibold">Staff Labor</h3>
                <span className="text-xs text-muted-foreground ml-auto">{eventLabor.length} entries · ${laborCost.toFixed(2)}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="px-3 py-1.5 font-medium">Staff</th>
                    <th className="px-3 py-1.5 font-medium">Clock In</th>
                    <th className="px-3 py-1.5 font-medium">Clock Out</th>
                    <th className="px-3 py-1.5 font-medium text-right">Hours</th>
                    <th className="px-3 py-1.5 font-medium text-right">Rate</th>
                    <th className="px-3 py-1.5 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {eventLabor.map(e => (
                    <tr key={e.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5 font-medium">{e.staff_name}</td>
                      <td className="px-3 py-1.5">{format(new Date(e.clock_in), 'dd/MM HH:mm')}</td>
                      <td className="px-3 py-1.5">{e.clock_out ? format(new Date(e.clock_out), 'dd/MM HH:mm') : '—'}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{(e.hours || 0).toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">${(e.hourly_rate || 0).toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold">${(e.total_cost || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <Icon className={cn('w-4 h-4', color || 'text-muted-foreground')} />
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}