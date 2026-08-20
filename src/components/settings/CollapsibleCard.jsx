import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function CollapsibleCard({ title, icon: Icon, storageKey, defaultOpen = false, children }) {
  const [open, setOpen] = useState(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(`settings_card_${storageKey}`);
        if (stored !== null) return stored === 'true';
      } catch {}
    }
    return defaultOpen;
  });

  useEffect(() => {
    if (storageKey) {
      try {
        localStorage.setItem(`settings_card_${storageKey}`, String(open));
      } catch {}
    }
  }, [open, storageKey]);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(prev => !prev)}
      >
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            {Icon && <Icon className="w-5 h-5 text-primary" />}
            {title}
          </span>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
        </CardTitle>
      </CardHeader>
      {open && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  );
}