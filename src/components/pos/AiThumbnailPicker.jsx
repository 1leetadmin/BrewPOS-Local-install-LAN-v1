import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STYLES = [
  { label: 'Photo', prompt: 'professional food photography, soft studio lighting, clean white background, ultra-realistic, commercial product shot' },
  { label: 'Flat Art', prompt: 'flat design illustration, bold colors, minimal geometric shapes, vector art style, bright pastel palette, no shadows' },
  { label: 'Watercolor', prompt: 'delicate watercolor painting, soft washes, artistic brush strokes, pastel tones, loose impressionist style' },
  { label: 'Pixel Art', prompt: 'retro 16-bit pixel art, vibrant colors, crisp pixels, game sprite style, dark background accent' },
  { label: '3D Render', prompt: 'glossy 3D rendered illustration, Blender-style, vibrant gradient background, soft shadows, clay material finish' },
];

export default function AiThumbnailPicker({ itemName, category, onSelect }) {
  const [images, setImages] = useState([]); // array of { style, url, loading }
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState(null);

  const generate = async () => {
    setGenerating(true);
    setImages(STYLES.map(s => ({ style: s.label, url: null, loading: true })));
    setSelected(null);

    const results = await Promise.allSettled(
      STYLES.map((s, i) =>
        base44.integrations.Core.GenerateImage({
          prompt: `${s.prompt}, subject: ${itemName} ${category} drink or food item, square format, appetizing`,
        }).then(res => ({ style: s.label, url: res.url, loading: false, idx: i }))
      )
    );

    const settled = results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { style: STYLES[i].label, url: null, loading: false, error: true, idx: i }
    );
    setImages(settled);
    setGenerating(false);
    toast.success('AI thumbnails ready — pick your favourite!');
  };

  const handlePick = (img) => {
    if (!img.url) return;
    setSelected(img.idx);
    onSelect(img.url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">AI Thumbnails</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={generate}
          disabled={generating || !itemName}
          className="gap-1.5 text-xs"
        >
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-primary" />}
          {generating ? 'Generating…' : images.length ? 'Regenerate' : 'Generate 5 Styles'}
        </Button>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              disabled={img.loading || img.error}
              onClick={() => handlePick(img)}
              className={cn(
                "relative aspect-square rounded-lg overflow-hidden border-2 transition-all",
                selected === img.idx ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50",
                (img.loading || img.error) && "cursor-default opacity-60"
              )}
            >
              {img.loading ? (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : img.error ? (
                <div className="w-full h-full bg-muted flex items-center justify-center text-[9px] text-destructive px-1 text-center">
                  Failed
                </div>
              ) : (
                <img src={img.url} alt={img.style} className="w-full h-full object-cover" />
              )}
              {selected === img.idx && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                  <Check className="w-5 h-5 text-primary drop-shadow" />
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5 font-medium">
                {img.style}
              </div>
            </button>
          ))}
        </div>
      )}

      {!itemName && images.length === 0 && (
        <p className="text-xs text-muted-foreground">Enter an item name above to generate AI thumbnails.</p>
      )}
    </div>
  );
}