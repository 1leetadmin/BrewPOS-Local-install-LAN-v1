import { Paintbrush, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAlpha, withAlpha, safeHex } from '@/lib/colorUtils';

const PALETTE = [
  '#f59e0b', '#3b82f6', '#10b981', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
];

export default function SlotColorPalette({ paintColor, onSelect }) {
  const isClear = paintColor === '__clear__';
  const isErasing = !paintColor;
  const alpha = isClear || isErasing ? 255 : getAlpha(paintColor);
  const alphaPercent = Math.round((alpha / 255) * 100);
  const activeRgb = isClear || isErasing ? null : safeHex(paintColor);

  const handleSwatch = (c) => {
    if (activeRgb === c) {
      onSelect(null);
    } else {
      onSelect(alpha < 255 ? withAlpha(c, alpha) : c);
    }
  };

  const handleAlpha = (pct) => {
    if (isClear || isErasing || !paintColor) return;
    const a = Math.round((pct / 100) * 255);
    onSelect(a >= 255 ? safeHex(paintColor) : withAlpha(paintColor, a));
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Paintbrush className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex gap-1.5">
          {PALETTE.map(c => (
            <button
              key={c}
              onClick={() => handleSwatch(c)}
              className={cn(
                'w-7 h-7 rounded-lg border-2 transition-all shrink-0',
                activeRgb === c ? 'border-foreground scale-110' : 'border-border'
              )}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
          <button
            onClick={() => onSelect(paintColor === '__clear__' ? null : '__clear__')}
            className={cn(
              'w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 bg-muted',
              paintColor === '__clear__' ? 'border-foreground scale-110' : 'border-border'
            )}
            title="Clear slot color"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="range"
          min={0}
          max={100}
          value={alphaPercent}
          onChange={(e) => handleAlpha(parseInt(e.target.value))}
          disabled={isClear || isErasing}
          className="w-16 h-1.5 accent-primary cursor-pointer disabled:opacity-40"
          title={`Opacity ${alphaPercent}%`}
        />
        <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">{alphaPercent}%</span>
      </div>
    </div>
  );
}