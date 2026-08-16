import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Package, DollarSign, Timer, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import AnalyticsFilters from '@/components/dashboard/AnalyticsFilters';
import AnalyticsCharts from '@/components/dashboard/AnalyticsCharts';
import AnalyticsTable from '@/components/dashboard/AnalyticsTable';
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

  const [rowDimension, setRowDimension] = useState('item');   // 'item' | 'category'
  const [granularity, setGranularity] = useState('hour');     // 'day' | 'hour' | 'minute'
  const [filters, setFilters] = useState({
    statusSet: new Set(),
    categories: new Set(),
    itemNames: new Set(),
    dateFrom: null,
    dateTo: null,
    datePreset: 'all',
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

  const tableRows = useMemo(() => computeTableMetrics(filtered, rowDimension), [filtered, rowDimension]);
  const chartData = useMemo(
    () => bucketByTime(filtered, granularity, filters.dateFrom, filters.dateTo),
    [filtered, granularity, filters.dateFrom, filters.dateTo]
  );

  const stats = useMemo(() => {
    const count = filtered.length;
    const revenue = filtered.reduce((s, oi) => s + (Number(oi.unit_price) || 0), 0);
    const preps = filtered.map(prepTimeSeconds).filter(p => p !== null);
    const avg = preps.length ? preps.reduce((a, b) => a + b, 0) / preps.length : null;
    return { count, revenue, avg, printed: preps.length, pct: count ? Math.round((preps.length / count) * 100) : 0 };
  }, [filtered]);

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6 max-w-7xl">
        <h1 className="text-2xl font-heading font-bold">Dashboard</h1>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Items Sold" value={stats.count} icon={Package} color="text-primary" />
          <StatCard title="Revenue" value={`$${stats.revenue.toFixed(2)}`} icon={DollarSign} color="text-green-500" />
          <StatCard title="Avg Prep" value={fmtTime(stats.avg)} icon={Timer} color="text-blue-500" />
          <StatCard title="Labels Printed" value={`${stats.pct}%`} icon={CheckCircle2} color="text-purple-500" subtitle={`${stats.printed}/${stats.count}`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Filters */}
          <div className="lg:col-span-4 xl:col-span-3">
            <AnalyticsFilters
              allCategories={allCategories}
              allItems={allItems}
              filters={filters}
              onFiltersChange={setFilters}
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
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Granularity</span>
                <ToggleGroup value={granularity} onChange={setGranularity} options={[{ k: 'day', l: 'Day' }, { k: 'hour', l: 'Hour' }, { k: 'minute', l: 'Minute (0–59)' }]} />
              </div>
            </div>

            <AnalyticsCharts volumeData={chartData} prepData={chartData} granularity={granularity} />
            <AnalyticsTable rows={tableRows} rowDimension={rowDimension} />
          </div>
        </div>
      </div>
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