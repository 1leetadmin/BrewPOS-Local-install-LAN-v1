/**
 * Shared drink-item line rendering for the customer-facing surfaces:
 * live label preview, browser-printed label fallback, BLE ESC/POS label path,
 * and the Customer Display Screen.
 *
 * Line 1: <Size word> + drink name  (e.g. "Large Latte"); name only if no size.
 * Lines 2..n: the remaining selected modifier groups, in the order the POS
 * emitted them into the cart (which reflects the per-item / category order).
 *
 * The size group is any modifier group whose name contains "size" — this covers
 * the legacy "Size" group (historical orders, SM/MED/LRG) and the new "Hot Size"
 * / "Iced Size" groups (full-word options). Comments are excluded from these
 * lines (handled separately by callers).
 */

const SIZE_WORDS = { SM: 'Small', MED: 'Medium', LRG: 'Large' };

/**
 * Returns the ordered array of display lines for a drink item.
 * @param {{ name?: string, modifiers?: Array<{name:string, option:string}> }} item
 * @returns {string[]}
 */
export function buildDrinkLines(item) {
  const mods = Array.isArray(item?.modifiers) ? item.modifiers : [];
  const name = (item?.name || '').trim();

  // Size group: any group whose name contains "size".
  let sizeWord = '';
  const sizeMod = mods.find(m => /size/i.test(m.name) && m.option);
  if (sizeMod) {
    const key = String(sizeMod.option).trim().toUpperCase();
    // Map SM/MED/LRG abbreviations (historical orders) to words; otherwise use
    // the option as-is (Hot Size / Iced Size options are already full words).
    sizeWord = SIZE_WORDS[key] || sizeMod.option;
  }
  const line1 = [sizeWord, name].filter(Boolean).join(' ') || name;

  const lines = [line1];
  // Remaining modifier lines in cart-array order. Exclude size groups + Comments.
  for (const m of mods) {
    if (/size/i.test(m.name)) continue;
    if (m.name === 'Comments') continue;
    if (m.option) lines.push(m.option);
  }
  return lines;
}

/** Combined "<Size> Name" line (Line 1). */
export function sizeNameLine(item) {
  return buildDrinkLines(item)[0] || '';
}

/** Ordered modifier lines only (everything after Line 1). Excludes size + Comments. */
export function buildModifierLines(item) {
  return buildDrinkLines(item).slice(1);
}