import { normalizePrinter } from '@/components/pos/LabelPrinterSettings';

/**
 * Printer routing — resolves which label printer(s) an item prints to.
 *
 * Resolution order (per item):
 *   1. item.printer_ids (non-empty) → item override
 *   2. settings.category_printers[item.category] (non-empty) → category assignment
 *   3. [settings.default_printer_id] → catch-all default
 *
 * Relationships are many-to-many: an item can resolve to more than one printer,
 * and appears in every resolved printer's print group.
 */

/**
 * Resolve the list of printer IDs for a single menu item.
 * @param {object} menuItem - the MenuItem record (has .category, .printer_ids)
 * @param {object} settings - StoreSettings (has .category_printers, .default_printer_id)
 * @returns {string[]} printer IDs (never null; may be empty if no default configured)
 */
export function resolvePrintersForItem(menuItem, settings) {
  if (!menuItem || !settings) return [];

  // 1. Item-level override
  const itemIds = Array.isArray(menuItem.printer_ids) ? menuItem.printer_ids : [];
  if (itemIds.length > 0) return [...itemIds];

  // 2. Category-level assignment
  const catMap = settings.category_printers || {};
  const catIds = Array.isArray(catMap[menuItem.category]) ? catMap[menuItem.category] : [];
  if (catIds.length > 0) return [...catIds];

  // 3. Default catch-all printer
  const def = settings.default_printer_id;
  return def ? [def] : [];
}

/**
 * Group order cart items by their destination printer(s).
 *
 * Each cart item is resolved against its source MenuItem to find its printer(s).
 * Items mapped to multiple printers appear in each of those printers' groups.
 *
 * @param {Array} cartItems - the order's cart (each has .menu_item_id, .quantity, .name, .modifiers, .notes)
 * @param {Array} menuItems - full MenuItem list (to look up category + printer_ids by id)
 * @param {object} settings - StoreSettings
 * @returns {Object} { [printerId]: cartItem[] } — items grouped per destination printer
 */
export function groupItemsByPrinter(cartItems, menuItems, settings) {
  const byId = {};
  for (const m of (menuItems || [])) byId[m.id] = m;

  const groups = {};
  for (const cartItem of (cartItems || [])) {
    const menuItem = byId[cartItem.menu_item_id] || {
      // Fallback: if the menu item was deleted, we can't route by category.
      // Use the cart item's own category if present, else it lands on the default.
      category: cartItem.category,
      printer_ids: cartItem.printer_ids,
    };
    const printerIds = resolvePrintersForItem(menuItem, settings);
    for (const pid of printerIds) {
      if (!groups[pid]) groups[pid] = [];
      groups[pid].push(cartItem);
    }
  }
  return groups;
}

/**
 * Look up a printer config by ID and normalize it for the label builder.
 * @returns {object|null} normalized printer config, or null if not found
 */
export function getPrinterConfig(printerId, settings) {
  const printers = settings?.label_printers || [];
  const found = printers.find(p => p.id === printerId);
  return found ? normalizePrinter(found) : null;
}

/**
 * Build per-printer print jobs with WHOLE-ORDER label numbering.
 *
 * Walks cart items in their original order and, for each physical label
 * (item copy × each destination printer), assigns a single global incrementing
 * labelIndex. labelTotal is the total count of physical labels across the
 * entire order. Because numbering is assigned before any printer grouping,
 * the label_count field (e.g. "3 / 4") always reflects the item's position in
 * the whole order regardless of which printer(s) it is routed to.
 *
 * @returns {{ groups: Object<string, Array<{item, labelIndex}>>, labelTotal: number }}
 */
export function buildLabelJobs(cartItems, menuItems, settings) {
  const byId = {};
  for (const m of (menuItems || [])) byId[m.id] = m;

  const groups = {};
  let globalIndex = 1;

  for (const cartItem of (cartItems || [])) {
    const menuItem = byId[cartItem.menu_item_id] || {
      category: cartItem.category,
      printer_ids: cartItem.printer_ids,
    };
    const printerIds = resolvePrintersForItem(menuItem, settings);
    const qty = Number(cartItem.quantity) || 1;
    for (const pid of printerIds) {
      if (!groups[pid]) groups[pid] = [];
      for (let q = 0; q < qty; q++) {
        groups[pid].push({ item: { ...cartItem, quantity: 1 }, labelIndex: globalIndex++ });
      }
    }
  }

  return { groups, labelTotal: globalIndex - 1 };
}

/**
 * All printer IDs that a set of cart items will route to.
 * Useful for deciding which connections are needed before printing.
 */
export function requiredPrinterIds(cartItems, menuItems, settings) {
  const groups = groupItemsByPrinter(cartItems, menuItems, settings);
  return Object.keys(groups);
}

/**
 * Build per-printer print jobs from a list of per-UNIT items (one record per
 * physical drink, each already carrying its OrderItem `id`). Whole-order label
 * numbering is assigned here, before any printer grouping, so label_count stays
 * consistent across printers. Each job carries its `orderItemId` so the caller
 * can stamp the OrderItem's `printed_at` once BLE confirms that label printed.
 *
 * @param {Array} units - [{ id, menu_item_id, category, name, modifiers, notes }]
 * @param {Array} menuItems - full MenuItem list (for item-level printer overrides)
 * @param {object} settings - StoreSettings
 * @returns {{ groups: Object<string, Array<{item, labelIndex, orderItemId}>>, labelTotal: number }}
 */
export function buildLabelJobsFromUnits(units, menuItems, settings) {
  const byId = {};
  for (const m of (menuItems || [])) byId[m.id] = m;

  const groups = {};
  let globalIndex = 1;

  for (const u of (units || [])) {
    const menuItem = byId[u.menu_item_id] || { category: u.category, printer_ids: u.printer_ids };
    const printerIds = resolvePrintersForItem(menuItem, settings);
    for (const pid of printerIds) {
      if (!groups[pid]) groups[pid] = [];
      groups[pid].push({
        item: {
          menu_item_id: u.menu_item_id,
          name: u.name,
          quantity: 1,
          modifiers: u.modifiers || [],
          notes: u.notes || '',
        },
        labelIndex: globalIndex++,
        orderItemId: u.id,
      });
    }
  }

  return { groups, labelTotal: globalIndex - 1 };
}