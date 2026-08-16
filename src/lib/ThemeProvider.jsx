import { createContext, useContext, useLayoutEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { normalizeTheme } from '@/lib/themePresets';
import { hexToHslTriplet } from '@/lib/colorUtils';

const ThemeContext = createContext(null);

// Persisted copy of the last-applied theme so the very first paint on a fresh
// load already shows the saved colours — eliminating the flash to the default
// fallback while the persisted settings are still being fetched.
const THEME_CACHE_KEY = 'pos.theme.v1';

// theme.colors key -> CSS custom property
const VAR_MAP = {
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  card_foreground: '--card-foreground',
  primary: '--primary',
  primary_foreground: '--primary-foreground',
  secondary: '--secondary',
  muted: '--muted',
  muted_foreground: '--muted-foreground',
  border: '--border',
  destructive: '--destructive',
};

function readCachedTheme() {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedTheme(theme) {
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(theme));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

// Write the theme's CSS custom properties onto the root element. Centralised so
// it runs identically on every application (no partial writes that could leave
// stale values from a previous theme). Exported so the public CDS page can
// apply the same theme from the (unauthenticated) public function payload.
export function applyThemeToRoot(theme) {
  const root = document.documentElement;
  const c = theme.colors;

  Object.entries(VAR_MAP).forEach(([key, cssVar]) => {
    if (c[key]) root.style.setProperty(cssVar, hexToHslTriplet(c[key]));
  });

  // Derived tokens so every shadcn component keeps working.
  root.style.setProperty('--popover', hexToHslTriplet(c.card));
  root.style.setProperty('--popover-foreground', hexToHslTriplet(c.card_foreground));
  root.style.setProperty('--accent', hexToHslTriplet(c.secondary));
  root.style.setProperty('--accent-foreground', hexToHslTriplet(c.foreground));
  root.style.setProperty('--secondary-foreground', hexToHslTriplet(c.foreground));
  root.style.setProperty('--input', hexToHslTriplet(c.border));
  root.style.setProperty('--ring', hexToHslTriplet(c.primary));
  root.style.setProperty('--destructive-foreground', '0 0% 98%');

  if (theme.mode === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function ThemeProvider({ children }) {
  const { data: settingsList } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: () => base44.entities.StoreSettings.list(),
  });

  const theme = useMemo(() => {
    // While persisted settings are still loading, reuse the last-applied theme
    // (synchronously available from localStorage) so first paint matches the
    // saved colours — never the stock/default fallback. Once data arrives it
    // becomes the single source of truth.
    if (settingsList === undefined) {
      return readCachedTheme() || normalizeTheme(undefined);
    }
    return normalizeTheme(settingsList[0]?.theme);
  }, [settingsList]);

  // useLayoutEffect runs BEFORE the browser paints, so the theme is applied
  // exactly once, up front — no race between a default value and the real theme.
  useLayoutEffect(() => {
    applyThemeToRoot(theme);
    writeCachedTheme(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext) || { theme: null };
}

// Resolve the colour config for a modifier block.
// Precedence: per-block override -> global modifier default -> null (use theme classes).
export function getModifierButtonColors(theme, blockKey) {
  if (!theme) return null;
  const overrides = theme.modifier_button_overrides || {};
  const ov = overrides[blockKey];
  if (ov && ov.selected && ov.unselected) return ov;
  const def = theme.modifier_button_default;
  if (def && def.selected && def.unselected) return def;
  return null;
}