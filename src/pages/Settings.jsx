import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Save, Store, Printer, Mic, Receipt, Tag, Palette, Sliders, Wifi, Tablet, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import LabelPrinterSettings, { DEFAULT_PRINTER, normalizePrinter } from '@/components/pos/LabelPrinterSettings';
import ReceiptPrinterSettings from '@/components/pos/ReceiptPrinterSettings';
import PrinterMultiSelect from '@/components/pos/PrinterMultiSelect';
import ThemeSettings from '@/components/settings/ThemeSettings';
import QrCodeLibrary from '@/components/settings/QrCodeLibrary';
import SmartConnectSettings from '@/components/settings/SmartConnectSettings';
import CollapsibleCard from '@/components/settings/CollapsibleCard';

function NetworkAccessCard() {
  const { data } = useQuery({
    queryKey: ['networkInfo'],
    queryFn: async () => {
      const res = await fetch(`http://${window.location.hostname}:3001/api/network-info`);
      return res.json();
    },
    refetchInterval: 10000,
  });
  const ip = data?.addresses?.[0];

  const copy = (url) => {
    navigator.clipboard.writeText(url);
    toast.success('Copied');
  };

  if (!ip) {
    return (
      <CollapsibleCard title="Network Access (KDS / Order Ready)" icon={Tablet} storageKey="network">
        <p className="text-sm text-muted-foreground">
          Could not detect a network address. Make sure this PC is connected to WiFi/LAN.
        </p>
      </CollapsibleCard>
    );
  }

  const links = [
    { label: 'Staff Order Board (tablet)', path: '/kds' },
    { label: 'Customer Ready Screen', path: '/order-ready' },
    { label: 'Customer Display (menu slideshow)', path: '/display' },
  ];

  return (
    <CollapsibleCard title="Network Access (KDS / Order Ready)" icon={Tablet} storageKey="network">
      <p className="text-xs text-muted-foreground mb-3">
        Type these into the browser on your staff tablet or customer screen — they must be on
        the same WiFi/network as this PC.
      </p>
      <div className="space-y-2">
        {links.map((l) => {
          const url = `http://${ip}:3000${l.path}`;
          return (
            <div key={l.path} className="flex items-center justify-between gap-2 p-2 bg-muted rounded-lg">
              <div className="min-w-0">
                <p className="text-xs font-medium">{l.label}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">{url}</p>
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => copy(url)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </CollapsibleCard>
  );
}
import { normalizeTheme, buildThemeFromPreset } from '@/lib/themePresets';

const FONT_FAMILIES = ['Arial', 'Arial Black', 'Courier New', 'Georgia', 'Impact', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];

const MENU_CATEGORIES = ['coffee', 'tea', 'smoothies', 'juices', 'sodas', 'water', 'alcohol', 'food', 'snacks', 'desserts', 'other'];

export default function Settings() {
  const [form, setForm] = useState(null);
  const queryClient = useQueryClient();

  const { data: settingsList } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: () => base44.entities.StoreSettings.list(),
    staleTime: 0,
    gcTime: 0,
  });

  const settings = settingsList?.[0];

  // Initialize form exactly once — when the first DB response arrives
  useEffect(() => {
    if (settingsList === undefined) return; // still loading
    if (form !== null) return;              // already initialized

    if (settings) {
      setForm({
        ...settings,
        theme: normalizeTheme(settings.theme),
        label_printers: (settings.label_printers && settings.label_printers.length > 0)
          ? settings.label_printers.map(normalizePrinter)
          : [{ ...DEFAULT_PRINTER }],
      });
    } else {
      setForm({
        store_name: 'My Store',
        theme: buildThemeFromPreset('light'),
        address: '',
        phone: '',
        tax_rate: 8.5,
        gst_number: '056-696-652',
        currency_symbol: '$',
        receipt_footer: 'Thank you for your visit!',
        order_counter: 0,
        default_printer_id: 'default',
        category_printers: {},
        category_modifier_order: {},
        auto_print_labels: true,
        voice_enabled: true,
        voice_language: 'en-US',
        label_printers: [{ ...DEFAULT_PRINTER }],
        receipt_printer: { name: '', width_mm: 80, font_family: 'Arial', show_logo: false, show_tax: true, show_footer: true },
        smartconnect: { enabled: false, register_id: '', base_url: '', paired: false, paired_device_name: '' },
      });
    }
  }, [settingsList]);

  const updateTheme = (theme) => setForm(prev => ({ ...prev, theme }));

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const { id, created_date, updated_date, created_by_id, ...cleanData } = data;
      if (settings?.id) {
        return base44.entities.StoreSettings.update(settings.id, cleanData);
      } else {
        return base44.entities.StoreSettings.create(cleanData);
      }
    },
    onSuccess: (saved) => {
      // Re-init form directly from the DB response — no null flash, no cache race.
      // Use the callback form so we can fall back to the current form's label_printers
      // (which already have the user's changes) if the saved response omits them —
      // prevents connection_type reverting to the DEFAULT_PRINTER's 'usb'.
      if (saved) {
        setForm(prev => ({
          ...saved,
          theme: normalizeTheme(saved.theme),
          label_printers: (saved.label_printers && saved.label_printers.length > 0)
            ? saved.label_printers.map(normalizePrinter)
            : (prev?.label_printers || [{ ...DEFAULT_PRINTER }]),
        }));
      }
      queryClient.invalidateQueries({ queryKey: ['storeSettings'] });
      toast.success('Settings saved');
    },
  });

  if (!form) return null;

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const updateReceiptPrinter = (key, value) =>
    setForm(prev => ({ ...prev, receipt_printer: { ...(prev.receipt_printer || {}), [key]: value } }));

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Settings</h1>
          <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="gap-2">
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>

        {/* Theme & Colours */}
        <CollapsibleCard title="Theme & Colours" icon={Palette} storageKey="theme">
            <ThemeSettings theme={form.theme} onChange={updateTheme} />
          </CollapsibleCard>

        {/* Store Info */}
        <CollapsibleCard title="Store Information" icon={Store} storageKey="store">
            <div className="space-y-2">
              <Label>Store Name</Label>
              <Input value={form.store_name} onChange={e => update('store_name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address || ''} onChange={e => update('address', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone || ''} onChange={e => update('phone', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Currency Symbol</Label>
                <Input value={form.currency_symbol} onChange={e => update('currency_symbol', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Website / Email</Label>
              <Input value={form.website || ''} onChange={e => update('website', e.target.value)} placeholder="e.g. www.cafe.co.nz or hello@cafe.co.nz" />
            </div>
          </CollapsibleCard>

        {/* Tax & Receipts */}
        <CollapsibleCard title="Tax & Receipts" icon={Receipt} storageKey="tax">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tax Label</Label>
                <Input value={form.tax_label || ''} onChange={e => update('tax_label', e.target.value)} placeholder="GST / VAT / Tax" />
              </div>
              <div className="space-y-2">
                <Label>Tax Rate (%)</Label>
                <Input type="number" step="0.01" value={form.tax_rate ?? 0} onChange={e => update('tax_rate', parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Prices are tax-inclusive</Label>
                <p className="text-xs text-muted-foreground mt-0.5">When on, menu prices include tax; the receipt breaks tax out of the total.</p>
              </div>
              <Switch checked={form.tax_inclusive ?? false} onCheckedChange={v => update('tax_inclusive', v)} />
            </div>
            <div className="space-y-2">
              <Label>Tax / Registration Number</Label>
              <Input value={form.gst_number || ''} onChange={e => update('gst_number', e.target.value)} placeholder="e.g. 056-696-652" />
            </div>
            <div className="space-y-2">
              <Label>Receipt Footer Message</Label>
              <Textarea value={form.receipt_footer || ''} onChange={e => update('receipt_footer', e.target.value)} rows={2} />
            </div>
          </CollapsibleCard>

        {/* Order Numbering */}
        <CollapsibleCard title="Order Numbering" icon={Tag} storageKey="orders">
            <p className="text-sm text-muted-foreground">
              Orders are numbered <span className="font-mono font-bold text-foreground">000</span> → <span className="font-mono font-bold text-foreground">999</span> then reset to <span className="font-mono font-bold text-foreground">000</span>.
            </p>
            <div className="flex items-center gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Current Counter</Label>
                <Input
                  type="number"
                  min={0}
                  max={999}
                  value={form.order_counter ?? 0}
                  onChange={e => update('order_counter', Math.min(999, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-28"
                />
              </div>
              <div className="pt-5">
                <p className="text-xs text-muted-foreground">Next order will be <span className="font-mono font-bold text-foreground">#{String((form.order_counter ?? 0) % 1000).padStart(3, '0')}</span></p>
              </div>
            </div>
          </CollapsibleCard>

        {/* Label Printers */}
        <CollapsibleCard title="Drink Label Printers" icon={Printer} storageKey="labels">
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-print drink labels on order complete</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Triggers the print dialog automatically</p>
              </div>
              <Switch checked={form.auto_print_labels} onCheckedChange={v => update('auto_print_labels', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Show label preview before printing</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Review each label layout before sending to printer</p>
              </div>
              <Switch checked={form.label_preview_enabled ?? true} onCheckedChange={v => update('label_preview_enabled', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>QR code on drink labels</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Show a QR code on each label — select from your library below</p>
              </div>
              <Switch checked={form.label_qr_enabled ?? false} onCheckedChange={v => update('label_qr_enabled', v)} />
            </div>
            {form.label_qr_enabled && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Select QR Code for Labels</Label>
                  <Select value={form.label_qr_id || ''} onValueChange={v => update('label_qr_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Choose a QR code from your library" /></SelectTrigger>
                    <SelectContent>
                      {(form.qr_codes || []).map(qr => (
                        <SelectItem key={qr.id} value={qr.id}>{qr.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(form.qr_codes || []).length === 0 && (
                    <p className="text-xs text-amber-600">No QR codes in your library yet — add one below.</p>
                  )}
                </div>
                <QrCodeLibrary qrCodes={form.qr_codes || []} onChange={codes => update('qr_codes', codes)} />
              </div>
            )}
            <Separator />
            <LabelPrinterSettings
              printers={form.label_printers || []}
              onChange={printers => update('label_printers', printers)}
              settings={form}
            />
          </CollapsibleCard>

        {/* Printer Routing */}
        <CollapsibleCard title="Printer Routing" icon={Printer} storageKey="routing">
            <div className="space-y-2">
              <Label>Default / Catch-all Printer</Label>
              <p className="text-xs text-muted-foreground">Used when an item has no item- or category-level assignment, so nothing is left unprinted.</p>
              <Select
                value={form.default_printer_id || ''}
                onValueChange={v => update('default_printer_id', v)}
              >
                <SelectTrigger><SelectValue placeholder="Select a default printer" /></SelectTrigger>
                <SelectContent>
                  {(form.label_printers || []).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name || 'Unnamed printer'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(!form.default_printer_id || !(form.label_printers || []).some(p => p.id === form.default_printer_id)) && (
                <p className="text-xs text-amber-600">No default printer selected — unrouted items will not print.</p>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <Label className="text-sm font-semibold">Category Assignments</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Assign each category to one or more printers. Items inherit this unless overridden per-item.</p>
              </div>
              <div className="space-y-2.5">
                {MENU_CATEGORIES.map(cat => {
                  const selected = (form.category_printers || {})[cat] || [];
                  return (
                    <div key={cat} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2.5 rounded-lg border border-border bg-muted/20">
                      <span className="text-sm font-medium capitalize w-24 shrink-0">{cat.replace(/_/g, ' ')}</span>
                      <div className="flex-1">
                        <PrinterMultiSelect
                          printers={form.label_printers || []}
                          selected={selected}
                          onChange={ids => {
                            const next = { ...(form.category_printers || {}), [cat]: ids };
                            update('category_printers', next);
                          }}
                          placeholder="Falls through to default printer"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CollapsibleCard>

        {/* Category Modifier Order */}
        <CollapsibleCard title="Category Modifier Order" icon={Sliders} storageKey="modifier-order">
            <p className="text-xs text-muted-foreground">Default display order of modifier groups for each category. Individual items inherit this unless they have their own order saved. Enter group names separated by commas, in display order.</p>
            <div className="space-y-2.5">
              {MENU_CATEGORIES.map(cat => {
                const list = (form.category_modifier_order || {})[cat] || [];
                return (
                  <div key={cat} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/20">
                    <span className="text-sm font-medium capitalize w-24 shrink-0">{cat.replace(/_/g, ' ')}</span>
                    <Input
                      className="flex-1"
                      value={list.join(', ')}
                      placeholder="e.g. Hot Size, Alt Milk, Sugar, Espresso shots, Flavour Shots"
                      onChange={e => {
                        const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                        const next = { ...(form.category_modifier_order || {}), [cat]: arr };
                        update('category_modifier_order', next);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </CollapsibleCard>

        {/* Receipt Printer */}
        <CollapsibleCard title="Receipt Printer" icon={Receipt} storageKey="receipt">
            <ReceiptPrinterSettings settings={form} onChange={updateReceiptPrinter} />
          </CollapsibleCard>

        {/* Voice */}
        <CollapsibleCard title="Voice Recognition" icon={Mic} storageKey="voice">
            <div className="flex items-center justify-between">
              <div>
                <Label>Enable Voice Input</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Use microphone to add items by speaking</p>
              </div>
              <Switch checked={form.voice_enabled} onCheckedChange={v => update('voice_enabled', v)} />
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <Input value={form.voice_language} onChange={e => update('voice_language', e.target.value)} placeholder="e.g. en-US" />
            </div>
            <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Voice Commands:</p>
              <p>• Say an item name: "Cappuccino" or "2 Espresso"</p>
              <p>• "Clear" or "Cancel" to empty the cart</p>
              <p>• "Checkout" or "Pay" to start payment</p>
            </div>
          </CollapsibleCard>

        {/* Network Access — KDS / Order Ready URLs */}
        <NetworkAccessCard />

        {/* SmartConnect EFTPOS */}
        <CollapsibleCard title="SmartConnect EFTPOS" icon={Wifi} storageKey="smartconnect">
            <SmartConnectSettings
            settings={form}
            onChange={update}
            onSave={() => saveMutation.mutateAsync(form)}
          />
          </CollapsibleCard>
      </div>
    </ScrollArea>
  );
}