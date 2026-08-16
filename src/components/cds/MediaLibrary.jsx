import { useState, useRef } from 'react';
import { FolderOpen, Upload, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { uploadCdsMedia, extractMediaFromSlides } from '@/lib/cdsMedia';

export default function MediaLibrary({ config }) {
  const [sessionUploads, setSessionUploads] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const slideMedia = extractMediaFromSlides(config?.slides || []);
  const allMedia = [...sessionUploads, ...slideMedia];
  const seen = new Set();
  const media = allMedia.filter(m => {
    if (seen.has(m.url)) return false;
    seen.add(m.url);
    return true;
  });

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadCdsMedia(file);
      if (res.success) {
        setSessionUploads(prev => [{ url: res.url, filename: file.name, source: 'New upload' }, ...prev]);
        toast.success('File uploaded');
      } else {
        toast.error(res.error || 'Upload failed');
      }
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copied to clipboard');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="w-5 h-5 text-primary" /> Media Library
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </CardHeader>
      <CardContent>
        {media.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No media files yet. Upload images or videos to use in your slides.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {media.map((file) => {
              const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(file.filename);
              const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.filename);
              return (
                <div key={file.url} className="rounded-lg border border-border overflow-hidden group relative">
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    {isImage ? (
                      <img src={file.url} className="w-full h-full object-cover" alt={file.filename} />
                    ) : isVideo ? (
                      <video src={file.url} className="w-full h-full object-cover" muted />
                    ) : (
                      <span className="text-xs text-muted-foreground p-2 truncate">{file.filename}</span>
                    )}
                  </div>
                  <div className="p-2 flex items-center justify-between gap-1">
                    <span className="text-xs truncate flex-1" title={file.filename}>{file.filename}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyUrl(file.url)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}