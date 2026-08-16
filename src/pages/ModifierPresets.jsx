import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Trash2, Sliders } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import ModifierEditor from '@/components/pos/ModifierEditor';
import { toast } from 'sonner';

export default function ModifierPresets() {
  const [editPreset, setEditPreset] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: presets = [], isLoading } = useQuery({
    queryKey: ['modifierPresets'],
    queryFn: () => base44.entities.ModifierPreset.list(),
  });

  const createMutation = useMutation({
    mutationFn: data => base44.entities.ModifierPreset.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['modifierPresets'] }); toast.success('Preset created'); closeDialog(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ModifierPreset.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['modifierPresets'] }); toast.success('Preset updated'); closeDialog(); },
  });

  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.ModifierPreset.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['modifierPresets'] }); toast.success('Preset deleted'); },
  });

  const closeDialog = () => { setDialogOpen(false); setEditPreset(null); };

  const handleSave = () => {
    if (!editPreset.name?.trim()) { toast.error('Preset name is required'); return; }
    if (editPreset.id) {
      const { id, created_date, updated_date, created_by_id, ...data } = editPreset;
      updateMutation.mutate({ id, data });
    } else {
      createMutation.mutate(editPreset);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border bg-card/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold">Modifier Presets</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Build reusable modifier menus and toggle them on/off per drink</p>
          </div>
          <Button onClick={() => { setEditPreset({ name: '', modifiers: [] }); setDialogOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> New Preset
          </Button>
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && presets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <Sliders className="w-12 h-12 text-muted-foreground/30" />
              <p className="text-muted-foreground font-medium">No presets yet</p>
              <p className="text-sm text-muted-foreground">Create a preset (e.g. "Milk Options") then toggle it on individual menu items.</p>
            </div>
          )}
          {presets.map(preset => (
            <Card key={preset.id} className="p-4 flex items-center gap-4">
              <Sliders className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{preset.name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(preset.modifiers || []).map((mod, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{mod.name} ({(mod.options || []).length} opts)</Badge>
                  ))}
                  {(!preset.modifiers || preset.modifiers.length === 0) && (
                    <span className="text-xs text-muted-foreground">No modifier groups yet</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditPreset({ ...preset }); setDialogOpen(true); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(preset.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editPreset?.id ? 'Edit Preset' : 'New Modifier Preset'}</DialogTitle>
          </DialogHeader>
          {editPreset && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Preset Name *</Label>
                <Input
                  placeholder="e.g. Milk Options, Syrups, Temperature"
                  value={editPreset.name}
                  onChange={e => setEditPreset(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <ModifierEditor
                modifiers={editPreset.modifiers || []}
                onChange={mods => setEditPreset(prev => ({ ...prev, modifiers: mods }))}
              />
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                  {editPreset.id ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}