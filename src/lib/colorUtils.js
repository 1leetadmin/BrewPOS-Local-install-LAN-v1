// Colour helpers for the live theming system.

// Convert "#rrggbb" -> "h s% l%" triplet (the format used by the app's CSS tokens,
// which are consumed as hsl(var(--token))). Returns the input unchanged on failure.
export function hexToHslTriplet(hex) {
  if (!hex || typeof hex !== 'string') return hex;
  const m = hex.replace('#', '').trim();
  const rgb = m.length === 8 ? m.substring(0, 6) : m;
  if (rgb.length !== 6 || /[^0-9a-fA-F]/.test(rgb)) return hex;
  const r = parseInt(rgb.substring(0, 2), 16) / 255;
  const g = parseInt(rgb.substring(2, 4), 16) / 255;
  const b = parseInt(rgb.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Relative luminance (sRGB) — used to pick a readable foreground for a given background.
function relativeLuminance(hex) {
  const m = (hex || '').replace('#', '');
  const rgb = m.length === 8 ? m.substring(0, 6) : m;
  if (rgb.length !== 6) return 1;
  const channel = (i) => {
    let c = parseInt(rgb.substring(i, i + 2), 16) / 255;
    c = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return c;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

// Returns black or white — whichever reads better on top of `hex`.
export function idealForeground(hex) {
  return relativeLuminance(hex) > 0.45 ? '#000000' : '#ffffff';
}

// Ensure a value is a valid 6-digit hex for <input type="color">.
// Strips the alpha channel from 8-digit hex (#rrggbbaa → #rrggbb).
export function safeHex(hex) {
  if (!hex || typeof hex !== 'string') return '#000000';
  const m = hex.replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(m)) return '#' + m;
  if (/^[0-9a-fA-F]{8}$/.test(m)) return '#' + m.substring(0, 6);
  return '#000000';
}

// Extract alpha (0-255) from an 8-digit hex, or 255 for 6-digit hex.
export function getAlpha(hex) {
  if (!hex || typeof hex !== 'string') return 255;
  const m = hex.replace('#', '').trim();
  if (m.length === 8) return parseInt(m.substring(6, 8), 16);
  return 255;
}

// Combine a hex colour (6 or 8 digit) with an alpha value (0-255).
// Returns 6-digit hex when alpha is 255, 8-digit (#rrggbbaa) otherwise.
export function withAlpha(hex, alpha) {
  if (!hex) return hex;
  const m = hex.replace('#', '').trim();
  const rgb = m.length === 8 ? m.substring(0, 6) : (m.length === 6 ? m : null);
  if (!rgb) return hex;
  const a = Math.round(Math.max(0, Math.min(255, alpha)));
  if (a >= 255) return '#' + rgb;
  return '#' + rgb + a.toString(16).padStart(2, '0');
}