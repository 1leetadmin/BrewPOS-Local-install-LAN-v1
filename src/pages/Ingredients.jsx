import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, Package, ArrowLeftRight, Flag, Search, AlertTriangle, Upload, LayoutGrid, List, TrendingDown, CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS, getSummary, aggregateByCategory } from '@/lib/ingredientReports';
import ExportButtons from '@/components/reports/ExportButtons';
import { exportCSV, exportPDF, exportDOCX, exportEmail, exportIngredientsCSV, exportIngredientsPDF, exportIngredientsDOCX, exportIngredientsEmail, exportEventsCSV, exportEventsPDF, exportEventsDOCX, exportEventsEmail } from '@/lib/ingredientExports';
import { format } from 'date-fns';
import IngredientForm from '@/components/ingredients/IngredientForm';
import TransactionForm from '@/components/ingredients/TransactionForm';
import EventForm from '@/components/ingredients/EventForm';
import ImportDialog from '@/components/ingredients/ImportDialog';
import EventReconciliation from '@/components/ingredients/EventReconciliation';
import EventUsageForm from '@/components/ingredients/EventUsageForm';
import EventCenter from '@/components/ingredients/EventCenter';
import { BwSelect } from '@/components/ingredients/BwSelect';

const TABS = [
  { id: 'ingredients', label: 'Ingredients', icon: Package },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'events', label: 'Events', icon: Flag },
  { id: 'event-center', label: 'Event Center', icon: CalendarRange },
];

export default function Ingredients() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('ingredients');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('name');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [ingredientForm, setIngredientForm] = useState(null);
  const [txForm, setTxForm] = useState(false);
  const [eventForm, setEventForm] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reconcileEvent, setReconcileEvent] = useState(null);
  const [usageEvent, setUsageEvent] = useState(null);
  const [editingTx, setEditingTx] = useState(null);

  const { data: ingredients = [] } = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => base44.entities.Ingredient.list('name', 500),
  });
  const { data: transactions = [] } = useQuery({
    queryKey: ['ingredientTransactions'],
    queryFn: () => base44.entities.IngredientTransaction.list('-date', 500),
  });
  const { data: events = [] } = useQuery({
    queryKey: ['events'],
    queryFn: () => base44.entities.Event.list('start_date', 100),
  });

  const ingredientMutation = useMutation({
    mutationFn: async ({ data, id }) => id
      ? base44.entities.Ingredient.update(id, data)
      : base44.entities.Ingredient.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ingredients'] }); toast.success('Ingredient saved'); setIngredientForm(null); },
    onError: (e) => toast.error(e.message),
  });

  const txMutation = useMutation({
    mutationFn: async ({ data, id }) => id
      ? base44.entities.IngredientTransaction.update(id, data)
      : base44.entities.IngredientTransaction.create(data),
    onSuccess: async (_, { data, id }) => {
      queryClient.invalidateQueries({ queryKey: ['ingredientTransactions'] });
      const sign = (type) => type === 'purchase' ? 1 : (type === 'usage' || type === 'wastage') ? -1 : 0;
      // Reverse old transaction's stock effect (if editing)
      if (id) {
        const oldTx = transactions.find(t => t.id === id);
        if (oldTx?.ingredient_id) {
          try {
            const fresh = await base44.entities.Ingredient.filter({ id: oldTx.ingredient_id });
            const oldIng = fresh[0];
            if (oldIng) await base44.entities.Ingredient.update(oldIng.id, { current_stock: (oldIng.current_stock || 0) - sign(oldTx.transaction_type) * oldTx.quantity });
          } catch {}
        }
      }
      // Apply new transaction's stock effect
      if (data.ingredient_id) {
        try {
          const fresh = await base44.entities.Ingredient.filter({ id: data.ingredient_id });
          const newIng = fresh[0];
          if (newIng) await base44.entities.Ingredient.update(newIng.id, { current_stock: (newIng.current_stock || 0) + sign(data.transaction_type) * data.quantity });
        } catch {}
      }
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success(id ? 'Transaction updated' : 'Transaction logged');
      setTxForm(false);
      setEditingTx(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const eventMutation = useMutation({
    mutationFn: async ({ data, id }) => id
      ? base44.entities.Event.update(id, data)
      : base44.entities.Event.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['events'] }); toast.success('Event saved'); setEventForm(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteIngredient = async (ing) => {
    if (!confirm(`Delete "${ing.name}"? This won't delete past transactions.`)) return;
    try { await base44.entities.Ingredient.delete(ing.id); queryClient.invalidateQueries({ queryKey: ['ingredients'] }); toast.success('Deleted'); }
    catch (e) { toast.error(e.message); }
  };

  const deleteTx = async (tx) => {
    if (!confirm('Delete this transaction?')) return;
    try {
      await base44.entities.IngredientTransaction.delete(tx.id);
      const sign = tx.transaction_type === 'purchase' ? 1 : (tx.transaction_type === 'usage' || tx.transaction_type === 'wastage') ? -1 : 0;
      if (sign !== 0 && tx.ingredient_id) {
        const fresh = await base44.entities.Ingredient.filter({ id: tx.ingredient_id });
        const ing = fresh[0];
        if (ing) await base44.entities.Ingredient.update(ing.id, { current_stock: (ing.current_stock || 0) - sign * tx.quantity });
      }
      queryClient.invalidateQueries({ queryKey: ['ingredientTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      toast.success('Deleted');
    } catch (e) { toast.error(e.message); }
  };

  const deleteEvent = async (ev) => {
    if (!confirm(`Delete event "${ev.name}"?`)) return;
    try { await base44.entities.Event.delete(ev.id); queryClient.invalidateQueries({ queryKey: ['events'] }); toast.success('Deleted'); }
    catch (e) { toast.error(e.message); }
  };

  const handleIngredientsExport = (type) => {
    if (filteredIngredients.length === 0) { toast.error('No data to export'); return; }
    try {
      if (type === 'csv') exportIngredientsCSV(filteredIngredients);
      else if (type === 'pdf') exportIngredientsPDF(filteredIngredients);
      else if (type === 'docx') exportIngredientsDOCX(filteredIngredients);
      else if (type === 'email') exportIngredientsEmail(filteredIngredients);
      toast.success(`Exported to ${type.toUpperCase()}`);
    } catch (err) { toast.error(`Export failed: ${err.message}`); }
  };

  const handleTransactionsExport = (type) => {
    if (transactions.length === 0) { toast.error('No data to export'); return; }
    const summary = getSummary(transactions);
    const byCategory = aggregateByCategory(transactions);
    try {
      if (type === 'csv') exportCSV(transactions, summary, 'All Transactions');
      else if (type === 'pdf') exportPDF(transactions, summary, byCategory, 'All Transactions');
      else if (type === 'docx') exportDOCX(transactions, summary, byCategory, 'All Transactions');
      else if (type === 'email') exportEmail(transactions, summary, 'All Transactions');
      toast.success(`Exported to ${type.toUpperCase()}`);
    } catch (err) { toast.error(`Export failed: ${err.message}`); }
  };

  const handleEventsExport = (type) => {
    if (events.length === 0) { toast.error('No data to export'); return; }
    try {
      if (type === 'csv') exportEventsCSV(events);
      else if (type === 'pdf') exportEventsPDF(events);
      else if (type === 'docx') exportEventsDOCX(events);
      else if (type === 'email') exportEventsEmail(events);
      toast.success(`Exported to ${type.toUpperCase()}`);
    } catch (err) { toast.error(`Export failed: ${err.message}`); }
  };

  const filteredIngredients = useMemo(() => {
    let result = [...ingredients];
    if (search) result = result.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    if (categoryFilter !== 'all') result = result.filter(i => i.category === categoryFilter);
    if (supplierFilter !== 'all') result = result.filter(i => i.supplier === supplierFilter);
    result.sort((a, b) => {
      switch (sortBy) {
        case 'category': return (a.category || '').localeCompare(b.category || '');
        case 'stock': return (a.current_stock || 0) - (b.current_stock || 0);
        case 'cost': return (a.cost_per_unit || 0) - (b.cost_per_unit || 0);
        case 'supplier': return (a.supplier || '').localeCompare(b.supplier || '');
        default: return (a.name || '').localeCompare(b.name || '');
      }
    });
    return result;
  }, [ingredients, search, categoryFilter, supplierFilter, sortBy]);

  const suppliers = useMemo(() => {
    const set = new Set();
    ingredients.forEach(i => { if (i.supplier) set.add(i.supplier); });
    transactions.forEach(t => { if (t.supplier) set.add(t.supplier); });
    return Array.from(set).sort();
  }, [ingredients, transactions]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  tab === t.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {tab === 'ingredients' && (
            <>
              <ExportButtons onExport={handleIngredientsExport} disabled={filteredIngredients.length === 0} />
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 w-48" />
              </div>
              <Button size="sm" onClick={() => setIngredientForm({})} className="gap-1.5"><Plus className="w-4 h-4" /> Add</Button>
            </>
          )}
          {tab === 'transactions' && (
            <div className="flex items-center gap-2">
              <ExportButtons onExport={handleTransactionsExport} disabled={transactions.length === 0} />
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5"><Upload className="w-4 h-4" /> Import</Button>
              <Button size="sm" onClick={() => { setEditingTx(null); setTxForm(true); }} className="gap-1.5"><Plus className="w-4 h-4" /> Log Transaction</Button>
            </div>
          )}
          {tab === 'events' && (
            <div className="flex items-center gap-2">
              <ExportButtons onExport={handleEventsExport} disabled={events.length === 0} />
              <Button size="sm" onClick={() => setEventForm({})} className="gap-1.5"><Plus className="w-4 h-4" /> Add Event</Button>
            </div>
          )}
        </div>
      </div>

      {/* Ingredients toolbar */}
      {tab === 'ingredients' && (
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap bg-card/30">
          <div className="flex border rounded-md overflow-hidden">
            <button onClick={() => setViewMode('grid')} className={cn('px-2 py-1.5 flex items-center', viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={cn('px-2 py-1.5 flex items-center', viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}>
              <List className="w-4 h-4" />
            </button>
          </div>
          <BwSelect
            value={sortBy}
            onChange={setSortBy}
            placeholder="Sort by"
            className="w-36"
            options={[
              { value: 'name', label: 'Sort: Name' },
              { value: 'category', label: 'Sort: Category' },
              { value: 'stock', label: 'Sort: Stock Level' },
              { value: 'cost', label: 'Sort: Cost' },
              { value: 'supplier', label: 'Sort: Supplier' },
            ]}
          />
          <BwSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            placeholder="All Categories"
            className="w-40"
            options={[
              { value: 'all', label: 'All Categories' },
              ...Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l })),
            ]}
          />
          <BwSelect
            value={supplierFilter}
            onChange={setSupplierFilter}
            placeholder="All Suppliers"
            className="w-40"
            options={[
              { value: 'all', label: 'All Suppliers' },
              ...suppliers.map(s => ({ value: s, label: s })),
            ]}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'ingredients' && viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredIngredients.map(ing => {
              const lowStock = ing.min_stock > 0 && (ing.current_stock || 0) <= ing.min_stock;
              return (
                <div key={ing.id} className="rounded-xl border border-border bg-card p-4 relative group">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{ing.name}</h3>
                      <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[ing.category] || ing.category}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setIngredientForm(ing)} className="p-1 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteIngredient(ing)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Stock: </span><span className={cn('font-medium', lowStock && 'text-destructive')}>{ing.current_stock || 0} {ing.unit}</span></div>
                    <div><span className="text-muted-foreground">Cost: </span><span className="font-medium">${(ing.cost_per_unit || 0).toFixed(2)}/{ing.unit}</span></div>
                    <div><span className="text-muted-foreground">Min: </span><span className="font-medium">{ing.min_stock || 0} {ing.unit}</span></div>
                    <div><span className="text-muted-foreground">Supplier: </span><span className="font-medium">{ing.supplier || '—'}</span></div>
                  </div>
                  {ing.custom_fields?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border flex flex-wrap gap-1">
                      {ing.custom_fields.map((cf, i) => (
                        <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded">{cf.name}: {cf.value}</span>
                      ))}
                    </div>
                  )}
                  {lowStock && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="w-3 h-3" /> Low stock — reorder needed
                    </div>
                  )}
                </div>
              );
            })}
            {filteredIngredients.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Package className="w-10 h-10 mb-2 opacity-40" />
                <p>No ingredients yet</p>
                <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setIngredientForm({})}><Plus className="w-4 h-4" /> Add your first ingredient</Button>
              </div>
            )}
          </div>
        )}

        {tab === 'ingredients' && viewMode === 'list' && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium text-right">Stock</th>
                  <th className="px-3 py-2 font-medium text-right">Cost/Unit</th>
                  <th className="px-3 py-2 font-medium text-right">Min Stock</th>
                  <th className="px-3 py-2 font-medium">Supplier</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredIngredients.map(ing => {
                  const lowStock = ing.min_stock > 0 && (ing.current_stock || 0) <= ing.min_stock;
                  return (
                    <tr key={ing.id} className="border-t border-border hover:bg-muted/30 group">
                      <td className="px-3 py-2 font-medium">{ing.name}</td>
                      <td className="px-3 py-2">{CATEGORY_LABELS[ing.category] || ing.category}</td>
                      <td className={cn('px-3 py-2 text-right font-mono', lowStock && 'text-destructive font-bold')}>{ing.current_stock || 0} {ing.unit}</td>
                      <td className="px-3 py-2 text-right font-mono">${(ing.cost_per_unit || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono">{ing.min_stock || 0}</td>
                      <td className="px-3 py-2">{ing.supplier || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setIngredientForm(ing)} className="p-1 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteIngredient(ing)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredIngredients.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">No ingredients found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'transactions' && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Ingredient</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} className="border-t border-border hover:bg-muted/30 group">
                    <td className="px-3 py-2 whitespace-nowrap">{format(new Date(t.date), 'dd/MM/yy HH:mm')}</td>
                    <td className="px-3 py-2 font-medium">{t.ingredient_name}</td>
                    <td className="px-3 py-2">{CATEGORY_LABELS[t.category] || t.category}</td>
                    <td className="px-3 py-2">
                      <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium',
                        t.transaction_type === 'wastage' ? 'bg-destructive/15 text-destructive' :
                        t.transaction_type === 'purchase' ? 'bg-green-500/15 text-green-600' :
                        t.transaction_type === 'usage' ? 'bg-blue-500/15 text-blue-600' : 'bg-muted text-muted-foreground')}>
                        {t.transaction_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{t.quantity} {t.unit}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">${(t.total_cost || 0).toFixed(2)}</td>
                    <td className="px-3 py-2">{t.event_name || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingTx(t); setTxForm(true); }} className="p-1 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteTx(t)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">No transactions logged yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'events' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {events.map(ev => (
              <div key={ev.id} className="rounded-xl border border-border bg-card p-4 group relative">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2"><Flag className="w-4 h-4 text-primary" /> {ev.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(ev.start_date), 'dd MMM yyyy')} — {format(new Date(ev.end_date), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEventForm(ev)} className="p-1 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteEvent(ev)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                  </div>
                </div>
                {ev.description && <p className="text-sm text-muted-foreground mt-2">{ev.description}</p>}
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setUsageEvent(ev)}>
                    <TrendingDown className="w-3.5 h-3.5" /> Log Usage
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setReconcileEvent(ev)}>
                    <ArrowLeftRight className="w-3.5 h-3.5" /> Reconcile
                  </Button>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Flag className="w-10 h-10 mb-2 opacity-40" />
                <p>No events yet</p>
                <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setEventForm({})}><Plus className="w-4 h-4" /> Create event</Button>
              </div>
            )}
          </div>
        )}

        {tab === 'event-center' && (
          <EventCenter
            events={events}
            transactions={transactions}
            ingredients={ingredients}
            onLogTransaction={(data) => txMutation.mutate({ data, id: null })}
            onCreateEvent={() => setEventForm({})}
          />
        )}
      </div>

      {/* Dialogs */}
      {ingredientForm && (
        <IngredientForm
          open={true}
          onClose={() => setIngredientForm(null)}
          ingredient={ingredientForm.id ? ingredientForm : null}
          events={events}
          onSave={(data) => ingredientMutation.mutate({ data, id: ingredientForm.id })}
        />
      )}
      <TransactionForm
        open={txForm}
        onClose={() => { setTxForm(false); setEditingTx(null); }}
        ingredients={ingredients}
        events={events}
        transaction={editingTx}
        onSave={(data) => txMutation.mutate({ data, id: editingTx?.id })}
      />
      {eventForm && (
        <EventForm
          open={true}
          onClose={() => setEventForm(null)}
          event={eventForm.id ? eventForm : null}
          onSave={(data) => eventMutation.mutate({ data, id: eventForm.id })}
        />
      )}

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        ingredients={ingredients}
        events={events}
        suppliers={suppliers}
      />

      {reconcileEvent && (
        <EventReconciliation
          open={!!reconcileEvent}
          onClose={() => setReconcileEvent(null)}
          event={reconcileEvent}
          transactions={transactions}
          ingredients={ingredients}
          onSave={(data) => txMutation.mutate({ data, id: null })}
        />
      )}

      {usageEvent && (
        <EventUsageForm
          open={!!usageEvent}
          onClose={() => setUsageEvent(null)}
          event={usageEvent}
          transactions={transactions}
          ingredients={ingredients}
          onSave={(data) => txMutation.mutate({ data, id: null })}
        />
      )}
    </div>
  );
}