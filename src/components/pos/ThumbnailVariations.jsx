import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Check, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STYLE_THEMES = [
  { label: 'Photo', prompt: 'professional food photography, soft studio lighting, clean white background, ultra-realistic, commercial product shot' },
  { label: 'Flat Design', prompt: 'flat design illustration, bold colors, minimal geometric shapes, vector art style, bright pastel palette, no shadows' },
  { label: 'Watercolor', prompt: 'delicate watercolor painting, soft washes, artistic brush strokes, pastel tones, loose impressionist style' },
  { label: 'Pixel Art', prompt: 'retro 16-bit pixel art, vibrant colors, crisp pixels, game sprite style, dark background accent' },
  { label: '3D Render', prompt: 'glossy 3D rendered illustration, Blender-style, vibrant gradient background, soft shadows, clay material finish' },
  { label: 'Cartoon', prompt: 'cartoon illustration, bold outlines, exaggerated features, playful colors, comic book style' },
  { label: 'Line Art', prompt: 'minimalist line art illustration, single weight strokes, monochrome with one accent color, elegant and clean' },
  { label: 'Vintage', prompt: 'vintage retro illustration, muted warm tones, 1950s diner poster style, textured paper background' },
  { label: 'Neon', prompt: 'neon glow illustration, dark background, glowing edges, cyberpunk aesthetic, vibrant electric colors' },
  { label: 'Oil Paint', prompt: 'oil painting, rich textured brush strokes, warm classical lighting, fine art style, canvas texture' },
];

export default function ThumbnailVariations({ open, onClose, itemName, category, onSelect }) {
  const [images, setImages] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState(null);

  const generate = async () => {
    if (!itemName) return;
    setGenerating(true);
    setSelected(null);
    setImages(STYLE_THEMES.map((s, i) => ({ label: s.label, url: null, loading: true, idx: i })));

    const results = await Promise.allSettled(
      STYLE_THEMES.map((s, i) =>
        base44.integrations.Core.GenerateImage({
          prompt: `${s.prompt}, subject: ${itemName} ${category || ''} drink or food item, square format, appetizing`,
        }).then(res => ({ label: s.label, url: res.url, loading: false, idx: i }))
      )
    );

    const settled = results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { label: STYLE_THEMES[i].label, url: null, loading: false, error: true, idx: i }
    );
    setImages(settled);
    setGenerating(false);
    toast.success('10 style variations ready — pick your favourite!');
  };

  const handlePick = (img) => {
    if (!img.url) return;
    setSelected(img.idx);
    onSelect(img.url);
    onClose();
  };

  const handleClose = () => {
    setImages([]);
    setSelected(null);
    setGenerating(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            10 Style Variations — {itemName}
          </DialogTitle>
        </DialogHeader>

        {images.length === 0 ? (
          <div className="py-12 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate 10 themed variations of <span className="font-medium text-foreground">{itemName}</span> and pick the best one.
            </p>
            <Button onClick={generate} disabled={!itemName} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Generate 10 Variations
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {generating ? 'Generating variations…' : 'Pick your favourite style'}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={generate}
                disabled={generating}
                className="gap-1.5 text-xs"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-primary" />}
                Regenerate
              </Button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {images.map((img) => (
                <button
                  key={img.idx}
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
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : img.error ? (
                    <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] text-destructive px-1 text-center">
                      Failed
                    </div>
                  ) : (
                    <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
                  )}
                  {selected === img.idx && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Check className="w-6 h-6 text-primary drop-shadow" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5 font-medium">
                    {img.label}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}