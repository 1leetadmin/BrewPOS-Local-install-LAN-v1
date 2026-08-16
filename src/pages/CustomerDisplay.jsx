import { useLayoutEffect, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { applyThemeToRoot } from '@/lib/ThemeProvider';
import { normalizeTheme } from '@/lib/themePresets';
import { buildDrinkLines } from '@/lib/drinkLines';
import { normalizeCdsConfig } from '@/lib/cdsDefaults';
import Slideshow from '@/components/cds/Slideshow';

const POLL_MS = 1500;

function money(n, symbol = '$') {
  return `${symbol}${(Number(n) || 0).toFixed(2)}`;
}

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>;
}

// One order line: quantity × name, modifiers as subtext, line total on the right.
function CartLine({ line, currency, showImages }) {
  const qty = Number(line.quantity) || 1;
  const unit = Number(line.unit_price) || 0;
  const lines = buildDrinkLines({ name: line.name, modifiers: line.modifiers });
  const header = lines[0] || line.name;
  const modLines = lines.slice(1);
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/60 last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        {showImages && line.image_url && (
          <img src={line.image_url} className="w-12 h-12 rounded-lg object-cover shrink-0" alt="" />
        )}
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-primary tabular-nums">{qty}×</span>
            <span className="text-3xl font-semibold truncate">{header}</span>
          </div>
          {modLines.length > 0 && (
            <div className="mt-1 ml-12 leading-snug">
              {modLines.map((ml, i) => (
                <p key={i} className="text-2xl text-muted-foreground">{ml}</p>
              ))}
            </div>
          )}
        </div>
      </div>
      <span className="text-3xl font-mono font-bold whitespace-nowrap tabular-nums">
        {money(unit * qty, currency)}
      </span>
    </div>
  );
}

function IdleScreen({ config, storeName }) {
  const bgColor = config.idle_background_color || undefined;
  const headline = config.idle_headline || storeName;
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center px-10"
      style={bgColor ? { backgroundColor: bgColor } : undefined}
    >
      {config.idle_logo_url && (
        <img src={config.idle_logo_url} className="max-h-32 mb-8 object-contain" alt="" />
      )}
      <h1 className="text-7xl font-heading font-black tracking-tight leading-none">{headline}</h1>
      {config.idle_subheadline && (
        <p className="text-3xl text-muted-foreground mt-6 font-light">{config.idle_subheadline}</p>
      )}
      {config.idle_show_clock && (
        <p className="text-4xl font-mono mt-8 text-primary"><Clock /></p>
      )}
    </div>
  );
}

function BuildingScreen({ cart, currency, config }) {
  const runningTotal = cart.reduce((s, l) => s + (Number(l.unit_price) || 0) * (Number(l.quantity) || 1), 0);
  return (
    <div className="h-full flex flex-col">
      <header className="px-10 py-6 border-b border-border">
        <h1 className="text-4xl font-heading font-bold">{config.order_panel_title || 'Your Order'}</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-10 py-4">
        {cart.map((line, i) => (
          <CartLine key={i} line={line} currency={currency} showImages={config.order_show_item_images} />
        ))}
      </div>
      <footer className="px-10 py-6 border-t border-border flex justify-between items-center bg-card/40">
        <span className="text-3xl font-semibold">Total</span>
        <span className="text-5xl font-mono font-black text-primary tabular-nums">{money(runningTotal, currency)}</span>
      </footer>
    </div>
  );
}

function PaymentScreen({ cart, total, currency, orderNumber, config }) {
  return (
    <div className="h-full flex flex-col">
      <header className="px-10 py-6 border-b border-border flex items-baseline justify-between">
        <h1 className="text-4xl font-heading font-bold">Order Summary</h1>
        {orderNumber && <span className="text-2xl font-mono text-muted-foreground">#{orderNumber}</span>}
      </header>
      <div className="flex-1 overflow-y-auto px-10 py-4">
        {cart.map((line, i) => (
          <CartLine key={i} line={line} currency={currency} showImages={config.order_show_item_images} />
        ))}
      </div>
      <footer className="px-10 py-8 border-t border-border bg-primary text-primary-foreground text-center">
        <p className="text-2xl font-light tracking-wide">Please pay at the terminal</p>
        <p className="text-6xl font-mono font-black mt-2 tabular-nums">{money(total, currency)}</p>
      </footer>
    </div>
  );
}

function ThankYouScreen({ orderNumber }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-10">
      <h1 className="text-8xl font-heading font-black tracking-tight">Thank You!</h1>
      {orderNumber && <p className="text-4xl text-muted-foreground mt-6 font-mono">Order #{orderNumber}</p>}
      <div className="mt-12 w-28 h-1.5 bg-primary rounded-full" />
    </div>
  );
}

function OrderPanel({ state, cart, total, currency, orderNumber, config, storeName }) {
  switch (state) {
    case 'idle': return <IdleScreen config={config} storeName={storeName} />;
    case 'building': return <BuildingScreen cart={cart} currency={currency} config={config} />;
    case 'payment': return <PaymentScreen cart={cart} total={total} currency={currency} orderNumber={orderNumber} config={config} />;
    case 'thankyou': return <ThankYouScreen orderNumber={orderNumber} />;
    default: return <IdleScreen config={config} storeName={storeName} />;
  }
}

export default function CustomerDisplay() {
  const { data } = useQuery({
    queryKey: ['cdsState'],
    queryFn: async () => {
      const res = await base44.functions.invoke('customerDisplay');
      return res.data;
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  useLayoutEffect(() => {
    applyThemeToRoot(normalizeTheme(data?.theme));
  }, [data?.theme]);

  const state = data?.display_state || 'idle';
  const cart = Array.isArray(data?.active_cart) ? data.active_cart : [];
  const currency = data?.currency_symbol || '$';
  const storeName = data?.store_name || 'Our Store';
  const config = normalizeCdsConfig(data?.cds_config);

  const enabledSlides = (config.slides || [])
    .filter(s => s.enabled)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const showSlideshow = config.slideshow_enabled && enabledSlides.length > 0;
  const isFullscreenIdle = config.layout === 'fullscreen-idle-split-active';
  const isVertical = config.layout === 'split-vertical';
  const isHorizontal = config.layout === 'split-horizontal';

  // In fullscreen-idle mode, slideshow fills screen when idle
  const slideshowFullscreen = isFullscreenIdle && state === 'idle';

  // Pause slideshow during active order if configured
  const slideshowPaused = config.slideshow_pause_during_order && (state === 'building' || state === 'payment');

  const slideshowProps = {
    slides: enabledSlides,
    defaultInterval: config.default_slide_interval_ms,
    defaultTransition: config.transition_style,
    paused: slideshowPaused,
  };

  const orderPanel = (
    <OrderPanel
      state={state}
      cart={cart}
      total={data?.active_total || 0}
      currency={currency}
      orderNumber={data?.active_order_number}
      config={config}
      storeName={storeName}
    />
  );

  // No slideshow — order panel takes full screen
  if (!showSlideshow) {
    return (
      <div className="fixed inset-0 bg-background text-foreground overflow-hidden select-none">
        {orderPanel}
      </div>
    );
  }

  // Fullscreen-idle-split-active: animated transition between fullscreen and split
  if (isFullscreenIdle) {
    return (
      <div className="fixed inset-0 flex bg-background text-foreground overflow-hidden select-none">
        <div
          style={{ width: slideshowFullscreen ? '0%' : `${config.split_ratio}%` }}
          className="h-full overflow-hidden transition-[width] duration-500 ease-in-out"
        >
          {orderPanel}
        </div>
        <div
          style={{ width: slideshowFullscreen ? '100%' : `${100 - config.split_ratio}%` }}
          className="h-full bg-black overflow-hidden transition-[width] duration-500 ease-in-out"
        >
          <Slideshow {...slideshowProps} />
        </div>
      </div>
    );
  }

  // Split vertical: order left, slideshow right
  if (isVertical) {
    return (
      <div className="fixed inset-0 flex bg-background text-foreground overflow-hidden select-none">
        <div style={{ width: `${config.split_ratio}%` }} className="h-full overflow-hidden">
          {orderPanel}
        </div>
        <div style={{ width: `${100 - config.split_ratio}%` }} className="h-full bg-black overflow-hidden">
          <Slideshow {...slideshowProps} />
        </div>
      </div>
    );
  }

  // Split horizontal: order top, slideshow bottom
  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground overflow-hidden select-none">
      <div style={{ height: `${config.split_ratio}%` }} className="overflow-hidden">
        {orderPanel}
      </div>
      <div style={{ height: `${100 - config.split_ratio}%` }} className="bg-black overflow-hidden">
        <Slideshow {...slideshowProps} />
      </div>
    </div>
  );
}