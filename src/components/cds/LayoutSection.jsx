import { Layout as LayoutIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LAYOUTS } from '@/lib/cdsDefaults';

export default function LayoutSection({ config, onChange }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LayoutIcon className="w-5 h-5 text-primary" /> Layout
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Enable Slideshow</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Show promotional slides on the customer display</p>
          </div>
          <Switch
            checked={config.slideshow_enabled}
            onCheckedChange={v => onChange('slideshow_enabled', v)}
          />
        </div>

        <div className="space-y-2">
          <Label>Layout Mode</Label>
          <Select value={config.layout} onValueChange={v => onChange('layout', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LAYOUTS.map(l => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {config.layout !== 'fullscreen-idle-split-active' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Split Ratio</Label>
              <span className="text-sm text-muted-foreground tabular-nums">
                Order {config.split_ratio}% / Slideshow {100 - config.split_ratio}%
              </span>
            </div>
            <Slider
              value={[config.split_ratio]}
              min={10}
              max={90}
              step={5}
              onValueChange={([v]) => onChange('split_ratio', v)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}