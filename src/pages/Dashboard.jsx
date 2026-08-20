import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Package, DollarSign, Timer, CheckCircle2, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import AnalyticsFilters from '@/components/dashboard/AnalyticsFilters';
import AnalyticsCharts from '@/components/dashboard/AnalyticsCharts';
import AnalyticsTable from '@/components/dashboard/AnalyticsTable';
import SalesImportUpload from '@/components/dashboard/SalesImportUpload';
import {
  filterItems, computeTableMetrics, bucketByTime, prepTimeSeconds,
  uniqueCategories, uniqueItemNames, fmtTime,
} from '@/lib/analytics';

export default function Dashboard() {
  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list('-created_date', 2000),
  });
  const { data: orderItems = [] } = useQuery({
    queryKey: ['orderItems'],
    queryFn: () => base44.entities.OrderItem.list('-placed_at', 5000),
  });
  const { data: salesImports = [] } = useQuery({
    queryKey: ['salesImports'],
    queryFn: () => base44.entities.SalesImport.list('-created_date'),
  });

  const [rowDimension, setRowDimension] = useState('item');   // 'item' | 'category'
  const [granularity, setGranularity] = useState('hour');     // 'day' | 'hour' | 'minute'
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filters, setFilters] = useState({
    statusSet: new Set(),
    categories: new Set(),
    itemNames: new Set(),
    dateFrom: null,
    dateTo: null,
    datePreset: 'all',
    eventId: null,
    importId: null,
  });

  const orderStatus = useMemo(() => {
    const m = {};
    for (const o of orders) m[o.id] = o.status;
    return m;
  }, [orders]);

  const allCategories = useMemo(() => uniqueCategories(orderItems), [orderItems]);
  const allItems = useMemo(() => uniqueItemNames(orderItems), [orderItems]);

  const filtered = useMemo(
    () => filterItems(orderItems, { ...filters, orderStatus }),
    [orderItems, filters, orderStatus]
  );

  const activeImport = filters.importId ? salesImports.find(i => i.id === filters.importId) : null;
  const importMode = Boolean(activeImport);

  // Imported data is pre-aggregated (daily/category/item totals, not
  // individual transactions) — same table/chart components, but fed from
  // the import record's own totals instead of filtering native orderItems.
  const tableRows = useMemo(() => {
    if (importMode) {
      const source = rowDimension === 'category' ? activeImport.category_totals : activeImport.item_totals;
      return (source || [])
        .map(row => ({
          name: rowDimension === 'category' ? row.category : row.name,
          count: row.items_sold,
          revenue: row.net_sales,
          avg: null, min: null, max: null,
          printed: row.items_sold, // hides the "(x/y printed)" note — not a meaningful concept for imports
        }))
        .sort((a, b) => b.revenue - a.revenue);
    }
    return computeTableMetrics(filtered, rowDimension);
  }, [importMode, activeImport, rowDimension, filtered]);

  const chartData = useMemo(() => {
    if (importMode) {
      return (activeImport.time_series || []).map(t => ({ label: t.label, count: t.net_sales })).reverse();
    }
    return bucketByTime(filtered, granularity, filters.dateFrom, filters.dateTo);
  }, [importMode, activeImport, filtered, granularity, filters.dateFrom, filters.dateTo]);

  const stats = useMemo(() => {
    if (importMode) {
      return {
        count: activeImport.total_items_sold || 0,
        revenue: activeImport.total_revenue || 0,
        avg: null, printed: 0, pct: null,
      };
    }
    const count = filtered.length;
    const revenue = filtered.reduce((s, oi) => s + (Number(oi.unit_price) || 0), 0);
    const preps = filtered.map(prepTimeSeconds).filter(p => p !== null);
    const avg = preps.length ? preps.reduce((a, b) => a + b, 0) / preps.length : null;
    return { count, revenue, avg, printed: preps.length, pct: count ? Math.round((preps.length / count) * 100) : 0 };
  }, [importMode, activeImport, filtered]);

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Dashboard</h1>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setUploadOpen(true)}>
            <Upload className="w-4 h-4" /> Import Sales Data
          </Button>
        </div>

        {importMode && (
          <div className="px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/20 text-sm text-primary">
            Showing imported data: <strong>{activeImport.label}</strong> (Loyverse) — prep-time and label-print stats aren't tracked in this data.
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Items Sold" value={stats.count} icon={Package} color="text-primary" />
          <StatCard title="Revenue" value={`$${stats.revenue.toFixed(2)}`} icon={DollarSign} color="text-green-500" />
          <StatCard title="Avg Prep" value={importMode ? 'N/A' : fmtTime(stats.avg)} icon={Timer} color="text-blue-500" />
          <StatCard
            title="Labels Printed"
            value={importMode ? 'N/A' : `${stats.pct}%`}
            icon={CheckCircle2}
            color="text-purple-500"
            subtitle={importMode ? 'Not tracked by Loyverse' : `${stats.printed}/${stats.count}`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Filters */}
          <div className="lg:col-span-4 xl:col-span-3">
            <AnalyticsFilters
              allCategories={allCategories}
              allItems={allItems}
              filters={filters}
              onFiltersChange={setFilters}
              onOpenImportUpload={() => setUploadOpen(true)}
            />
          </div>

          {/* Main */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-6">
            {/* Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rows</span>
                <ToggleGroup value={rowDimension} onChange={setRowDimension} options={[{ k: 'item', l: 'By Item' }, { k: 'category', l: 'By Category' }]} />
              </div>
              {!importMode && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Granularity</span>
                  <ToggleGroup value={granularity} onChange={setGranularity} options={[{ k: 'day', l: 'Day' }, { k: 'hour', l: 'Hour' }, { k: 'minute', l: 'Minute (0–59)' }]} />
                </div>
              )}
            </div>

            <AnalyticsCharts volumeData={chartData} prepData={chartData} granularity={granularity} importMode={importMode} />
            <AnalyticsTable rows={tableRows} rowDimension={rowDimension} />
          </div>
        </div>
      </div>

      <SalesImportUpload open={uploadOpen} onOpenChange={setUploadOpen} />
    </ScrollArea>
  );
}

function ToggleGroup({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {options.map(o => (
        <button
          key={o.k}
          onClick={() => onChange(o.k)}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-md transition-colors',
            value === o.k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, subtitle }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-mono font-black mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className={cn('p-3 rounded-xl bg-muted', color)}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}