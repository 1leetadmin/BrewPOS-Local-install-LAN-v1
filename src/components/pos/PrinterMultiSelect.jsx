import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Multi-select chip list for assigning menu items / categories to one or more printers.
 *
 * Props:
 *  - printers: [{ id, name }] available printers
 *  - selected: string[] of selected printer IDs
 *  - onChange: (string[]) => void
 *  - placeholder: text shown when nothing is selected (e.g. "Inherits from category")
 *  - inheritMode: when true, shows the placeholder and selecting clears inherit
 */
export default function PrinterMultiSelect({ printers = [], selected = [], onChange, placeholder = 'Select printers…', inheritMode = false }) {
  const selectedSet = new Set(selected);

  const toggle = (id) => {
    if (selectedSet.has(id)) {
      onChange(selected.filter(pid => pid !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const hasSelection = selected.length > 0;

  if (printers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No label printers configured. Add printers in Settings → Drink Label Printers.
      </p>
    );
  }

  return (
    <div>
      {inheritMode && !hasSelection && (
        <p className="text-xs text-muted-foreground italic mb-1.5">{placeholder}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {printers.map(p => {
          const active = selectedSet.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {active && <Check className="w-3 h-3" />}
              {p.name || 'Unnamed printer'}
            </button>
          );
        })}
      </div>
      {!inheritMode && !hasSelection && (
        <p className="text-xs text-muted-foreground mt-1.5">{placeholder}</p>
      )}
    </div>
  );
}