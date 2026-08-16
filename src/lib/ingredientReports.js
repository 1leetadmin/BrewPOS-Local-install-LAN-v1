import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfYear, endOfYear, eachDayOfInterval,
} from 'date-fns';

export const CATEGORY_LABELS = {
  milk: 'Milk',
  beans: 'Coffee Beans',
  alt_milk: 'Alt Milk',
  cups: 'Cups',
  slushy_mix: 'Slushy Mix',
  syrups: 'Syrups',
  ice: 'Ice',
  food: 'Food',
  other: 'Other',
};

export const CATEGORY_COLORS = {
  milk: '#60a5fa',
  beans: '#92400e',
  alt_milk: '#a78bfa',
  cups: '#f472b6',
  slushy_mix: '#c084fc',
  syrups: '#facc15',
  ice: '#22d3ee',
  food: '#fb923c',
  other: '#94a3b8',
};

const CHART_PALETTE = ['#f59e0b', '#60a5fa', '#34d399', '#a78bfa', '#f472b6', '#22d3ee', '#facc15', '#fb923c', '#94a3b8', '#4ade80'];

export function getChartColor(idx, category) {
  if (category && CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  return CHART_PALETTE[idx % CHART_PALETTE.length];
}

export function getPresetRange(preset) {
  const now = new Date();
  switch (preset) {
    case 'day':
      return { start: startOfDay(now), end: endOfDay(now), label: 'Today' };
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }), label: 'This Week' };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now), label: 'This Month' };
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      return {
        start: new Date(now.getFullYear(), q * 3, 1),
        end: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999),
        label: 'This Quarter',
      };
    }
    case 'year':
      return { start: startOfYear(now), end: endOfYear(now), label: 'This Year' };
    default:
      return null;
  }
}

export function filterByDateRange(transactions, start, end) {
  if (!start || !end) return transactions;
  const s = start.getTime();
  const e = end.getTime();
  return transactions.filter(t => {
    const d = new Date(t.date).getTime();
    return d >= s && d <= e;
  });
}

export function aggregateByCategory(transactions) {
  const groups = new Map();
  for (const t of transactions) {
    const key = t.category || 'other';
    if (!groups.has(key)) groups.set(key, { name: key, label: CATEGORY_LABELS[key] || key, cost: 0, quantity: 0, wastage: 0 });
    const g = groups.get(key);
    g.cost += Number(t.total_cost) || 0;
    g.quantity += Number(t.quantity) || 0;
    if (t.transaction_type === 'wastage') g.wastage += Number(t.total_cost) || 0;
  }
  return [...groups.values()].sort((a, b) => b.cost - a.cost);
}

export function aggregateByIngredient(transactions) {
  const groups = new Map();
  for (const t of transactions) {
    const key = t.ingredient_id;
    if (!groups.has(key)) groups.set(key, {
      name: t.ingredient_name, category: t.category, unit: t.unit,
      cost: 0, quantity: 0, wastage: 0,
    });
    const g = groups.get(key);
    g.cost += Number(t.total_cost) || 0;
    g.quantity += Number(t.quantity) || 0;
    if (t.transaction_type === 'wastage') g.wastage += Number(t.total_cost) || 0;
  }
  return [...groups.values()].sort((a, b) => b.cost - a.cost);
}

export function aggregateByDay(transactions, start, end) {
  const days = eachDayOfInterval({ start, end });
  const buckets = new Map();
  for (const day of days) {
    const key = format(day, 'yyyy-MM-dd');
    buckets.set(key, { label: format(day, 'MMM d'), date: key, cost: 0, wastage: 0, quantity: 0, purchases: 0 });
  }
  for (const t of transactions) {
    const key = format(new Date(t.date), 'yyyy-MM-dd');
    const b = buckets.get(key);
    if (!b) continue;
    b.cost += Number(t.total_cost) || 0;
    b.quantity += Number(t.quantity) || 0;
    if (t.transaction_type === 'wastage') b.wastage += Number(t.total_cost) || 0;
    if (t.transaction_type === 'purchase') b.purchases += Number(t.total_cost) || 0;
  }
  return [...buckets.values()];
}

export function getSummary(transactions) {
  const total = transactions.reduce((s, t) => s + (Number(t.total_cost) || 0), 0);
  const wastage = transactions.filter(t => t.transaction_type === 'wastage').reduce((s, t) => s + (Number(t.total_cost) || 0), 0);
  const purchases = transactions.filter(t => t.transaction_type === 'purchase').reduce((s, t) => s + (Number(t.total_cost) || 0), 0);
  const usage = transactions.filter(t => t.transaction_type === 'usage').reduce((s, t) => s + (Number(t.total_cost) || 0), 0);
  const wastagePct = total > 0 ? (wastage / total) * 100 : 0;
  return { total, wastage, purchases, usage, count: transactions.length, wastagePct };
}