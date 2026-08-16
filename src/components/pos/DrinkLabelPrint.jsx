import { format } from 'date-fns';
import { DEFAULT_PRINTER, normalizePrinter } from '@/components/pos/LabelPrinterSettings';
import { sizeNameLine, buildModifierLines } from '@/lib/drinkLines';
import { computeLabelFit, scaledFontPt } from '@/lib/labelFit';
import { resolveQrDataUrl } from '@/lib/qrCode';

// MM to px conversion for preview rendering (96dpi screen)
const MM_TO_PX = 3.7795275591;

export function mmToPx(mm) {
  return Math.round(Number(mm) * MM_TO_PX);
}

// Returns a string for most fields, but an ARRAY of strings for 'modifiers' (one per modifier line)
function getFieldContent(key, item, orderNumber, labelIndex, labelTotal, now, qrDataUrl) {
  switch (key) {
    case 'order_number': return `#${orderNumber}`;
    case 'time':         return now;
    case 'size':
      // Size is merged into item_name (Line 1) — render nothing here so no blank line.
      return '';
    case 'item_name':
      // Line 1: Size word + drink name combined (e.g. "Large Latte").
      return sizeNameLine(item);
    case 'modifiers': {
      // Ordered modifier lines (Alt Milk, Sugar, Flavour Shots, Espresso shots,
      // then any other selected groups). Size & Comments excluded.
      return buildModifierLines(item);
    }
    case 'comments': {
      const c = item.notes || (item.modifiers || []).find(m => m.name === 'Comments')?.option;
      return c ? `★ ${c}` : '';
    }
    case 'label_count': return `${labelIndex} / ${labelTotal}`;
    case 'qr_code':      return qrDataUrl || '';
    default: return '';
  }
}

// Build a structured label data object for both HTML print and React preview.
// Modifier fields are expanded into one entry per modifier line.
export function buildLabelData(item, orderNumber, labelIndex, labelTotal, printer, qrDataUrl = '') {
  const now = format(new Date(), 'HH:mm');
  const fields = (printer.fields || []).filter(f => f.key !== 'customer');
  const visibleFields = fields.map(f => {
    if (f.key === 'label_count') return { ...f, visible: true };
    if (f.key === 'qr_code' && qrDataUrl) return { ...f, visible: true };
    return f;
  }).filter(f => f.visible !== false);

  const expandedFields = [];
  for (const f of visibleFields) {
    const content = getFieldContent(f.key, item, orderNumber, labelIndex, labelTotal, now, qrDataUrl);
    if (Array.isArray(content)) {
      // Each modifier on its own line
      for (const line of content) {
        if (line) expandedFields.push({ ...f, content: line });
      }
    } else {
      expandedFields.push({ ...f, content });
    }
  }

  return { printer, fields: expandedFields };
}

function renderLabelHtml(item, orderNumber, p, labelIndex, labelTotal, qrDataUrl) {
  const data = buildLabelData(item, orderNumber, labelIndex, labelTotal, p, qrDataUrl);
  const { fields } = data;
  const pad  = Number(p.padding_mm) || 1.5;
  const w    = Number(p.width_mm)   || 50;
  const h    = Number(p.height_mm)  || 30;
  const font = p.font_family        || 'Arial';
  const fit = computeLabelFit(p, fields);
  const scaled = fit.scale < 1;

  const HEADER_KEYS = ['order_number', 'time'];
  const FOOTER_KEYS = ['label_count'];

  const headerFields = fields.filter(f => HEADER_KEYS.includes(f.key));
  const footerFields = fields.filter(f => FOOTER_KEYS.includes(f.key));
  const bodyFields   = fields.filter(f => !HEADER_KEYS.includes(f.key) && !FOOTER_KEYS.includes(f.key));

  const fieldHtml = (f) => {
    if (!f.content) return '';
    if (f.key === 'qr_code') {
      const qrSize = Math.min(Number(p.width_mm) * 0.28, Number(p.height_mm) * 0.55, 15);
      return `<div style="display:flex;justify-content:center;width:100%;"><img src="${f.content}" style="width:${qrSize}mm;height:${qrSize}mm;object-fit:contain;" /></div>`;
    }
    const fs = scaledFontPt(f.font_size_pt, fit.scale);
    const fw = f.bold ? 'bold' : 'normal';
    const ta = f.align || 'left';
    const fi = f.key === 'comments' ? 'italic' : 'normal';
    return `<div style="font-size:${fs}pt;font-weight:${fw};text-align:${ta};font-style:${fi};line-height:${fit.lineHeight};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;">${f.content}</div>`;
  };

  const headerHtml = headerFields.length ? `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%;gap:2px;">
      <div style="flex:1;min-width:0;">${headerFields[0] ? fieldHtml(headerFields[0]) : ''}</div>
      <div style="flex-shrink:0;">${headerFields[1] ? fieldHtml(headerFields[1]) : ''}</div>
    </div>` : '';

  const bodyHtml = bodyFields.map(fieldHtml).join('');

  const footerHtml = footerFields.length ? `
    <div style="display:flex;justify-content:flex-end;width:100%;">
      ${fieldHtml(footerFields[0])}
    </div>` : '';

  // When fit-to-size scales content, vertically centre the whole block within
  // height_mm. When content already fits, keep the existing space-between layout.
  if (scaled) {
    return `<div style="width:${w}mm;height:${h}mm;padding:${pad}mm ${pad * 1.5}mm;font-family:'${font}',Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;overflow:hidden;box-sizing:border-box;page-break-after:always;">
      <div style="display:flex;flex-direction:column;width:100%;">${headerHtml}${bodyHtml}${footerHtml}</div>
    </div>`;
  }
  return `<div style="width:${w}mm;height:${h}mm;padding:${pad}mm ${pad * 1.5}mm;font-family:'${font}',Arial,sans-serif;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;box-sizing:border-box;page-break-after:always;">
    ${headerHtml}
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;overflow:hidden;width:100%;">
      ${bodyHtml}
    </div>
    ${footerHtml}
  </div>`;
}

export async function printDrinkLabels(jobs, orderNumber, settings = {}, labelTotal) {
  const printer = normalizePrinter(
    (settings.label_printers && settings.label_printers.length > 0)
      ? settings.label_printers[0]
      : DEFAULT_PRINTER
  );

  const w = Number(printer.width_mm)  || 50;
  const h = Number(printer.height_mm) || 30;

  // jobs are pre-expanded and pre-numbered against the WHOLE order, so the
  // label_count field stays consistent across printers and browser fallback.
  const total = labelTotal || jobs.length;

  // Open window first (within the user gesture) to avoid popup blockers.
  const win = window.open('', '_blank');
  if (!win) return;

  let qrDataUrl = '';
  if (settings.label_qr_enabled) {
    qrDataUrl = await resolveQrDataUrl(settings);
  }

  const labelsHtml = jobs
    .map(job => renderLabelHtml(job.item, orderNumber, printer, job.labelIndex, total, qrDataUrl))
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Labels #${orderNumber}</title>
  <style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; width: ${w}mm; height: ${h}mm; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>${labelsHtml}</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    win.focus();
    win.print();
    win.addEventListener('afterprint', () => win.close());
  }, 500);
}