// Fit-to-size for the CSS-rendered label paths: browser fallback print
// (DrinkLabelPrint.jsx), LiveLabelPreview (LabelPrinterSettings.jsx), and the
// POS LabelPreviewModal. The BLE ESC/POS path uses a separate discrete-mode fit
// (bluetoothPrinter.js) because ESC/POS fonts cannot scale continuously.

const PT_TO_MM = 25.4 / 72;          // 1pt = 0.3528mm
const DEFAULT_LINE_HEIGHT = 1.25;
const MIN_LINE_HEIGHT = 1.0;         // secondary compression floor
export const MIN_FONT_PT = 6;        // never render a font below this

/**
 * Compute a proportional scale factor so the total content height of the
 * visible expanded fields fits within the printer's printable height.
 *
 * - Never scales up (scale capped at 1): if content already fits, scale = 1
 *   and the caller renders at configured sizes unchanged.
 * - Never scales any font below MIN_FONT_PT (6pt): if the proportional scale
 *   would drop the smallest configured font below the floor, scale is raised
 *   to keep it at 6pt and line-height is compressed as a secondary measure
 *   (down to MIN_LINE_HEIGHT) to absorb the remaining overflow.
 *
 * @param {{ height_mm?: number, padding_mm?: number }} printer
 * @param {Array<{ font_size_pt?: number, content?: string }>} expandedFields
 *   (modifier fields already split into one entry per line)
 * @returns {{ scale: number, lineHeight: number }}
 */
export function computeLabelFit(printer, expandedFields) {
  const heightMm = Number(printer.height_mm) || 30;
  const padMm = Number(printer.padding_mm) || 1.5;
  const availableMm = Math.max(1, heightMm - padMm * 2);

  const vis = (expandedFields || []).filter(f => f.content && f.key !== 'qr_code');
  if (vis.length === 0) return { scale: 1, lineHeight: DEFAULT_LINE_HEIGHT };

  const sizes = vis.map(f => Number(f.font_size_pt) || 7);
  const totalMm = sizes.reduce((s, pt) => s + pt * DEFAULT_LINE_HEIGHT * PT_TO_MM, 0);

  if (totalMm <= availableMm) return { scale: 1, lineHeight: DEFAULT_LINE_HEIGHT };

  // Proportional scale to fit (never scales up). The 6pt floor is applied per
  // field in scaledFontPt, so large fields still shrink proportionally while
  // no field drops below the readable floor — preserving the size hierarchy.
  const scale = availableMm / totalMm;
  let lineHeight = DEFAULT_LINE_HEIGHT;
  const flooredTotal = sizes.reduce(
    (s, pt) => s + Math.max(MIN_FONT_PT, pt * scale) * lineHeight * PT_TO_MM,
    0
  );
  // Secondary: if the floored total still overflows, compress line-height
  // (down to MIN_LINE_HEIGHT) before giving up (caller clips via overflow:hidden).
  if (flooredTotal > availableMm) {
    lineHeight = Math.max(MIN_LINE_HEIGHT, lineHeight * (availableMm / flooredTotal));
  }
  return { scale, lineHeight };
}

/** Apply the fit scale to a font size, clamped to the 6pt floor. */
export function scaledFontPt(fontPt, scale) {
  return Math.max(MIN_FONT_PT, (Number(fontPt) || 7) * scale);
}