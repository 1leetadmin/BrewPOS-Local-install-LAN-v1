import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import TileColorField from '@/components/pos/TileColorField';
import { cn } from '@/lib/utils';

const PRICE_MODES = [
  { value: 'none', label: 'No change' },
  { value: 'set', label: 'Set to' },
  { value: 'increase', label: 'Increase by' },
  { value: 'decrease', label: 'Decrease by' },
];

const COLOR_MODES = [
  { value: 'none', label: 'No change' },
  { value: 'set', label: 'Set color' },
  { value: 'clear', label: 'Clear color' },
];

const PRESET_MODES = [
  { value: 'none', label: 'No change' },
  { value: 'add', label: 'Add presets' },
  { value: 'remove', label: 'Remove presets' },
  { value: 'replace', label: 'Replace presets' },
];

const SEG_BTN = 'px-3 py-1.5 text-xs font-medium transition-colors border-border';
const SEG_BTN_OFF = `${SEG_BTN} bg-card text-muted-foreground hover:bg-muted`;
const SEG_BTN_ON = `${SEG_BTN} bg-primary text-primary-foreground border-primary`;

function SegGroup({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn('rounded-md border', value === opt.value ? SEG_BTN_ON : SEG_BTN_OFF)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function BulkEditDialog({ open, onClose, selectedItems, presets, onApply, isApplying }) {
  const [priceMode, setPriceMode] = useState('none');
  const [priceValue, setPriceValue] = useState(0);
  const [priceUnit, setPriceUnit] = useState('amount');
  const [colorMode, setColorMode] = useState('none');
  const [color, setColor] = useState('');
  const [presetMode, setPresetMode] = useState('none');
  const [selectedPresets, setSelectedPresets] = useState([]);
  const [availability, setAvailability] = useState(null); // null = no change

  const reset = () => {
    setPriceMode('none'); setPriceValue(0); setPriceUnit('amount');
    setColorMode('none'); setColor('');
    setPresetMode('none'); setSelectedPresets([]);
    setAvailability(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const buildUpdates = () => {
    return selectedItems.map(item => {
      const changes = {};

      if (priceMode === 'set') {
        changes.price = Math.round(priceValue * 100) / 100;
      } else if (priceMode === 'increase') {
        changes.price = Math.round((priceUnit === 'percent'
          ? item.price * (1 + priceValue / 100)
          : item.price + priceValue) * 100) / 100;
      } else if (priceMode === 'decrease') {
        changes.price = Math.round((priceUnit === 'percent'
          ? item.price * (1 - priceValue / 100)
          : item.price - priceValue) * 100) / 100;
      }

      if (colorMode === 'set') changes.color = color;
      else if (colorMode === 'clear') changes.color = '';

      if (presetMode === 'add') {
        changes.preset_ids = [...new Set([...(item.preset_ids || []), ...selectedPresets])];
      } else if (presetMode === 'remove') {
        changes.preset_ids = (item.preset_ids || []).filter(id => !selectedPresets.includes(id));
      } else if (presetMode === 'replace') {
        changes.preset_ids = selectedPresets;
      }

      if (availability !== null) changes.is_available = availability;

      return { id: item.id, ...changes };
    });
  };

  const hasChanges =
    priceMode !== 'none' ||
    colorMode !== 'none' ||
    presetMode !== 'none' ||
    availability !== null;

  const handleApply = () => {
    if (!hasChanges) return;
    onApply(buildUpdates());
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Edit — {selectedItems.length} items</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Price */}
          <section className="space-y-2.5">
            <Label className="text-sm font-semibold">Price</Label>
            <SegGroup options={PRICE_MODES} value={priceMode} onChange={setPriceMode} />
            {priceMode !== 'none' && (
              <div className="flex items-center gap-2 pl-1">
                {(priceMode === 'increase' || priceMode === 'decrease') && (
                  <SegGroup
                    options={[{ value: 'amount', label: '$' }, { value: 'percent', label: '%' }]}
                    value={priceUnit}
                    onChange={setPriceUnit}
                  />
                )}
                <Input
                  type="number"
                  step="0.01"
                  value={priceValue}
                  onChange={e => setPriceValue(parseFloat(e.target.value) || 0)}
                  className="w-28"
                />
              </div>
            )}
          </section>

          {/* Color */}
          <section className="space-y-2.5">
            <Label className="text-sm font-semibold">Tile Color</Label>
            <SegGroup options={COLOR_MODES} value={colorMode} onChange={setColorMode} />
            {colorMode === 'set' && (
              <div className="pl-1">
                <TileColorField value={color} onChange={setColor} />
              </div>
            )}
          </section>

          {/* Modifier Presets */}
          {presets.length > 0 && (
            <section className="space-y-2.5">
              <Label className="text-sm font-semibold">Modifier Presets</Label>
              <SegGroup options={PRESET_MODES} value={presetMode} onChange={setPresetMode} />
              {presetMode !== 'none' && (
                <div className="space-y-1.5 pl-1">
                  {presets.map(preset => {
                    const enabled = selectedPresets.includes(preset.id);
                    return (
                      <div key={preset.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/30">
                        <div>
                          <p className="text-sm font-medium">{preset.name}</p>
                          <p className="text-xs text-muted-foreground">{(preset.modifiers || []).map(m => m.name).join(', ') || 'No groups'}</p>
                        </div>
                        <Switch
                          checked={enabled}
                          onCheckedChange={v => setSelectedPresets(prev => v ? [...prev, preset.id] : prev.filter(id => id !== preset.id))}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Availability */}
          <section className="space-y-2.5">
            <Label className="text-sm font-semibold">Availability</Label>
            <SegGroup
              options={[
                { value: 'none', label: 'No change' },
                { value: 'available', label: 'Available' },
                { value: 'unavailable', label: 'Unavailable' },
              ]}
              value={availability === null ? 'none' : availability ? 'available' : 'unavailable'}
              onChange={v => setAvailability(v === 'none' ? null : v === 'available')}
            />
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleApply} disabled={!hasChanges || isApplying}>
            {isApplying ? 'Applying...' : `Apply to ${selectedItems.length} items`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}