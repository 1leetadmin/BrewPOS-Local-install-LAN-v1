import { Image as ImageIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TRANSITION_STYLES, DURATION_PRESETS } from '@/lib/cdsDefaults';
import { cn } from '@/lib/utils';

export default function SlideshowSection({ config, onChange }) {
  const seconds = Math.round((config.default_slide_interval_ms || 5000) / 1000);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="w-5 h-5 text-primary" /> Slideshow Behaviour
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Pause during order</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Freeze the slideshow while an order is being built or paid</p>
          </div>
          <Switch
            checked={config.slideshow_pause_during_order}
            onCheckedChange={v => onChange('slideshow_pause_during_order', v)}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Default Slide Interval</Label>
            <span className="text-sm text-muted-foreground tabular-nums">{seconds}s</span>
          </div>
          <div className="flex gap-1.5">
            {DURATION_PRESETS.map(p => (
              <button
                key={p.seconds}
                type="button"
                onClick={() => onChange('default_slide_interval_ms', p.seconds * 1000)}
                className={cn(
                  'flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors',
                  seconds === p.seconds
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-muted text-muted-foreground border-transparent hover:text-foreground'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Slider
            value={[seconds]}
            min={1}
            max={60}
            step={1}
            onValueChange={([v]) => onChange('default_slide_interval_ms', v * 1000)}
          />
          <p className="text-xs text-muted-foreground">Pick a preset above, or fine-tune with the slider — this is the fallback for any slide that doesn't have its own custom duration set.</p>
        </div>

        <div className="space-y-2">
          <Label>Default Transition</Label>
          <Select
            value={config.transition_style}
            onValueChange={v => onChange('transition_style', v)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TRANSITION_STYLES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}