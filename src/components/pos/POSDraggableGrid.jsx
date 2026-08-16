import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { idealForeground } from '@/lib/colorUtils';
import { X, GripVertical, Plus } from 'lucide-react';

const CATEGORY_FILL = {
  coffee: 'from-amber-500/20 to-amber-600/10',
  tea: 'from-green-500/20 to-green-600/10',
  smoothies: 'from-purple-500/20 to-purple-600/10',
  juices: 'from-orange-500/20 to-orange-600/10',
  sodas: 'from-blue-500/20 to-blue-600/10',
  water: 'from-cyan-500/20 to-cyan-600/10',
  alcohol: 'from-red-500/20 to-red-600/10',
  food: 'from-yellow-500/20 to-yellow-600/10',
  snacks: 'from-pink-500/20 to-pink-600/10',
  desserts: 'from-rose-500/20 to-rose-600/10',
  other: 'from-slate-500/20 to-slate-600/10',
};
const CATEGORY_BORDER = {
  coffee: 'border-amber-500/30',
  tea: 'border-green-500/30',
  smoothies: 'border-purple-500/30',
  juices: 'border-orange-500/30',
  sodas: 'border-blue-500/30',
  water: 'border-cyan-500/30',
  alcohol: 'border-red-500/30',
  food: 'border-yellow-500/30',
  snacks: 'border-pink-500/30',
  desserts: 'border-rose-500/30',
  other: 'border-slate-500/30',
};

// Minimum pointer movement (px) before a press-and-hold is treated as a drag
// rather than a tap/click. Keeps the empty-slot "assign item" click and the
// remove button working normally when the user isn't actually dragging.
const DRAG_THRESHOLD = 6;

export default function POSDraggableGrid({
  slots, menuItemsMap, onReorder, onRemove, onEmptySlotClick,
  gridCols, editMode, slotColors = {}, paintColor, onPaintSlot,
  thumbnailSize = 36, textSize = 12,
}) {
  const isPainting = !!paintColor;
  const canDrag = editMode && !isPainting;

  const [draggingIdx, setDraggingIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  // Everything about the in-progress gesture lives in a ref so pointermove
  // (which can fire many times per frame) never has to wait on React state.
  const gestureRef = useRef({
    active: false,      // press is down
    dragging: false,    // moved past the threshold — a real drag
    sourceIdx: null,
    startX: 0,
    startY: 0,
    pointerId: null,
  });

  // Set for one tick right after a real drag+drop completes, so the
  // synthetic click the browser fires on pointerup (over the drop target)
  // doesn't also trigger that slot's onClick (assign/remove).
  const suppressClickRef = useRef(false);

  const findSlotIdxAtPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const slotEl = el?.closest('[data-slot-idx]');
    if (!slotEl) return null;
    const idx = parseInt(slotEl.dataset.slotIdx, 10);
    return Number.isNaN(idx) ? null : idx;
  };

  const handlePointerDown = (e, idx) => {
    if (!canDrag || !slots[idx]) return; // only filled slots can originate a drag
    if (e.button !== undefined && e.button !== 0) return; // left click / primary touch only
    gestureRef.current = {
      active: true,
      dragging: false,
      sourceIdx: idx,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
    // Capture so we keep receiving move/up even if the pointer leaves this element.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    const g = gestureRef.current;
    if (!g.active) return;

    if (!g.dragging) {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      g.dragging = true;
      setDraggingIdx(g.sourceIdx);
    }

    e.preventDefault();
    const hoverIdx = findSlotIdxAtPoint(e.clientX, e.clientY);
    setOverIdx((current) => (current === hoverIdx ? current : hoverIdx));
  };

  const finishGesture = (e) => {
    const g = gestureRef.current;
    if (!g.active) return;
    const wasDragging = g.dragging;
    const sourceIdx = g.sourceIdx;

    gestureRef.current = { active: false, dragging: false, sourceIdx: null, startX: 0, startY: 0, pointerId: null };
    setDraggingIdx(null);
    setOverIdx(null);

    if (!wasDragging) return; // plain tap/click — let normal onClick handlers run

    const targetIdx = findSlotIdxAtPoint(e.clientX, e.clientY);
    suppressClickRef.current = true;
    setTimeout(() => { suppressClickRef.current = false; }, 0);

    if (targetIdx === null || targetIdx === sourceIdx) return;

    const newSlots = [...slots];
    const temp = newSlots[targetIdx];
    newSlots[targetIdx] = newSlots[sourceIdx];
    newSlots[sourceIdx] = temp;
    onReorder(newSlots);
  };

  const handlePointerUp = (e) => finishGesture(e);
  const handlePointerCancel = (e) => finishGesture(e);

  const guardClick = (handler) => (e) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    handler(e);
  };

  return (
    <div
      className="grid gap-3 p-1"
      style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
    >
      {slots.map((itemId, idx) => {
        const item = itemId ? menuItemsMap[itemId] : null;
        const hasCustomColor = item && !!item.color && item.color.trim();
        const slotColor = slotColors?.[String(idx)];
        const bgColor = hasCustomColor ? item.color : (slotColor || null);
        const fg = bgColor ? idealForeground(bgColor) : null;
        const isDragging = draggingIdx === idx;
        const isOver = overIdx === idx && draggingIdx !== null && draggingIdx !== idx;
        // While ANY slot is mid-drag, interactive children (the empty-slot
        // "+" button in particular) must not be hit by elementFromPoint, or
        // the hit-test resolves to the button/icon instead of this slot
        // wrapper and the drop silently fails to find a target.
        const contentInert = draggingIdx !== null;

        return (
          <div
            key={`slot-${idx}`}
            data-slot-idx={idx}
            onPointerDown={(e) => handlePointerDown(e, idx)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            style={{
              ...(bgColor ? { backgroundColor: bgColor, color: fg } : {}),
              touchAction: canDrag && item ? 'none' : undefined,
            }}
            className={cn(
              'relative rounded-xl border min-h-[90px] flex flex-col items-center justify-center p-3 select-none',
              bgColor
                ? 'border-black/10'
                : item
                  ? cn('bg-gradient-to-br', CATEGORY_FILL[item.category] || CATEGORY_FILL.other, CATEGORY_BORDER[item.category] || CATEGORY_BORDER.other)
                  : 'border-dashed border-border bg-muted/20',
              canDrag && (item ? 'cursor-grab active:cursor-grabbing' : 'cursor-grab'),
              isPainting && 'cursor-pointer hover:ring-2 hover:ring-primary',
              isDragging && 'opacity-40',
              isOver && 'ring-2 ring-primary shadow-2xl scale-105 z-50',
              !item && !isPainting && 'opacity-40',
            )}
          >
            {/* Paint overlay — captures clicks when a paint color is active */}
            {isPainting && (
              <div
                className="absolute inset-0 z-20 rounded-xl"
                onClick={() => onPaintSlot?.(idx, paintColor)}
              />
            )}

            {canDrag && item && (
              <div className="absolute top-1 left-1 text-muted-foreground/60 z-10 pointer-events-none">
                <GripVertical className="w-3.5 h-3.5" />
              </div>
            )}

            {canDrag && item && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={guardClick(() => onRemove(idx))}
                className={cn(
                  'absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive/80 text-white flex items-center justify-center hover:bg-destructive z-10',
                  contentInert && 'pointer-events-none',
                )}
              >
                <X className="w-3 h-3" />
              </button>
            )}

            {item ? (
              <>
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} draggable={false} className="rounded-lg object-cover mb-1.5 pointer-events-none" style={{ width: thumbnailSize, height: thumbnailSize }} />
                ) : (
                  <div className="rounded-lg bg-white/10 flex items-center justify-center mb-1.5" style={{ width: thumbnailSize, height: thumbnailSize }}>
                    <span className="font-bold opacity-60" style={{ fontSize: thumbnailSize * 0.4 }}>{item.name.charAt(0)}</span>
                  </div>
                )}
                <span className="font-semibold text-center leading-tight line-clamp-2" style={{ fontSize: textSize }}>{item.name}</span>
                <span
                  className={cn('font-mono font-bold mt-0.5', !bgColor && 'text-primary')}
                  style={{ fontSize: textSize, ...(bgColor ? { color: fg } : {}) }}
                >
                  ${item.price.toFixed(2)}
                </span>
              </>
            ) : canDrag ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={guardClick(() => onEmptySlotClick && onEmptySlotClick(idx))}
                className={cn(
                  'flex flex-col items-center gap-1 text-muted-foreground/50 hover:text-primary transition-colors',
                  contentInert && 'pointer-events-none',
                )}
              >
                <Plus className="w-4 h-4" />
                <span className="text-[10px]">Slot {idx + 1}</span>
              </button>
            ) : (
              <span className="text-xs text-muted-foreground/40">Empty</span>
            )}
          </div>
        );
      })}
    </div>
  );
}