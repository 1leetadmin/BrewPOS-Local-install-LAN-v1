import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Drag-and-drop editor for a single modifier's options
function ModifierOptionsEditor({ modifier, modIndex, onUpdate, onRemoveMod }) {
  const [expanded, setExpanded] = useState(true);

  const updateName = (name) => onUpdate(modIndex, { ...modifier, name });

  const handleOptionDragEnd = (result) => {
    if (!result.destination) return;
    const opts = [...(modifier.options || [])];
    const [moved] = opts.splice(result.source.index, 1);
    opts.splice(result.destination.index, 0, moved);
    onUpdate(modIndex, { ...modifier, options: opts });
  };

  const updateOption = (optIdx, field, value) => {
    const opts = [...(modifier.options || [])];
    opts[optIdx] = { ...opts[optIdx], [field]: field === 'price_adjustment' ? parseFloat(value) || 0 : value };
    onUpdate(modIndex, { ...modifier, options: opts });
  };

  const addOption = () => {
    const opts = [...(modifier.options || []), { label: '', price_adjustment: 0 }];
    onUpdate(modIndex, { ...modifier, options: opts });
  };

  const removeOption = (optIdx) => {
    const opts = (modifier.options || []).filter((_, i) => i !== optIdx);
    onUpdate(modIndex, { ...modifier, options: opts });
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Modifier header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40">
        <Input
          value={modifier.name || ''}
          onChange={e => updateName(e.target.value)}
          placeholder="Modifier name (e.g. Milk Type)"
          className="h-8 text-sm font-semibold bg-transparent border-none shadow-none focus-visible:ring-0 p-0"
        />
        <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-foreground transition-colors">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button onClick={() => onRemoveMod(modIndex)} className="text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {expanded && (
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-3 px-1 pb-1">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={!!modifier.multi_select}
                onChange={e => onUpdate(modIndex, { ...modifier, multi_select: e.target.checked })}
              />
              Multi-select
            </label>
            {modifier.multi_select && (
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                Max selections:
                <Input
                  type="number"
                  min="0"
                  value={modifier.max_selections ?? 0}
                  onChange={e => onUpdate(modIndex, { ...modifier, max_selections: parseInt(e.target.value) || 0 })}
                  className="h-7 w-16 text-xs"
                />
              </label>
            )}
          </div>

          <div className="grid grid-cols-[1fr_90px_32px] gap-1 px-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">Option</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">Price adj.</span>
            <span />
          </div>

          <DragDropContext onDragEnd={handleOptionDragEnd}>
            <Droppable droppableId={`modifier-${modIndex}-options`}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                  {(modifier.options || []).map((opt, optIdx) => (
                    <Draggable key={optIdx} draggableId={`mod-${modIndex}-opt-${optIdx}`} index={optIdx}>
                      {(drag, snapshot) => (
                        <div
                          ref={drag.innerRef}
                          {...drag.draggableProps}
                          className={cn(
                            "grid grid-cols-[16px_1fr_90px_32px] items-center gap-1",
                            snapshot.isDragging && "opacity-80"
                          )}
                        >
                          <div {...drag.dragHandleProps} className="text-muted-foreground/50 cursor-grab flex items-center">
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>
                          <Input
                            value={opt.label}
                            onChange={e => updateOption(optIdx, 'label', e.target.value)}
                            placeholder="e.g. Oat Milk"
                            className="h-8 text-sm"
                          />
                          <Input
                            type="number"
                            step="0.10"
                            value={opt.price_adjustment ?? 0}
                            onChange={e => updateOption(optIdx, 'price_adjustment', e.target.value)}
                            className="h-8 text-sm text-right"
                          />
                          <button onClick={() => removeOption(optIdx)} className="flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          <button
            onClick={addOption}
            className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
          >
            <Plus className="w-3 h-3" /> Add option
          </button>
        </div>
      )}
    </div>
  );
}

// Top-level drag-and-drop for modifier order
export default function ModifierEditor({ modifiers = [], onChange }) {
  const handleModifierDragEnd = (result) => {
    if (!result.destination) return;
    const mods = [...modifiers];
    const [moved] = mods.splice(result.source.index, 1);
    mods.splice(result.destination.index, 0, moved);
    onChange(mods);
  };

  const updateModifier = (idx, updated) => {
    const mods = [...modifiers];
    mods[idx] = updated;
    onChange(mods);
  };

  const removeModifier = (idx) => {
    onChange(modifiers.filter((_, i) => i !== idx));
  };

  const addModifier = () => {
    onChange([...modifiers, { name: '', options: [{ label: '', price_adjustment: 0 }] }]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Modifiers</Label>
        <button onClick={addModifier} className="flex items-center gap-1 text-xs text-primary hover:underline">
          <Plus className="w-3 h-3" /> Add modifier
        </button>
      </div>

      {modifiers.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">No modifiers. Add one to let cashiers customise this item.</p>
      )}

      <DragDropContext onDragEnd={handleModifierDragEnd}>
        <Droppable droppableId="modifiers-list">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {modifiers.map((mod, idx) => (
                <Draggable key={idx} draggableId={`modifier-${idx}`} index={idx}>
                  {(drag, snapshot) => (
                    <div
                      ref={drag.innerRef}
                      {...drag.draggableProps}
                      className={cn("flex gap-2 items-start", snapshot.isDragging && "opacity-80")}
                    >
                      <div {...drag.dragHandleProps} className="mt-2.5 text-muted-foreground/40 cursor-grab hover:text-muted-foreground transition-colors">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <ModifierOptionsEditor
                          modifier={mod}
                          modIndex={idx}
                          onUpdate={updateModifier}
                          onRemoveMod={removeModifier}
                        />
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}