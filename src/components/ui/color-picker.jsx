import { Input } from '@/components/ui/input';
import { safeHex, getAlpha, withAlpha } from '@/lib/colorUtils';

// Reusable colour picker with an inline opacity slider.
// Outputs 6-digit hex (#rrggbb) at full opacity or 8-digit hex (#rrggbbaa) when transparent.
export default function ColorPicker({ value, onChange, swatchClass = 'w-8 h-8', inputClass = 'h-8 w-24' }) {
  const alpha = getAlpha(value);
  const alphaPercent = Math.round((alpha / 255) * 100);

  const handleColorChange = (hex6) => {
    onChange(alpha >= 255 ? hex6 : withAlpha(hex6, alpha));
  };

  const handleAlphaChange = (pct) => {
    const a = Math.round((pct / 100) * 255);
    onChange(a >= 255 ? safeHex(value) : withAlpha(value || '#000000', a));
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={safeHex(value)}
        onChange={(e) => handleColorChange(e.target.value)}
        className={`${swatchClass} rounded border border-border cursor-pointer bg-transparent p-0 shrink-0`}
        aria-label="Pick colour"
      />
      <Input
        value={value || ''}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder="#000000"
        className={`${inputClass} font-mono text-xs`}
      />
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="range"
          min={0}
          max={100}
          value={alphaPercent}
          onChange={(e) => handleAlphaChange(parseInt(e.target.value))}
          className="w-14 h-1.5 accent-primary cursor-pointer"
          title={`Opacity ${alphaPercent}%`}
          aria-label="Opacity"
        />
        <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">{alphaPercent}%</span>
      </div>
    </div>
  );
}