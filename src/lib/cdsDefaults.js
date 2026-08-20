// Quick presets for slide duration — used both for the global default and
// per-slide overrides, so someone can pick "Fast/Normal/Slow" without
// needing to know what number of seconds that means, while the underlying
// numeric field (slider or input) is always right there for a manual
// override if the presets don't fit.
export const DURATION_PRESETS = [
  { label: 'Fast', seconds: 3 },
  { label: 'Normal', seconds: 5 },
  { label: 'Slow', seconds: 8 },
  { label: 'Very slow', seconds: 12 },
];

export const DEFAULT_CDS_CONFIG = {
  slideshow_enabled: true,
  layout: 'fullscreen-idle-split-active',
  split_ratio: 40,
  slideshow_pause_during_order: true,
  default_slide_interval_ms: 5000,
  transition_style: 'fade',
  idle_background_color: '',
  idle_logo_url: '',
  idle_headline: '',
  idle_subheadline: '',
  idle_show_clock: true,
  order_panel_title: 'Your Order',
  order_show_item_images: false,
  order_accent_color: '',
  slides: [],
};

export function normalizeCdsConfig(config) {
  if (!config || typeof config !== 'object') return { ...DEFAULT_CDS_CONFIG };
  return {
    ...DEFAULT_CDS_CONFIG,
    ...config,
    slides: Array.isArray(config.slides) ? config.slides : [],
  };
}

export function createSlide(type = 'image') {
  return {
    id: crypto.randomUUID(),
    type,
    title: '',
    media_url: '',
    headline: '',
    body: '',
    background_color: '',
    text_color: '',
    menu_item_id: null,
    special_name: '',
    special_description: '',
    special_price: '',
    special_image_url: '',
    duration_ms: null,
    transition: null,
    sort_order: 0,
    enabled: true,
  };
}

export const TRANSITION_STYLES = [
  { value: 'cut', label: 'Cut (instant)' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide-left', label: 'Slide Left' },
  { value: 'slide-up', label: 'Slide Up' },
  { value: 'zoom', label: 'Zoom' },
];

export const LAYOUTS = [
  { value: 'split-vertical', label: 'Split — Vertical (order left, slideshow right)' },
  { value: 'split-horizontal', label: 'Split — Horizontal (order top, slideshow bottom)' },
  { value: 'fullscreen-idle-split-active', label: 'Fullscreen idle → Split when active' },
];

export const SLIDE_TYPES = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'text', label: 'Text' },
  { value: 'special', label: 'Special' },
];

export const TRANSITION_VARIANTS = {
  cut: { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  'slide-left': { initial: { x: '100%', opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: '-100%', opacity: 0 } },
  'slide-up': { initial: { y: '100%', opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: '-100%', opacity: 0 } },
  zoom: { initial: { scale: 0.85, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 1.15, opacity: 0 } },
};