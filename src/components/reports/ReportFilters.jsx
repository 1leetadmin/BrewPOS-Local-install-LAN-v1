import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, CalendarDays, CalendarRange, CalendarClock, Flag, LineChart, PieChart as PieIcon, BarChart3, Table } from 'lucide-react';

const PRESETS = [
  { value: 'day', label: 'Day', icon: Calendar },
  { value: 'week', label: 'Week', icon: CalendarDays },
  { value: 'month', label: 'Month', icon: CalendarRange },
  { value: 'quarter', label: 'Quarter', icon: CalendarClock },
  { value: 'year', label: 'Year', icon: CalendarDays },
  { value: 'event', label: 'Event', icon: Flag },
];

const VIEWS = [
  { value: 'line', label: 'Line', icon: LineChart },
  { value: 'pie', label: 'Pie', icon: PieIcon },
  { value: 'bar', label: 'Bar', icon: BarChart3 },
  { value: 'table', label: 'Table', icon: Table },
];

export default function ReportFilters({
  preset, onPresetChange, customStart, customEnd, onCustomChange,
  events, selectedEvent, onEventChange, view, onViewChange,
}) {
  const isCustom = preset === 'custom';
  const isEvent = preset === 'event';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => {
          const Icon = p.icon;
          return (
            <Button key={p.value} size="sm" variant={preset === p.value ? 'default' : 'outline'}
              onClick={() => onPresetChange(p.value)} className="gap-1.5">
              <Icon className="w-3.5 h-3.5" /> {p.label}
            </Button>
          );
        })}
        <Button size="sm" variant={isCustom ? 'default' : 'outline'} onClick={() => onPresetChange('custom')} className="gap-1.5">
          <CalendarRange className="w-3.5 h-3.5" /> Custom
        </Button>
      </div>

      {isCustom && (
        <div className="flex items-center gap-2">
          <Input type="date" value={customStart} onChange={e => onCustomChange('start', e.target.value)} className="w-auto" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={customEnd} onChange={e => onCustomChange('end', e.target.value)} className="w-auto" />
        </div>
      )}

      {isEvent && (
        <div className="flex items-center gap-2">
          <select value={selectedEvent} onChange={e => onEventChange(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm">
            <option value="">Select an event...</option>
            {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border pt-3">
        <span className="text-xs font-medium text-muted-foreground mr-1">View:</span>
        {VIEWS.map(v => {
          const Icon = v.icon;
          return (
            <Button key={v.value} size="sm" variant={view === v.value ? 'default' : 'ghost'}
              onClick={() => onViewChange(v.value)} className="gap-1.5">
              <Icon className="w-3.5 h-3.5" /> {v.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}