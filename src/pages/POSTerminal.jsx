import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { setCDSDisplay } from '@/lib/cdsState';
import { Search, Pencil, Monitor, Paintbrush, WifiOff, Loader2, CheckCircle } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { addOfflineOrder, getOfflineQueueLength, getNextLocalOrderNumber, syncLocalCounter, syncOfflineOrders, withTimeout } from '@/lib/offlineSync';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import CartPanel from '@/components/pos/CartPanel';
import VoiceRecognition from '@/components/pos/VoiceRecognition';
import CheckoutDialog from '@/components/pos/CheckoutDialog';
import ModifierDialog from '@/components/pos/ModifierDialog';
import BluetoothPrinterPanel from '@/components/pos/BluetoothPrinterPanel';
import LabelPreviewModal from '@/components/pos/LabelPreviewModal';
import { buildLabelJobsFromUnits } from '@/lib/printerRouting';
import { printOrderLabelJobs } from '@/lib/orderPrinting';
import { printReceipt } from '@/components/pos/ReceiptPrint';
import POSPageTabs from '@/components/pos/POSPageTabs';
import POSPageEditor from '@/components/pos/POSPageEditor';
import POSDraggableGrid from '@/components/pos/POSDraggableGrid';
import SlotColorPalette from '@/components/pos/SlotColorPalette';
import ThumbnailSizeControl from '@/components/pos/ThumbnailSizeControl';
import PrepaidAlert from '@/components/pos/PrepaidAlert';
import { trimTrailingNulls, padSlots } from '@/lib/slotUtils';
import { computeOrderTotals } from '@/lib/taxCalc';
import { cn } from '@/lib/utils';
import { idealForeground } from '@/lib/colorUtils';

const NUM_PAGES = 6;
const DEFAULT_PAGE_LABELS = ['Main', 'Drinks', 'Food', 'Snacks', 'Specials', 'Other'];

// Category fill gradients (default tile background) + borders, kept separate so
// a per-item custom background colour can override only the fill (border stays).
const CATEGORY_FILL = {
  coffee: 'from-amber-500/20 to-amber-600/10',
  tea: 'from-green-500/20 to-green-600/10',
  smoothies: 'from-purple-500/20 to-purple-600/10',
  juices: 'from-orange-500/20 to-orange-600/10',
  sodas: 'from-blue-500/20 to-blue-600/10',
  water: 'from-cyan-500/20 to-cyan-600/10',
  alcohol: 'from-red-500/20 to-red-600/10',
  food: 'from-yellow-500/20 to-yellow-600/10',
  snacks: 'from-pink-500/20 to-pink-600/10',
  desserts: 'from-rose-500/20 to-rose-600/10',
  other: 'from-slate-500/20 to-slate-600/10',
};
const CATEGORY_BORDER = {
  coffee: 'border-amber-500/30',
  tea: 'border-green-500/30',
  smoothies: 'border-purple-500/30',
  juices: 'border-orange-500/30',
  sodas: 'border-blue-500/30',
  water: 'border-cyan-500/30',
  alcohol: 'border-red-500/30',
  food: 'border-yellow-500/30',
  snacks: 'border-pink-500/30',
  desserts: 'border-rose-500/30',
  other: 'border-slate-500/30',
};

function getGridCols(count) {
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  if (count <= 25) return 5;
  if (count <= 36) return 6;
  return 7;
}

export default function POSTerminal() {
  const queryClient = useQueryClient();
  const [activePage, setActivePage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutTotals, setCheckoutTotals] = useState(null);
  const [modifierItem, setModifierItem] = useState(null);
  const [voiceQuantity, setVoiceQuantity] = useState(null);
  const [editingCartIdx, setEditingCartIdx] = useState(null);
  const [editingPage, setEditingPage] = useState(null);
  const [inlineEdit, setInlineEdit] = useState(false);
  const [paintColor, setPaintColor] = useState(null);
  const [labelPreview, setLabelPreview] = useState(null); // { items, orderNumber }
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [thumbnailSize, setThumbnailSize] = useState(() => parseInt(localStorage.getItem('pos_thumbnail_size')) || 40);
  const [textSize, setTextSize] = useState(() => parseInt(localStorage.getItem('pos_text_size')) || 12);

  const isOnline = useOnlineStatus();
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(() => getOfflineQueueLength());

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menuItems'],
    queryFn: () => base44.entities.MenuItem.list('sort_order', 200),
    initialData: () => { try { return JSON.parse(localStorage.getItem('cache_menuItems') || '[]'); } catch { return []; } },
  });

  const { data: layouts = [] } = useQuery({
    queryKey: ['menuPageLayouts'],
    queryFn: () => base44.entities.MenuPageLayout.list('page_index', 6),
    initialData: () => { try { return JSON.parse(localStorage.getItem('cache_layouts') || '[]'); } catch { return []; } },
  });

  const { data: discounts = [] } = useQuery({
    queryKey: ['discounts'],
    queryFn: () => base44.entities.Discount.list(),
    initialData: () => { try { return JSON.parse(localStorage.getItem('cache_discounts') || '[]'); } catch { return []; } },
  });

  // Pre-fetch modifier presets on page load so they're cached for offline use.
  // The ModifierDialog shares this query key and uses the cached data when offline.
  const { data: modifierPresets = [] } = useQuery({
    queryKey: ['modifierPresets'],
    queryFn: () => base44.entities.ModifierPreset.list(),
    initialData: () => { try { return JSON.parse(localStorage.getItem('cache_modifierPresets') || '[]'); } catch { return []; } },
  });

  // Canonical array shape — matches Settings & ThemeProvider so the shared
  // ['storeSettings'] cache is consistent everywhere (prevents the shape
  // mismatch that broke live theme application + caused default-form re-init).
  const { data: settingsList } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: () => base44.entities.StoreSettings.list(),
    initialData: () => { try { return JSON.parse(localStorage.getItem('cache_settings') || '[]'); } catch { return []; } },
  });
  const settings = settingsList?.[0] || { tax_rate: 8.5, auto_print_labels: true, voice_enabled: true };

  // Cache query data to localStorage so the POS survives a page refresh while offline
  useEffect(() => { if (menuItems?.length) localStorage.setItem('cache_menuItems', JSON.stringify(menuItems)); }, [menuItems]);
  useEffect(() => { if (layouts?.length) localStorage.setItem('cache_layouts', JSON.stringify(layouts)); }, [layouts]);
  useEffect(() => { if (discounts?.length) localStorage.setItem('cache_discounts', JSON.stringify(discounts)); }, [discounts]);
  useEffect(() => { if (modifierPresets?.length) localStorage.setItem('cache_modifierPresets', JSON.stringify(modifierPresets)); }, [modifierPresets]);
  useEffect(() => { if (settingsList?.length) localStorage.setItem('cache_settings', JSON.stringify(settingsList)); }, [settingsList]);

  // Auto-sync queued orders when the connection is restored
  useEffect(() => {
    if (!isOnline) return;
    if (getOfflineQueueLength() === 0) return;
    let cancelled = false;
    setSyncing(true);
    (async () => {
      const result = await syncOfflineOrders(queryClient);
      if (!cancelled) {
        setSyncing(false);
        setPendingCount(result.remaining);
        if (result.synced > 0) {
          toast.success(`${result.synced} offline order${result.synced > 1 ? 's' : ''} synced`);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isOnline, queryClient]);

  const taxRate = settings?.tax_rate || 0;
  const taxInclusive = !!settings?.tax_inclusive;

  // --- Customer Display Screen (CDS) live state ---
  // The cart is mirrored to StoreSettings so the public /display page (any
  // internet-connected tablet) can poll it and show the growing order live.
  const cdsPhase = useRef('idle');
  const cdsTimer = useRef(null);

  useEffect(() => {
    if (!settings?.id) return;
    // Payment / thank-you screens are driven explicitly by the checkout +
    // completion flow — don't let cart changes override them.
    if (cdsPhase.current === 'payment' || cdsPhase.current === 'thankyou') return;
    if (cart.length === 0) {
      cdsPhase.current = 'idle';
      setCDSDisplay(settings.id, { display_state: 'idle', active_cart: [], active_order_number: '', active_total: 0 });
    } else {
      cdsPhase.current = 'building';
      setCDSDisplay(settings.id, { display_state: 'building', active_cart: cart });
    }
  }, [cart, settings?.id]);

  useEffect(() => () => { if (cdsTimer.current) clearTimeout(cdsTimer.current); }, []);

  useEffect(() => { localStorage.setItem('pos_thumbnail_size', String(thumbnailSize)); }, [thumbnailSize]);

  useEffect(() => { localStorage.setItem('pos_text_size', String(textSize)); }, [textSize]);

  const menuItemsMap = useMemo(() => Object.fromEntries(menuItems.map(i => [i.id, i])), [menuItems]);

  // Build page descriptors for all 6 pages
  const pages = useMemo(() =>
    Array.from({ length: NUM_PAGES }, (_, i) => {
      const layout = layouts.find(l => l.page_index === i);
      return {
        label: layout?.label || DEFAULT_PAGE_LABELS[i],
        items_per_page: layout?.items_per_page || 20,
        slots: layout?.slots || [],
      };
    }), [layouts]);

  const currentPage = pages[activePage];

  const currentLayout = layouts.find(l => l.page_index === activePage);
  const currentSlotColors = currentLayout?.slot_colors || {};
  const paddedSlots = padSlots(currentPage.slots, currentPage.items_per_page);

  const layoutMutation = useMutation({
    mutationFn: async ({ layoutId, pageIndex, ...data }) => {
      if (layoutId) return base44.entities.MenuPageLayout.update(layoutId, data);
      return base44.entities.MenuPageLayout.create({ page_index: pageIndex, ...data });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menuPageLayouts'] }),
  });

  const saveLayout = (data) =>
    layoutMutation.mutate({ layoutId: currentLayout?.id, pageIndex: activePage, ...data });

  const handleInlineReorder = (newSlots) => {
    saveLayout({ label: currentPage.label, items_per_page: currentPage.items_per_page, slots: trimTrailingNulls(newSlots) });
  };

  const handleInlineRemove = (idx) => {
    const padded = [...paddedSlots];
    padded[idx] = null;
    saveLayout({ label: currentPage.label, items_per_page: currentPage.items_per_page, slots: trimTrailingNulls(padded) });
  };

  const handleInlinePaint = (idx, color) => {
    const newColors = { ...currentSlotColors };
    if (color === '__clear__') delete newColors[String(idx)];
    else newColors[String(idx)] = color;
    saveLayout({ label: currentPage.label, items_per_page: currentPage.items_per_page, slots: currentPage.slots, slot_colors: newColors });
  };

  // Items visible on current page, filtered by search
  const visibleItems = useMemo(() => {
    const slotItems = currentPage.slots
      .map(id => menuItemsMap[id])
      .filter(Boolean)
      .filter(item => !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return slotItems;
  }, [currentPage.slots, menuItemsMap, searchQuery]);

  // For the read-only POS grid we just show the ordered slot items (no empty pads)
  const gridCols = getGridCols(currentPage.items_per_page);

  const addToCart = useCallback((cartItem) => {
    setCart(prev => {
      if (!cartItem.modifiers?.length) {
        const existingIdx = prev.findIndex(c => c.menu_item_id === cartItem.menu_item_id && !c.modifiers?.length);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = { ...updated[existingIdx], quantity: updated[existingIdx].quantity + cartItem.quantity };
          return updated;
        }
      }
      return [...prev, cartItem];
    });
  }, []);

  const handleItemClick = useCallback((item) => {
    if (!item.is_available) return;
    setVoiceQuantity(null);
    setModifierItem(item);
  }, []);

  const handleEditItem = useCallback((idx) => {
    const cartLine = cart[idx];
    if (!cartLine) return;
    const menuItem = menuItems.find(m => m.id === cartLine.menu_item_id);
    if (!menuItem) {
      toast.error('Original menu item not found');
      return;
    }
    setEditingCartIdx(idx);
    setVoiceQuantity(null);
    setModifierItem(menuItem);
  }, [cart, menuItems]);

  const handleModifierConfirm = useCallback((cartItem) => {
    if (editingCartIdx !== null) {
      setCart(prev => prev.map((item, i) => i === editingCartIdx ? cartItem : item));
      setEditingCartIdx(null);
      toast.success(`Updated ${cartItem.quantity}x ${cartItem.name}`);
    } else {
      addToCart(cartItem);
      toast.success(`Added ${cartItem.quantity}x ${cartItem.name}`);
    }
  }, [editingCartIdx, addToCart]);

  const handleVoiceCommand = useCallback((cmd) => {
    if (cmd.type === 'add_item') {
      if (cmd.skipDialog) {
        const unitPrice = Math.max(0, cmd.item.price + (cmd.priceAdjustment || 0));
        addToCart({
          menu_item_id: cmd.item.id,
          name: cmd.item.name,
          quantity: cmd.quantity,
          unit_price: unitPrice,
          modifiers: cmd.modifiers || [],
          total: unitPrice * cmd.quantity,
        });
      } else {
        setVoiceQuantity(cmd.quantity);
        setModifierItem(cmd.item);
      }
    } else if (cmd.type === 'clear_cart') {
      setCart([]);
    } else if (cmd.type === 'checkout') {
      if (cart.length > 0) {
        const totals = computeOrderTotals(cart, taxRate, taxInclusive, appliedDiscount);
        setCheckoutTotals(totals);
        setCheckoutOpen(true);
        cdsPhase.current = 'payment';
        setCDSDisplay(settings?.id, { display_state: 'payment', active_cart: cart, active_total: totals.total });
      }
    }
  }, [cart, taxRate, addToCart]);

  const updateQuantity = (idx, qty) => {
    if (qty <= 0) setCart(prev => prev.filter((_, i) => i !== idx));
    else setCart(prev => prev.map((item, i) => i === idx ? { ...item, quantity: qty } : item));
  };

  const removeItem = (idx) => setCart(prev => prev.filter((_, i) => i !== idx));

  const handleCheckout = (totals) => {
    setCheckoutTotals(totals);
    setCheckoutOpen(true);
    cdsPhase.current = 'payment';
    setCDSDisplay(settings?.id, { display_state: 'payment', active_cart: cart, active_total: totals.total });
  };

  const handleCheckoutClose = () => {
    setCheckoutOpen(false);
    // Backed out of payment without completing → resume building (or idle).
    if (cart.length > 0) {
      cdsPhase.current = 'building';
      setCDSDisplay(settings?.id, { display_state: 'building', active_cart: cart });
    }
  };

  const handleCompleteOrder = async (paymentData) => {
    const { subtotal, taxTotal, discountAmount, total: finalTotal } =
      computeOrderTotals(cart, taxRate, taxInclusive, appliedDiscount);
    const nowISO = new Date().toISOString();

    // Build one unit per physical item (for label printing + order items)
    const menuById = {};
    (menuItems || []).forEach(m => { menuById[m.id] = m; });
    const units = [];
    for (const line of cart) {
      const mi = menuById[line.menu_item_id] || {};
      const qty = Number(line.quantity) || 1;
      for (let q = 0; q < qty; q++) {
        units.push({
          menu_item_id: line.menu_item_id,
          name: line.name,
          category: mi.category || line.category || 'other',
          unit_price: line.unit_price,
          modifiers: line.modifiers || [],
          notes: line.notes || '',
        });
      }
    }

    const orderData = {
      status: 'completed',
      item_count: cart.reduce((s, i) => s + (Number(i.quantity) || 1), 0),
      subtotal,
      tax_total: taxTotal,
      total: finalTotal,
      discount_amount: discountAmount,
      discount_type: appliedDiscount ? 'percentage' : 'none',
      discount_id: appliedDiscount?.id || undefined,
      discount_name: appliedDiscount?.name || undefined,
      payment_method: paymentData.payment_method,
      amount_paid: paymentData.amount_paid,
      change_due: paymentData.change_due,
      cash_amount: paymentData.cash_amount || 0,
      card_amount: paymentData.card_amount || 0,
      customer_name: customerName,
      completed_at: nowISO,
    };

    let orderNumber = '000';
    let savedOffline = false;

    if (isOnline) {
      try {
        // ONLINE: create records on the server immediately (with timeout fallback)
        if (settings?.id) {
          const fresh = await withTimeout(base44.entities.StoreSettings.filter({ id: settings.id }));
          const freshSettings = fresh[0] || settings;
          const currentCounter = freshSettings.order_counter ?? 0;
          orderNumber = String(currentCounter).padStart(3, '0');
          const nextCounter = (currentCounter + 1) % 1000;
          await withTimeout(base44.entities.StoreSettings.update(settings.id, { order_counter: nextCounter }));
          syncLocalCounter(nextCounter);
        }
        const order = await withTimeout(base44.entities.Order.create({ ...orderData, order_number: orderNumber }));
        const orderItems = await withTimeout(base44.entities.OrderItem.bulkCreate(
          units.map(u => ({ ...u, order_id: order.id, order_number: orderNumber, placed_at: nowISO }))
        ));
        orderItems.forEach((oi, i) => { units[i].id = oi.id; });
      } catch (err) {
        // Network failed or timed out — fall back to offline queue so the POS
        // doesn't stall. navigator.onLine can be unreliable (WiFi up but
        // internet down), so we catch the actual failure and recover gracefully.
        orderNumber = getNextLocalOrderNumber(settings?.order_counter);
        addOfflineOrder({
          _localId: crypto.randomUUID(),
          _queuedAt: nowISO,
          settingsId: settings?.id,
          localOrderNumber: orderNumber,
          orderData,
          units,
          placedAt: nowISO,
          discountUpdate: appliedDiscount?.id && (appliedDiscount.prepaid_amount || 0) > 0
            ? { id: appliedDiscount.id, amount: discountAmount }
            : null,
        });
        setPendingCount(getOfflineQueueLength());
        savedOffline = true;
      }
    } else {
      // OFFLINE: queue locally, assign a local order number for display/printing
      orderNumber = getNextLocalOrderNumber(settings?.order_counter);
      addOfflineOrder({
        _localId: crypto.randomUUID(),
        _queuedAt: nowISO,
        settingsId: settings?.id,
        localOrderNumber: orderNumber,
        orderData,
        units,
        placedAt: nowISO,
        discountUpdate: appliedDiscount?.id && (appliedDiscount.prepaid_amount || 0) > 0
          ? { id: appliedDiscount.id, amount: discountAmount }
          : null,
      });
      setPendingCount(getOfflineQueueLength());
      savedOffline = true;
    }

    // Whole-order label numbering, assigned before any printer grouping.
    const { groups: printerGroups, labelTotal } = buildLabelJobsFromUnits(units, menuItems, settings || {});
    const allJobs = Object.values(printerGroups).flat();

    const doPrint = async () => {
      const { sent, fallback } = await printOrderLabelJobs(printerGroups, labelTotal, settings, {
        orderNumber,
        onLabelPrinted: (job) => {
          // BLE confirmed this label fully printed (gap-feed settled) — stamp
          // the corresponding OrderItem's printed_at timestamp (online only).
          if (job.orderItemId && !savedOffline) {
            base44.entities.OrderItem
              .update(job.orderItemId, { printed_at: new Date().toISOString() })
              .catch(() => {});
          }
        },
        onError: (name, err) => toast.error(`${name}: ${err.message}`),
      });
      if (sent > 0) toast.success(`Labels sent to ${sent} printer(s)`);
      if (sent === 0 && fallback > 0) {
        toast.info('Connect a Bluetooth printer for silent printing', { duration: 3000 });
      }
    };

    if (allJobs.length > 0 && settings?.auto_print_labels !== false) {
      if (settings?.label_preview_enabled !== false) {
        setLabelPreview({ jobs: allJobs, orderNumber, labelTotal, onPrint: doPrint });
      } else {
        doPrint();
      }
    }

    // Receipt auto-print — sends the order (with items) to the local print
    // server, which prints via the configured connection (USB / LAN / Bluetooth).
    if (settings?.receipt_printer && settings.receipt_printer.auto_print !== false) {
      printReceipt({ ...orderData, order_number: orderNumber, items: units }, settings);
    }

    if (!savedOffline) {
      queryClient.invalidateQueries({ queryKey: ['storeSettings'] });

      // Update discount used_amount for prepaid tracking
      if (appliedDiscount?.id && (appliedDiscount.prepaid_amount || 0) > 0) {
        try {
          const fresh = await withTimeout(base44.entities.Discount.filter({ id: appliedDiscount.id }));
          const d = fresh[0];
          if (d) await withTimeout(base44.entities.Discount.update(d.id, { used_amount: (d.used_amount || 0) + discountAmount }));
        } catch {}
      }
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
    }

    toast.success(
      savedOffline
        ? `Order #${orderNumber} saved offline — will sync when reconnected`
        : `Order #${orderNumber} completed!`
    );
    setCart([]);
    setCustomerName('');
    setAppliedDiscount(null);
    setCheckoutOpen(false);
    setCheckoutTotals(null);

    // CDS: show a brief thank-you, then return to idle branding.
    cdsPhase.current = 'thankyou';
    setCDSDisplay(settings?.id, {
      display_state: 'thankyou',
      active_order_number: orderNumber,
      active_total: finalTotal,
      active_cart: cart,
    });
    if (cdsTimer.current) clearTimeout(cdsTimer.current);
    cdsTimer.current = setTimeout(() => {
      cdsPhase.current = 'idle';
      setCDSDisplay(settings?.id, { display_state: 'idle', active_cart: [], active_order_number: '', active_total: 0 });
    }, 5000);
  };

  return (
    <div className="flex h-full">
      {/* Left: Menu */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="p-4 flex items-center gap-3 border-b border-border bg-card/50">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search menu..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-muted/50"
            />
          </div>
          <VoiceRecognition
            onCommand={handleVoiceCommand}
            menuItems={menuItems}
            modifierPresets={modifierPresets}
            enabled={settings?.voice_enabled !== false}
          />
          <BluetoothPrinterPanel />
          {(!isOnline || syncing || pendingCount > 0) && (
            <div className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border shrink-0',
              !isOnline
                ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                : syncing
                  ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                  : 'bg-green-500/10 text-green-600 border-green-500/30'
            )}>
              {!isOnline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Offline</span>
                  {pendingCount > 0 && (
                    <span className="ml-1 bg-amber-600 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">{pendingCount}</span>
                  )}
                </>
              ) : syncing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="hidden sm:inline">Syncing…</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{pendingCount} queued</span>
                </>
              )}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-10 shrink-0"
            onClick={() => window.open('/display', '_blank', 'noopener,noreferrer')}
            title="Open Customer Display on this or another device"
          >
            <Monitor className="w-4 h-4" />
            <span className="hidden sm:inline text-xs font-medium">Customer Display</span>
          </Button>
          <ThumbnailSizeControl size={thumbnailSize} onChange={setThumbnailSize} textSize={textSize} onTextChange={setTextSize} />
        </div>

        {/* Page Tabs */}
        <div className="flex items-center gap-1 border-b border-border bg-card/30 px-2 pt-2">
          <POSPageTabs pages={pages} activePage={activePage} onPageChange={setActivePage} />
          <button
            onClick={() => { setInlineEdit(!inlineEdit); setPaintColor(null); }}
            className={cn(
              'mb-1.5 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors border',
              inlineEdit
                ? 'bg-primary text-primary-foreground border-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted border-border',
            )}
          >
            <Paintbrush className="w-3 h-3" /> {inlineEdit ? 'Editing' : 'Arrange'}
          </button>
          {inlineEdit && (
            <div className="mb-1.5">
              <SlotColorPalette paintColor={paintColor} onSelect={setPaintColor} />
            </div>
          )}
          <button
            onClick={() => setEditingPage(activePage)}
            className="ml-auto mr-3 mb-1.5 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border"
          >
            <Pencil className="w-3 h-3" /> Edit Page
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {inlineEdit ? (
            <POSDraggableGrid
              slots={paddedSlots}
              menuItemsMap={menuItemsMap}
              onReorder={handleInlineReorder}
              onRemove={handleInlineRemove}
              onEmptySlotClick={() => setEditingPage(activePage)}
              onPaintSlot={handleInlinePaint}
              gridCols={gridCols}
              editMode={true}
              slotColors={currentSlotColors}
              paintColor={paintColor}
              thumbnailSize={thumbnailSize}
              textSize={textSize}
            />
          ) : searchQuery ? (
            visibleItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <p className="text-lg">No matching items</p>
              </div>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
                {visibleItems.map(item => {
                  const hasCustomColor = !!item.color && item.color.trim();
                  const fg = hasCustomColor ? idealForeground(item.color) : null;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      disabled={!item.is_available}
                      style={hasCustomColor ? { backgroundColor: item.color, color: fg } : undefined}
                      className={cn(
                        'pos-grid-tile relative flex flex-col items-center justify-center p-4 rounded-xl border min-h-[90px]',
                        'hover:shadow-lg hover:scale-[1.02] cursor-pointer transition-all',
                        hasCustomColor
                          ? (CATEGORY_BORDER[item.category] || 'border-slate-500/30')
                          : cn('bg-gradient-to-br', CATEGORY_FILL[item.category] || 'from-slate-500/20 to-slate-600/10', CATEGORY_BORDER[item.category] || 'border-slate-500/30'),
                        !item.is_available && 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="rounded-lg object-cover mb-2" style={{ width: thumbnailSize, height: thumbnailSize }} />
                      ) : (
                        <div className="rounded-lg bg-white/10 flex items-center justify-center mb-2" style={{ width: thumbnailSize, height: thumbnailSize }}>
                          <span className="font-bold opacity-60" style={{ fontSize: thumbnailSize * 0.4 }}>{item.name.charAt(0)}</span>
                        </div>
                      )}
                      <span className="font-semibold text-center leading-tight line-clamp-2" style={{ fontSize: textSize }}>{item.name}</span>
                      <span className={cn('font-mono font-bold mt-1', !hasCustomColor && 'text-primary')} style={{ fontSize: textSize, ...(hasCustomColor ? { color: fg } : {}) }}>${item.price.toFixed(2)}</span>
                      {!item.is_available && (
                        <span className="absolute top-1 right-1 text-[10px] bg-destructive/80 text-destructive-foreground px-1.5 py-0.5 rounded-full">
                          Sold Out
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          ) : paddedSlots.every(s => !s) ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <p className="text-lg">This page is empty</p>
              <Button variant="outline" size="sm" onClick={() => setInlineEdit(true)} className="gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> Set up this page
              </Button>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
              {paddedSlots.map((itemId, idx) => {
                const item = itemId ? menuItemsMap[itemId] : null;
                if (!item) return <div key={`empty-${idx}`} className="min-h-[90px]" />;
                const slotColor = currentSlotColors?.[String(idx)];
                const hasCustomColor = !!item.color && item.color.trim();
                const bgColor = hasCustomColor ? item.color : (slotColor || null);
                const fg = bgColor ? idealForeground(bgColor) : null;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    disabled={!item.is_available}
                    style={bgColor ? { backgroundColor: bgColor, color: fg } : undefined}
                    className={cn(
                      'pos-grid-tile relative flex flex-col items-center justify-center p-4 rounded-xl border min-h-[90px]',
                      'hover:shadow-lg hover:scale-[1.02] cursor-pointer transition-all',
                      bgColor
                        ? 'border-black/10'
                        : cn('bg-gradient-to-br', CATEGORY_FILL[item.category] || 'from-slate-500/20 to-slate-600/10', CATEGORY_BORDER[item.category] || 'border-slate-500/30'),
                      !item.is_available && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="rounded-lg object-cover mb-2" style={{ width: thumbnailSize, height: thumbnailSize }} />
                    ) : (
                      <div className="rounded-lg bg-white/10 flex items-center justify-center mb-2" style={{ width: thumbnailSize, height: thumbnailSize }}>
                        <span className="font-bold opacity-60" style={{ fontSize: thumbnailSize * 0.4 }}>{item.name.charAt(0)}</span>
                      </div>
                    )}
                    <span className="font-semibold text-center leading-tight line-clamp-2" style={{ fontSize: textSize }}>{item.name}</span>
                    <span className={cn('font-mono font-bold mt-1', !bgColor && 'text-primary')} style={{ fontSize: textSize, ...(bgColor ? { color: fg } : {}) }}>${item.price.toFixed(2)}</span>
                    {!item.is_available && (
                      <span className="absolute top-1 right-1 text-[10px] bg-destructive/80 text-destructive-foreground px-1.5 py-0.5 rounded-full">
                        Sold Out
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <CartPanel
        cart={cart}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeItem}
        onClearCart={() => setCart([])}
        onCheckout={handleCheckout}
        customerName={customerName}
        onCustomerNameChange={setCustomerName}
        taxRate={taxRate}
        taxInclusive={taxInclusive}
        discounts={discounts}
        appliedDiscount={appliedDiscount}
        onApplyDiscount={setAppliedDiscount}
        onEditItem={handleEditItem}
      />

      {/* Modifier picker */}
      <ModifierDialog
        item={modifierItem}
        editItem={editingCartIdx !== null ? cart[editingCartIdx] : null}
        open={!!modifierItem}
        onClose={() => { setModifierItem(null); setVoiceQuantity(null); setEditingCartIdx(null); }}
        onConfirm={handleModifierConfirm}
        defaultQuantity={voiceQuantity}
        discounts={discounts}
        appliedDiscount={appliedDiscount}
        onApplyDiscount={setAppliedDiscount}
      />

      {/* Checkout */}
      <CheckoutDialog
        open={checkoutOpen}
        onClose={handleCheckoutClose}
        totals={checkoutTotals}
        onComplete={handleCompleteOrder}
        eftposEnabled={settings?.smartconnect?.enabled && settings?.smartconnect?.paired}
      />

      {/* Label Preview Modal */}
      {labelPreview && (
        <LabelPreviewModal
          open={!!labelPreview}
          onClose={() => setLabelPreview(null)}
          onPrint={labelPreview.onPrint}
          jobs={labelPreview.jobs}
          labelTotal={labelPreview.labelTotal}
          orderNumber={labelPreview.orderNumber}
          settings={settings}
        />
      )}

      {/* Prepaid discount alerts */}
      <PrepaidAlert discounts={discounts} />

      {/* Page Editor overlay */}
      {editingPage !== null && (
        <POSPageEditor
          pageIndex={editingPage}
          onClose={() => setEditingPage(null)}
        />
      )}
    </div>
  );
}