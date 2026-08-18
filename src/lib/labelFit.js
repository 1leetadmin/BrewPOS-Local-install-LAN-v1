// Fit-to-size for the CSS-rendered label paths: browser fallback print
// (DrinkLabelPrint.jsx), LiveLabelPreview (LabelPrinterSettings.jsx), and the
// POS LabelPreviewModal. The BLE ESC/POS path uses a separate discrete-mode fit
// (bluetoothPrinter.js) because ESC/POS fonts cannot scale continuously.
//
// Overflow detection here now mirrors bluetoothPrinter.js's width-aware line
// wrapping (previously it only summed raw font heights and ignored width_mm
// entirely — a label narrow enough to wrap text onto extra lines showed as
// "fits fine" in this preview while the real printer, which does wrap by
// width, saw it as overflowing and shrank/compressed it. That mismatch was
// the main reason the live preview didn't match what actually printed.)

const PT_TO_MM = 25.4 / 72;          // 1pt = 0.3528mm
const DEFAULT_LINE_HEIGHT = 1.25;
const MIN_LINE_HEIGHT = 1.0;         // secondary compression floor
export const MIN_FONT_PT = 6;        // never render a font below this

// Same character-width assumptions as the ESC/POS path (bluetoothPrinter.js /
// server/printer.js) — approximate mm-per-character for normal vs. wide text,
// used only to predict how many lines a field will wrap onto.
const CHAR_MM_NORMAL = 1.5;
const CHAR_MM_WIDE = 3.0;

function wrapCount(text, charsPerLine) {
  if (!text || charsPerLine <= 0) return text ? 1 : 0;
  const words = text.split(' ');
  let lines = 1;
  let current = '';
  for (const word of words) {
    if (current.length === 0) {
      current = word.slice(0, charsPerLine);
    } else if (current.length + 1 + word.length <= charsPerLine) {
      current += ' ' + word;
    } else {
      lines += 1;
      current = word.slice(0, charsPerLine);
    }
  }
  return lines;
}

/**
 * Compute a proportional scale factor so the total content height of the
 * visible expanded fields fits within the printer's printable height —
 * accounting for how many lines each field will actually wrap onto given
 * the printer's width, not just its raw configured font size.
 *
 * - Never scales up (scale capped at 1): if content already fits, scale = 1
 *   and the caller renders at configured sizes unchanged.
 * - Never scales any font below MIN_FONT_PT (6pt): if the proportional scale
 *   would drop the smallest configured font below the floor, scale is raised
 *   to keep it at 6pt and line-height is compressed as a secondary measure
 *   (down to MIN_LINE_HEIGHT) to absorb the remaining overflow.
 *
 * @param {{ width_mm?: number, height_mm?: number, padding_mm?: number }} printer
 * @param {Array<{ font_size_pt?: number, content?: string }>} expandedFields
 *   (modifier fields already split into one entry per line)
 * @returns {{ scale: number, lineHeight: number }}
 */
export function computeLabelFit(printer, expandedFields) {
  const widthMm = Number(printer.width_mm) || 50;
  const heightMm = Number(printer.height_mm) || 30;
  const padMm = Number(printer.padding_mm) || 1.5;
  const availableMm = Math.max(1, heightMm - padMm * 2);
  const printableWmm = Math.max(10, widthMm - padMm * 2);

  const vis = (expandedFields || []).filter(f => f.content && f.key !== 'qr_code');
  if (vis.length === 0) return { scale: 1, lineHeight: DEFAULT_LINE_HEIGHT };

  // Each field's actual wrapped line count at its configured size, same
  // char-width assumptions the real ESC/POS printer uses.
  const wrapped = vis.map(f => {
    const pt = Number(f.font_size_pt) || 7;
    const charMm = pt >= 12 ? CHAR_MM_WIDE : CHAR_MM_NORMAL;
    const charsPerLine = Math.floor(printableWmm / charMm);
    const lines = Math.max(1, wrapCount(String(f.content), charsPerLine));
    return { pt, lines };
  });

  const totalMm = wrapped.reduce((s, f) => s + f.pt * DEFAULT_LINE_HEIGHT * PT_TO_MM * f.lines, 0);

  if (totalMm <= availableMm) return { scale: 1, lineHeight: DEFAULT_LINE_HEIGHT };

  // Proportional scale to fit (never scales up). The 6pt floor is applied per
  // field in scaledFontPt, so large fields still shrink proportionally while
  // no field drops below the readable floor — preserving the size hierarchy.
  const scale = availableMm / totalMm;
  let lineHeight = DEFAULT_LINE_HEIGHT;
  const flooredTotal = wrapped.reduce(
    (s, f) => s + Math.max(MIN_FONT_PT, f.pt * scale) * lineHeight * PT_TO_MM * f.lines,
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