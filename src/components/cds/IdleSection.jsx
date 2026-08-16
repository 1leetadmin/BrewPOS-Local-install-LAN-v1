import { useState, useRef } from 'react';
import { Clock, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { uploadCdsMedia } from '@/lib/cdsMedia';

export default function IdleSection({ config, onChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadCdsMedia(file);
      if (res.success && res.url) {
        onChange('idle_logo_url', res.url);
        toast.success('Logo uploaded');
      } else {
        toast.error(res.error || 'Upload failed — is the local server running?');
      }
    } catch {
      toast.error('Upload failed — is the local server running?');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="w-5 h-5 text-primary" /> Idle Screen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Background Colour</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={config.idle_background_color || '#ffffff'}
              onChange={e => onChange('idle_background_color', e.target.value)}
              className="w-10 h-9 rounded-md border border-input cursor-pointer"
            />
            <Input
              value={config.idle_background_color || ''}
              onChange={e => onChange('idle_background_color', e.target.value)}
              placeholder="Leave empty for theme default"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex items-center gap-2">
            <Input
              value={config.idle_logo_url || ''}
              onChange={e => onChange('idle_logo_url', e.target.value)}
              placeholder="Logo URL"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="w-4 h-4" />
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
            />
          </div>
          {config.idle_logo_url && (
            <img
              src={config.idle_logo_url}
              className="h-16 object-contain rounded border border-border"
              alt="Logo preview"
            />
          )}
        </div>

        <div className="space-y-2">
          <Label>Headline</Label>
          <Input
            value={config.idle_headline || ''}
            onChange={e => onChange('idle_headline', e.target.value)}
            placeholder="Leave empty to use store name"
          />
        </div>

        <div className="space-y-2">
          <Label>Subheadline</Label>
          <Input
            value={config.idle_subheadline || ''}
            onChange={e => onChange('idle_subheadline', e.target.value)}
            placeholder="e.g. Welcome — ready when you are"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label>Show Clock</Label>
          <Switch
            checked={config.idle_show_clock}
            onCheckedChange={v => onChange('idle_show_clock', v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}