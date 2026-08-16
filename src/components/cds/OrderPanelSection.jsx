import { ShoppingBag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export default function OrderPanelSection({ config, onChange }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingBag className="w-5 h-5 text-primary" /> Order Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Panel Title</Label>
          <Input
            value={config.order_panel_title || ''}
            onChange={e => onChange('order_panel_title', e.target.value)}
            placeholder="Your Order"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Show item images</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Display item thumbnails in the order list</p>
          </div>
          <Switch
            checked={config.order_show_item_images}
            onCheckedChange={v => onChange('order_show_item_images', v)}
          />
        </div>

        <div className="space-y-2">
          <Label>Accent Colour</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={config.order_accent_color || '#f59e0b'}
              onChange={e => onChange('order_accent_color', e.target.value)}
              className="w-10 h-9 rounded-md border border-input cursor-pointer"
            />
            <Input
              value={config.order_accent_color || ''}
              onChange={e => onChange('order_accent_color', e.target.value)}
              placeholder="Leave empty for theme default"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}