import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bluetooth, BluetoothOff, BluetoothConnected, Printer, Loader2, AlertCircle, Receipt, RefreshCw, FileText, Wifi, WifiOff, Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { printerService } from '@/lib/bluetoothPrinter';
import { buildTestReceipt } from '@/lib/receiptEscpos';
import { normalizePrinter, DEFAULT_PRINTER, DEFAULT_LABEL_FIELDS } from '@/components/pos/LabelPrinterSettings';
import { getPrinterStatus, printLabelJobs } from '@/lib/localPrinter';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Usb } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export default function BluetoothPrinterPanel() {
  const [statuses, setStatuses] = useState({}); // printerId -> status string
  const [attempts, setAttempts] = useState({}); // printerId -> reconnect attempt number
  const [connectingId, setConnectingId] = useState(null);
  const [reconnectingAll, setReconnectingAll] = useState(false);
  const [addingPrinter, setAddingPrinter] = useState(false);
  const [supported, setSupported] = useState(true);
  const queryClient = useQueryClient();

  // Receipt printer state
  const [receiptStatus, setReceiptStatus] = useState(null);
  const [receiptChecking, setReceiptChecking] = useState(false);
  const [receiptTesting, setReceiptTesting] = useState(false);
  const [receiptBtConnecting, setReceiptBtConnecting] = useState(false);
  const [isLocalEnv, setIsLocalEnv] = useState(false);

  // Canonical array shape — matches every other ['storeSettings'] consumer.
  // This panel is always mounted on the POS Terminal, so an object-shaped query
  // here poisoned the shared cache and reverted the applied theme to defaults.
  const { data: settingsList } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: () => base44.entities.StoreSettings.list(),
  });
  const settings = settingsList?.[0] || null;

  // Receipt printer config — handle both string (legacy) and object forms
  const receiptPrinter = typeof settings?.receipt_printer === 'string'
    ? { name: settings.receipt_printer, connection_type: 'usb' }
    : settings?.receipt_printer || {};
  const receiptConnectionType = receiptPrinter.connection_type || 'usb';
  const receiptTarget = receiptConnectionType === 'lan' ? receiptPrinter.lan_address : receiptPrinter.name;
  const receiptConnected = receiptStatus?.connected === true;
  const receiptBtStatus = statuses['__receipt__'] || 'disconnected';
  const receiptBtConnected = receiptBtStatus === 'connected';
  const receiptBtReconnecting = receiptBtStatus === 'reconnecting';

  useEffect(() => {
    const h = window.location.hostname;
    setIsLocalEnv(h === 'localhost' || h === '127.0.0.1');
  }, []);

  function getAuthToken() {
    for (const key of Object.keys(localStorage)) {
      const val = localStorage.getItem(key);
      if (val && val.length > 20 && !key.includes('theme') && !key.includes('color')) {
        return val;
      }
    }
    return '';
  }

  const handleCheckReceiptPrinter = async () => {
    setReceiptChecking(true);
    try {
      const token = getAuthToken();
      const params = new URLSearchParams();
      if (receiptPrinter.name) params.set('name', receiptPrinter.name);
      params.set('connection_type', receiptConnectionType);
      if (receiptPrinter.lan_address) params.set('lan_address', receiptPrinter.lan_address);
      const res = await fetch(`/api/printer-status?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await res.json();
      setReceiptStatus(result);
      if (result.connected) {
        toast.success('Receipt printer connected');
      } else {
        toast.error('Receipt printer not found');
      }
    } catch (err) {
      toast.error(`Printer check failed: ${err.message}`);
      setReceiptStatus({ connected: false });
    }
    setReceiptChecking(false);
  };

  const handleTestReceiptPrint = async () => {
    setReceiptTesting(true);
    try {
      const token = getAuthToken();
      const testOrder = {
        order_number: 'TEST',
        subtotal: 14.0,
        tax_total: 2.1,
        total: 16.1,
        payment_method: 'card',
        amount_paid: 16.1,
        change_due: 0,
      };
      const res = await fetch('/api/print-receipt', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ order: testOrder, settings: settings || {} }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('Test receipt sent');
      } else {
        toast.error(result.error || 'Test print failed');
      }
    } catch (err) {
      toast.error(`Test print failed: ${err.message}`);
    }
    setReceiptTesting(false);
  };

  const handleConnectReceiptBt = async () => {
    setReceiptBtConnecting(true);
    try {
      const name = await printerService.connectSmart('__receipt__');
      toast.success(`Receipt printer connected to ${name}`);
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        toast.error(`Printer error: ${err.message}`);
      }
    }
    setReceiptBtConnecting(false);
  };

  const handleDisconnectReceiptBt = () => {
    printerService.disconnect('__receipt__');
    toast.info('Receipt printer disconnected');
  };

  const handleTestReceiptPrintBt = async () => {
    setReceiptTesting(true);
    try {
      const escpos = buildTestReceipt(settings || {});
      await printerService.printReceipt(escpos);
      toast.success('Test receipt sent');
    } catch (err) {
      toast.error(`Print failed: ${err.message}`);
    }
    setReceiptTesting(false);
  };

  const printers = (settings?.label_printers && settings.label_printers.length > 0)
    ? settings.label_printers
    : [{ ...DEFAULT_PRINTER }];

  useEffect(() => {
    setSupported(printerService.isSupported());
    const unsub = printerService.onStatusChange(({ printerId, status, attempt }) => {
      setStatuses(prev => ({ ...prev, [printerId]: status }));
      if (attempt !== undefined) {
        setAttempts(prev => ({ ...prev, [printerId]: attempt }));
      }
    });
    return unsub;
  }, []);

  // Seed initial statuses for any already-connected printers
  useEffect(() => {
    const init = {};
    for (const p of printers) {
      init[p.id] = printerService.getStatus(p.id);
    }
    if (receiptConnectionType === 'bluetooth') {
      init['__receipt__'] = printerService.getStatus('__receipt__');
    }
    setStatuses(prev => ({ ...init, ...prev }));
  }, [printers, receiptConnectionType]);

  // USB/LAN printers don't use the BLE connection/status machinery above —
  // they're checked on demand via the local server, like the receipt printer.
  const [wiredStatuses, setWiredStatuses] = useState({}); // printerId -> { connected, loading }
  const [wiredTesting, setWiredTesting] = useState(null); // printerId currently test-printing

  const checkWiredPrinter = async (p) => {
    setWiredStatuses(prev => ({ ...prev, [p.id]: { ...prev[p.id], loading: true } }));
    const result = await getPrinterStatus(p);
    setWiredStatuses(prev => ({ ...prev, [p.id]: { connected: !!result.connected, loading: false } }));
    if (result.connected) toast.success(`${p.name}: printer reachable`);
    else toast.error(`${p.name}: printer not found`);
  };

  const testWiredPrint = async (p) => {
    setWiredTesting(p.id);
    try {
      const printer = normalizePrinter(p);
      const result = await printLabelJobs(
        printer,
        [{ item: { name: 'Test Item', modifiers: [{ name: 'Size', option: 'Medium' }, { name: 'Milk', option: 'Oat' }] }, labelIndex: 1 }],
        'TEST',
        1,
      );
      if (result.success) toast.success(`Test label sent to ${p.name}`);
      else toast.error(result.error || 'Print failed');
    } catch (err) {
      toast.error(`Print failed: ${err.message}`);
    }
    setWiredTesting(null);
  };

  const bluetoothPrinters = printers.filter(p => (p.connection_type || 'bluetooth') === 'bluetooth');
  const wiredPrinters = printers.filter(p => p.connection_type === 'usb' || p.connection_type === 'lan');

  // Auto-reconnect to previously paired BLE printers when the printer list loads.
  // Uses getDevices() — no device picker, works silently if devices are in range.
  const blePrintersForReconnect = [...bluetoothPrinters];
  if (receiptConnectionType === 'bluetooth') {
    blePrintersForReconnect.push({ id: '__receipt__', connection_type: 'bluetooth' });
  }
  const blePrinterKey = blePrintersForReconnect.map(p => p.id).join(',');
  useEffect(() => {
    if (printerService.canAutoReconnect && blePrinterKey) {
      printerService.reconnectAll(blePrintersForReconnect);
    }
  }, [blePrinterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddPrinter = async () => {
    setAddingPrinter(true);
    try {
      const device = await printerService.requestDevice();
      const newPrinter = {
        id: `lp_${Date.now()}`,
        name: device.name || 'New Printer',
        width_mm: 50,
        height_mm: 50,
        font_family: 'Arial Black',
        padding_mm: 1.5,
        connection_type: 'bluetooth',
        os_printer_name: '',
        lan_address: '',
        fields: DEFAULT_LABEL_FIELDS.map(f => ({ ...f })),
      };
      const updatedPrinters = [...(settings?.label_printers || []), newPrinter];
      await base44.entities.StoreSettings.update(settings.id, { label_printers: updatedPrinters });
      await queryClient.invalidateQueries({ queryKey: ['storeSettings'] });
      await printerService.connectDevice(newPrinter.id, device);
      toast.success(`Added and connected to ${device.name || 'printer'}`);
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        toast.error(`Failed to add printer: ${err.message}`);
      }
    }
    setAddingPrinter(false);
  };

  const handleReconnectAll = async () => {
    setReconnectingAll(true);
    try {
      const result = await printerService.reconnectAll(blePrintersForReconnect);
      if (result.unsupported) {
        toast.info('Auto-reconnect not supported in this browser. Connect each printer manually.');
      } else if (result.reconnected > 0) {
        toast.success(`Reconnected to ${result.reconnected} printer(s)`);
      } else {
        toast.info('No previously paired printers found in range. Connect each printer manually first.');
      }
    } catch (err) {
      toast.error(`Reconnect failed: ${err.message}`);
    }
    setReconnectingAll(false);
  };

  const anyConnected = bluetoothPrinters.some(p => statuses[p.id] === 'connected')
    || wiredPrinters.some(p => wiredStatuses[p.id]?.connected);
  const anyReconnecting = bluetoothPrinters.some(p => statuses[p.id] === 'reconnecting');

  const handleConnect = async (p) => {
    setConnectingId(p.id);
    try {
      const name = await printerService.connectSmart(p.id);
      toast.success(`${p.name}: connected to ${name}`);
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        toast.error(`Printer error: ${err.message}`);
      }
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = (p) => {
    printerService.disconnect(p.id);
    toast.info(`${p.name} disconnected`);
  };

  const handleTestPrint = async (p) => {
    try {
      const printer = normalizePrinter(p);
      await printerService.printDrinkLabel({
        item: { name: 'Test Item', modifiers: [{ name: 'Size', option: 'Medium' }, { name: 'Milk', option: 'Oat' }] },
        orderNumber: 'TEST',
        printer,
      });
      toast.success(`Test label sent to ${p.name}`);
    } catch (err) {
      toast.error(`Print failed: ${err.message}`);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-2 h-10",
            anyConnected && "border-green-500/40 text-green-600 bg-green-500/5",
            !anyConnected && anyReconnecting && "border-amber-500/40 text-amber-600 bg-amber-500/5",
            !supported && "opacity-50 cursor-not-allowed"
          )}
        >
          {anyReconnecting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : anyConnected ? (
            <BluetoothConnected className="w-4 h-4" />
          ) : (
            <Bluetooth className="w-4 h-4" />
          )}
          <span className="hidden sm:inline text-xs font-medium">
            {anyConnected
              ? `${printers.filter(p => statuses[p.id] === 'connected').length}/${printers.length} connected`
              : anyReconnecting ? 'Reconnecting…' : 'Printers'}
          </span>
          {anyConnected && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
          {(receiptConnected || receiptBtConnected) && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-3">
          <div>
            <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
              <Printer className="w-4 h-4 text-primary" />
              Label Printers
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Connect each printer individually</p>
          </div>

          {!supported && bluetoothPrinters.length > 0 && (
            <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded-lg text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Web Bluetooth requires Chrome on Windows/macOS/Android. Not supported in this browser.
            </div>
          )}

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {wiredPrinters.map(p => {
              const st = wiredStatuses[p.id] || {};
              const connected = !!st.connected;
              const testing = wiredTesting === p.id;
              return (
                <div key={p.id} className="rounded-lg border border-border p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate flex items-center gap-1.5">
                        {p.connection_type === 'lan' ? <Wifi className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <Usb className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        {p.name || 'Unnamed printer'}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] mt-0.5",
                          connected && "border-green-500/30 bg-green-500/10 text-green-600",
                          st.loading && "border-amber-500/30 bg-amber-500/10 text-amber-600",
                          !connected && !st.loading && "border-border text-muted-foreground"
                        )}
                      >
                        {st.loading ? 'Checking…' : connected ? 'Connected' : 'Not checked / unreachable'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 flex-1" onClick={() => checkWiredPrinter(p)} disabled={st.loading}>
                      {st.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Check
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 flex-1" onClick={() => testWiredPrint(p)} disabled={testing}>
                      {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />} Test
                    </Button>
                  </div>
                </div>
              );
            })}
            {bluetoothPrinters.map(p => {
              const st = statuses[p.id] || 'disconnected';
              const connected = st === 'connected';
              const reconnecting = st === 'reconnecting';
              const connecting = connectingId === p.id;
              return (
                <div key={p.id} className="rounded-lg border border-border p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name || 'Unnamed printer'}</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] mt-0.5",
                          connected && "border-green-500/30 bg-green-500/10 text-green-600",
                          (connecting || reconnecting) && "border-amber-500/30 bg-amber-500/10 text-amber-600",
                          !connected && !connecting && !reconnecting && "border-border text-muted-foreground"
                        )}
                      >
                        {connected ? `Connected — ${printerService.getDeviceName(p.id)}` : reconnecting ? `Reconnecting (attempt ${attempts[p.id] || 1})…` : connecting ? 'Scanning…' : 'Not connected'}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex gap-1.5">
                    {connected ? (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 flex-1" onClick={() => handleTestPrint(p)}>
                          <Printer className="w-3 h-3" /> Test
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 flex-1 text-destructive" onClick={() => handleDisconnect(p)}>
                          <BluetoothOff className="w-3 h-3" /> Disconnect
                        </Button>
                      </>
                    ) : reconnecting ? (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 justify-center py-1 w-full">
                        <Loader2 className="w-3 h-3 animate-spin" /> Auto-reconnecting…
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1.5 w-full"
                        disabled={connecting || !supported}
                        onClick={() => handleConnect(p)}
                      >
                        {connecting ? <><Loader2 className="w-3 h-3 animate-spin" /> Scanning…</> : <><Bluetooth className="w-3 h-3" /> Connect</>}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 text-xs gap-1.5"
            onClick={handleAddPrinter}
            disabled={addingPrinter || !supported}
          >
            {addingPrinter ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add Another Printer
          </Button>

          {printerService.canAutoReconnect && bluetoothPrinters.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs gap-1.5"
              onClick={handleReconnectAll}
              disabled={reconnectingAll}
            >
              {reconnectingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Reconnect All Printers
            </Button>
          )}

          <div className="border-t border-border" />

          <div>
            <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
              <Receipt className="w-4 h-4 text-primary" />
              Receipt Printer
            </h3>
          </div>

          <div className="rounded-lg border border-border p-2.5 space-y-2">
            {/* Bluetooth — always available */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate flex items-center gap-1.5">
                  <Bluetooth className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  {printerService.getDeviceName('__receipt__') || 'Receipt Printer'}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] mt-0.5",
                    receiptBtConnected && "border-green-500/30 bg-green-500/10 text-green-600",
                    receiptBtReconnecting && "border-amber-500/30 bg-amber-500/10 text-amber-600",
                    !receiptBtConnected && !receiptBtReconnecting && "border-border text-muted-foreground"
                  )}
                >
                  {receiptBtConnected ? `Connected — ${printerService.getDeviceName('__receipt__')}` : receiptBtReconnecting ? `Reconnecting (attempt ${attempts['__receipt__'] || 1})…` : 'Not connected'}
                </Badge>
              </div>
            </div>
            <div className="flex gap-1.5">
              {receiptBtConnected ? (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 flex-1" onClick={handleTestReceiptPrintBt} disabled={receiptTesting}>
                    {receiptTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} Test Print
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 flex-1 text-destructive" onClick={handleDisconnectReceiptBt}>
                    <BluetoothOff className="w-3 h-3" /> Disconnect
                  </Button>
                </>
              ) : receiptBtReconnecting ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 justify-center py-1 w-full">
                  <Loader2 className="w-3 h-3 animate-spin" /> Auto-reconnecting…
                </div>
              ) : (
                <Button size="sm" className="h-7 text-xs gap-1.5 w-full" disabled={!supported || receiptBtConnecting} onClick={handleConnectReceiptBt}>
                  {receiptBtConnecting ? <><Loader2 className="w-3 h-3 animate-spin" /> Scanning…</> : <><Bluetooth className="w-3 h-3" /> Connect via Bluetooth</>}
                </Button>
              )}
            </div>

            {/* USB / LAN — shown when configured */}
            {receiptConnectionType !== 'bluetooth' && (
              <>
                <Separator />
                {!isLocalEnv ? (
                  <p className="text-xs text-muted-foreground">USB/LAN receipt printing only available in the local Windows install</p>
                ) : !receiptTarget ? (
                  <p className="text-xs text-muted-foreground">No USB/LAN receipt printer configured — set it up in Settings</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{receiptTarget}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] mt-0.5",
                            receiptConnected && "border-green-500/30 bg-green-500/10 text-green-600",
                            !receiptConnected && "border-border text-muted-foreground"
                          )}
                        >
                          {receiptConnected ? 'Connected' : 'Disconnected'}
                        </Badge>
                      </div>
                      {receiptConnected ? (
                        <Wifi className="w-4 h-4 text-green-600" />
                      ) : (
                        <WifiOff className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 flex-1" onClick={handleCheckReceiptPrinter} disabled={receiptChecking}>
                        {receiptChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Check Connection
                      </Button>
                      {receiptConnected && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 flex-1" onClick={handleTestReceiptPrint} disabled={receiptTesting}>
                          {receiptTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} Test Print
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Each menu item routes to its assigned printer(s) when an order completes. Configure assignments in Menu & Settings.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}