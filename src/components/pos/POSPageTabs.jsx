import { cn } from '@/lib/utils';

const PAGE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

export default function POSPageTabs({ pages, activePage, onPageChange }) {
  return (
    <div className="flex gap-1 px-4 pt-2">
      {pages.map((page, i) => {
        const color = PAGE_COLORS[i % PAGE_COLORS.length];
        const isActive = activePage === i;
        return (
          <button
            key={i}
            onClick={() => onPageChange(i)}
            className={cn(
              "px-4 py-1.5 rounded-t-lg text-sm font-semibold transition-all border-b-2",
              isActive
                ? "bg-card text-foreground border-b-card shadow-sm"
                : "bg-muted/50 text-muted-foreground border-b-transparent hover:bg-muted"
            )}
            style={isActive ? { borderTopColor: color, borderTopWidth: 3, borderLeftColor: color + '40', borderRightColor: color + '40' } : {}}
          >
            <span
              className="inline-block w-2 h-2 rounded-full mr-2"
              style={{ background: color }}
            />
            {page.label || `Page ${i + 1}`}
          </button>
        );
      })}
    </div>
  );
}