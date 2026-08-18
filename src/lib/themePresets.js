// Theme presets (inspired by Windows 11 personalization) + normalisation helpers.
// Each preset is a complete starting point; once applied every value stays user-editable.

import { idealForeground } from '@/lib/colorUtils';

export const BUILT_IN_BLOCKS = ['Size', 'Espresso Shot', 'Flavour Shot'];

export const THEME_PRESETS = {
  light: {
    id: 'light',
    name: 'Light',
    mode: 'light',
    colors: {
      background: '#f4f4f6',
      foreground: '#1a1a1a',
      card: '#ffffff',
      card_foreground: '#1a1a1a',
      primary: '#0078d4',
      primary_foreground: '#ffffff',
      secondary: '#e9e9ec',
      muted: '#efeff2',
      muted_foreground: '#666666',
      border: '#d4d4d8',
      destructive: '#c42b1c',
    },
    accent_swatches: ['#0078d4', '#7b2ff7', '#107c10', '#ca501c'],
    modifier_button_default: {
      selected: { background: '#0078d4', text: '#ffffff' },
      unselected: { background: '#ffffff', text: '#1a1a1a' },
    },
  },
  dark: {
    id: 'dark',
    name: 'Dark',
    mode: 'dark',
    colors: {
      background: '#1c1c1e',
      foreground: '#e8e8ea',
      card: '#262629',
      card_foreground: '#e8e8ea',
      primary: '#4cc2ff',
      primary_foreground: '#000000',
      secondary: '#34343a',
      muted: '#2a2a2e',
      muted_foreground: '#9a9aa0',
      border: '#3a3a40',
      destructive: '#ff6b5e',
    },
    accent_swatches: ['#4cc2ff', '#7b2ff7', '#107c10', '#ca501c'],
    modifier_button_default: {
      selected: { background: '#4cc2ff', text: '#000000' },
      unselected: { background: '#2a2a2e', text: '#e8e8ea' },
    },
  },
  high_contrast: {
    id: 'high_contrast',
    name: 'High Contrast',
    mode: 'dark',
    colors: {
      background: '#000000',
      foreground: '#ffffff',
      card: '#000000',
      card_foreground: '#ffffff',
      primary: '#ffff00',
      primary_foreground: '#000000',
      secondary: '#1a1a1a',
      muted: '#0a0a0a',
      muted_foreground: '#ffffff',
      border: '#ffffff',
      destructive: '#ff0000',
    },
    accent_swatches: ['#ffff00', '#00ffff', '#ff00ff', '#00ff00'],
    modifier_button_default: {
      selected: { background: '#ffff00', text: '#000000' },
      unselected: { background: '#000000', text: '#ffffff' },
    },
  },
};

export const ADDITIONAL_THEMES = {
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    mode: 'light',
    colors: {
      background: '#f0f9ff',
      foreground: '#0c4a6e',
      card: '#ffffff',
      card_foreground: '#0c4a6e',
      primary: '#0284c7',
      primary_foreground: '#ffffff',
      secondary: '#e0f2fe',
      muted: '#f0f9ff',
      muted_foreground: '#0369a1',
      border: '#bae6fd',
      destructive: '#dc2626',
    },
    accent_swatches: ['#0284c7', '#0ea5e9', '#06b6d4', '#0891b2'],
    modifier_button_default: {
      selected: { background: '#0284c7', text: '#ffffff' },
      unselected: { background: '#e0f2fe', text: '#0c4a6e' },
    },
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    mode: 'light',
    colors: {
      background: '#fff7ed',
      foreground: '#7c2d12',
      card: '#ffffff',
      card_foreground: '#7c2d12',
      primary: '#ea580c',
      primary_foreground: '#ffffff',
      secondary: '#ffedd5',
      muted: '#fff7ed',
      muted_foreground: '#c2410c',
      border: '#fed7aa',
      destructive: '#dc2626',
    },
    accent_swatches: ['#ea580c', '#f97316', '#fb923c', '#f59e0b'],
    modifier_button_default: {
      selected: { background: '#ea580c', text: '#ffffff' },
      unselected: { background: '#ffedd5', text: '#7c2d12' },
    },
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    mode: 'light',
    colors: {
      background: '#f0fdf4',
      foreground: '#14532d',
      card: '#ffffff',
      card_foreground: '#14532d',
      primary: '#16a34a',
      primary_foreground: '#ffffff',
      secondary: '#dcfce7',
      muted: '#f0fdf4',
      muted_foreground: '#15803d',
      border: '#bbf7d0',
      destructive: '#dc2626',
    },
    accent_swatches: ['#16a34a', '#22c55e', '#4ade80', '#15803d'],
    modifier_button_default: {
      selected: { background: '#16a34a', text: '#ffffff' },
      unselected: { background: '#dcfce7', text: '#14532d' },
    },
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender',
    mode: 'light',
    colors: {
      background: '#f5f3ff',
      foreground: '#4c1d95',
      card: '#ffffff',
      card_foreground: '#4c1d95',
      primary: '#7c3aed',
      primary_foreground: '#ffffff',
      secondary: '#ede9fe',
      muted: '#f5f3ff',
      muted_foreground: '#6d28d9',
      border: '#ddd6fe',
      destructive: '#dc2626',
    },
    accent_swatches: ['#7c3aed', '#8b5cf6', '#a78bfa', '#6366f1'],
    modifier_button_default: {
      selected: { background: '#7c3aed', text: '#ffffff' },
      unselected: { background: '#ede9fe', text: '#4c1d95' },
    },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    mode: 'dark',
    colors: {
      background: '#0f172a',
      foreground: '#e2e8f0',
      card: '#1e293b',
      card_foreground: '#e2e8f0',
      primary: '#3b82f6',
      primary_foreground: '#ffffff',
      secondary: '#334155',
      muted: '#1e293b',
      muted_foreground: '#94a3b8',
      border: '#334155',
      destructive: '#ef4444',
    },
    accent_swatches: ['#3b82f6', '#6366f1', '#8b5cf6', '#06b6d4'],
    modifier_button_default: {
      selected: { background: '#3b82f6', text: '#ffffff' },
      unselected: { background: '#334155', text: '#e2e8f0' },
    },
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    mode: 'light',
    colors: {
      background: '#fff1f2',
      foreground: '#881337',
      card: '#ffffff',
      card_foreground: '#881337',
      primary: '#e11d48',
      primary_foreground: '#ffffff',
      secondary: '#ffe4e6',
      muted: '#fff1f2',
      muted_foreground: '#be123c',
      border: '#fecdd3',
      destructive: '#dc2626',
    },
    accent_swatches: ['#e11d48', '#f43f5e', '#fb7185', '#ec4899'],
    modifier_button_default: {
      selected: { background: '#e11d48', text: '#ffffff' },
      unselected: { background: '#ffe4e6', text: '#881337' },
    },
  },
  sand: {
    id: 'sand',
    name: 'Sand',
    mode: 'light',
    colors: {
      background: '#fefce8',
      foreground: '#713f12',
      card: '#ffffff',
      card_foreground: '#713f12',
      primary: '#a16207',
      primary_foreground: '#ffffff',
      secondary: '#fef9c3',
      muted: '#fefce8',
      muted_foreground: '#854d0e',
      border: '#fde68a',
      destructive: '#dc2626',
    },
    accent_swatches: ['#a16207', '#ca8a04', '#eab308', '#d97706'],
    modifier_button_default: {
      selected: { background: '#a16207', text: '#ffffff' },
      unselected: { background: '#fef9c3', text: '#713f12' },
    },
  },
  mint: {
    id: 'mint',
    name: 'Mint',
    mode: 'light',
    colors: {
      background: '#f0fdfa',
      foreground: '#134e4a',
      card: '#ffffff',
      card_foreground: '#134e4a',
      primary: '#0d9488',
      primary_foreground: '#ffffff',
      secondary: '#ccfbf1',
      muted: '#f0fdfa',
      muted_foreground: '#0f766e',
      border: '#99f6e4',
      destructive: '#dc2626',
    },
    accent_swatches: ['#0d9488', '#14b8a6', '#2dd4bf', '#06b6d4'],
    modifier_button_default: {
      selected: { background: '#0d9488', text: '#ffffff' },
      unselected: { background: '#ccfbf1', text: '#134e4a' },
    },
  },
  slate: {
    id: 'slate',
    name: 'Slate',
    mode: 'dark',
    colors: {
      background: '#1e293b',
      foreground: '#e2e8f0',
      card: '#334155',
      card_foreground: '#e2e8f0',
      primary: '#64748b',
      primary_foreground: '#ffffff',
      secondary: '#475569',
      muted: '#334155',
      muted_foreground: '#94a3b8',
      border: '#475569',
      destructive: '#ef4444',
    },
    accent_swatches: ['#64748b', '#94a3b8', '#3b82f6', '#06b6d4'],
    modifier_button_default: {
      selected: { background: '#64748b', text: '#ffffff' },
      unselected: { background: '#475569', text: '#e2e8f0' },
    },
  },
  coral: {
    id: 'coral',
    name: 'Coral',
    mode: 'light',
    colors: {
      background: '#fffbeb',
      foreground: '#78350f',
      card: '#ffffff',
      card_foreground: '#78350f',
      primary: '#f97316',
      primary_foreground: '#ffffff',
      secondary: '#fef3c7',
      muted: '#fffbeb',
      muted_foreground: '#b45309',
      border: '#fde68a',
      destructive: '#dc2626',
    },
    accent_swatches: ['#f97316', '#fb923c', '#fbbf24', '#f43f5e'],
    modifier_button_default: {
      selected: { background: '#f97316', text: '#ffffff' },
      unselected: { background: '#fef3c7', text: '#78350f' },
    },
  },
  glass: {
    id: 'glass',
    name: 'Glass',
    mode: 'dark',
    // `glass: true` triggers the frosted/translucent card treatment in
    // index.css (backdrop-blur + semi-transparent panels) — see the
    // `.theme-glass` rules there. Colors here are chosen to look right
    // once that translucency + blur is layered on top.
    glass: true,
    colors: {
      background: '#0f172a',
      foreground: '#e2e8f0',
      card: '#1e293b',
      card_foreground: '#f1f5f9',
      primary: '#38bdf8',
      primary_foreground: '#0f172a',
      secondary: '#334155',
      muted: '#1e293b',
      muted_foreground: '#94a3b8',
      border: '#475569',
      destructive: '#fb7185',
    },
    accent_swatches: ['#38bdf8', '#a78bfa', '#34d399', '#fb923c'],
    modifier_button_default: {
      selected: { background: '#38bdf8', text: '#0f172a' },
      unselected: { background: '#33415580', text: '#f1f5f9' },
    },
  },
};

export const ALL_THEMES = { ...THEME_PRESETS, ...ADDITIONAL_THEMES };

export function buildThemeFromPreset(presetId) {
  const p = ALL_THEMES[presetId] || THEME_PRESETS.light;
  return {
    active_preset: p.id,
    mode: p.mode,
    colors: { ...p.colors },
    accent_swatches: [...p.accent_swatches],
    modifier_button_default: {
      selected: { ...p.modifier_button_default.selected },
      unselected: { ...p.modifier_button_default.unselected },
    },
    modifier_button_overrides: {},
  };
}

// Fill missing fields so a partially-stored theme is always complete.
export function normalizeTheme(theme) {
  const base = buildThemeFromPreset('light');
  if (!theme || typeof theme !== 'object') return base;

  return {
    active_preset: theme.active_preset || 'custom',
    mode: theme.mode === 'dark' ? 'dark' : 'light',
    // Carries the frosted/translucent card treatment through save/reload —
    // without this, picking the Glass preset would lose its blur effect
    // the next time settings are loaded from storage.
    glass: !!theme.glass,
    colors: { ...base.colors, ...(theme.colors || {}) },
    accent_swatches:
      Array.isArray(theme.accent_swatches) && theme.accent_swatches.length
        ? theme.accent_swatches
        : base.accent_swatches,
    modifier_button_default: {
      selected: {
        ...base.modifier_button_default.selected,
        ...((theme.modifier_button_default || {}).selected || {}),
      },
      unselected: {
        ...base.modifier_button_default.unselected,
        ...((theme.modifier_button_default || {}).unselected || {}),
      },
    },
    modifier_button_overrides: theme.modifier_button_overrides || {},
  };
}

// Apply an accent swatch across the theme (primary + modifier default selected).
export function applyAccent(theme, swatch) {
  const fg = idealForeground(swatch);
  return {
    ...theme,
    active_preset: 'custom',
    colors: { ...theme.colors, primary: swatch, primary_foreground: fg },
    modifier_button_default: {
      ...theme.modifier_button_default,
      selected: { background: swatch, text: fg },
    },
  };
}