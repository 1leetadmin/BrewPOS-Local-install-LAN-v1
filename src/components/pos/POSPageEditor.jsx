import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings2, Check, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import POSDraggableGrid from './POSDraggableGrid';
import SlotColorPalette from './SlotColorPalette';
import { trimTrailingNulls } from '@/lib/slotUtils';

const PAGE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
const DEFAULT_ITEMS_PER_PAGE = 20;

function getGridCols(count) {
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  if (count <= 25) return 5;
  if (count <= 36) return 6;
  return 7;
}

export default function POSPageEditor({ pageIndex, onClose }) {
  const queryClient = useQueryClient();
  const [assignTargetIdx, setAssignTargetIdx] = useState(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [labelEdit, setLabelEdit] = useState(null);
  const [paintColor, setPaintColor] = useState(null);

  const { data: layouts = [] } = useQuery({
    queryKey: ['menuPageLayouts'],
    queryFn: () => base44.entities.MenuPageLayout.list('page_index', 6),
  });

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menuItems'],
    queryFn: () => base44.entities.MenuItem.list('sort_order', 200),
  });

  const menuItemsMap = useMemo(() => Object.fromEntries(menuItems.map(i => [i.id, i])), [menuItems]);

  const layout = layouts.find(l => l.page_index === pageIndex);
  const slots = layout?.slots || [];
  const slotColors = layout?.slot_colors || {};
  const itemsPerPage = layout?.items_per_page || DEFAULT_ITEMS_PER_PAGE;
  const label = layout?.label || `Page ${pageIndex + 1}`;

  // Pad slots to itemsPerPage for display (null = empty slot)
  const paddedSlots = [...slots];
  while (paddedSlots.length < itemsPerPage) paddedSlots.push(null);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (layout?.id) {
        return base44.entities.MenuPageLayout.update(layout.id, data);
      } else {
        return base44.entities.MenuPageLayout.create({ page_index: pageIndex, ...data });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menuPageLayouts'] }),
  });

  const saveField = (field, value) => {
    saveMutation.mutate({ label, slots, items_per_page: itemsPerPage, [field]: value });
  };

  const handleReorder = (newSlots) => {
    saveMutation.mutate({ label, items_per_page: itemsPerPage, slots: trimTrailingNulls(newSlots) });
  };

  // Set to null instead of splicing — preserves the fixed position of every
  // other item on the page.
  const handleRemove = (idx) => {
    const padded = [...paddedSlots];
    padded[idx] = null;
    saveMutation.mutate({ label, items_per_page: itemsPerPage, slots: trimTrailingNulls(padded) });
  };

  // Assign to a specific slot (when the user clicked an empty slot).
  const handleAssignToSlot = (itemId) => {
    if (paddedSlots.includes(itemId)) {
      toast.error('Item already on this page');
      return;
    }
    if (assignTargetIdx !== null && assignTargetIdx < itemsPerPage) {
      const padded = [...paddedSlots];
      padded[assignTargetIdx] = itemId;
      saveMutation.mutate({ label, items_per_page: itemsPerPage, slots: trimTrailingNulls(padded) });
      toast.success(`Placed ${menuItemsMap[itemId]?.name} in slot ${assignTargetIdx + 1}`);
    } else {
      // Fallback: append to first available empty slot
      const padded = [...paddedSlots];
      const firstEmpty = padded.indexOf(null);
      if (firstEmpty === -1) {
        toast.error('Page is full. Increase items per page or remove an item.');
        return;
      }
      padded[firstEmpty] = itemId;
      saveMutation.mutate({ label, items_per_page: itemsPerPage, slots: trimTrailingNulls(padded) });
      toast.success(`Added ${menuItemsMap[itemId]?.name}`);
    }
    setAssignTargetIdx(null);
  };

  const handlePaint = (idx, color) => {
    const newColors = { ...slotColors };
    if (color === '__clear__') delete newColors[String(idx)];
    else newColors[String(idx)] = color;
    saveMutation.mutate({ label, items_per_page: itemsPerPage, slots: trimTrailingNulls(paddedSlots), slot_colors: newColors });
  };

  const handleEmptySlotClick = (idx) => {
    setAssignTargetIdx(idx);
    setAddPickerOpen(true);
  };

  const handleAddItem = (itemId) => {
    if (assignTargetIdx !== null) {
      handleAssignToSlot(itemId);
      return;
    }
    if (paddedSlots.includes(itemId)) {
      toast.error('Item already on this page');
      return;
    }
    const padded = [...paddedSlots];
    const firstEmpty = padded.indexOf(null);
    if (firstEmpty === -1) {
      toast.error('Page is full. Increase items per page or remove an item.');
      return;
    }
    padded[firstEmpty] = itemId;
    saveMutation.mutate({ label, items_per_page: itemsPerPage, slots: trimTrailingNulls(padded) });
    toast.success(`Added ${menuItemsMap[itemId]?.name}`);
  };

  const adjustItemsPerPage = (delta) => {
    const next = Math.min(60, Math.max(9, itemsPerPage + delta));
    saveField('items_per_page', next);
  };

  const gridCols = getGridCols(itemsPerPage);

  const categories = [...new Set(menuItems.map(i => i.category).filter(Boolean))];
  const filteredForPicker = menuItems.filter(i =>
    (categoryFilter === 'all' || i.category === categoryFilter) && !paddedSlots.includes(i.id)
  );

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-3 flex items-center gap-4">
        <Settings2 className="w-5 h-5 text-primary" />
        <div className="flex items-center gap-2">
          {labelEdit !== null ? (
            <Input
              autoFocus
              value={labelEdit}
              onChange={e => setLabelEdit(e.target.value)}
              onBlur={() => { saveField('label', labelEdit); setLabelEdit(null); }}
              onKeyDown={e => e.key === 'Enter' && (saveField('label', labelEdit), setLabelEdit(null))}
              className="h-8 w-40 text-sm font-bold"
            />
          ) : (
            <button
              onClick={() => setLabelEdit(label)}
              className="text-lg font-bold hover:text-primary transition-colors"
              title="Click to rename"
            >
              {label}
            </button>
          )}
          <div
            className="w-3 h-3 rounded-full"
            style={{ background: PAGE_COLORS[pageIndex % PAGE_COLORS.length] }}
          />
        </div>

        <div className="flex items-center gap-2 ml-4 border border-border rounded-lg overflow-hidden">
          <button onClick={() => adjustItemsPerPage(-1)} className="px-2 py-1.5 hover:bg-muted transition-colors">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="px-3 text-sm font-mono font-bold min-w-[3ch] text-center">{itemsPerPage}</span>
          <button onClick={() => adjustItemsPerPage(1)} className="px-2 py-1.5 hover:bg-muted transition-colors">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <span className="text-xs text-muted-foreground">{paddedSlots.filter(Boolean).length}/{itemsPerPage} items</span>

        <div className="ml-auto flex items-center gap-3">
          <SlotColorPalette paintColor={paintColor} onSelect={setPaintColor} />
          <Button variant="outline" size="sm" onClick={() => { setAssignTargetIdx(null); setAddPickerOpen(true); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Items
          </Button>
          <Button size="sm" onClick={onClose} className="gap-1.5">
            <Check className="w-3.5 h-3.5" /> Done
          </Button>
        </div>
      </div>

      {/* Grid */}
      <ScrollArea className="flex-1 p-6">
        <POSDraggableGrid
          slots={paddedSlots}
          menuItemsMap={menuItemsMap}
          onReorder={handleReorder}
          onRemove={handleRemove}
          onEmptySlotClick={handleEmptySlotClick}
          onPaintSlot={handlePaint}
          gridCols={gridCols}
          editMode={true}
          slotColors={slotColors}
          paintColor={paintColor}
        />
      </ScrollArea>

      {/* Add item picker */}
      <Dialog open={addPickerOpen} onOpenChange={(open) => { setAddPickerOpen(open); if (!open) setAssignTargetIdx(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {assignTargetIdx !== null ? `Assign item to Slot ${assignTargetIdx + 1}` : `Add Items to ${label}`}
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 flex-wrap mb-3">
            {['all', ...categories].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize",
                  categoryFilter === cat ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
          <ScrollArea className="h-80">
            <div className="grid grid-cols-3 gap-2">
              {filteredForPicker.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleAddItem(item.id)}
                  className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-accent text-left transition-colors"
                >
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">{item.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{item.name}</p>
                    <p className="text-xs text-primary font-mono">${item.price.toFixed(2)}</p>
                  </div>
                </button>
              ))}
              {filteredForPicker.length === 0 && (
                <p className="col-span-3 text-center text-sm text-muted-foreground py-8">
                  All items already added
                </p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}