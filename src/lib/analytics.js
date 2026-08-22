import { format, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns';

export function prepTimeSeconds(oi) {
  if (!oi.printed_at || !oi.placed_at) return null;
  return (new Date(oi.printed_at) - new Date(oi.placed_at)) / 1000;
}

export function uniqueCategories(items) {
  return [...new Set(items.map(i => i.category || 'other'))].sort();
}

export function uniqueItemNames(items) {
  return [...new Set(items.map(i => i.name || 'Unknown'))].sort();
}

/**
 * AND-logic filter. An empty Set for a dimension means "no filter" (all included).
 * `orderStatus` is a map of order_id -> status, used for the status dimension.
 */
export function filterItems(items, filters) {
  const { statusSet, categories, itemNames, dateFrom, dateTo, orderStatus } = filters;
  return items.filter(oi => {
    if (statusSet && statusSet.size) {
      const st = orderStatus[oi.order_id];
      if (!st || !statusSet.has(st)) return false;
    }
    if (categories && categories.size && !categories.has(oi.category || 'other')) return false;
    if (itemNames && itemNames.size && !itemNames.has(oi.name || 'Unknown')) return false;
    if (dateFrom || dateTo) {
      const t = new Date(oi.placed_at).getTime();
      if (dateFrom && t < dateFrom) return false;
      if (dateTo && t > dateTo) return false;
    }
    return true;
  });
}

/**
 * Group filtered items into table rows by the chosen dimension.
 * Prep-time metrics ignore records with null printed_at; count/revenue include them.
 */
export function computeTableMetrics(filtered, rowDimension) {
  const groups = new Map();
  for (const oi of filtered) {
    const key = rowDimension === 'category' ? (oi.category || 'other') : (oi.name || 'Unknown');
    if (!groups.has(key)) groups.set(key, { name: key, count: 0, revenue: 0, prep: [], printed: 0 });
    const g = groups.get(key);
    g.count += 1;
    g.revenue += Number(oi.unit_price) || 0;
    const pt = prepTimeSeconds(oi);
    if (pt !== null) { g.prep.push(pt); g.printed += 1; }
  }
  const rows = [...groups.values()].map(g => ({
    name: g.name,
    count: g.count,
    revenue: g.revenue,
    avg: g.prep.length ? g.prep.reduce((a, b) => a + b, 0) / g.prep.length : null,
    min: g.prep.length ? Math.min(...g.prep) : null,
    max: g.prep.length ? Math.max(...g.prep) : null,
    printed: g.printed,
  }));
  rows.sort((a, b) => b.revenue - a.revenue);
  return rows;
}

/**
 * Bucket filtered items over time at the chosen granularity.
 * - day:   one bucket per calendar date across the active date range
 * - hour:  24 buckets, hour-of-day 0..23 (aggregates across selected days)
 * - minute: 60 buckets, minute-of-hour 0..59 (zoom view within an hour)
 *
 * Empty buckets are kept so the chart shows gaps. avgPrep is null when no
 * printed records fell in that bucket (line gaps, not zero).
 */
export function bucketByTime(filtered, granularity, dateFrom, dateTo) {
  let labels = [];
  if (granularity === 'day') {
    let start = dateFrom ? startOfDay(new Date(dateFrom)) : null;
    let end = dateTo ? endOfDay(new Date(dateTo)) : null;
    if (!start || !end) {
      const times = filtered.map(i => new Date(i.placed_at).getTime()).sort((a, b) => a - b);
      if (times.length) {
        start = start || startOfDay(new Date(times[0]));
        end = end || endOfDay(new Date(times[times.length - 1]));
      } else {
        start = startOfDay(new Date());
        end = endOfDay(new Date());
      }
    }
    if (start > end) [start, end] = [end, start];
    labels = eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));
  } else if (granularity === 'hour') {
    labels = Array.from({ length: 24 }, (_, h) => String(h));
  } else {
    labels = Array.from({ length: 60 }, (_, m) => String(m));
  }

  const buckets = new Map();
  for (const label of labels) {
    const display = granularity === 'day'
      ? format(new Date(label), 'MMM d')
      : granularity === 'hour'
        ? `${label}:00`
        : `:${label.padStart(2, '0')}`;
    buckets.set(label, { label, display, count: 0, revenue: 0, prep: [], printed: 0 });
  }

  for (const oi of filtered) {
    const d = new Date(oi.placed_at);
    const key = granularity === 'day' ? format(d, 'yyyy-MM-dd')
      : granularity === 'hour' ? String(d.getHours())
      : String(d.getMinutes());
    const b = buckets.get(key);
    if (!b) continue;
    b.count += 1;
    b.revenue += Number(oi.unit_price) || 0;
    const pt = prepTimeSeconds(oi);
    if (pt !== null) { b.prep.push(pt); b.printed += 1; }
  }

  return [...buckets.values()].map(b => ({
    label: b.display,
    count: b.count,
    revenue: b.revenue,
    avgPrep: b.prep.length ? b.prep.reduce((a, c) => a + c, 0) / b.prep.length : null,
  }));
}

export function fmtTime(s) {
  if (s === null || s === undefined) return '—';
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

/**
 * Computes native BrewPOS sales data into the SAME shape as an imported
 * SalesImport record (category_totals, item_totals, time_series,
 * granularity, total_items_sold, total_revenue) — matching Loyverse's own
 * Category Sales / Item Sales / Sales Summary report columns exactly
 * (Items sold, Gross sales, Refunds, Discounts, Net sales, Cost of goods,
 * Gross profit, Margin, Taxes). Computed this way so the exact same
 * rendering (AnalyticsTable, AnalyticsCharts, the CSV export) works for
 * both native and imported data without needing a second set of
 * components.
 *
 * Order-level discount and tax are prorated across that order's line
 * items by revenue share (an order's $10 voucher across a $6 latte + $4
 * muffin splits $6 to the latte, $4 to the muffin) — Loyverse charges per
 * transaction the same way, this reproduces that at the line-item level
 * since BrewPOS discounts/tax are stored per-order, not per-item.
 * A fully refunded order's items count their full price as a refund and
 * contribute zero to net sales, matching Loyverse's own Refunds column
 * behavior. Only items already present in `filtered` are included, so
 * this respects whatever status/date/category filters are already active
 * — voided orders are already excluded upstream by filterItems unless the
 * user explicitly included them.
 *
 * @param {Array} filtered - OrderItem records already run through filterItems
 * @param {Array} orders - full Order list (for discount_amount, tax_total, status)
 * @param {Array} menuItems - full MenuItem list (for per-item cost)
 * @param {number|null} dateFrom, {number|null} dateTo - for granularity auto-detection
 */
export function computeLoyverseStyleReport(filtered, orders, menuItems, dateFrom, dateTo) {
  const orderById = new Map(orders.map(o => [o.id, o]));
  const costByMenuItemId = new Map(menuItems.map(m => [m.id, Number(m.cost) || 0]));
  const costByName = new Map(menuItems.map(m => [m.name, Number(m.cost) || 0]));
  const getCost = (oi) => costByMenuItemId.has(oi.menu_item_id) ? costByMenuItemId.get(oi.menu_item_id) : (costByName.get(oi.name) || 0);

  // Group items by order first, to prorate each order's discount/tax by
  // each item's share of that order's revenue.
  const itemsByOrder = new Map();
  for (const oi of filtered) {
    if (!itemsByOrder.has(oi.order_id)) itemsByOrder.set(oi.order_id, []);
    itemsByOrder.get(oi.order_id).push(oi);
  }

  // Per-item computed rows: { name, category, gross, refund, discount, net, cost, placed_at }
  const rows = [];
  for (const [orderId, items] of itemsByOrder) {
    const order = orderById.get(orderId);
    const isRefunded = order?.status === 'refunded';
    const orderDiscount = Number(order?.discount_amount) || 0;
    const orderTax = Number(order?.tax_total) || 0;
    const orderGrossTotal = items.reduce((s, oi) => s + (Number(oi.unit_price) || 0), 0);

    for (const oi of items) {
      const gross = Number(oi.unit_price) || 0;
      const share = orderGrossTotal > 0 ? gross / orderGrossTotal : 0;
      const discount = orderDiscount * share;
      const tax = orderTax * share;
      const refund = isRefunded ? gross : 0;
      const net = isRefunded ? 0 : gross - discount;
      const qty = 1; // OrderItem is already one row per unit ordered
      rows.push({
        name: oi.name || 'Unknown', category: oi.category || 'other',
        qty, gross, refund, discount, net, tax, cost: getCost(oi), placed_at: oi.placed_at,
      });
    }
  }

  // Aggregate into category/item totals.
  const categoryKey = (r) => r.category;
  const itemKey = (r) => r.name;
  function aggregate(keyFn, keyField) {
    const map = new Map();
    for (const r of rows) {
      const key = keyFn(r);
      if (!map.has(key)) map.set(key, { items_sold: 0, gross_sales: 0, refunds: 0, discounts: 0, net_sales: 0, cost: 0, taxes: 0 });
      const a = map.get(key);
      a.items_sold += r.qty;
      a.gross_sales += r.gross;
      a.refunds += r.refund;
      a.discounts += r.discount;
      a.net_sales += r.net;
      a.cost += r.cost * r.qty;
      a.taxes += r.tax;
    }
    return [...map.entries()].map(([key, a]) => ({
      [keyField]: key,
      items_sold: a.items_sold, gross_sales: a.gross_sales, refunds: a.refunds,
      discounts: a.discounts, net_sales: a.net_sales, cost: a.cost,
      profit: a.net_sales - a.cost,
      margin: a.net_sales > 0 ? ((a.net_sales - a.cost) / a.net_sales) * 100 : 0,
      taxes: a.taxes,
    }));
  }

  const category_totals = aggregate(categoryKey, 'category');
  const item_totals = aggregate(itemKey, 'name');

  // Granularity auto-detected the same way Loyverse's own export switches:
  // hourly when the filtered range is a single calendar day, daily otherwise.
  const isSingleDay = dateFrom && dateTo && startOfDay(new Date(dateFrom)).getTime() === startOfDay(new Date(dateTo)).getTime();
  const granularity = isSingleDay ? 'hourly' : 'daily';
  const timeMap = new Map();
  for (const r of rows) {
    const d = new Date(r.placed_at);
    const key = isSingleDay ? String(d.getHours()) : format(startOfDay(d), 'yyyy-MM-dd');
    if (!timeMap.has(key)) timeMap.set(key, { gross_sales: 0, refunds: 0, discounts: 0, net_sales: 0, cost: 0, taxes: 0, _sortKey: isSingleDay ? Number(key) : key });
    const t = timeMap.get(key);
    t.gross_sales += r.gross; t.refunds += r.refund; t.discounts += r.discount; t.net_sales += r.net; t.cost += r.cost * r.qty; t.taxes += r.tax;
  }
  const time_series = [...timeMap.entries()]
    .sort((a, b) => a[1]._sortKey > b[1]._sortKey ? 1 : -1)
    .map(([key, t]) => ({
      label: isSingleDay ? `${key}:00` : format(new Date(key), 'MMM d'),
      gross_sales: t.gross_sales, refunds: t.refunds, discounts: t.discounts, net_sales: t.net_sales,
      cost: t.cost, profit: t.net_sales - t.cost, margin: t.net_sales > 0 ? ((t.net_sales - t.cost) / t.net_sales) * 100 : 0, taxes: t.taxes,
    }))
    .filter(t => t.gross_sales > 0 || t.net_sales > 0);

  return {
    category_totals, item_totals, time_series, granularity,
    total_items_sold: rows.reduce((s, r) => s + r.qty, 0),
    total_revenue: rows.reduce((s, r) => s + r.net, 0),
  };
}
