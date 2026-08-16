import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TrendingDown, ShoppingCart, Trash2, Package, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReportFilters from '@/components/reports/ReportFilters';
import TransactionDetailModal from '@/components/reports/TransactionDetailModal';
import { LineView, PieView, BarView, TableView } from '@/components/reports/ReportCharts';
import ExportButtons from '@/components/reports/ExportButtons';
import {
  getPresetRange, filterByDateRange, aggregateByCategory,
  aggregateByIngredient, aggregateByDay, getSummary, CATEGORY_LABELS,
} from '@/lib/ingredientReports';
import { exportCSV, exportPDF, exportDOCX, exportEmail } from '@/lib/ingredientExports';
import { format } from 'date-fns';

export default function IngredientDashboard() {
  const queryClient = useQueryClient();
  const [preset, setPreset] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('');
  const [view, setView] = useState('bar');
  const [drillDown, setDrillDown] = useState(null);

  const { data: transactions = [] } = useQuery({
    queryKey: ['ingredientTransactions'],
    queryFn: () => base44.entities.IngredientTransaction.list('-date', 2000),
  });

  const { data: events = [] } = useQuery({
    queryKey: ['events'],
    queryFn: () => base44.entities.Event.list(),
  });

  const { dateRange, dateLabel } = useMemo(() => {
    if (preset === 'custom' && customStart && customEnd) {
      return {
        dateRange: { start: new Date(customStart + 'T00:00:00'), end: new Date(customEnd + 'T23:59:59') },
        dateLabel: `${customStart} to ${customEnd}`,
      };
    }
    if (preset === 'event' && selectedEvent) {
      const ev = events.find(e => e.id === selectedEvent);
      if (ev) {
        return {
          dateRange: { start: new Date(ev.start_date), end: new Date(ev.end_date) },
          dateLabel: ev.name,
        };
      }
      return { dateRange: null, dateLabel: 'No event selected' };
    }
    const range = getPresetRange(preset);
    if (range) {
      return { dateRange: range, dateLabel: range.label };
    }
    return { dateRange: null, dateLabel: 'All Time' };
  }, [preset, customStart, customEnd, selectedEvent, events]);

  const filteredTx = useMemo(() => {
    if (!dateRange) return [];
    return filterByDateRange(transactions, dateRange.start, dateRange.end);
  }, [transactions, dateRange]);

  const summary = useMemo(() => getSummary(filteredTx), [filteredTx]);
  const byCategory = useMemo(() => aggregateByCategory(filteredTx), [filteredTx]);
  const byIngredient = useMemo(() => aggregateByIngredient(filteredTx), [filteredTx]);
  const byDay = useMemo(() => {
    if (!dateRange) return [];
    return aggregateByDay(filteredTx, dateRange.start, dateRange.end);
  }, [filteredTx, dateRange]);

  const handleExport = (type) => {
    if (filteredTx.length === 0) { toast.error('No data to export'); return; }
    try {
      if (type === 'csv') exportCSV(filteredTx, summary, dateLabel);
      else if (type === 'pdf') exportPDF(filteredTx, summary, byCategory, dateLabel);
      else if (type === 'docx') exportDOCX(filteredTx, summary, byCategory, dateLabel);
      else if (type === 'email') exportEmail(filteredTx, summary, dateLabel);
      toast.success(`Exported to ${type.toUpperCase()}`);
    } catch (err) {
      toast.error(`Export failed: ${err.message}`);
    }
  };

  const chartData = view === 'pie' ? byCategory : view === 'bar' ? byIngredient : byDay;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">Ingredient Cost Reports</h1>
            <p className="text-sm text-muted-foreground">{dateLabel} · {filteredTx.length} transactions</p>
          </div>
          <ExportButtons onExport={handleExport} disabled={filteredTx.length === 0} />
        </div>
        <ReportFilters
          preset={preset} onPresetChange={setPreset}
          customStart={customStart} customEnd={customEnd}
          onCustomChange={(k, v) => k === 'start' ? setCustomStart(v) : setCustomEnd(v)}
          events={events} selectedEvent={selectedEvent} onEventChange={setSelectedEvent}
          view={view} onViewChange={setView}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Total Cost" value={`$${(summary.total || 0).toFixed(2)}`} icon={Package} color="text-primary"
            onClick={() => setDrillDown({ title: 'All Transactions', tx: filteredTx })} />
          <SummaryCard label="Wastage" value={`$${(summary.wastage || 0).toFixed(2)}`} sub={`${(summary.wastagePct || 0).toFixed(1)}% of total`} icon={Trash2} color="text-destructive"
            onClick={() => setDrillDown({ title: 'Wastage Transactions', tx: filteredTx.filter(t => t.transaction_type === 'wastage') })} />
          <SummaryCard label="Purchases" value={`$${(summary.purchases || 0).toFixed(2)}`} icon={ShoppingCart} color="text-green-600"
            onClick={() => setDrillDown({ title: 'Purchase Transactions', tx: filteredTx.filter(t => t.transaction_type === 'purchase') })} />
          <SummaryCard label="Usage Cost" value={`$${(summary.usage || 0).toFixed(2)}`} icon={TrendingDown} color="text-blue-600"
            onClick={() => setDrillDown({ title: 'Usage Transactions', tx: filteredTx.filter(t => t.transaction_type === 'usage') })} />
        </div>

        {/* Chart / Table */}
        <div className="rounded-xl border border-border bg-card p-4">
          {view === 'line' && <LineView data={byDay} />}
          {view === 'pie' && <PieView data={byCategory.map(c => ({ ...c, label: CATEGORY_LABELS[c.name] || c.name }))} />}
          {view === 'bar' && <BarView data={byIngredient.map(i => ({ ...i, label: i.name }))} />}
          {view === 'table' && <TableView transactions={filteredTx} summary={summary} />}
          {filteredTx.length === 0 && view !== 'table' && (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <AlertTriangle className="w-8 h-8 mb-2 opacity-50" />
              <p>No data for this period</p>
              <p className="text-xs">Log transactions in the Ingredients page to see reports here</p>
            </div>
          )}
        </div>

        {/* Category breakdown */}
        {byCategory.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Cost Breakdown by Category</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {byCategory.map(c => (
                <div key={c.name} onClick={() => setDrillDown({ title: `${CATEGORY_LABELS[c.name] || c.name} — Transactions`, tx: filteredTx.filter(t => t.category === c.name) })}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 cursor-pointer hover:bg-muted hover:border-primary/30 border border-transparent transition-all">
                  <div>
                    <p className="text-sm font-medium">{CATEGORY_LABELS[c.name] || c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.quantity.toFixed(1)} units · Wastage: ${c.wastage.toFixed(2)}</p>
                  </div>
                  <span className="text-lg font-bold text-primary">${c.cost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <TransactionDetailModal
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        title={drillDown?.title || ''}
        transactions={drillDown?.tx || []}
      />
    </div>
  );
}

function SummaryCard({ label, value, sub, icon: Icon, color, onClick }) {
  return (
    <div onClick={onClick} className={cn('rounded-xl border border-border bg-card p-4', onClick && 'cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all')}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <Icon className={`w-4 h-4 ${color || 'text-muted-foreground'}`} />
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}