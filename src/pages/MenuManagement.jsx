import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Trash2, Search, LayoutGrid, List, ImagePlus, Sliders, CheckSquare, X } from 'lucide-react';
import ModifierEditor from '@/components/pos/ModifierEditor';
import ModifierOrderEditor from '@/components/pos/ModifierOrderEditor';
import TileColorField from '@/components/pos/TileColorField';
import AiThumbnailPicker from '@/components/pos/AiThumbnailPicker';
import ThumbnailGallery from '@/components/pos/ThumbnailGallery';
import PrinterMultiSelect from '@/components/pos/PrinterMultiSelect';
import BulkEditDialog from '@/components/pos/BulkEditDialog';
import { DEFAULT_PRINTER } from '@/components/pos/LabelPrinterSettings';
import { ALL_MENU_CATEGORIES } from '@/pages/Settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const categories = ALL_MENU_CATEGORIES;

export default function MenuManagement() {
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [uploadingImage, setUploadingImage] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['menuItems'],
    queryFn: () => base44.entities.MenuItem.list('sort_order', 200),
  });

  const { data: presets = [] } = useQuery({
    queryKey: ['modifierPresets'],
    queryFn: () => base44.entities.ModifierPreset.list(),
  });

  // Canonical array shape — matches every other ['storeSettings'] consumer
  // (Settings, ThemeProvider, Orders, POSTerminal) so the shared cache always
  // holds the array. A mismatched object shape here previously poisoned the
  // cache and reverted the applied theme to defaults on this page.
  const { data: settingsList } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: () => base44.entities.StoreSettings.list(),
  });
  const settings = settingsList?.[0] || null;

  const createMutation = useMutation({
    mutationFn: data => base44.entities.MenuItem.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      toast.success('Item created');
      closeDialog();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MenuItem.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      toast.success('Item updated');
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.MenuItem.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      toast.success('Item deleted');
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: updates => base44.entities.MenuItem.bulkUpdate(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      toast.success(`Updated ${selectedIds.size} items`);
      setBulkEditOpen(false);
      setSelectedIds(new Set());
      setBulkMode(false);
    },
    onError: (err) => toast.error(err.message || 'Bulk update failed'),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditItem(null);
  };

  const handleSave = () => {
    if (!editItem.name || !editItem.price) {
      toast.error('Name and price are required');
      return;
    }
    if (editItem.id) {
      const { id, created_date, updated_date, created_by_id, ...data } = editItem;
      updateMutation.mutate({ id: editItem.id, data });
    } else {
      createMutation.mutate(editItem);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setEditItem(prev => ({ ...prev, image_url: file_url }));
    setUploadingImage(false);
  };

  const filtered = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border bg-card/50">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-heading font-bold">Menu Items</h1>
          <div className="flex items-center gap-2">
            <div className="flex border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={cn("px-3 py-2 transition-colors", viewMode === 'grid' ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
                title="Thumbnail grid"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn("px-3 py-2 transition-colors", viewMode === 'list' ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
                title="Text list"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            <Button
              variant={bulkMode ? 'default' : 'outline'}
              onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
              className="gap-2"
            >
              <CheckSquare className="w-4 h-4" /> Bulk Edit
            </Button>
            <Button onClick={() => { setEditItem({ name: '', price: 0, category: 'coffee', is_available: true, sort_order: 0 }); setDialogOpen(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> Add Item
            </Button>
          </div>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-muted/50" />
        </div>
      </div>

      {/* Items */}
      <ScrollArea className="flex-1">
        {viewMode === 'grid' ? (
          <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map(item => {
              const isSelected = selectedIds.has(item.id);
              const toggleSelect = (e) => {
                e.stopPropagation();
                setSelectedIds(prev => {
                  const next = new Set(prev);
                  if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                  return next;
                });
              };
              return (
                <Card
                  key={item.id}
                  onClick={bulkMode ? toggleSelect : undefined}
                  className={cn(
                    "overflow-hidden group relative transition-all",
                    bulkMode && "cursor-pointer",
                    !bulkMode && "cursor-pointer",
                    !item.is_available && "opacity-60",
                    isSelected && "ring-2 ring-primary"
                  )}
                >
                  {bulkMode && (
                    <button
                      onClick={toggleSelect}
                      className={cn(
                        "absolute top-1.5 left-1.5 z-10 w-6 h-6 rounded-md border-2 flex items-center justify-center shadow transition-colors",
                        isSelected ? "bg-primary border-primary text-primary-foreground" : "bg-background/90 border-border"
                      )}
                    >
                      {isSelected && <CheckSquare className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl font-black text-muted-foreground/40">{item.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="font-semibold text-sm truncate">{item.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <Badge variant="outline" className="text-[10px] capitalize px-1.5 py-0">{item.category}</Badge>
                      <span className="text-sm font-mono font-bold text-primary">${item.price?.toFixed(2)}</span>
                    </div>
                  </div>
                  {!bulkMode && (
                    <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditItem({ ...item }); setDialogOpen(true); }}
                        className="w-7 h-7 rounded-md bg-background/90 border border-border flex items-center justify-center hover:bg-accent shadow"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(item.id)}
                        className="w-7 h-7 rounded-md bg-background/90 border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground shadow"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {!item.is_available && (
                    <div className="absolute bottom-0 left-0 right-0 bg-muted/80 text-center text-[10px] font-semibold text-muted-foreground py-0.5">
                      Unavailable
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="p-6 flex flex-col gap-2">
            {filtered.map(item => {
              const isSelected = selectedIds.has(item.id);
              const toggleSelect = () => setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                return next;
              });
              return (
                <Card
                  key={item.id}
                  onClick={bulkMode ? toggleSelect : undefined}
                  className={cn("p-4 flex items-center gap-3", bulkMode && "cursor-pointer", isSelected && "ring-2 ring-primary")}
                >
                  {bulkMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelect(); }}
                      className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                        isSelected ? "bg-primary border-primary text-primary-foreground" : "border-border"
                      )}
                    >
                      {isSelected && <CheckSquare className="w-3 h-3" />}
                    </button>
                  )}
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-base font-bold text-muted-foreground">{item.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{item.name}</p>
                      {!item.is_available && <Badge variant="secondary" className="text-xs">Unavailable</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs capitalize">{item.category}</Badge>
                      <span className="text-sm font-mono font-bold text-primary">${item.price?.toFixed(2)}</span>
                    </div>
                  </div>
                  {!bulkMode && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditItem({ ...item }); setDialogOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Bulk action bar */}
      {bulkMode && (
        <div className="border-t border-border bg-card px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (selectedIds.size === filtered.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(filtered.map(i => i.id)));
              }}
              className="text-xs"
            >
              {selectedIds.size === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all'}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setBulkMode(false); setSelectedIds(new Set()); }} className="gap-1.5">
              <X className="w-3.5 h-3.5" /> Exit
            </Button>
            <Button
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={() => setBulkEditOpen(true)}
            >
              Edit Selected
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Edit Dialog */}
      <BulkEditDialog
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        selectedItems={items.filter(i => selectedIds.has(i.id))}
        presets={presets}
        onApply={updates => bulkUpdateMutation.mutate(updates)}
        isApplying={bulkUpdateMutation.isPending}
      />

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? 'Edit Item' : 'New Item'}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4">
              {/* Thumbnail upload */}
              <div className="space-y-2">
                <Label>Thumbnail Image</Label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border">
                    {editItem.image_url ? (
                      <img src={editItem.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImagePlus className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors",
                        uploadingImage && "opacity-50 pointer-events-none"
                      )}>
                        <ImagePlus className="w-3.5 h-3.5" />
                        {uploadingImage ? 'Uploading...' : 'Upload image'}
                      </span>
                    </label>
                    {editItem.image_url && (
                      <button
                        onClick={() => setEditItem(prev => ({ ...prev, image_url: '' }))}
                        className="text-xs text-destructive hover:underline text-left"
                      >
                        Remove image
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={editItem.name} onChange={e => setEditItem({ ...editItem, name: e.target.value })} />
              </div>

              {/* Preset Thumbnail Gallery */}
              <ThumbnailGallery
                selectedUrl={editItem.image_url}
                onSelect={url => setEditItem(prev => ({ ...prev, image_url: url }))}
              />

              {/* AI Thumbnail Picker */}
              <AiThumbnailPicker
                itemName={editItem.name}
                category={editItem.category}
                onSelect={url => setEditItem(prev => ({ ...prev, image_url: url }))}
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price *</Label>
                  <Input type="number" step="0.01" value={editItem.price} onChange={e => setEditItem({ ...editItem, price: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label>Cost</Label>
                  <Input type="number" step="0.01" value={editItem.cost || ''} onChange={e => setEditItem({ ...editItem, cost: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={editItem.category} onValueChange={val => setEditItem({ ...editItem, category: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(() => {
                      // Respects Settings > Printer Routing's "Active
                      // Categories" toggle — but always includes this
                      // item's CURRENT category even if it's since been
                      // hidden, so editing an existing item never shows a
                      // blank/broken selector for data that already exists.
                      const enabled = settings?.enabled_categories && settings.enabled_categories.length > 0
                        ? categories.filter(c => settings.enabled_categories.includes(c))
                        : categories;
                      const shown = enabled.includes(editItem.category) ? enabled : [...enabled, editItem.category];
                      return shown.map(c => (
                        <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, ' ')}</SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
              <TileColorField
                value={editItem.color || ''}
                onChange={c => setEditItem(prev => ({ ...prev, color: c }))}
              />
              {(() => {
                const labelPrinters = settings?.label_printers || [{ ...DEFAULT_PRINTER }];
                const catMap = settings?.category_printers || {};
                const inheritedIds = (catMap[editItem.category] && catMap[editItem.category].length > 0)
                  ? catMap[editItem.category]
                  : (settings?.default_printer_id ? [settings.default_printer_id] : []);
                const inheritedNames = inheritedIds
                  .map(id => labelPrinters.find(p => p.id === id)?.name).filter(Boolean).join(', ')
                  || 'no default printer set';
                const hasOverride = (editItem.printer_ids || []).length > 0;
                return (
                  <div className="space-y-2">
                    <Label>Printers {hasOverride ? '(override)' : '(inherited)'}</Label>
                    <PrinterMultiSelect
                      printers={labelPrinters}
                      selected={editItem.printer_ids || []}
                      onChange={ids => setEditItem(prev => ({ ...prev, printer_ids: ids }))}
                      inheritMode
                      placeholder={`Inherits from ${editItem.category.replace(/_/g, ' ')} — ${inheritedNames}`}
                    />
                    {hasOverride && (
                      <button
                        onClick={() => setEditItem(prev => ({ ...prev, printer_ids: [] }))}
                        className="text-xs text-destructive hover:underline"
                      >
                        Reset — inherit from category
                      </button>
                    )}
                  </div>
                );
              })()}
              <div className="space-y-2">
                <Label>Barcode (optional)</Label>
                <Input value={editItem.barcode || ''} onChange={e => setEditItem({ ...editItem, barcode: e.target.value })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Available</Label>
                <Switch checked={editItem.is_available !== false} onCheckedChange={v => setEditItem({ ...editItem, is_available: v })} />
              </div>
              {/* Modifier Presets toggles */}
              {presets.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-sm font-semibold">Modifier Presets</Label>
                  </div>
                  <div className="space-y-1.5">
                    {presets.map(preset => {
                      const enabled = (editItem.preset_ids || []).includes(preset.id);
                      return (
                        <div key={preset.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/30">
                          <div>
                            <p className="text-sm font-medium">{preset.name}</p>
                            <p className="text-xs text-muted-foreground">{(preset.modifiers || []).map(m => m.name).join(', ') || 'No groups'}</p>
                          </div>
                          <Switch
                            checked={enabled}
                            onCheckedChange={v => {
                              const ids = editItem.preset_ids || [];
                              setEditItem(prev => ({
                                ...prev,
                                preset_ids: v ? [...ids, preset.id] : ids.filter(id => id !== preset.id)
                              }));
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <ModifierEditor
                modifiers={editItem.modifiers || []}
                onChange={mods => setEditItem(prev => ({ ...prev, modifiers: mods }))}
              />
              {(() => {
                const resolved = (presets || []).filter(p => (editItem.preset_ids || []).includes(p.id));
                const assignedGroupNames = [
                  ...(editItem.modifiers || []).map(m => m.name),
                  ...resolved.flatMap(p => (p.modifiers || []).map(m => m.name)),
                ];
                return (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Modifier Group Order</Label>
                    <p className="text-xs text-muted-foreground -mt-1">Drag to set how groups appear in the POS, on labels, and the customer display. Saved per item; overrides the category default.</p>
                    <ModifierOrderEditor
                      assignedGroupNames={assignedGroupNames}
                      order={editItem.modifier_order}
                      onChange={ords => setEditItem(prev => ({ ...prev, modifier_order: ords }))}
                    />
                  </div>
                );
              })()}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                  {editItem.id ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}