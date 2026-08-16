import { cn } from '@/lib/utils';

const tileColors = {
  coffee: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
  tea: 'from-green-500/20 to-green-600/10 border-green-500/30',
  smoothies: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
  juices: 'from-orange-500/20 to-orange-600/10 border-orange-500/30',
  sodas: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
  water: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
  alcohol: 'from-red-500/20 to-red-600/10 border-red-500/30',
  food: 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30',
  snacks: 'from-pink-500/20 to-pink-600/10 border-pink-500/30',
  desserts: 'from-rose-500/20 to-rose-600/10 border-rose-500/30',
  other: 'from-slate-500/20 to-slate-600/10 border-slate-500/30',
};

export default function MenuGrid({ items, onItemClick }) {
  if (!items.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-lg">No items in this category</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-1">
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => onItemClick(item)}
          disabled={!item.is_available}
          className={cn(
            "pos-grid-tile relative flex flex-col items-center justify-center p-4 rounded-xl border bg-gradient-to-br min-h-[100px]",
            "hover:shadow-lg hover:scale-[1.02] cursor-pointer",
            tileColors[item.category] || tileColors.other,
            !item.is_available && "opacity-40 cursor-not-allowed"
          )}
        >
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover mb-2" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center mb-2">
              <span className="text-lg font-bold opacity-60">{item.name.charAt(0)}</span>
            </div>
          )}
          <span className="text-xs font-semibold text-center leading-tight line-clamp-2">{item.name}</span>
          <span className="text-xs font-mono font-bold text-primary mt-1">${item.price.toFixed(2)}</span>
          {!item.is_available && (
            <span className="absolute top-1 right-1 text-[10px] bg-destructive/80 text-destructive-foreground px-1.5 py-0.5 rounded-full">
              Sold Out
            </span>
          )}
        </button>
      ))}
    </div>
  );
}