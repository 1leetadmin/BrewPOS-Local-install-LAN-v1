import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { verifyValue } from '@/lib/pinHash';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock, LogOut, CalendarRange, Coffee, ArrowLeft, Play, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PinKeypad from '@/components/auth/PinKeypad';
import { BwSelect } from '@/components/ingredients/BwSelect';

export default function StaffPortal() {
  const [staffUsers, setStaffUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState(null);
  const [pin, setPin] = useState('');
  const [authedStaff, setAuthedStaff] = useState(null);
  const [error, setError] = useState('');
  const [timeEntries, setTimeEntries] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    base44.entities.StaffUser.filter({ is_active: true }).then(setStaffUsers).catch(() => {});
    base44.entities.Event.list().then(setEvents).catch(() => {});
    const savedId = sessionStorage.getItem('portal_staff_id');
    if (savedId) {
      base44.entities.StaffUser.filter({ id: savedId }).then(users => {
        if (users?.[0]) setAuthedStaff(users[0]);
      });
    }
  }, []);

  const loadEntries = async () => {
    if (!authedStaff) return;
    const entries = await base44.entities.TimeEntry.filter({ staff_user_id: authedStaff.id }, '-clock_in', 50);
    setTimeEntries(entries || []);
  };

  useEffect(() => { if (authedStaff) loadEntries(); }, [authedStaff]);

  const selectedStaff = staffUsers.find(u => u.id === selectedStaffId);
  const currentEntry = timeEntries.find(e => e.status === 'open');

  const handlePinDigit = (d) => {
    if (pin.length >= (selectedStaff?.pin_length || 4)) return;
    const newPin = pin + d;
    setPin(newPin);
    if (newPin.length === (selectedStaff?.pin_length || 4)) {
      setTimeout(() => verifyPin(newPin), 100);
    }
  };

  const verifyPin = async (testPin) => {
    const valid = await verifyValue(testPin, selectedStaff.pin_hash);
    if (valid) {
      setAuthedStaff(selectedStaff);
      sessionStorage.setItem('portal_staff_id', selectedStaff.id);
      setError('');
      setPin('');
      setSelectedStaffId(null);
    } else {
      setError('Incorrect PIN');
      setPin('');
    }
  };

  const handleLogout = () => {
    setAuthedStaff(null);
    sessionStorage.removeItem('portal_staff_id');
    setPin('');
    setError('');
    setSelectedStaffId(null);
  };

  const handleClockIn = async () => {
    setLoading(true);
    try {
      const ev = events.find(e => e.id === selectedEventId);
      await base44.entities.TimeEntry.create({
        staff_user_id: authedStaff.id,
        staff_name: authedStaff.name,
        clock_in: new Date().toISOString(),
        status: 'open',
        hourly_rate: authedStaff.hourly_rate || 0,
        event_id: selectedEventId || null,
        event_name: ev?.name || null,
      });
      toast.success('Clocked in');
      await loadEntries();
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  };

  const handleClockOut = async () => {
    if (!currentEntry) return;
    setLoading(true);
    try {
      const now = new Date();
      const inTime = new Date(currentEntry.clock_in);
      const hours = Math.round(((now - inTime) / (1000 * 60 * 60)) * 100) / 100;
      await base44.entities.TimeEntry.update(currentEntry.id, {
        clock_out: now.toISOString(),
        hours,
        total_cost: Math.round(hours * (currentEntry.hourly_rate || 0) * 100) / 100,
        status: 'completed',
      });
      toast.success(`Clocked out · ${hours.toFixed(2)}h`);
      await loadEntries();
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  };

  const weekEntries = useMemo(() => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    return timeEntries.filter(e => e.status === 'completed' && new Date(e.clock_in) >= weekAgo);
  }, [timeEntries]);
  const weekHours = weekEntries.reduce((s, e) => s + (e.hours || 0), 0);
  const weekPay = weekEntries.reduce((s, e) => s + (e.total_cost || 0), 0);

  // Login screen
  if (!authedStaff) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-3">
              <Coffee className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Staff Portal</h1>
            <p className="text-sm text-muted-foreground mt-1">Clock in & out · Track your hours</p>
          </div>

          {!selectedStaffId ? (
            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="text-sm font-medium text-center mb-4">Select your name</p>
              <div className="grid grid-cols-2 gap-2">
                {staffUsers.map(u => (
                  <button key={u.id} onClick={() => { setSelectedStaffId(u.id); setError(''); }}
                    className="px-4 py-3 rounded-xl border border-border bg-background hover:border-primary hover:bg-primary/5 transition-all text-sm font-medium">
                    {u.name}
                  </button>
                ))}
              </div>
              {staffUsers.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">No staff users configured.</p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => { setSelectedStaffId(null); setPin(''); setError(''); }}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <span className="text-sm font-medium">{selectedStaff?.name}</span>
              </div>
              <div className="flex justify-center gap-2 mb-6">
                {Array.from({ length: selectedStaff?.pin_length || 4 }).map((_, i) => (
                  <div key={i} className={cn('w-4 h-4 rounded-full border-2 transition-colors',
                    i < pin.length ? 'bg-primary border-primary' : 'border-muted-foreground/30')} />
                ))}
              </div>
              <PinKeypad onDigit={handlePinDigit} onBackspace={() => setPin(p => p.slice(0, -1))} />
              {error && <p className="text-center text-sm text-destructive mt-4">{error}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{authedStaff.name}</h1>
            <p className="text-sm text-muted-foreground">${(authedStaff.hourly_rate || 0).toFixed(2)}/hr</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5">
            <LogOut className="w-4 h-4" /> Logout
          </Button>
        </div>

        {/* Status card */}
        <div className={cn('rounded-2xl border-2 p-6 text-center transition-colors',
          currentEntry ? 'border-green-500/50 bg-green-500/5' : 'border-border bg-card')}>
          <div className={cn('inline-flex items-center justify-center w-14 h-14 rounded-full mb-3',
            currentEntry ? 'bg-green-500/10' : 'bg-muted')}>
            {currentEntry ? <Play className="w-7 h-7 text-green-600" /> : <Clock className="w-7 h-7 text-muted-foreground" />}
          </div>
          {currentEntry ? (
            <>
              <p className="text-sm text-muted-foreground">Clocked in since</p>
              <p className="text-2xl font-bold">{format(new Date(currentEntry.clock_in), 'HH:mm')}</p>
              <p className="text-sm text-muted-foreground">{format(new Date(currentEntry.clock_in), 'EEEE, dd MMM')}</p>
              {currentEntry.event_name && (
                <p className="text-xs text-primary mt-1">Event: {currentEntry.event_name}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Not clocked in</p>
              <p className="text-lg font-semibold mt-1">Ready to start</p>
            </>
          )}
        </div>

        {/* Event selector + clock button */}
        {!currentEntry && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-muted-foreground" />
              <BwSelect
                value={selectedEventId}
                onChange={setSelectedEventId}
                placeholder="No event (general work)"
                className="flex-1"
                options={[
                  { value: '', label: 'No event (general work)' },
                  ...events.map(e => ({ value: e.id, label: e.name })),
                ]}
              />
            </div>
            <Button className="w-full h-14 text-base gap-2" onClick={handleClockIn} disabled={loading}>
              <Play className="w-5 h-5" /> Clock In
            </Button>
          </div>
        )}
        {currentEntry && (
          <Button variant="destructive" className="w-full h-14 text-base gap-2" onClick={handleClockOut} disabled={loading}>
            <Square className="w-5 h-5" /> Clock Out
          </Button>
        )}

        {/* Week summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">This Week</p>
            <p className="text-2xl font-bold mt-1">{weekHours.toFixed(2)}h</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground font-medium">Earnings</p>
            <p className="text-2xl font-bold mt-1">${weekPay.toFixed(2)}</p>
          </div>
        </div>

        {/* Recent entries */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">Recent Entries</h3>
          </div>
          {timeEntries.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No entries yet</p>
          ) : (
            <div className="divide-y divide-border">
              {timeEntries.slice(0, 10).map(e => (
                <div key={e.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{format(new Date(e.clock_in), 'EEE dd MMM, HH:mm')}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.status === 'open' ? 'In progress' : `${(e.hours || 0).toFixed(2)}h`}
                      {e.event_name && ` · ${e.event_name}`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">{e.status === 'completed' ? `$${(e.total_cost || 0).toFixed(2)}` : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}