import { Palette } from 'lucide-react';
import { Label } from '@/components/ui/label';
import ColorPicker from '@/components/ui/color-picker';

// Optional per-item POS tile background override. Empty value = inherit the
// default category colour (no override). This is purely a background fill;
// text colour, border, and states remain governed by the theme + category.
export default function TileColorField({ value, onChange }) {
  const hasColor = !!value && value.trim();
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold flex items-center gap-2">
        <Palette className="w-4 h-4 text-muted-foreground" />
        Tile Background (optional)
      </Label>
      <p className="text-xs text-muted-foreground">
        Overrides this item's POS tile background. Leave empty to use the default category colour.
      </p>
      <div className="flex items-center gap-2">
        <ColorPicker value={value} onChange={onChange} swatchClass="w-9 h-9" inputClass="h-9 w-36" />
        {hasColor && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-destructive hover:underline px-1"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}