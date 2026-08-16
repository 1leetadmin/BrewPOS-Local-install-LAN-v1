import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Percent } from 'lucide-react';
import { toast } from 'sonner';

export default function Discounts() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newPct, setNewPct] = useState('');
  const [newPrepaid, setNewPrepaid] = useState('');

  const { data: discounts = [] } = useQuery({
    queryKey: ['discounts'],
    queryFn: () => base44.entities.Discount.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Discount.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      setNewName('');
      setNewPct('');
      setNewPrepaid('');
      toast.success('Discount created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Discount.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discounts'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Discount.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      toast.success('Discount deleted');
    },
  });

  const handleCreate = () => {
    const pct = parseFloat(newPct);
    if (!newName.trim() || isNaN(pct) || pct < 0 || pct > 100) {
      toast.error('Please enter a name and a percentage between 0 and 100');
      return;
    }
    createMutation.mutate({ name: newName.trim(), percentage: pct, is_active: true, prepaid_amount: Number(newPrepaid) || 0 });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Discounts</h1>
        <p className="text-sm text-muted-foreground mt-1">Create named discounts to apply at checkout.</p>
      </div>

      {/* Add new */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> New Discount</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Name</Label>
              <Input placeholder="e.g. Staff Discount" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="w-32 space-y-1">
              <Label className="text-xs">Percentage (%)</Label>
              <Input type="number" min="0" max="100" step="1" placeholder="e.g. 20" value={newPct} onChange={e => setNewPct(e.target.value)} />
            </div>
            <div className="w-36 space-y-1">
              <Label className="text-xs">Prepaid Amount ($)</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={newPrepaid} onChange={e => setNewPrepaid(e.target.value)} />
            </div>
            <Button onClick={handleCreate} disabled={createMutation.isPending} className="shrink-0">
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-2">
        {discounts.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No discounts yet. Add one above.</p>
        )}
        {discounts.map(d => (
          <Card key={d.id} className={d.is_active ? '' : 'opacity-50'}>
            <CardContent className="py-3 px-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Percent className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{d.name}</p>
                <p className="text-xs text-muted-foreground">{d.percentage}% off order total</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs text-muted-foreground">Prepaid: $</span>
                  <input
                    key={`prepaid-${d.id}-${d.prepaid_amount || 0}`}
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={d.prepaid_amount || 0}
                    onBlur={e => {
                      const val = Number(e.target.value) || 0;
                      if (val !== (d.prepaid_amount || 0)) updateMutation.mutate({ id: d.id, data: { prepaid_amount: val } });
                    }}
                    className="w-20 h-6 text-xs border border-input rounded px-1 bg-transparent"
                    placeholder="0"
                  />
                  {(d.used_amount || 0) > 0 && (
                    <span className="text-xs text-muted-foreground">| Used: ${d.used_amount.toFixed(2)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Switch
                  checked={d.is_active}
                  onCheckedChange={v => updateMutation.mutate({ id: d.id, data: { is_active: v } })}
                />
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => deleteMutation.mutate(d.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}