import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Palette, Plus, RotateCcw, Check } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import ColorPicker from '@/components/ui/color-picker';
import {
  THEME_PRESETS,
  ADDITIONAL_THEMES,
  buildThemeFromPreset,
  applyAccent,
  BUILT_IN_BLOCKS,
} from '@/lib/themePresets';

function ColorRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <Label className="text-xs text-muted-foreground shrink-0">{label}</Label>
      <ColorPicker value={value} onChange={onChange} swatchClass="w-8 h-8" inputClass="h-8 w-24" />
    </div>
  );
}

function BlockOverrideRow({ blockKey, override, defaultColors, onEnable, onDisable, onColor }) {
  const enabled = !!override;
  return (
    <div className={cn('rounded-lg border p-3 space-y-2', enabled ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20')}>
      <div className="flex items-center justify-between">
        <Label className="font-medium text-sm">{blockKey}</Label>
        <Switch checked={enabled} onCheckedChange={(v) => (v ? onEnable() : onDisable())} />
      </div>
      {enabled && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Selected</p>
            <ColorRow label="Background" value={override.selected.background} onChange={(v) => onColor('selected', 'background', v)} />
            <ColorRow label="Text" value={override.selected.text} onChange={(v) => onColor('selected', 'text', v)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unselected</p>
            <ColorRow label="Background" value={override.unselected.background} onChange={(v) => onColor('unselected', 'background', v)} />
            <ColorRow label="Text" value={override.unselected.text} onChange={(v) => onColor('unselected', 'text', v)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ThemeSettings({ theme, onChange }) {
  const [customBlock, setCustomBlock] = useState('');
  const [showMoreThemes, setShowMoreThemes] = useState(false);

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menuItems'],
    queryFn: () => base44.entities.MenuItem.list(),
  });
  const { data: presets = [] } = useQuery({
    queryKey: ['modifierPresets'],
    queryFn: () => base44.entities.ModifierPreset.list(),
  });

  const itemBlocks = (menuItems || []).flatMap((i) => (i.modifiers || []).map((m) => m.name)).filter(Boolean);
  const presetBlocks = (presets || []).flatMap((p) => (p.modifiers || []).map((m) => m.name)).filter(Boolean);
  const overrideKeys = Object.keys(theme.modifier_button_overrides || {});
  const knownBlocks = Array.from(
    new Set([...BUILT_IN_BLOCKS, ...itemBlocks, ...presetBlocks, ...overrideKeys])
  ).sort();

  const patch = (partial) => onChange({ ...theme, active_preset: 'custom', ...partial });
  const patchColors = (partial) => patch({ colors: { ...theme.colors, ...partial } });

  const applyPreset = (id) => onChange(buildThemeFromPreset(id));

  const setMode = (dark) => patch({ mode: dark ? 'dark' : 'light' });

  // ---- Modifier-button default ----
  const setModDefault = (state, field, value) =>
    patch({
      modifier_button_default: {
        ...theme.modifier_button_default,
        [state]: { ...theme.modifier_button_default[state], [field]: value },
      },
    });

  // ---- Per-block overrides ----
  const overrides = theme.modifier_button_overrides || {};
  const enableBlock = (blockKey) =>
    onChange({
      ...theme,
      active_preset: 'custom',
      modifier_button_overrides: {
        ...overrides,
        [blockKey]: {
          selected: { ...theme.modifier_button_default.selected },
          unselected: { ...theme.modifier_button_default.unselected },
        },
      },
    });
  const disableBlock = (blockKey) => {
    const next = { ...overrides };
    delete next[blockKey];
    onChange({ ...theme, modifier_button_overrides: next });
  };
  const setBlockColor = (blockKey, state, field, value) =>
    onChange({
      ...theme,
      active_preset: 'custom',
      modifier_button_overrides: {
        ...overrides,
        [blockKey]: {
          ...overrides[blockKey],
          [state]: { ...overrides[blockKey][state], [field]: value },
        },
      },
    });

  const addCustomBlock = () => {
    const name = customBlock.trim();
    if (!name || knownBlocks.includes(name) || overrides[name]) {
      setCustomBlock('');
      return;
    }
    enableBlock(name);
    setCustomBlock('');
  };

  return (
    <div className="space-y-6">
      {/* Presets */}
      <div>
        <Label className="text-sm font-semibold">Starting Theme</Label>
        <p className="text-xs text-muted-foreground mt-0.5">Pick a preset to load a full starting palette — then edit anything below.</p>
        <div className="grid grid-cols-3 gap-3 mt-3">
          {Object.values(THEME_PRESETS).map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={cn(
                'rounded-xl border-2 p-3 text-left transition-all hover:border-primary/50',
                theme.active_preset === p.id ? 'border-primary ring-2 ring-primary/20' : 'border-border'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-5 h-5 rounded-full border border-border"
                  style={{ background: p.colors.primary }}
                />
                <span className="text-sm font-semibold">{p.name}</span>
                {theme.active_preset === p.id && <Check className="w-4 h-4 text-primary ml-auto" />}
              </div>
              <div className="flex gap-1">
                <span className="h-4 flex-1 rounded" style={{ background: p.colors.background, border: `1px solid ${p.colors.border}` }} />
                <span className="h-4 flex-1 rounded" style={{ background: p.colors.card, border: `1px solid ${p.colors.border}` }} />
                <span className="h-4 flex-1 rounded" style={{ background: p.colors.secondary }} />
              </div>
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setShowMoreThemes(true)}>
          <Plus className="w-4 h-4" /> Add Theme
        </Button>
      </div>

      {/* More Themes Dialog */}
      <Dialog open={showMoreThemes} onOpenChange={setShowMoreThemes}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose a Theme</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.values(ADDITIONAL_THEMES).map(p => (
              <button
                key={p.id}
                onClick={() => { onChange(buildThemeFromPreset(p.id)); setShowMoreThemes(false); }}
                className={cn(
                  'rounded-xl border-2 p-3 text-left transition-all hover:border-primary/50',
                  theme.active_preset === p.id ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full border border-border" style={{ background: p.colors.primary }} />
                  <span className="text-sm font-semibold">{p.name}</span>
                  {theme.active_preset === p.id && <Check className="w-4 h-4 text-primary ml-auto" />}
                </div>
                <div className="flex gap-1">
                  <span className="h-4 flex-1 rounded" style={{ background: p.colors.background, border: `1px solid ${p.colors.border}` }} />
                  <span className="h-4 flex-1 rounded" style={{ background: p.colors.card, border: `1px solid ${p.colors.border}` }} />
                  <span className="h-4 flex-1 rounded" style={{ background: p.colors.secondary }} />
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Accent swatches */}
      <div>
        <Label className="text-sm font-semibold">Accent Colour</Label>
        <p className="text-xs text-muted-foreground mt-0.5">Drives buttons &amp; highlights across the app.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {(theme.accent_swatches || []).map((sw) => (
            <button
              key={sw}
              onClick={() => onChange(applyAccent(theme, sw))}
              className={cn(
                'w-9 h-9 rounded-full border-2 transition-transform hover:scale-110',
                theme.colors.primary.toLowerCase() === sw.toLowerCase() ? 'border-foreground' : 'border-border'
              )}
              style={{ background: sw }}
              title={sw}
            />
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <button className="w-9 h-9 rounded-full border-2 border-dashed border-border flex items-center justify-center hover:border-primary transition-colors" title="Add custom accent colour">
                <Plus className="w-4 h-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
              <div className="space-y-2">
                <p className="text-sm font-medium">Add Accent Colour</p>
                <ColorPicker
                  value=""
                  onChange={(v) => {
                    const swatches = theme.accent_swatches || [];
                    const newSwatches = swatches.includes(v) ? swatches : [...swatches, v];
                    onChange({ ...applyAccent(theme, v), accent_swatches: newSwatches });
                  }}
                  swatchClass="w-9 h-9"
                  inputClass="h-9 w-36"
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Appearance mode */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold">Dark Appearance</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Switches the sidebar &amp; shadow surfaces to dark.</p>
        </div>
        <Switch checked={theme.mode === 'dark'} onCheckedChange={setMode} />
      </div>

      <Separator />

      {/* Core colours */}
      <div>
        <Label className="text-sm font-semibold">Colours</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-3">
          <ColorRow label="Background" value={theme.colors.background} onChange={(v) => patchColors({ background: v })} />
          <ColorRow label="Text" value={theme.colors.foreground} onChange={(v) => patchColors({ foreground: v })} />
          <ColorRow label="Card" value={theme.colors.card} onChange={(v) => patchColors({ card: v })} />
          <ColorRow label="Card Text" value={theme.colors.card_foreground} onChange={(v) => patchColors({ card_foreground: v })} />
          <ColorRow label="Accent / Primary" value={theme.colors.primary} onChange={(v) => patchColors({ primary: v })} />
          <ColorRow label="Primary Text" value={theme.colors.primary_foreground} onChange={(v) => patchColors({ primary_foreground: v })} />
          <ColorRow label="Secondary" value={theme.colors.secondary} onChange={(v) => patchColors({ secondary: v })} />
          <ColorRow label="Muted" value={theme.colors.muted} onChange={(v) => patchColors({ muted: v })} />
          <ColorRow label="Muted Text" value={theme.colors.muted_foreground} onChange={(v) => patchColors({ muted_foreground: v })} />
          <ColorRow label="Border" value={theme.colors.border} onChange={(v) => patchColors({ border: v })} />
          <ColorRow label="Destructive" value={theme.colors.destructive} onChange={(v) => patchColors({ destructive: v })} />
        </div>
      </div>

      <Separator />

      {/* Modifier-button default colours */}
      <div>
        <Label className="text-sm font-semibold">Modifier Buttons — Default</Label>
        <p className="text-xs text-muted-foreground mt-0.5">Used by every modifier block that has no per-block override below.</p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Selected</p>
            <ColorRow label="Background" value={theme.modifier_button_default.selected.background} onChange={(v) => setModDefault('selected', 'background', v)} />
            <ColorRow label="Text" value={theme.modifier_button_default.selected.text} onChange={(v) => setModDefault('selected', 'text', v)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unselected</p>
            <ColorRow label="Background" value={theme.modifier_button_default.unselected.background} onChange={(v) => setModDefault('unselected', 'background', v)} />
            <ColorRow label="Text" value={theme.modifier_button_default.unselected.text} onChange={(v) => setModDefault('unselected', 'text', v)} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Per-block overrides */}
      <div>
        <Label className="text-sm font-semibold">Modifier Buttons — Per-Block Overrides</Label>
        <p className="text-xs text-muted-foreground mt-0.5">Enable a block to give it its own selected / unselected colours. Overrides take precedence over the default above.</p>
        <div className="space-y-2 mt-3">
          {knownBlocks.map((blockKey) => (
            <BlockOverrideRow
              key={blockKey}
              blockKey={blockKey}
              override={overrides[blockKey]}
              defaultColors={theme.modifier_button_default}
              onEnable={() => enableBlock(blockKey)}
              onDisable={() => disableBlock(blockKey)}
              onColor={(state, field, v) => setBlockColor(blockKey, state, field, v)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Input
            value={customBlock}
            onChange={(e) => setCustomBlock(e.target.value)}
            placeholder="Add a custom block name…"
            className="h-8 flex-1 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomBlock())}
          />
          <Button variant="outline" size="sm" className="gap-1" onClick={addCustomBlock}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}