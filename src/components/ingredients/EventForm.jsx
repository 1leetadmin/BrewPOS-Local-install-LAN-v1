import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function EventForm({ open, onClose, onSave, event }) {
  const isEdit = !!event;
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', description: '' });

  useEffect(() => {
    if (event) {
      const toDate = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';
      setForm({
        name: event.name || '',
        start_date: toDate(event.start_date),
        end_date: toDate(event.end_date),
        description: event.description || '',
      });
    } else if (open) {
      const today = new Date().toISOString().slice(0, 10);
      setForm({ name: '', start_date: today, end_date: today, description: '' });
    }
  }, [event, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.name || !form.start_date || !form.end_date) return;
    onSave({
      name: form.name,
      start_date: new Date(form.start_date + 'T00:00:00').toISOString(),
      end_date: new Date(form.end_date + 'T23:59:59').toISOString(),
      description: form.description,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Event' : 'Create Event'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Event Name *</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Summer Festival" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date *</Label>
              <Input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date *</Label>
              <Input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Optional..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!form.name}>{isEdit ? 'Update' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}