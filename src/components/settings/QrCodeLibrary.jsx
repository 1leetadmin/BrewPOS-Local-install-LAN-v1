import { useState, useRef } from 'react';
import { Plus, Trash2, Pencil, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useQrCode } from '@/lib/qrCode';
import { toast } from 'sonner';

function QrPreview({ text, size = 100 }) {
  const dataUrl = useQrCode(text, size);
  if (!dataUrl) {
    return <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Generating…</div>;
  }
  return <img src={dataUrl} alt="QR preview" style={{ width: size, height: size }} className="object-contain" />;
}

function QrCard({ qr, onEdit, onDelete }) {
  return (
    <div className="border border-border rounded-lg p-2 space-y-2 bg-card">
      <div className="aspect-square bg-white border border-border rounded flex items-center justify-center overflow-hidden">
        {qr.type === 'image' ? (
          <img src={qr.image_url} alt={qr.name} className="w-full h-full object-contain" />
        ) : (
          <QrPreview text={qr.text} size={90} />
        )}
      </div>
      <div>
        <p className="text-sm font-medium truncate">{qr.name}</p>
        <p className="text-xs text-muted-foreground">{qr.type === 'text' ? 'Generated' : 'Uploaded'}</p>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" className="h-7 flex-1" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 flex-1 text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function QrCodeLibrary({ qrCodes = [], onChange }) {
  const [editing, setEditing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const openAdd = () => setEditing({ id: '', name: '', type: 'text', text: '', image_url: '' });
  const openEdit = (qr) => setEditing({ ...qr });
  const close = () => setEditing(null);

  const save = () => {
    if (!editing.name.trim()) { toast.error('Name is required'); return; }
    if (editing.type === 'text' && !editing.text.trim()) { toast.error('Text or URL is required'); return; }
    if (editing.type === 'image' && !editing.image_url) { toast.error('Please upload a QR image'); return; }

    const id = editing.id || `qr_${Date.now()}`;
    const exists = qrCodes.find(q => q.id === id);
    if (exists) {
      onChange(qrCodes.map(q => q.id === id ? { ...editing, id } : q));
    } else {
      onChange([...qrCodes, { ...editing, id }]);
    }
    close();
  };

  const remove = (id) => onChange(qrCodes.filter(q => q.id !== id));

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setEditing(prev => ({ ...prev, image_url: file_url }));
      toast.success('QR image uploaded');
    } catch {
      toast.error('Upload failed');
    }
    setUploading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">QR Code Library</Label>
        <Button size="sm" variant="outline" onClick={openAdd} className="gap-1.5">
          <Plus className="w-4 h-4" /> Add QR Code
        </Button>
      </div>

      {qrCodes.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
          No QR codes yet. Click "Add QR Code" to upload an image or create one from text.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {qrCodes.map(qr => (
            <QrCard key={qr.id} qr={qr} onEdit={() => openEdit(qr)} onDelete={() => remove(qr.id)} />
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={v => !v && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit QR Code' : 'Add QR Code'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Review Link, WiFi, Menu"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant={editing.type === 'text' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEditing({ ...editing, type: 'text' })}
                >
                  Generate from Text
                </Button>
                <Button
                  variant={editing.type === 'image' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEditing({ ...editing, type: 'image' })}
                >
                  Upload Image
                </Button>
              </div>

              {editing.type === 'text' ? (
                <div className="space-y-2">
                  <Label>Text or URL to Encode</Label>
                  <Input
                    value={editing.text}
                    onChange={e => setEditing({ ...editing, text: e.target.value })}
                    placeholder="https://review.cafe.co.nz or any text"
                  />
                  {editing.text && (
                    <div className="flex justify-center pt-2">
                      <div className="w-28 h-28 bg-white border border-border rounded flex items-center justify-center">
                        <QrPreview text={editing.text} size={100} />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>QR Code Image</Label>
                  {editing.image_url ? (
                    <div className="flex items-center gap-3">
                      <img src={editing.image_url} alt="QR" className="w-24 h-24 object-contain border border-border rounded" />
                      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                        Replace Image
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-full py-10 border-2 border-dashed border-border rounded-lg flex flex-col items-center gap-2 hover:border-primary transition-colors"
                    >
                      {uploading ? (
                        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                      ) : (
                        <Upload className="w-6 h-6 text-muted-foreground" />
                      )}
                      <span className="text-sm text-muted-foreground">
                        {uploading ? 'Uploading…' : 'Click to upload QR image'}
                      </span>
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => handleUpload(e.target.files?.[0])}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}