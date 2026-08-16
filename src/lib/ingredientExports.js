import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { CATEGORY_LABELS, getChartColor } from '@/lib/ingredientReports';

function downloadFile(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportCSV(transactions, summary, dateLabel) {
  const headers = ['Date', 'Ingredient', 'Category', 'Type', 'Quantity', 'Unit', 'Cost/Unit', 'Total Cost', 'Event', 'Notes'];
  const rows = transactions.map(t => [
    format(new Date(t.date), 'dd/MM/yyyy HH:mm'),
    t.ingredient_name || '',
    CATEGORY_LABELS[t.category] || t.category || '',
    t.transaction_type || '',
    t.quantity || 0,
    t.unit || '',
    (t.cost_per_unit || 0).toFixed(2),
    (t.total_cost || 0).toFixed(2),
    t.event_name || '',
    (t.notes || '').replace(/,/g, ';').replace(/\n/g, ' '),
  ]);
  const csv = [
    `Ingredient Cost Report - ${dateLabel}`,
    '',
    headers.join(','),
    ...rows.map(r => r.map(c => `"${c}"`).join(',')),
    '',
    `Total Cost,${(summary.total || 0).toFixed(2)}`,
    `Wastage Cost,${(summary.wastage || 0).toFixed(2)}`,
    `Purchase Cost,${(summary.purchases || 0).toFixed(2)}`,
    `Usage Cost,${(summary.usage || 0).toFixed(2)}`,
    `Total Transactions,${summary.count || 0}`,
    `Wastage %,${(summary.wastagePct || 0).toFixed(1)}`,
  ].join('\n');
  downloadFile('\uFEFF' + csv, 'text/csv;charset=utf-8', `ingredient-report-${dateLabel}.csv`);
}

export function exportPDF(transactions, summary, categoryData, dateLabel) {
  const doc = new jsPDF();
  doc.setFontSize(20); doc.text('Ingredient Cost Report', 14, 22);
  doc.setFontSize(12); doc.text(dateLabel, 14, 30);
  doc.setFontSize(10);
  doc.text(`Total: $${(summary.total || 0).toFixed(2)}`, 14, 45);
  doc.text(`Wastage: $${(summary.wastage || 0).toFixed(2)} (${(summary.wastagePct || 0).toFixed(1)}%)`, 80, 45);
  doc.text(`Transactions: ${summary.count}`, 150, 45);

  let y = 58;
  doc.setFontSize(14); doc.text('Cost by Category', 14, y); y += 8;
  doc.setFontSize(9);
  doc.text('Category', 14, y); doc.text('Cost', 90, y); doc.text('Wastage', 130, y); y += 5;
  doc.line(14, y, 180, y); y += 6;
  for (const c of categoryData) {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(CATEGORY_LABELS[c.name] || c.name, 14, y);
    doc.text(`$${c.cost.toFixed(2)}`, 90, y);
    doc.text(`$${c.wastage.toFixed(2)}`, 130, y);
    y += 6;
  }

  y += 10;
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFontSize(14); doc.text('Transactions', 14, y); y += 8;
  doc.setFontSize(8);
  doc.text('Date', 14, y); doc.text('Ingredient', 45, y); doc.text('Type', 105, y);
  doc.text('Qty', 135, y); doc.text('Total', 160, y); y += 5;
  doc.line(14, y, 180, y); y += 6;
  for (const t of transactions) {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(format(new Date(t.date), 'dd/MM/yy'), 14, y);
    doc.text((t.ingredient_name || '').substring(0, 28), 45, y);
    doc.text(t.transaction_type || '', 105, y);
    doc.text(`${t.quantity || 0} ${t.unit || ''}`, 135, y);
    doc.text(`$${(t.total_cost || 0).toFixed(2)}`, 160, y);
    y += 6;
  }
  doc.save(`ingredient-report-${dateLabel}.pdf`);
}

export function exportDOCX(transactions, summary, categoryData, dateLabel) {
  const txRows = transactions.map(t => `<tr>
    <td>${format(new Date(t.date), 'dd/MM/yyyy HH:mm')}</td>
    <td>${t.ingredient_name || ''}</td>
    <td>${CATEGORY_LABELS[t.category] || t.category || ''}</td>
    <td>${t.transaction_type || ''}</td>
    <td>${t.quantity || 0} ${t.unit || ''}</td>
    <td>$${(t.cost_per_unit || 0).toFixed(2)}</td>
    <td>$${(t.total_cost || 0).toFixed(2)}</td>
    <td>${t.event_name || ''}</td>
    <td>${(t.notes || '').replace(/</g, '&lt;')}</td>
  </tr>`).join('');
  const catRows = categoryData.map(c => `<tr>
    <td>${CATEGORY_LABELS[c.name] || c.name}</td>
    <td>$${c.cost.toFixed(2)}</td>
    <td>$${c.wastage.toFixed(2)}</td>
  </tr>`).join('');
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>Ingredient Cost Report</title>
<style>
body{font-family:Calibri,Arial;font-size:11pt}
h1{font-size:20pt;color:#333}h2{font-size:14pt;color:#555;margin-top:20px}
table{border-collapse:collapse;width:100%;margin:10px 0}
th,td{border:1px solid #999;padding:4px 8px;font-size:9pt}
th{background:#f0f0f0;font-weight:bold}
.summary span{display:inline-block;margin-right:30px;font-weight:bold}
</style></head><body>
<h1>Ingredient Cost Report</h1><h2>${dateLabel}</h2>
<div class="summary">
<span>Total: $${(summary.total || 0).toFixed(2)}</span>
<span>Wastage: $${(summary.wastage || 0).toFixed(2)}</span>
<span>Purchases: $${(summary.purchases || 0).toFixed(2)}</span>
<span>Transactions: ${summary.count}</span>
</div>
<h2>Cost by Category</h2>
<table><tr><th>Category</th><th>Cost</th><th>Wastage</th></tr>${catRows}</table>
<h2>Transactions</h2>
<table><tr><th>Date</th><th>Ingredient</th><th>Category</th><th>Type</th><th>Quantity</th><th>Cost/Unit</th><th>Total</th><th>Event</th><th>Notes</th></tr>${txRows}</table>
</body></html>`;
  downloadFile(html, 'application/msword', `ingredient-report-${dateLabel}.doc`);
}

export function exportEmail(transactions, summary, dateLabel) {
  const subject = `Ingredient Cost Report - ${dateLabel}`;
  const body = `INGREDIENT COST REPORT - ${dateLabel}\n\n` +
    `Total Cost: $${(summary.total || 0).toFixed(2)}\n` +
    `Wastage Cost: $${(summary.wastage || 0).toFixed(2)} (${(summary.wastagePct || 0).toFixed(1)}%)\n` +
    `Purchase Cost: $${(summary.purchases || 0).toFixed(2)}\n` +
    `Usage Cost: $${(summary.usage || 0).toFixed(2)}\n` +
    `Total Transactions: ${summary.count}\n\n` +
    `View the full report in your BrewPOS dashboard.`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// === Ingredients List Export ===
export function exportIngredientsCSV(ingredients) {
  const headers = ['Name', 'Category', 'Stock', 'Unit', 'Cost/Unit', 'Stock Value', 'Min Stock', 'Supplier'];
  const rows = ingredients.map(i => [
    i.name || '', CATEGORY_LABELS[i.category] || i.category || '',
    i.current_stock || 0, i.unit || '',
    (i.cost_per_unit || 0).toFixed(2),
    ((i.current_stock || 0) * (i.cost_per_unit || 0)).toFixed(2),
    i.min_stock || 0, i.supplier || '',
  ]);
  const totalValue = ingredients.reduce((s, i) => s + (i.current_stock || 0) * (i.cost_per_unit || 0), 0);
  const lowStock = ingredients.filter(i => i.min_stock > 0 && (i.current_stock || 0) <= i.min_stock).length;
  const csv = [
    'Ingredient Inventory Export', format(new Date(), 'dd/MM/yyyy HH:mm'), '',
    headers.join(','),
    ...rows.map(r => r.map(c => `"${c}"`).join(',')), '',
    `Total Stock Value,${totalValue.toFixed(2)}`,
    `Total Ingredients,${ingredients.length}`,
    `Low Stock Items,${lowStock}`,
  ].join('\n');
  downloadFile('\uFEFF' + csv, 'text/csv;charset=utf-8', 'ingredients-export.csv');
}

export function exportIngredientsPDF(ingredients) {
  const doc = new jsPDF();
  doc.setFontSize(20); doc.text('Ingredient Inventory', 14, 22);
  doc.setFontSize(10); doc.text(format(new Date(), 'dd/MM/yyyy HH:mm'), 14, 30);
  const totalValue = ingredients.reduce((s, i) => s + (i.current_stock || 0) * (i.cost_per_unit || 0), 0);
  const lowStock = ingredients.filter(i => i.min_stock > 0 && (i.current_stock || 0) <= i.min_stock).length;
  doc.text(`Total Value: $${totalValue.toFixed(2)}`, 14, 42);
  doc.text(`Items: ${ingredients.length}`, 80, 42);
  doc.text(`Low Stock: ${lowStock}`, 120, 42);
  let y = 55;
  doc.setFontSize(9);
  doc.text('Name', 14, y); doc.text('Category', 70, y); doc.text('Stock', 110, y); doc.text('Cost/Unit', 135, y); doc.text('Value', 170, y); y += 5;
  doc.line(14, y, 196, y); y += 6;
  for (const i of ingredients) {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.text((i.name || '').substring(0, 28), 14, y);
    doc.text((CATEGORY_LABELS[i.category] || i.category || '').substring(0, 18), 70, y);
    doc.text(`${i.current_stock || 0} ${i.unit || ''}`, 110, y);
    doc.text(`$${(i.cost_per_unit || 0).toFixed(2)}`, 135, y);
    doc.text(`$${((i.current_stock || 0) * (i.cost_per_unit || 0)).toFixed(2)}`, 170, y);
    y += 6;
  }
  doc.save('ingredients-export.pdf');
}

export function exportIngredientsDOCX(ingredients) {
  const rows = ingredients.map(i => `<tr>
    <td>${i.name || ''}</td><td>${CATEGORY_LABELS[i.category] || i.category || ''}</td>
    <td>${i.current_stock || 0} ${i.unit || ''}</td><td>$${(i.cost_per_unit || 0).toFixed(2)}</td>
    <td>$${((i.current_stock || 0) * (i.cost_per_unit || 0)).toFixed(2)}</td>
    <td>${i.min_stock || 0}</td><td>${i.supplier || ''}</td></tr>`).join('');
  const totalValue = ingredients.reduce((s, i) => s + (i.current_stock || 0) * (i.cost_per_unit || 0), 0);
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>Ingredient Inventory</title>
<style>body{font-family:Calibri,Arial;font-size:11pt}h1{font-size:20pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px 8px;font-size:9pt}th{background:#f0f0f0}</style></head><body>
<h1>Ingredient Inventory</h1><p>Total Stock Value: $${totalValue.toFixed(2)} · Items: ${ingredients.length}</p>
<table><tr><th>Name</th><th>Category</th><th>Stock</th><th>Cost/Unit</th><th>Stock Value</th><th>Min Stock</th><th>Supplier</th></tr>${rows}</table>
</body></html>`;
  downloadFile(html, 'application/msword', 'ingredients-export.doc');
}

export function exportIngredientsEmail(ingredients) {
  const totalValue = ingredients.reduce((s, i) => s + (i.current_stock || 0) * (i.cost_per_unit || 0), 0);
  const lowStock = ingredients.filter(i => i.min_stock > 0 && (i.current_stock || 0) <= i.min_stock).length;
  const subject = 'Ingredient Inventory Export';
  const body = `INGREDIENT INVENTORY EXPORT\n${format(new Date(), 'dd/MM/yyyy HH:mm')}\n\n` +
    `Total Items: ${ingredients.length}\nTotal Stock Value: $${totalValue.toFixed(2)}\nLow Stock Items: ${lowStock}\n\n` +
    `View the full inventory in your dashboard.`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// === Events Export ===
export function exportEventsCSV(events) {
  const headers = ['Name', 'Start Date', 'End Date', 'Description'];
  const rows = events.map(e => [
    e.name || '', format(new Date(e.start_date), 'dd/MM/yyyy'),
    format(new Date(e.end_date), 'dd/MM/yyyy'),
    (e.description || '').replace(/,/g, ';').replace(/\n/g, ' '),
  ]);
  const csv = ['Events Export', format(new Date(), 'dd/MM/yyyy HH:mm'), '',
    headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(',')), '', `Total Events,${events.length}`].join('\n');
  downloadFile('\uFEFF' + csv, 'text/csv;charset=utf-8', 'events-export.csv');
}

export function exportEventsPDF(events) {
  const doc = new jsPDF();
  doc.setFontSize(20); doc.text('Events Export', 14, 22);
  doc.setFontSize(10); doc.text(format(new Date(), 'dd/MM/yyyy HH:mm'), 14, 30);
  doc.text(`Total Events: ${events.length}`, 14, 42);
  let y = 55;
  doc.setFontSize(9);
  doc.text('Name', 14, y); doc.text('Start Date', 90, y); doc.text('End Date', 130, y); y += 5;
  doc.line(14, y, 180, y); y += 6;
  for (const e of events) {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.text((e.name || '').substring(0, 35), 14, y);
    doc.text(format(new Date(e.start_date), 'dd/MM/yyyy'), 90, y);
    doc.text(format(new Date(e.end_date), 'dd/MM/yyyy'), 130, y);
    y += 6;
  }
  doc.save('events-export.pdf');
}

export function exportEventsDOCX(events) {
  const rows = events.map(e => `<tr><td>${e.name || ''}</td><td>${format(new Date(e.start_date), 'dd/MM/yyyy')}</td><td>${format(new Date(e.end_date), 'dd/MM/yyyy')}</td><td>${(e.description || '').replace(/</g, '&lt;')}</td></tr>`).join('');
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>Events Export</title>
<style>body{font-family:Calibri,Arial;font-size:11pt}h1{font-size:20pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px 8px;font-size:9pt}th{background:#f0f0f0}</style></head><body>
<h1>Events Export</h1><p>Total Events: ${events.length}</p>
<table><tr><th>Name</th><th>Start Date</th><th>End Date</th><th>Description</th></tr>${rows}</table>
</body></html>`;
  downloadFile(html, 'application/msword', 'events-export.doc');
}

export function exportEventsEmail(events) {
  const subject = 'Events Export';
  const body = `EVENTS EXPORT\n${format(new Date(), 'dd/MM/yyyy HH:mm')}\n\nTotal Events: ${events.length}\n\n` +
    events.map(e => `• ${e.name} (${format(new Date(e.start_date), 'dd/MM/yyyy')} — ${format(new Date(e.end_date), 'dd/MM/yyyy')})`).join('\n');
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}