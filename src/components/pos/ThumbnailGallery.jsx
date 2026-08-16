import { useState } from 'react';
import { Search, Check, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import ThumbnailVariations from '@/components/pos/ThumbnailVariations';

export const PRESET_THUMBNAILS = [
  { name: 'Flat White', category: 'coffee', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/9469cf809_generated_image.png' },
  { name: 'Mocha', category: 'coffee', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/78c69824a_generated_image.png' },
  { name: 'Latte', category: 'coffee', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/5fa93392c_generated_image.png' },
  { name: 'Cappuccino', category: 'coffee', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/3c0fc6dab_generated_image.png' },
  { name: 'Hot Chocolate', category: 'other', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/3355be452_generated_image.png' },
  { name: 'Iced Latte', category: 'coffee', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/273de0013_generated_image.png' },
  { name: 'Iced Chocolate', category: 'other', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/0ac50260c_generated_image.png' },
  { name: 'Slushy', category: 'smoothies', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/c3a33d8f8_generated_image.png' },
  { name: 'Italian Soda', category: 'sodas', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/a9517d7ef_generated_image.png' },
  { name: 'Brownie', category: 'desserts', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/2ef8be8c5_generated_image.png' },
  { name: 'Muffin', category: 'snacks', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/24443aae6_generated_image.png' },
  { name: 'Pineapple Latte', category: 'coffee', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/04177d0fc_generated_image.png' },
  { name: 'Pineapple Iced Latte', category: 'coffee', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/316f08abd_generated_image.png' },
  { name: 'Ferrero Rocher Iced Latte', category: 'coffee', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/0cba4f47e_generated_image.png' },
  { name: 'Ferrero Rocher Latte', category: 'coffee', url: 'https://media.base44.com/images/public/6a21c5ce26723b26c970184c/5d242595c_generated_image.png' },
];

export default function ThumbnailGallery({ selectedUrl, onSelect }) {
  const [search, setSearch] = useState('');
  const [variationPreset, setVariationPreset] = useState(null);
  const filtered = PRESET_THUMBNAILS.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Preset Gallery</span>
        <span className="text-xs text-muted-foreground">Click ✓ to use · Click ✨ for 10 styles</span>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search presets..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-8 text-sm"
        />
      </div>
      <div className="grid grid-cols-5 gap-2 max-h-52 overflow-y-auto pr-1">
        {filtered.map(thumb => (
          <div key={thumb.name} className="relative group">
            <button
              type="button"
              onClick={() => onSelect(thumb.url)}
              title={thumb.name}
              className={cn(
                "relative aspect-square w-full rounded-lg overflow-hidden border-2 transition-all block",
                selectedUrl === thumb.url
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-primary/50"
              )}
            >
              <img src={thumb.url} alt={thumb.name} className="w-full h-full object-cover" />
              {selectedUrl === thumb.url && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                  <Check className="w-5 h-5 text-primary drop-shadow" />
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] text-center py-0.5 font-medium truncate px-0.5">
                {thumb.name}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setVariationPreset(thumb)}
              title={`Generate 10 style variations of ${thumb.name}`}
              className="absolute top-1 right-1 w-6 h-6 rounded-md bg-background/90 border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground shadow opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Sparkles className="w-3 h-3" />
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-5 text-xs text-muted-foreground text-center py-4">
            No matching thumbnails.
          </p>
        )}
      </div>

      <ThumbnailVariations
        open={!!variationPreset}
        onClose={() => setVariationPreset(null)}
        itemName={variationPreset?.name || ''}
        category={variationPreset?.category || ''}
        onSelect={url => {
          onSelect(url);
          setVariationPreset(null);
        }}
      />
    </div>
  );
}