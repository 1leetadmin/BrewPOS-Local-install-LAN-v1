/**
 * Effective modifier-group display order for an item.
 *
 * Resolution (category-default-with-per-item-override, same pattern as printer
 * routing):
 *   1. item.modifier_order      — explicit per-item override (non-empty wins)
 *   2. settings.category_modifier_order[item.category] — category default
 *   3. null                      — natural order (item groups, then preset groups)
 *
 * The order is a list of group NAMES. Group names are effectively unique within
 * a single item's resolved set (item-level groups + its presets' groups).
 *
 * @returns {string[] | null}
 */
export function resolveOrderNames(item, settings) {
  if (Array.isArray(item?.modifier_order) && item.modifier_order.length > 0) {
    return item.modifier_order;
  }
  const catMap = settings?.category_modifier_order;
  const catList = catMap && catMap[item?.category];
  if (Array.isArray(catList) && catList.length > 0) return catList;
  return null;
}

/**
 * Sort a list of section objects ({ name }) by an ordered list of group names.
 * Sections whose name isn't in the order list keep their relative order and
 * append after the listed ones. Returns a new array (does not mutate input).
 *
 * @param {Array<{name:string}>} sections
 * @param {string[] | null} orderNames
 */
export function sortSectionsByOrder(sections, orderNames) {
  if (!orderNames || orderNames.length === 0) return sections;
  const indexOf = (name) => orderNames.indexOf(name);
  return [...sections].sort((a, b) => {
    const ia = indexOf(a.name);
    const ib = indexOf(b.name);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}