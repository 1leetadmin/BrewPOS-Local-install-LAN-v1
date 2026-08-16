import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Plus, Minus, ChevronUp, ChevronDown, Tag, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useTheme, getModifierButtonColors } from '@/lib/ThemeProvider';
import { resolveOrderNames, sortSectionsByOrder } from '@/lib/modifierOrder';


// Build the initial ordered section list for a given item + resolved presets
function buildSections(item, resolvedPresets, orderNames) {
  const sections = [];
  // All modifier groups come from the item's own record: item-level groups then
  // its preset groups. No hardcoded groups. Order follows the effective order
  // (per-item override → category default → natural).
  (item.modifiers || []).forEach(mod => {
    sections.push({ type: 'item_mod', name: mod.name });
  });
  resolvedPresets.forEach(preset => {
    (preset.modifiers || []).forEach(mod => {
      sections.push({ type: 'preset_mod', presetId: preset.id, name: mod.name });
    });
  });
  // When an item has an explicit per-item modifier_order, treat it as a
  // visibility filter too — only groups listed in the order are shown. This
  // lets staff hide a group (e.g. "Iced Size" on a hot-only item) by removing
  // it from the item's order list. Category-default orders only sort, never hide.
  const hasItemOverride = Array.isArray(item?.modifier_order) && item.modifier_order.length > 0;
  const filtered = hasItemOverride
    ? sections.filter(s => item.modifier_order.includes(s.name))
    : sections;
  return sortSectionsByOrder(filtered, orderNames);
}

export default function ModifierDialog({ item, open, onClose, onConfirm, defaultQuantity, discounts = [], appliedDiscount, onApplyDiscount, editItem }) {
  const [quantity, setQuantity] = useState(1);
  const [itemModifiers, setItemModifiers] = useState({});
  const [sections, setSections] = useState([]);
  const [comments, setComments] = useState('');

  const { data: allPresets = [] } = useQuery({
    queryKey: ['modifierPresets'],
    queryFn: () => base44.entities.ModifierPreset.list(),
    enabled: open,
    initialData: () => { try { return JSON.parse(localStorage.getItem('cache_modifierPresets') || '[]'); } catch { return []; } },
  });

  // Cache presets so they survive a page refresh / offline use
  useEffect(() => { if (allPresets?.length) localStorage.setItem('cache_modifierPresets', JSON.stringify(allPresets)); }, [allPresets]);

  const { data: settingsList } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: () => base44.entities.StoreSettings.list(),
    enabled: open,
    initialData: () => { try { return JSON.parse(localStorage.getItem('cache_settings') || '[]'); } catch { return []; } },
  });
  const settings = settingsList?.[0];

  const resolvedPresets = allPresets.filter(p => (item?.preset_ids || []).includes(p.id));
  const orderNames = resolveOrderNames(item, settings);

  useEffect(() => {
    if (open && item) {
      const builtSections = buildSections(item, resolvedPresets, orderNames);
      setQuantity(editItem?.quantity ?? defaultQuantity ?? 1);
      setComments(editItem?.notes || '');
      setSections(builtSections);

      // Pre-populate modifier selections from the existing cart line (edit mode)
      if (editItem?.modifiers?.length) {
        const state = {};
        for (const m of editItem.modifiers) {
          if (m.name === 'Comments') continue;
          const sec = builtSections.find(s => s.name === m.name);
          if (!sec) continue;
          const key = sec.type === 'preset_mod' ? `${sec.presetId}__${sec.name}` : sec.name;
          let isMulti = false;
          if (sec.type === 'item_mod') {
            isMulti = !!item.modifiers?.find(mm => mm.name === m.name)?.multi_select;
          } else {
            const preset = resolvedPresets.find(p => p.id === sec.presetId);
            isMulti = !!preset?.modifiers?.find(mm => mm.name === m.name)?.multi_select;
          }
          if (isMulti) {
            if (!Array.isArray(state[key])) state[key] = [];
            if (!state[key].includes(m.option)) state[key].push(m.option);
          } else {
            state[key] = m.option;
          }
        }
        setItemModifiers(state);
      } else {
        setItemModifiers({});
      }
    }
  }, [open, item, defaultQuantity, allPresets, orderNames, editItem]);

  if (!item) return null;

  const moveSection = (idx, dir) => {
    const next = idx + dir;
    if (next < 0 || next >= sections.length) return;
    setSections(prev => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  };

  const itemModAdj = Object.entries(itemModifiers).reduce((sum, [key, value]) => {
    const labels = Array.isArray(value) ? value : (value ? [value] : []);
    let mod;
    if (key.includes('__')) {
      const [presetId, modName] = key.split('__');
      const preset = resolvedPresets.find(p => p.id === presetId);
      mod = preset?.modifiers?.find(m => m.name === modName);
    } else {
      mod = item.modifiers?.find(m => m.name === key);
    }
    const options = mod?.options || [];
    return sum + labels.reduce((s, label) => {
      const opt = options.find(o => o.label === label);
      return s + (opt?.price_adjustment ?? 0);
    }, 0);
  }, 0);

  const unitPrice = Math.max(0, item.price + itemModAdj);

  const handleConfirm = () => {
    const modifiers = [];
    // Emit modifiers in display order (multi-select groups emit one entry per selected option)
    sections.forEach(sec => {
      if (sec.type === 'item_mod') {
        const value = itemModifiers[sec.name];
        const labels = Array.isArray(value) ? value : (value ? [value] : []);
        const mod = item.modifiers?.find(m => m.name === sec.name);
        labels.forEach(label => {
          const opt = mod?.options?.find(o => o.label === label);
          modifiers.push({ name: sec.name, option: label, price_adjustment: opt?.price_adjustment ?? 0 });
        });
      } else if (sec.type === 'preset_mod') {
        const value = itemModifiers[`${sec.presetId}__${sec.name}`];
        const labels = Array.isArray(value) ? value : (value ? [value] : []);
        const preset = resolvedPresets.find(p => p.id === sec.presetId);
        const mod = preset?.modifiers?.find(m => m.name === sec.name);
        labels.forEach(label => {
          const opt = mod?.options?.find(o => o.label === label);
          modifiers.push({ name: sec.name, option: label, price_adjustment: opt?.price_adjustment ?? 0 });
        });
      }
    });

    if (comments.trim()) {
      modifiers.push({ name: 'Comments', option: comments.trim(), price_adjustment: 0 });
    }

    onConfirm({
      menu_item_id: item.id,
      name: item.name,
      quantity,
      unit_price: unitPrice,
      modifiers,
      notes: comments.trim() || undefined,
      total: unitPrice * quantity,
      discount: appliedDiscount || undefined,
    });
    onClose();
  };

  const renderSection = (sec, idx) => {
    const arrows = (
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          onClick={() => moveSection(idx, -1)}
          disabled={idx === 0}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-muted disabled:opacity-20 transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => moveSection(idx, 1)}
          disabled={idx === sections.length - 1}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-muted disabled:opacity-20 transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    );

    if (sec.type === 'item_mod') {
      const mod = item.modifiers?.find(m => m.name === sec.name);
      if (!mod) return null;
      const isMulti = !!mod.multi_select;
      const maxSel = mod.max_selections || 0;
      return (
        <div key={sec.name} className="flex items-start gap-2">
          {arrows}
          <div className="flex-1">
            <ModGroup label={mod.name} multi={isMulti} max={maxSel}>
              {mod.options?.map(opt => {
                const selected = isMulti
                  ? Array.isArray(itemModifiers[mod.name]) && itemModifiers[mod.name].includes(opt.label)
                  : itemModifiers[mod.name] === opt.label;
                return (
                  <OptionBtn
                    key={opt.label}
                    blockKey={mod.name}
                    label={opt.label}
                    sub={opt.price_adjustment ? `${opt.price_adjustment > 0 ? '+' : ''}$${Math.abs(opt.price_adjustment).toFixed(2)}` : ''}
                    active={selected}
                    multi={isMulti}
                    onClick={() => {
                      if (isMulti) {
                        setItemModifiers(prev => {
                          const current = prev[mod.name] || [];
                          const arr = Array.isArray(current) ? current : (current ? [current] : []);
                          if (arr.includes(opt.label)) {
                            const next = arr.filter(l => l !== opt.label);
                            const updated = { ...prev };
                            if (next.length === 0) delete updated[mod.name];
                            else updated[mod.name] = next;
                            return updated;
                          }
                          if (maxSel > 0 && arr.length >= maxSel) return prev;
                          return { ...prev, [mod.name]: [...arr, opt.label] };
                        });
                      } else {
                        setItemModifiers(prev => {
                          if (prev[mod.name] === opt.label) { const next = { ...prev }; delete next[mod.name]; return next; }
                          return { ...prev, [mod.name]: opt.label };
                        });
                      }
                    }}
                  />
                );
              })}
            </ModGroup>
          </div>
        </div>
      );
    }

    if (sec.type === 'preset_mod') {
      const preset = resolvedPresets.find(p => p.id === sec.presetId);
      const mod = preset?.modifiers?.find(m => m.name === sec.name);
      if (!mod) return null;
      const stateKey = `${sec.presetId}__${sec.name}`;
      const isMulti = !!mod.multi_select;
      const maxSel = mod.max_selections || 0;
      return (
        <div key={stateKey} className="flex items-start gap-2">
          {arrows}
          <div className="flex-1">
            <ModGroup label={mod.name} multi={isMulti} max={maxSel}>
              {mod.options?.map(opt => {
                const selected = isMulti
                  ? Array.isArray(itemModifiers[stateKey]) && itemModifiers[stateKey].includes(opt.label)
                  : itemModifiers[stateKey] === opt.label;
                return (
                  <OptionBtn
                    key={opt.label}
                    blockKey={mod.name}
                    label={opt.label}
                    sub={opt.price_adjustment ? `${opt.price_adjustment > 0 ? '+' : ''}$${Math.abs(opt.price_adjustment).toFixed(2)}` : ''}
                    active={selected}
                    multi={isMulti}
                    onClick={() => {
                      if (isMulti) {
                        setItemModifiers(prev => {
                          const current = prev[stateKey] || [];
                          const arr = Array.isArray(current) ? current : (current ? [current] : []);
                          if (arr.includes(opt.label)) {
                            const next = arr.filter(l => l !== opt.label);
                            const updated = { ...prev };
                            if (next.length === 0) delete updated[stateKey];
                            else updated[stateKey] = next;
                            return updated;
                          }
                          if (maxSel > 0 && arr.length >= maxSel) return prev;
                          return { ...prev, [stateKey]: [...arr, opt.label] };
                        });
                      } else {
                        setItemModifiers(prev => {
                          if (prev[stateKey] === opt.label) { const next = { ...prev }; delete next[stateKey]; return next; }
                          return { ...prev, [stateKey]: opt.label };
                        });
                      }
                    }}
                  />
                );
              })}
            </ModGroup>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl flex flex-col p-0 gap-0 max-h-[100dvh] overflow-hidden">
        {/* Header — fixed */}
        <div className="px-4 pt-3 pb-2 border-b border-border shrink-0">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading flex items-center justify-between">
              <span>{item.name}</span>
              <span className="text-primary font-mono text-2xl">${unitPrice.toFixed(2)}</span>
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Modifiers — no scroll, compact grid */}
        <div className="flex-1 overflow-hidden px-4 py-3 min-h-0 flex flex-col gap-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sections.map((sec, idx) => renderSection(sec, idx))}
          </div>

          {/* Discount */}
          {discounts.filter(d => d.is_active).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Discount</p>
              {appliedDiscount ? (
                <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">{appliedDiscount.name} ({appliedDiscount.percentage}%)</span>
                  </div>
                  <button onClick={() => onApplyDiscount(null)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {discounts.filter(d => d.is_active).map(d => (
                    <button
                      key={d.id}
                      onClick={() => onApplyDiscount(d)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors font-medium"
                    >
                      <Tag className="w-3 h-3" />
                      {d.name} {d.percentage}%
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Comments */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Comments / Special Instructions</p>
            <Textarea
              placeholder="e.g. extra hot, no ice, allergy notes…"
              value={comments}
              onChange={e => setComments(e.target.value)}
              rows={1}
              className="resize-none text-sm"
            />
          </div>
        </div>

        {/* Footer — always visible */}
        <div className="px-4 pb-3 pt-2 border-t border-border shrink-0 space-y-2 bg-background">
          {/* Quantity */}
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Quantity</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center hover:bg-accent transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center text-lg font-bold">{quantity}</span>
              <button
                onClick={() => setQuantity(q => q + 1)}
                className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleConfirm} className="flex-1 h-12 text-base font-bold shadow-lg shadow-primary/25">
              Add to Order · ${(unitPrice * quantity).toFixed(2)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModGroup({ label, children, multi, max }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
        {label}{multi && max > 0 ? ` (select up to ${max})` : multi ? ' (multi-select)' : ''}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {children}
      </div>
    </div>
  );
}

function OptionBtn({ label, sub, active, onClick, multi, blockKey }) {
  const { theme } = useTheme();
  const cfg = getModifierButtonColors(theme, blockKey);

  if (cfg) {
    const st = active ? cfg.selected : cfg.unselected;
    return (
      <button
        onClick={onClick}
        style={{
          backgroundColor: st.background,
          color: st.text,
          borderColor: active ? cfg.selected.background : 'hsl(var(--border))',
        }}
        className="flex flex-col items-center px-2.5 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all min-w-[56px]"
      >
        <span>{label}</span>
        {sub && <span className="text-[10px] font-normal mt-0.5 opacity-70">{sub}</span>}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all min-w-[70px]",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border hover:border-primary/40 hover:bg-muted/60",
        multi && active && "border-green-500 bg-green-500/10 text-green-700"
      )}
    >
      <span>{label}</span>
      {sub && <span className="text-[10px] font-normal mt-0.5 opacity-70">{sub}</span>}
    </button>
  );
}