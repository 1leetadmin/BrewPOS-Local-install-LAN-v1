import { cn } from '@/lib/utils';
import { 
  Coffee, Leaf, GlassWater, Citrus, Wine,
  Droplets, UtensilsCrossed, Cookie, IceCream, Grid3X3, Layers
} from 'lucide-react';

const categoryConfig = {
  all: { icon: Grid3X3, label: 'All' },
  coffee: { icon: Coffee, label: 'Coffee' },
  tea: { icon: Leaf, label: 'Tea' },
  smoothies: { icon: GlassWater, label: 'Smoothies' },
  juices: { icon: Citrus, label: 'Juices' },
  sodas: { icon: Droplets, label: 'Sodas' },
  water: { icon: Droplets, label: 'Water' },
  alcohol: { icon: Wine, label: 'Alcohol' },
  food: { icon: UtensilsCrossed, label: 'Food' },
  snacks: { icon: Cookie, label: 'Snacks' },
  desserts: { icon: IceCream, label: 'Desserts' },
  other: { icon: Layers, label: 'Other' },
};

export default function CategoryBar({ activeCategory, onCategoryChange, categories }) {
  const displayCategories = ['all', ...categories];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {displayCategories.map(cat => {
        const config = categoryConfig[cat] || { icon: Layers, label: cat };
        const Icon = config.icon;
        const active = activeCategory === cat;
        return (
          <button
            key={cat}
            onClick={() => onCategoryChange(cat)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 shrink-0",
              active
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "bg-card text-muted-foreground hover:text-foreground hover:bg-accent border border-border"
            )}
          >
            <Icon className="w-4 h-4" />
            {config.label}
          </button>
        );
      })}
    </div>
  );
}