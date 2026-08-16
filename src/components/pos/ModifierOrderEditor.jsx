import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * Drag-and-drop (plus up/down arrows) editor for the display order of a menu
 * item's assigned modifier groups. Emits the full ordered list of group names
 * via onChange; the parent persists it to item.modifier_order.
 *
 * The list is seeded from `assignedGroupNames` (item-level groups + toggled
 * presets' groups). Any order already saved on the item is respected; groups
 * not present in the saved order append at the end in their natural order.
 */
export default function ModifierOrderEditor({ assignedGroupNames, order, onChange }) {
  const buildList = () => {
    const assigned = [...new Set((assignedGroupNames || []).filter(Boolean))];
    const saved = Array.isArray(order) ? order : [];
    const ordered = saved.filter(n => assigned.includes(n));
    const rest = assigned.filter(n => !ordered.includes(n));
    return [...ordered, ...rest];
  };

  const [list, setList] = useState(buildList);

  // Reseed when the assigned set changes (preset toggled on/off, item groups edited).
  useEffect(() => {
    setList(buildList());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(assignedGroupNames)]);

  const commit = (next) => {
    setList(next);
    onChange(next);
  };

  const onDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const next = [...list];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    commit(next);
  };

  const move = (i, dir) => {
    const n = i + dir;
    if (n < 0 || n >= list.length) return;
    const next = [...list];
    [next[i], next[n]] = [next[n], next[i]];
    commit(next);
  };

  if (list.length === 0) {
    return <p className="text-xs text-muted-foreground py-1">No modifier groups assigned to this item.</p>;
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="modifier-order">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
            {list.map((name, i) => (
              <Draggable key={name} draggableId={name} index={i}>
                {(drag) => (
                  <div
                    ref={drag.innerRef}
                    {...drag.draggableProps}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30"
                  >
                    <div {...drag.dragHandleProps} className="text-muted-foreground/50 cursor-grab hover:text-muted-foreground">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <span className="flex-1 text-sm font-medium">{name}</span>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === list.length - 1}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
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
  );
}