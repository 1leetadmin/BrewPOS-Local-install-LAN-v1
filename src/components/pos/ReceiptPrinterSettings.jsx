import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { usePrinterStatus, getPrinterList } from '@/lib/localPrinter';
import { printTestReceipt } from '@/components/pos/ReceiptPrint';
import { cn } from '@/lib/utils';
import QrCodeLibrary from '@/components/settings/QrCodeLibrary';

// Receipt printer setup for the Settings page. The POS app talks to a small
// local Node server (server/index.js, run on the POS machine) that sends raw
// ESC/POS to the receipt printer — over USB (named OS printer, or raw libusb
// auto-discovery) or LAN (raw socket to the printer's IP, no install needed).
// No QZ Tray, no browser USB bridging.
export default function ReceiptPrinterSettings({ settings, onChange, onUpdateSettings }) {
  const rp = settings.receipt_printer || {};
  const connectionType = rp.connection_type || 'usb';
  const status = usePrinterStatus(rp, 5000);
  const [printers, setPrinters] = useState([]);
  const [listLoading, setListLoading] = useState(false);

  const refreshPrinters = useCallback(async () => {
    setListLoading(true);
    const { printers } = await getPrinterList();
    setPrinters(printers || []);
    setListLoading(false);
  }, []);

  useEffect(() => { refreshPrinters(); }, [refreshPrinters]);

  const serverUp = status.server !== false;
  const connected = !!status.connected;
  const hasTarget = connectionType === 'lan'
    ? !!(rp.lan_address && rp.lan_address.trim())
    : connectionType === 'bluetooth'
      ? true
      : !!(rp.name && rp.name.trim());

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Connection</Label>
        <Select value={connectionType} onValueChange={(v) => onChange('connection_type', v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="usb">USB</SelectItem>
            <SelectItem value="lan">Network (LAN / WiFi)</SelectItem>
            <SelectItem value="bluetooth">Bluetooth</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {connectionType === 'lan' ? (
        <div className="space-y-1.5">
          <Label>Printer IP Address</Label>
          <Input
            value={rp.lan_address || ''}
            onChange={(e) => onChange('lan_address', e.target.value)}
            placeholder="192.168.1.50"
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">Optionally add a port, e.g. 192.168.1.50:9100 (defaults to 9100)</p>
        </div>
      ) : connectionType === 'bluetooth' ? (
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Connect and manage the Bluetooth receipt printer from the Printers panel on the POS terminal. It will auto-reconnect when the POS page loads.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Receipt Printer</Label>
            <button onClick={refreshPrinters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              {listLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh list
            </button>
          </div>
          <Select value={rp.name || ''} onValueChange={v => onChange('name', v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={listLoading ? 'Loading printers…' : 'Select a printer'} />
            </SelectTrigger>
            <SelectContent>
              {printers.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Choose the printer as it appears in Windows Printers &amp; Scanners, or leave blank to auto-detect over USB</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Paper Width (mm)</Label>
        <Input
          type="number"
          step="1"
          min="10"
          max="80"
          value={rp.width_mm ?? 80}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') return;
            const n = parseFloat(v);
            if (!isNaN(n)) onChange('width_mm', n);
          }}
          onBlur={(e) => {
            const n = parseFloat(e.target.value);
            if (isNaN(n)) { onChange('width_mm', 80); return; }
            onChange('width_mm', Math.min(80, Math.max(10, n)));
          }}
          className="h-9"
        />
        <p className="text-xs text-muted-foreground">Range: 10–80mm</p>
      </div>

      {connectionType !== 'bluetooth' && (serverUp ? (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <Label>Status</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {!hasTarget
                  ? connectionType === 'lan' ? 'Enter the printer\u2019s IP address above, then check connection' : 'Select a printer above, then check connection'
                  : status.loading
                    ? 'Checking…'
                    : connected
                      ? 'Connected — printer ready'
                      : 'Disconnected — printer not found'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('flex items-center gap-1.5',
                connected ? 'text-green-600' : 'text-muted-foreground')}>
                {status.loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : connected ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              </span>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={status.check} disabled={status.loading || !hasTarget}>
                {status.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Check Connection
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Receipt printing only available in local install</p>
        </div>
      ))}

      <Separator />

      <div className="flex items-center justify-between">
        <div>
          <Label>Auto-print receipt on payment</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Sends the ESC/POS receipt automatically when an order is completed</p>
        </div>
        <Switch checked={rp.auto_print ?? true} onCheckedChange={(v) => onChange('auto_print', v)} />
      </div>

      <div className="space-y-3">
        {[
          { key: 'show_logo', label: 'Show store name as header', def: true },
          { key: 'show_tax', label: 'Show tax line on receipt', def: true },
          { key: 'show_footer', label: 'Show footer message', def: true },
          { key: 'print_drink_ticket', label: 'Print drink ticket after receipt', def: false },
        ].map(({ key, label, def }) => (
          <div key={key} className="flex items-center justify-between">
            <Label className="font-normal">{label}</Label>
            <Switch checked={rp[key] ?? def} onCheckedChange={(v) => onChange(key, v)} />
          </div>
        ))}
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-sm font-semibold">QR Code on Customer Receipt</Label>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Print a QR code on the customer copy</p>
          <Switch checked={rp.qr_enabled ?? false} onCheckedChange={(v) => onChange('qr_enabled', v)} />
        </div>
        {rp.qr_enabled && (
          <div className="space-y-1.5">
            <Label>Select QR Code</Label>
            <Select value={rp.qr_id || ''} onValueChange={v => onChange('qr_id', v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a QR code from your library" /></SelectTrigger>
              <SelectContent>
                {(settings.qr_codes || []).map(qr => (
                  <SelectItem key={qr.id} value={qr.id}>{qr.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-1">
              <Label className="text-xs">Caption (printed below QR code)</Label>
              <Input
                value={rp.qr_caption || ''}
                onChange={e => onChange('qr_caption', e.target.value)}
                placeholder="e.g. Scan for Google Reviews"
              />
            </div>
            {/* Full add/edit/delete right here — previously this only let you
                pick from an existing QR code and pointed you to a completely
                different settings section just to create one. qr_codes is a
                top-level settings field (not nested under receipt_printer,
                unlike everything else this component edits), so this uses
                onUpdateSettings rather than the regular onChange. */}
            <div className="pt-2">
              <QrCodeLibrary
                qrCodes={settings.qr_codes || []}
                onChange={(codes) => onUpdateSettings('qr_codes', codes)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Line Alignment</Label>
        <p className="text-xs text-muted-foreground">Set text alignment for each receipt section</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'header', label: 'Store Header', def: 'center' },
            { key: 'order_info', label: 'Order Info', def: 'left' },
            { key: 'items', label: 'Line Items', def: 'left' },
            { key: 'totals', label: 'Totals', def: 'left' },
            { key: 'payment', label: 'Payment', def: 'left' },
            { key: 'footer', label: 'Footer', def: 'center' },
            { key: 'qr_code', label: 'QR Code', def: 'center' },
          ].map(({ key, label, def }) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Select
                value={(rp.line_alignments || {})[key] || def}
                onValueChange={v => {
                  const next = { ...(rp.line_alignments || {}), [key]: v };
                  onChange('line_alignments', next);
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Auto-cut after printing</Label>
        <Select value={rp.auto_cut || 'partial'} onValueChange={(v) => onChange('auto_cut', v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="partial">Partial cut</SelectItem>
            <SelectItem value="full">Full cut</SelectItem>
            <SelectItem value="none">No auto-cut</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rp.print_drink_ticket && (
        <>
          <Separator />
          <div className="space-y-1.5">
            <Label>Drink ticket message</Label>
            <Textarea
              value={rp.drink_ticket_text || ''}
              onChange={(e) => onChange('drink_ticket_text', e.target.value)}
              placeholder={'Please present to the barista\nto collect your order'}
              rows={3}
              className="text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground">Use line breaks for multiple lines</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Order number size</Label>
              <Select value={rp.drink_ticket_order_size || 'xlarge'} onValueChange={(v) => onChange('drink_ticket_order_size', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small (compact)</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="bold">Bold</SelectItem>
                  <SelectItem value="double">Double height</SelectItem>
                  <SelectItem value="tall">Double height + bold</SelectItem>
                  <SelectItem value="large">Large (2× width + height)</SelectItem>
                  <SelectItem value="xlarge">Extra large (2× + bold)</SelectItem>
                  <SelectItem value="xxlarge">Max (2× + bold + underline)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Order number alignment</Label>
              <Select value={rp.drink_ticket_order_align || 'center'} onValueChange={(v) => onChange('drink_ticket_order_align', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Message text size</Label>
              <Select value={rp.drink_ticket_text_size || 'normal'} onValueChange={(v) => onChange('drink_ticket_text_size', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small (compact)</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="bold">Bold</SelectItem>
                  <SelectItem value="double">Double height</SelectItem>
                  <SelectItem value="tall">Double height + bold</SelectItem>
                  <SelectItem value="large">Large (2× width + height)</SelectItem>
                  <SelectItem value="xlarge">Extra large (2× + bold)</SelectItem>
                  <SelectItem value="xxlarge">Max (2× + bold + underline)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Message text alignment</Label>
              <Select value={rp.drink_ticket_text_align || 'center'} onValueChange={(v) => onChange('drink_ticket_text_align', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Order number font</Label>
              <Select value={rp.drink_ticket_order_font || 'A'} onValueChange={(v) => onChange('drink_ticket_order_font', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Standard (Font A)</SelectItem>
                  <SelectItem value="B">Compressed (Font B)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Message text font</Label>
              <Select value={rp.drink_ticket_text_font || 'A'} onValueChange={(v) => onChange('drink_ticket_text_font', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Standard (Font A)</SelectItem>
                  <SelectItem value="B">Compressed (Font B)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Item breakdown size</Label>
              <Select value={rp.drink_ticket_items_size || 'large'} onValueChange={(v) => onChange('drink_ticket_items_size', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small (compact)</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="bold">Bold</SelectItem>
                  <SelectItem value="double">Double height</SelectItem>
                  <SelectItem value="tall">Double height + bold</SelectItem>
                  <SelectItem value="large">Large (2× width + height)</SelectItem>
                  <SelectItem value="xlarge">Extra large (2× + bold)</SelectItem>
                  <SelectItem value="xxlarge">Max (2× + bold + underline)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Item breakdown font</Label>
              <Select value={rp.drink_ticket_items_font || 'A'} onValueChange={(v) => onChange('drink_ticket_items_font', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Standard (Font A)</SelectItem>
                  <SelectItem value="B">Compressed (Font B)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      <Button variant="outline" className="gap-2 w-full" onClick={() => printTestReceipt(settings)} disabled={status.loading || !hasTarget || (!serverUp && connectionType !== 'bluetooth')}>
        <Printer className="w-4 h-4" /> Test Print
      </Button>
    </div>
  );
}