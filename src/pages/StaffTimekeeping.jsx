import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Clock, Trash2, Plus, DollarSign, Timer, Users, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { BwSelect } from '@/components/ingredients/BwSelect';

export default function StaffTimekeeping() {
  const queryClient = useQueryClient();
  const [staffFilter, setStaffFilter] = useState('all');
  const [eventFilter, setEventFilter] = useState('all');
  const [editingEntry, setEditingEntry] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: staffUsers = [] } = useQuery({
    queryKey: ['staffUsers'],
    queryFn: () => base44.entities.StaffUser.list(),
  });
  const { data: timeEntries = [] } = useQuery({
    queryKey: ['timeEntries'],
    queryFn: () => base44.entities.TimeEntry.list('-clock_in', 2000),
  });
  const { data: events = [] } = useQuery({
    queryKey: ['events'],
    queryFn: () => base44.entities.Event.list(),
  });

  const rateMutation = useMutation({
    mutationFn: ({ id, rate }) => base44.entities.StaffUser.update(id, { hourly_rate: rate }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['staffUsers'] }); toast.success('Rate updated'); },
    onError: (e) => toast.error(e.message),
  });

  const entryMutation = useMutation({
    mutationFn: async ({ data, id }) => id
      ? base44.entities.TimeEntry.update(id, data)
      : base44.entities.TimeEntry.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['timeEntries'] }); toast.success('Entry saved'); setEditingEntry(null); setAddOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const deleteEntry = async (entry) => {
    if (!confirm('Delete this time entry?')) return;
    try { await base44.entities.TimeEntry.delete(entry.id); queryClient.invalidateQueries({ queryKey: ['timeEntries'] }); toast.success('Deleted'); }
    catch (e) { toast.error(e.message); }
  };

  const filteredEntries = useMemo(() => {
    let result = [...timeEntries];
    if (staffFilter !== 'all') result = result.filter(e => e.staff_user_id === staffFilter);
    if (eventFilter !== 'all') result = result.filter(e => e.event_id === eventFilter);
    return result;
  }, [timeEntries, staffFilter, eventFilter]);

  const summary = useMemo(() => {
    const completed = filteredEntries.filter(e => e.status === 'completed');
    const totalHours = completed.reduce((s, e) => s + (e.hours || 0), 0);
    const totalCost = completed.reduce((s, e) => s + (e.total_cost || 0), 0);
    const activeNow = timeEntries.filter(e => e.status === 'open').length;
    return { totalHours, totalCost, activeNow };
  }, [filteredEntries, timeEntries]);

  const staffStats = useMemo(() => {
    const map = {};
    filteredEntries.filter(e => e.status === 'completed').forEach(e => {
      if (!map[e.staff_user_id]) map[e.staff_user_id] = { name: e.staff_name, hours: 0, cost: 0 };
      map[e.staff_user_id].hours += e.hours || 0;
      map[e.staff_user_id].cost += e.total_cost || 0;
    });
    return Object.values(map).sort((a, b) => b.cost - a.cost);
  }, [filteredEntries]);

  const eventStats = useMemo(() => {
    const map = {};
    filteredEntries.filter(e => e.status === 'completed').forEach(e => {
      const key = e.event_id || '_none';
      if (!map[key]) map[key] = { name: e.event_name || 'General (no event)', hours: 0, cost: 0, count: 0 };
      map[key].hours += e.hours || 0;
      map[key].cost += e.total_cost || 0;
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => b.cost - a.cost);
  }, [filteredEntries]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Staff Timekeeping</h1>
            <p className="text-sm text-muted-foreground">{filteredEntries.length} entries · {summary.activeNow} staff clocked in now</p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Entry</Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <BwSelect
            value={staffFilter} onChange={setStaffFilter}
            placeholder="All Staff" className="w-44"
            options={[{ value: 'all', label: 'All Staff' }, ...staffUsers.map(s => ({ value: s.id, label: s.name }))]}
          />
          <BwSelect
            value={eventFilter} onChange={setEventFilter}
            placeholder="All Events" className="w-44"
            options={[{ value: 'all', label: 'All Events' }, ...events.map(e => ({ value: e.id, label: e.name }))]}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Hours" value={`${summary.totalHours.toFixed(2)}h`} icon={Timer} color="text-blue-600" />
          <StatCard label="Total Cost" value={`$${summary.totalCost.toFixed(2)}`} icon={DollarSign} color="text-green-600" />
          <StatCard label="Active Now" value={String(summary.activeNow)} icon={Users} color="text-amber-600" />
          <StatCard label="Avg Rate" value={summary.totalHours > 0 ? `$${(summary.totalCost / summary.totalHours).toFixed(2)}/h` : '—'} icon={TrendingUp} color="text-purple-600" />
        </div>

        {/* Staff rates */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Staff Hourly Rates</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {staffUsers.filter(s => s.is_active !== false).map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-capitalize text-muted-foreground">{s.role}</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number" min="0" step="0.50"
                    defaultValue={s.hourly_rate || 0}
                    onBlur={e => {
                      const val = Number(e.target.value) || 0;
                      if (val !== (s.hourly_rate || 0)) rateMutation.mutate({ id: s.id, rate: val });
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                    className="w-20 h-7 text-sm text-right"
                  />
                  <span className="text-xs text-muted-foreground">/hr</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per-staff breakdown */}
        {staffStats.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Hours by Staff</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {staffStats.map(s => (
                <div key={s.name} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.hours.toFixed(2)} hours</p>
                  </div>
                  <span className="text-lg font-bold text-primary">${s.cost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-event labor cost */}
        {eventStats.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Labor Cost by Event</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {eventStats.map((ev, i) => (
                <div key={i} className="rounded-lg bg-muted/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{ev.name}</p>
                    <span className="text-lg font-bold text-primary whitespace-nowrap">${ev.cost.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{ev.hours.toFixed(2)} hours · {ev.count} {ev.count === 1 ? 'shift' : 'shifts'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Time entries table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Staff</th>
                  <th className="px-3 py-2 font-medium">Clock In</th>
                  <th className="px-3 py-2 font-medium">Clock Out</th>
                  <th className="px-3 py-2 font-medium text-right">Hours</th>
                  <th className="px-3 py-2 font-medium text-right">Rate</th>
                  <th className="px-3 py-2 font-medium text-right">Cost</th>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map(e => (
                  <tr key={e.id} className="border-t border-border hover:bg-muted/30 group">
                    <td className="px-3 py-2 font-medium">{e.staff_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{format(new Date(e.clock_in), 'dd/MM/yy HH:mm')}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{e.clock_out ? format(new Date(e.clock_out), 'dd/MM/yy HH:mm') : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{e.status === 'completed' ? (e.hours || 0).toFixed(2) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">${(e.hourly_rate || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{e.status === 'completed' ? `$${(e.total_cost || 0).toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-2">{e.event_name || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium',
                        e.status === 'open' ? 'bg-green-500/15 text-green-600' : 'bg-blue-500/15 text-blue-600')}>
                        {e.status === 'open' ? 'Active' : 'Done'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingEntry(e)} className="p-1 rounded hover:bg-muted text-xs">Edit</button>
                        <button onClick={() => deleteEntry(e)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredEntries.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">No time entries found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <EntryEditDialog
        open={!!editingEntry || addOpen}
        entry={editingEntry}
        staffUsers={staffUsers}
        events={events}
        onClose={() => { setEditingEntry(null); setAddOpen(false); }}
        onSave={(data, id) => entryMutation.mutate({ data, id })}
      />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
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

function EntryEditDialog({ open, entry, staffUsers, events, onClose, onSave }) {
  const [staffId, setStaffId] = useState('');
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [eventId, setEventId] = useState('');

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    setStaffId(entry?.staff_user_id || staffUsers[0]?.id || '');
    setClockIn(entry?.clock_in ? new Date(new Date(entry.clock_in) - tzOffset).toISOString().slice(0, 16) : '');
    setClockOut(entry?.clock_out ? new Date(new Date(entry.clock_out) - tzOffset).toISOString().slice(0, 16) : '');
    setEventId(entry?.event_id || '');
  }, [open, entry, staffUsers]);

  const handleSave = () => {
    const staff = staffUsers.find(s => s.id === staffId);
    if (!staff || !clockIn) { toast.error('Select staff and clock-in time'); return; }
    const inTime = new Date(clockIn).toISOString();
    const outTime = clockOut ? new Date(clockOut).toISOString() : null;
    let hours = 0, totalCost = 0;
    if (outTime) {
      hours = Math.round(((new Date(outTime) - new Date(inTime)) / (1000 * 60 * 60)) * 100) / 100;
      totalCost = Math.round(hours * (staff.hourly_rate || 0) * 100) / 100;
    }
    const ev = events.find(e => e.id === eventId);
    onSave({
      staff_user_id: staffId,
      staff_name: staff.name,
      clock_in: inTime,
      clock_out: outTime,
      hours: hours || null,
      hourly_rate: staff.hourly_rate || 0,
      total_cost: totalCost || null,
      event_id: eventId || null,
      event_name: ev?.name || null,
      status: outTime ? 'completed' : 'open',
    }, entry?.id || null);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{entry ? 'Edit Time Entry' : 'Add Time Entry'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Staff Member</label>
            <select value={staffId} onChange={e => setStaffId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              {staffUsers.map(s => (
                <option key={s.id} value={s.id}>{s.name} (${(s.hourly_rate || 0).toFixed(2)}/hr)</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Clock In</label>
            <Input type="datetime-local" value={clockIn} onChange={e => setClockIn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Clock Out (leave empty if still working)</label>
            <Input type="datetime-local" value={clockOut} onChange={e => setClockOut(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Event (optional)</label>
            <select value={eventId} onChange={e => setEventId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              <option value="">No event</option>
              {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}