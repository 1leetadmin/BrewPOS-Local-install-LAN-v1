import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Save, ExternalLink, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { normalizeCdsConfig } from '@/lib/cdsDefaults';
import LayoutSection from '@/components/cds/LayoutSection';
import SlideshowSection from '@/components/cds/SlideshowSection';
import IdleSection from '@/components/cds/IdleSection';
import OrderPanelSection from '@/components/cds/OrderPanelSection';
import SlidesManager from '@/components/cds/SlidesManager';
import MediaLibrary from '@/components/cds/MediaLibrary';

export default function CdsSettings() {
  const [config, setConfig] = useState(null);
  const queryClient = useQueryClient();

  const { data: settingsList } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: () => base44.entities.StoreSettings.list(),
    staleTime: 0,
    gcTime: 0,
  });

  const settings = settingsList?.[0];

  useEffect(() => {
    if (settingsList === undefined) return;
    if (config !== null) return;
    setConfig(normalizeCdsConfig(settings?.cds_config));
  }, [settingsList]);

  const saveMutation = useMutation({
    mutationFn: async (cdsConfig) => {
      if (settings?.id) {
        return base44.entities.StoreSettings.update(settings.id, { cds_config: cdsConfig });
      } else {
        return base44.entities.StoreSettings.create({ store_name: 'My Store', cds_config: cdsConfig });
      }
    },
    onSuccess: (saved) => {
      if (saved?.cds_config) setConfig(normalizeCdsConfig(saved.cds_config));
      queryClient.invalidateQueries({ queryKey: ['storeSettings'] });
      toast.success('CDS settings saved');
    },
  });

  if (!config) return null;

  const update = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  // Persist a config to StoreSettings without the success toast — used by
  // auto-save flows (e.g. media upload in SlideEditor) so the URL is
  // immediately available to the CDS display without a manual Save click.
  const saveConfigQuietly = async (cdsConfig) => {
    try {
      let saved;
      if (settings?.id) {
        saved = await base44.entities.StoreSettings.update(settings.id, { cds_config: cdsConfig });
      } else {
        saved = await base44.entities.StoreSettings.create({ store_name: 'My Store', cds_config: cdsConfig });
      }
      if (saved?.cds_config) setConfig(normalizeCdsConfig(saved.cds_config));
      queryClient.invalidateQueries({ queryKey: ['storeSettings'] });
    } catch (err) {
      toast.error(`Failed to save: ${err.message}`);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <Monitor className="w-6 h-6 text-primary" /> Customer Display
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Configure the customer-facing display screen</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => window.open('/display', '_blank')}
              className="gap-2"
            >
              <ExternalLink className="w-4 h-4" /> Preview
            </Button>
            <Button
              onClick={() => saveMutation.mutate(config)}
              disabled={saveMutation.isPending}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        <LayoutSection config={config} onChange={update} />
        <SlideshowSection config={config} onChange={update} />
        <IdleSection config={config} onChange={update} />
        <OrderPanelSection config={config} onChange={update} />
        <SlidesManager config={config} onChange={update} onSave={saveConfigQuietly} />
        <MediaLibrary config={config} />
      </div>
    </ScrollArea>
  );
}