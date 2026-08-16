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