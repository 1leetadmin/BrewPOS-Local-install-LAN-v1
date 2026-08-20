import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Save, Store, Printer, Mic, Receipt, Tag, Palette, Sliders, Wifi, Tablet, Copy, Download, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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

const BACKUP_CATEGORY_INFO = [
  { key: 'core', label: 'Core Setup', description: 'Menu items, modifiers, discounts, menu layout, ingredient catalog, store settings' },
  { key: 'staff', label: 'Staff', description: 'Staff accounts and PINs' },
  { key: 'transactions', label: 'Transactions & Financial', description: 'Orders, order items, ingredient usage, time clock entries, events' },
];

function BackupCard() {
  const [selected, setSelected] = useState({ core: true, staff: true, transactions: true });
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const restoreInputRef = useRef(null);

  const toggle = (key) => setSelected((s) => ({ ...s, [key]: !s[key] }));

  const handleExport = async () => {
    const categories = Object.keys(selected).filter((k) => selected[k]);
    if (categories.length === 0) {
      toast.error('Select at least one category to back up');
      return;
    }
    setExporting(true);
    try {
      const url = `http://${window.location.hostname}:3001/api/backup/export?categories=${categories.join(',')}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Backup failed (${res.status})`);
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = downloadUrl;
      a.download = `BrewPOS-Backup-${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      toast.success('Backup downloaded');
    } catch (err) {
      toast.error(`Backup failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleRestore = async (file) => {
    const confirmed = window.confirm(
      `Restore from "${file.name}"?\n\nThis replaces existing data for anything included in this backup. This can't be undone.`
    );
    if (!confirmed) return;

    setRestoring(true);
    try {
      const buffer = await file.arrayBuffer();
      const url = `http://${window.location.hostname}:3001/api/backup/import`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: buffer,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Restore failed (${res.status})`);

      const summary = data.restored.entities
        .filter((e) => e.count > 0)
        .map((e) => `${e.name} (${e.count})`)
        .join(', ');
      toast.success(`Restored: ${summary || 'no records'}${data.restored.uploads ? `, ${data.restored.uploads} photo(s)` : ''} — reloading…`);
      // Restore replaces data on disk directly (a raw fetch, not a
      // react-query mutation). A query cache invalidation alone isn't
      // enough here: this page's printer/settings form only ever syncs
      // from the query ONCE on mount (by design, so a live poll doesn't
      // wipe out in-progress edits) — after a restore that guard would
      // block the new data from ever reaching the form. A full reload
      // is the simplest way to guarantee every page reflects the
      // restored data, not just this one's query cache.
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error(`Restore failed: ${err.message}`);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <CollapsibleCard title="Backup" icon={Download} storageKey="backup">
      <p className="text-xs text-muted-foreground mb-3">
        Downloads a zip file to this PC with the data you select below. This never requires
        internet — it's the one backup method guaranteed to work every time. Doesn't include
        your admin login, license key, or Bluetooth pairing info.
      </p>
      <div className="space-y-3 mb-4">
        {BACKUP_CATEGORY_INFO.map((cat) => (
          <div key={cat.key} className="flex items-start gap-3">
            <Checkbox
              id={`backup-${cat.key}`}
              checked={selected[cat.key]}
              onCheckedChange={() => toggle(cat.key)}
              className="mt-0.5"
            />
            <label htmlFor={`backup-${cat.key}`} className="cursor-pointer">
              <p className="text-sm font-medium">{cat.label}</p>
              <p className="text-xs text-muted-foreground">{cat.description}</p>
            </label>
          </div>
        ))}
      </div>
      <Button onClick={handleExport} disabled={exporting} className="w-full sm:w-auto">
        <Download className="w-4 h-4 mr-2" />
        {exporting ? 'Preparing backup…' : 'Download Backup'}
      </Button>

      <Separator className="my-4" />

      <div>
        <p className="text-sm font-medium mb-1">Restore from Backup</p>
        <p className="text-xs text-muted-foreground mb-3">
          For a fresh install after a hardware failure or reinstall — pick a backup zip and it
          restores everything that was in it. Existing data for anything included in the backup
          gets replaced.
        </p>
        <input
          ref={restoreInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleRestore(file);
            e.target.value = '';
          }}
        />
        <Button
          variant="outline"
          onClick={() => restoreInputRef.current?.click()}
          disabled={restoring}
          className="w-full sm:w-auto"
        >
          <Upload className="w-4 h-4 mr-2" />
          {restoring ? 'Restoring…' : 'Choose Backup File & Restore'}
        </Button>
      </div>
    </CollapsibleCard>
  );
}

import { generateQrDataUrl } from '@/lib/qrCode';

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
  const [qrCodes, setQrCodes] = useState({});

  const copy = (url) => {
    navigator.clipboard.writeText(url);
    toast.success('Copied');
  };

  const links = ip ? [
    { label: 'Staff Order Board (tablet)', path: '/kds' },
    { label: 'Customer Ready Screen', path: '/order-ready' },
    { label: 'Customer Display (menu slideshow)', path: '/display' },
  ] : [];

  useEffect(() => {
    if (!ip) return;
    let active = true;
    (async () => {
      const entries = await Promise.all(
        links.map(async (l) => {
          const url = `http://${ip}:3000${l.path}`;
          const dataUrl = await generateQrDataUrl(url, 120);
          return [l.path, dataUrl];
        })
      );
      if (active) setQrCodes(Object.fromEntries(entries));
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip]);

  if (!ip) {
    return (
      <CollapsibleCard title="Network Access (KDS / Order Ready)" icon={Tablet} storageKey="network">
        <p className="text-sm text-muted-foreground">
          Could not detect a network address. Make sure this PC is connected to WiFi/LAN.
        </p>
      </CollapsibleCard>
    );
  }

  return (
    <CollapsibleCard title="Network Access (KDS / Order Ready)" icon={Tablet} storageKey="network">
      <p className="text-xs text-muted-foreground mb-3">
        Scan the QR code on your staff tablet or customer screen's camera/browser — or type the
        URL manually. Both must be on the same WiFi/network as this PC.
      </p>
      <div className="space-y-3">
        {links.map((l) => {
          const url = `http://${ip}:3000${l.path}`;
          return (
            <div key={l.path} className="flex items-center gap-3 p-2 bg-muted rounded-lg">
              {qrCodes[l.path] && (
                <img src={qrCodes[l.path]} alt={`QR code for ${l.label}`} className="w-16 h-16 rounded bg-white p-1 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
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

// The full set of possible categories. Which ones actually show up in
// Printer Routing / Category Modifier Order (and, correspondingly, the
// category picker when creating a menu item) is controlled by
// settings.enabled_categories — defaults to all of them if unset, so
// nothing changes for an existing install until someone actively hides
// categories they don't use. Same list MenuManagement.jsx draws from.
export const ALL_MENU_CATEGORIES = ['coffee', 'tea', 'smoothies', 'juices', 'sodas', 'water', 'alcohol', 'food', 'snacks', 'desserts', 'other'];

export default function Settings() {
  const [form, setForm] = useState(null);
  const queryClient = useQueryClient();

  const { data: settingsList } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: () => base44.entities.StoreSettings.list(),
    staleTime: 0,
    gcTime: 0,
  });

  const { data: modifierPresets = [] } = useQuery({
    queryKey: ['modifierPresets'],
    queryFn: () => base44.entities.ModifierPreset.list(),
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

  // Defaults to every category if the setting has never been touched, so
  // this is fully backward-compatible — nothing changes until someone
  // actively unchecks a category they don't use.
  const activeCategories = form.enabled_categories && form.enabled_categories.length > 0
    ? ALL_MENU_CATEGORIES.filter(c => form.enabled_categories.includes(c))
    : ALL_MENU_CATEGORIES;
  const toggleCategory = (cat) => {
    const current = form.enabled_categories && form.enabled_categories.length > 0
      ? form.enabled_categories
      : [...ALL_MENU_CATEGORIES];
    const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    update('enabled_categories', next);
  };

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
              <Label className="text-sm font-semibold">Active Categories</Label>
              <p className="text-xs text-muted-foreground">
                Uncheck any categories you don't use — hides them from the lists below (and from
                the category picker when creating a menu item), so you're not scrolling past
                options that don't apply to your menu.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_MENU_CATEGORIES.map(cat => {
                  const isActive = activeCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium capitalize border transition-colors',
                        isActive
                          ? 'bg-primary/15 text-primary border-primary/30'
                          : 'bg-muted text-muted-foreground border-transparent line-through'
                      )}
                    >
                      {cat.replace(/_/g, ' ')}
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

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
                {activeCategories.map(cat => {
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
            <p className="text-xs text-muted-foreground">Default display order of modifier groups for each category. Individual items inherit this unless they have their own order saved.</p>
            <div className="space-y-3">
              {activeCategories.map(cat => {
                const list = (form.category_modifier_order || {})[cat] || [];
                const availableToAdd = modifierPresets
                  .map(p => p.name)
                  .filter(name => !list.includes(name));
                const removeAt = (idx) => {
                  const next = { ...(form.category_modifier_order || {}), [cat]: list.filter((_, i) => i !== idx) };
                  update('category_modifier_order', next);
                };
                const addOne = (name) => {
                  if (!name || list.includes(name)) return;
                  const next = { ...(form.category_modifier_order || {}), [cat]: [...list, name] };
                  update('category_modifier_order', next);
                };
                return (
                  <div key={cat} className="p-2.5 rounded-lg border border-border bg-muted/20 space-y-2">
                    <span className="text-sm font-medium capitalize">{cat.replace(/_/g, ' ')}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {list.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">No modifier groups set</span>
                      )}
                      {list.map((name, idx) => (
                        <span
                          key={`${name}-${idx}`}
                          className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium"
                        >
                          {name}
                          <button
                            type="button"
                            onClick={() => removeAt(idx)}
                            className="w-4 h-4 rounded-full hover:bg-primary/25 flex items-center justify-center"
                            title={`Remove ${name}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    {availableToAdd.length > 0 && (
                      <select
                        className="text-xs bg-background border border-input rounded px-2 py-1 w-full sm:w-auto"
                        value=""
                        onChange={(e) => addOne(e.target.value)}
                      >
                        <option value="" disabled>+ Add modifier group…</option>
                        {availableToAdd.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleCard>

        {/* Receipt Printer */}
        <CollapsibleCard title="Receipt Printer" icon={Receipt} storageKey="receipt">
            <ReceiptPrinterSettings settings={form} onChange={updateReceiptPrinter} onUpdateSettings={update} />
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

        {/* Backup */}
        <BackupCard />

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

        {/* Bottom Save — mirrors the top one so a change made deep in a long
            scroll (e.g. the last card, SmartConnect) doesn't require
            scrolling all the way back up just to save it. */}
        <div className="flex justify-end pt-2 pb-4">
          <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="gap-2">
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}