import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { Search, X, CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';

const STATUSES = [
  { key: 'open', label: 'Open' },
  { key: 'completed', label: 'Completed' },
  { key: 'voided', label: 'Voided' },
  { key: 'refunded', label: 'Refunded' },
];

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'all', label: 'All' },
  { key: 'event', label: 'Event' },
  { key: 'import', label: 'Import' },
  { key: 'custom', label: 'Custom' },
];

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card border-border text-muted-foreground hover:bg-accent'
      )}
    >
      {children}
    </button>
  );
}

function toggle(set, value) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

export default function AnalyticsFilters({ allCategories, allItems, filters, onFiltersChange, onOpenImportUpload }) {
  const [itemSearch, setItemSearch] = useState('');

  const { data: events = [] } = useQuery({
    queryKey: ['events'],
    queryFn: () => base44.entities.Event.list('-start_date'),
  });
  const { data: imports = [] } = useQuery({
    queryKey: ['salesImports'],
    queryFn: () => base44.entities.SalesImport.list('-created_date'),
  });

  const set = (partial) => onFiltersChange({ ...filters, ...partial });

  const applyPreset = (preset) => {
    if (preset === 'all') return set({ datePreset: 'all', dateFrom: null, dateTo: null, eventId: null, importId: null });
    if (preset === 'custom') return set({ datePreset: 'custom', eventId: null, importId: null });
    if (preset === 'event') return set({ datePreset: 'event', dateFrom: null, dateTo: null, eventId: null, importId: null });
    if (preset === 'import') return set({ datePreset: 'import', dateFrom: null, dateTo: null, eventId: null, importId: null });
    const now = new Date();
    if (preset === 'today') return set({ datePreset: 'today', dateFrom: startOfDay(now).getTime(), dateTo: endOfDay(now).getTime(), eventId: null, importId: null });
    const days = preset === '7d' ? 6 : 29;
    return set({ datePreset: preset, dateFrom: startOfDay(subDays(now, days)).getTime(), dateTo: endOfDay(now).getTime(), eventId: null, importId: null });
  };

  // Orders don't carry an event_id — Event only has start/end dates, so
  // "view by event" just becomes a shortcut that sets the date range to
  // match that event's dates, same underlying filter as Custom. No schema
  // change needed, and it stays correct even for orders that existed
  // before this feature did.
  const applyEvent = (eventId) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    set({
      datePreset: 'event',
      eventId: ev.id,
      importId: null,
      dateFrom: new Date(ev.start_date).getTime(),
      dateTo: new Date(ev.end_date).getTime(),
    });
  };

  const applyImport = (importId) => {
    set({ datePreset: 'import', importId, eventId: null, dateFrom: null, dateTo: null });
  };

  const onCustomDate = (which, value) => {
    if (!value) return set({ [which === 'from' ? 'dateFrom' : 'dateTo']: null });
    const d = new Date(value + (which === 'from' ? 'T00:00:00' : 'T23:59:59'));
    set({ datePreset: 'custom', [which === 'from' ? 'dateFrom' : 'dateTo']: d.getTime() });
  };

  const visibleItems = useMemo(() => {
    const q = itemSearch.toLowerCase();
    const selected = [...(filters.itemNames || [])];
    const base = allItems.filter(n => !q || n.toLowerCase().includes(q));
    const merged = [...new Set([...selected, ...base])];
    return merged.sort();
  }, [allItems, itemSearch, filters.itemNames]);

  const dateInputValue = (ms) => (ms ? format(new Date(ms), 'yyyy-MM-dd') : '');

  return (
    <div className="space-y-4 p-4 rounded-xl border border-border bg-card">
      {/* Status — voided/refunded can be measured on their own */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Order status</p>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map(s => (
            <Chip
              key={s.key}
              active={filters.statusSet?.has(s.key)}
              onClick={() => set({ statusSet: toggle(filters.statusSet, s.key) })}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Date range */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Date range</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map(p => (
            <Chip key={p.key} active={filters.datePreset === p.key} onClick={() => applyPreset(p.key)}>
              {p.label}
            </Chip>
          ))}
          {filters.datePreset === 'custom' && (
            <div className="flex items-center gap-1.5 ml-1">
              <Input type="date" value={dateInputValue(filters.dateFrom)} onChange={e => onCustomDate('from', e.target.value)} className="h-8 w-[150px] text-xs" />
              <span className="text-xs text-muted-foreground">→</span>
              <Input type="date" value={dateInputValue(filters.dateTo)} onChange={e => onCustomDate('to', e.target.value)} className="h-8 w-[150px] text-xs" />
            </div>
          )}
          {filters.datePreset === 'event' && (
            <div className="flex items-center gap-1.5 ml-1">
              <Select value={filters.eventId || ''} onValueChange={applyEvent}>
                <SelectTrigger className="h-8 w-[220px] text-xs">
                  <SelectValue placeholder={events.length === 0 ? 'No events yet' : 'Choose an event…'} />
                </SelectTrigger>
                <SelectContent>
                  {events.map(ev => (
                    <SelectItem key={ev.id} value={ev.id}>
                      {ev.name} — {format(new Date(ev.start_date), 'MMM d')}
                      {ev.end_date && ev.end_date !== ev.start_date ? `–${format(new Date(ev.end_date), 'MMM d')}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filters.eventId && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  {dateInputValue(filters.dateFrom)} → {dateInputValue(filters.dateTo)}
                </span>
              )}
            </div>
          )}
          {filters.datePreset === 'import' && (
            <div className="flex items-center gap-1.5 ml-1">
              <Select value={filters.importId || ''} onValueChange={applyImport}>
                <SelectTrigger className="h-8 w-[220px] text-xs">
                  <SelectValue placeholder={imports.length === 0 ? 'No imports yet' : 'Choose an import…'} />
                </SelectTrigger>
                <SelectContent>
                  {imports.map(imp => (
                    <SelectItem key={imp.id} value={imp.id}>{imp.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {onOpenImportUpload && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onOpenImportUpload}>
                  Upload new…
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Categories */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Categories</p>
        <div className="flex flex-wrap gap-1.5">
          {allCategories.map(c => (
            <Chip
              key={c}
              active={filters.categories?.has(c)}
              onClick={() => set({ categories: toggle(filters.categories, c) })}
            >
              {c}
            </Chip>
          ))}
        </div>
      </div>

      {/* Items (with search) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Items</p>
          {(filters.itemNames?.size ?? 0) > 0 && (
            <button onClick={() => set({ itemNames: new Set() })} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="w-3 h-3" /> clear
            </button>
          )}
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search items…"
            value={itemSearch}
            onChange={e => setItemSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {visibleItems.map(n => (
            <Chip
              key={n}
              active={filters.itemNames?.has(n)}
              onClick={() => set({ itemNames: toggle(filters.itemNames, n) })}
            >
              {n}
            </Chip>
          ))}
          {visibleItems.length === 0 && <span className="text-xs text-muted-foreground">No items</span>}
        </div>
      </div>
    </div>
  );
}