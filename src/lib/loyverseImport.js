// ============================================================================
// src/lib/loyverseImport.js
//
// Parses Loyverse's CSV report exports (Reports > Sales Summary / Category
// Sales / Item Sales / Modifier Sales / Payment Type Sales) into a single
// combined import record. Validated against real exports from two actual
// events — a single-day one (which gets HOURLY granularity in its Sales
// Summary export — Loyverse switches from daily to hourly rows when the
// export date range is a single day) and a multi-day one (daily rows only).
//
// Loyverse doesn't export per-transaction data on the free/standard tier —
// only these pre-aggregated summary reports — so this is the finest
// granularity available; there's no way to reconstruct individual orders
// from this data, and this module doesn't attempt to.
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

/** Minimal RFC4180-ish CSV parser: handles quoted fields (embedded commas/
 * quotes), CRLF or LF line endings. Loyverse's exports are simple enough
 * not to need a full library for this. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(text).replace(/\r\n/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

function parseNum(s) {
  if (s == null) return 0;
  const cleaned = String(s).replace(/[%$,]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Detects which of the 5 known Loyverse export types a file is, by its
 * header row — not filename, since filenames are user-editable and
 * unreliable. Distinguishes daily vs hourly Sales Summary by whether the
 * first column is "Date" or "Time". */
export function detectLoyverseFileType(headerRow) {
  const cells = (headerRow || []).map(c => String(c).trim().toLowerCase());
  const c0 = cells[0], c1 = cells[1];
  if (c0 === 'date' && c1 === 'gross sales') return { type: 'sales-summary', granularity: 'daily' };
  if (c0 === 'time' && c1 === 'gross sales') return { type: 'sales-summary', granularity: 'hourly' };
  if (c0 === 'category' && c1 === 'items sold') return { type: 'category-sales-summary' };
  if (c0 === 'item name' && c1 === 'sku') return { type: 'item-sales-summary' };
  if (c0 === 'modifier name' && c1 === 'option name') return { type: 'modifier-sales' };
  if (c0 === 'payment type') return { type: 'payment-type-sales' };
  return { type: 'unknown' };
}

/** Parses one CSV file's raw text into {detected, dataRows}. */
export function parseLoyverseFile(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { detected: { type: 'unknown' }, dataRows: [] };
  const header = rows[0].map(c => c.trim());
  const detected = detectLoyverseFileType(header);
  return { detected, dataRows: rows.slice(1) };
}

/** Combines an array of {detected, dataRows} (one per uploaded file) into a
 * single import record ready to store as a SalesImport entity. Files can
 * be given in any order/combination — a partial set (e.g. just Item Sales)
 * still produces a usable record, just with fewer totals populated. */
export function buildLoyverseImportRecord(parsedFiles, label) {
  const record = {
    label,
    source: 'loyverse',
    granularity: null,
    time_series: [],
    category_totals: [],
    item_totals: [],
    modifier_totals: [],
    payment_totals: [],
  };

  for (const { detected, dataRows } of parsedFiles) {
    if (detected.type === 'sales-summary') {
      record.granularity = detected.granularity;
      record.time_series = dataRows
        .map(r => ({
          label: r[0], gross_sales: parseNum(r[1]), refunds: parseNum(r[2]), discounts: parseNum(r[3]),
          net_sales: parseNum(r[4]), cost: parseNum(r[5]), profit: parseNum(r[6]), margin: parseNum(r[7]), taxes: parseNum(r[8]),
        }))
        // Drop zero-activity buckets, same as the native Order Volume
        // chart already does for hours with no orders.
        .filter(t => t.gross_sales > 0 || t.net_sales > 0);
    } else if (detected.type === 'category-sales-summary') {
      record.category_totals = dataRows.map(r => ({
        category: r[0], items_sold: parseNum(r[1]), gross_sales: parseNum(r[2]), refunds: parseNum(r[4]),
        discounts: parseNum(r[5]), net_sales: parseNum(r[6]), cost: parseNum(r[7]), profit: parseNum(r[8]), margin: parseNum(r[9]),
      }));
    } else if (detected.type === 'item-sales-summary') {
      record.item_totals = dataRows.map(r => ({
        name: r[0], sku: r[1], category: r[2], items_sold: parseNum(r[3]), gross_sales: parseNum(r[4]),
        refunds: parseNum(r[6]), discounts: parseNum(r[7]), net_sales: parseNum(r[8]), cost: parseNum(r[9]), profit: parseNum(r[10]), margin: parseNum(r[11]),
      }));
    } else if (detected.type === 'modifier-sales') {
      record.modifier_totals = dataRows.map(r => ({
        modifier: r[0], option: r[1], quantity_sold: parseNum(r[2]), gross_sales: parseNum(r[3]), net_sales: parseNum(r[6]),
      }));
    } else if (detected.type === 'payment-type-sales') {
      record.payment_totals = dataRows.map(r => ({
        payment_type: r[0], transactions: parseNum(r[1]), amount: parseNum(r[2]), net_amount: parseNum(r[5]), tips: parseNum(r[6]),
      }));
    }
  }

  record.total_items_sold = record.item_totals.reduce((s, i) => s + i.items_sold, 0);
  record.total_revenue = record.item_totals.reduce((s, i) => s + i.net_sales, 0);
  return record;
}

/** Best-effort label suggestion from a filename — strips Loyverse's known
 * report-type suffix and trailing date range, so
 * "WOOLFEST_2025_sales-summary-2025-05-22-2025-05-24.csv" suggests
 * "Woolfest 2025". Always shown as an editable field, never used blindly —
 * filename parsing is inherently fragile (this is a suggestion, not a
 * grouping mechanism; files are grouped by explicit user selection, not
 * by matching filenames against each other). */
export function suggestLabelFromFilename(filename) {
  const REPORT_SUFFIXES = ['sales-summary', 'category-sales-summary', 'item-sales-summary', 'modifier-sales', 'payment-type-sales'];
  let name = filename.replace(/\.csv$/i, '');
  for (const suffix of REPORT_SUFFIXES) {
    const idx = name.toLowerCase().indexOf('-' + suffix);
    if (idx > 0) { name = name.slice(0, idx); break; }
  }
  return name.replace(/[_-]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/** Escapes a CSV field per RFC4180 (wraps in quotes if it contains a
 * comma, quote, or newline; doubles any internal quotes). */
function csvField(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvField).join(',')];
  for (const row of rows) lines.push(row.map(csvField).join(','));
  return lines.join('\r\n');
}

const money = (n) => (Number(n) || 0).toFixed(2);
const pct = (n) => `${(Number(n) || 0).toFixed(2)}%`;

/**
 * Generates the 3 core Loyverse-format CSVs (Category Sales, Item Sales,
 * Sales Summary) from a report object shaped like a SalesImport record —
 * works for both a genuinely imported record and native BrewPOS data
 * computed via computeLoyverseStyleReport (src/lib/analytics.js), since
 * both share the same shape. Column order and headers match Loyverse's
 * own exports exactly, so a real Loyverse export and a BrewPOS export of
 * the same period can be directly compared or combined.
 */
export function exportLoyverseFormatCsvs(report) {
  const files = {};

  files['category-sales-summary.csv'] = toCsv(
    ['Category', 'Items sold', 'Gross sales', 'Items refunded', 'Refunds', 'Discounts', 'Net sales', 'Cost of goods', 'Gross profit', 'Margin', 'Taxes'],
    (report.category_totals || []).map(c => [
      c.category, c.items_sold.toFixed(3), money(c.gross_sales), '0.000', money(c.refunds),
      money(c.discounts), money(c.net_sales), money(c.cost), money(c.profit), pct(c.margin), money(c.taxes),
    ])
  );

  files['item-sales-summary.csv'] = toCsv(
    ['Item name', 'SKU', 'Category', 'Items sold', 'Gross sales', 'Items refunded', 'Refunds', 'Discounts', 'Net sales', 'Cost of goods', 'Gross profit', 'Margin', 'Taxes'],
    (report.item_totals || []).map(i => [
      i.name, i.sku || '', i.category || '', i.items_sold.toFixed(3), money(i.gross_sales), '0.000', money(i.refunds),
      money(i.discounts), money(i.net_sales), money(i.cost), money(i.profit), pct(i.margin), money(i.taxes),
    ])
  );

  const timeHeader = report.granularity === 'hourly' ? 'Time' : 'Date';
  files['sales-summary.csv'] = toCsv(
    [timeHeader, 'Gross sales', 'Refunds', 'Discounts', 'Net sales', 'Cost of goods', 'Gross profit', 'Margin', 'Taxes'],
    (report.time_series || []).map(t => [
      t.label, money(t.gross_sales), money(t.refunds), money(t.discounts),
      money(t.net_sales), money(t.cost), money(t.profit), pct(t.margin), money(t.taxes),
    ])
  );

  return files;
}

/** Triggers a browser download for each generated CSV. */
export function downloadLoyverseFormatCsvs(report, labelPrefix = 'brewpos') {
  const files = exportLoyverseFormatCsvs(report);
  const safePrefix = labelPrefix.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  for (const [filename, content] of Object.entries(files)) {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safePrefix}-${filename}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
