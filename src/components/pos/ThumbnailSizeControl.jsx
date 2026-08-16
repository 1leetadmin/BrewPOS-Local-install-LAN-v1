import { Maximize2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';

export default function ThumbnailSizeControl({ size, onChange, textSize, onTextChange }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-10 shrink-0" title="Adjust tile appearance">
          <Maximize2 className="w-4 h-4" />
          <span className="hidden sm:inline text-xs font-medium">Tile Size</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Thumbnail Size</span>
              <span className="text-sm font-mono text-muted-foreground">{size}px</span>
            </div>
            <Slider
              value={[size]}
              onValueChange={([v]) => onChange(v)}
              min={20}
              max={80}
              step={4}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Small</span>
              <span>Large</span>
            </div>
          </div>
          <div className="border-t border-border pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Text Size</span>
              <span className="text-sm font-mono text-muted-foreground">{textSize}px</span>
            </div>
            <Slider
              value={[textSize]}
              onValueChange={([v]) => onTextChange(v)}
              min={9}
              max={20}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Small</span>
              <span>Large</span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}