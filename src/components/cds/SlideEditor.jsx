import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SLIDE_TYPES, TRANSITION_STYLES } from '@/lib/cdsDefaults';
import { uploadCdsMedia } from '@/lib/cdsMedia';

export default function SlideEditor({ slide, onChange, onClose, onSave }) {
  const fileRef = useRef(null);
  const specialFileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const update = (key, value) => onChange({ ...slide, [key]: value });

  const handleMediaUpload = async (e, urlField) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadCdsMedia(file);
      if (res.success && res.url) {
        const updatedSlide = { ...slide, [urlField]: res.url };
        onChange(updatedSlide);
        onSave?.(updatedSlide);
        toast.success('File uploaded');
      } else {
        toast.error(res.error || 'Upload failed');
      }
    } catch {
      toast.error('Upload failed');
    }
    setUploading(false);
    if (e.target) e.target.value = '';
  };

  const showMediaFields = slide.type === 'image' || slide.type === 'video';
  const showTextFields = slide.type === 'text';
  const showSpecialFields = slide.type === 'special';

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {slide.type} slide</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Title (internal label)</Label>
            <Input
              value={slide.title || ''}
              onChange={e => update('title', e.target.value)}
              placeholder="e.g. Summer promo"
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={slide.type} onValueChange={v => update('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SLIDE_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showMediaFields && (
            <div className="space-y-2">
              <Label>Media URL</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={slide.media_url || ''}
                  onChange={e => update('media_url', e.target.value)}
                  placeholder="Image or video URL"
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
                  accept={slide.type === 'image' ? 'image/*' : 'video/*'}
                  onChange={e => handleMediaUpload(e, 'media_url')}
                  className="hidden"
                />
              </div>
              {slide.media_url && slide.type === 'image' && (
                <img src={slide.media_url} className="h-20 object-cover rounded border border-border" alt="" />
              )}
            </div>
          )}

          {showTextFields && (
            <>
              <div className="space-y-2">
                <Label>Headline</Label>
                <Input
                  value={slide.headline || ''}
                  onChange={e => update('headline', e.target.value)}
                  placeholder="e.g. Freshly Roasted Daily"
                />
              </div>
              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea
                  value={slide.body || ''}
                  onChange={e => update('body', e.target.value)}
                  rows={3}
                  placeholder="Supporting text"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Background</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={slide.background_color || '#1a1a2e'}
                      onChange={e => update('background_color', e.target.value)}
                      className="w-10 h-9 rounded-md border border-input cursor-pointer"
                    />
                    <Input
                      value={slide.background_color || ''}
                      onChange={e => update('background_color', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Text Colour</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={slide.text_color || '#ffffff'}
                      onChange={e => update('text_color', e.target.value)}
                      className="w-10 h-9 rounded-md border border-input cursor-pointer"
                    />
                    <Input
                      value={slide.text_color || ''}
                      onChange={e => update('text_color', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {showSpecialFields && (
            <>
              <div className="space-y-2">
                <Label>Special Name</Label>
                <Input
                  value={slide.special_name || ''}
                  onChange={e => update('special_name', e.target.value)}
                  placeholder="e.g. Flat White"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={slide.special_description || ''}
                  onChange={e => update('special_description', e.target.value)}
                  rows={2}
                  placeholder="Short marketing description"
                />
              </div>
              <div className="space-y-2">
                <Label>Price</Label>
                <Input
                  value={slide.special_price || ''}
                  onChange={e => update('special_price', e.target.value)}
                  placeholder="e.g. $5.50"
                />
              </div>
              <div className="space-y-2">
                <Label>Special Image</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={slide.special_image_url || ''}
                    onChange={e => update('special_image_url', e.target.value)}
                    placeholder="Image URL"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => specialFileRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="w-4 h-4" />
                  </Button>
                  <input
                    ref={specialFileRef}
                    type="file"
                    accept="image/*"
                    onChange={e => handleMediaUpload(e, 'special_image_url')}
                    className="hidden"
                  />
                </div>
                {slide.special_image_url && (
                  <img src={slide.special_image_url} className="h-20 object-cover rounded border border-border" alt="" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Background</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={slide.background_color || '#16213e'}
                      onChange={e => update('background_color', e.target.value)}
                      className="w-10 h-9 rounded-md border border-input cursor-pointer"
                    />
                    <Input
                      value={slide.background_color || ''}
                      onChange={e => update('background_color', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Text Colour</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={slide.text_color || '#ffffff'}
                      onChange={e => update('text_color', e.target.value)}
                      className="w-10 h-9 rounded-md border border-input cursor-pointer"
                    />
                    <Input
                      value={slide.text_color || ''}
                      onChange={e => update('text_color', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Timing overrides */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
            <div className="space-y-2">
              <Label>Duration (sec)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={slide.duration_ms ? slide.duration_ms / 1000 : ''}
                onChange={e => {
                  const v = e.target.value ? parseInt(e.target.value) : null;
                  update('duration_ms', v ? v * 1000 : null);
                }}
                placeholder="Default"
              />
            </div>
            <div className="space-y-2">
              <Label>Transition</Label>
              <Select
                value={slide.transition || 'default'}
                onValueChange={v => update('transition', v === 'default' ? null : v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  {TRANSITION_STYLES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Label>Enabled</Label>
            <Switch
              checked={slide.enabled}
              onCheckedChange={v => update('enabled', v)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}