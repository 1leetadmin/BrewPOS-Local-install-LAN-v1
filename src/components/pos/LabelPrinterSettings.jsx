import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ChevronUp, ChevronDown, ChevronRight, Plus, Trash2, Eye, EyeOff, Printer, Bluetooth, Usb, Wifi, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mmToPx } from '@/components/pos/DrinkLabelPrint';
import { computeLabelFit, scaledFontPt } from '@/lib/labelFit';
import { getPrinterList } from '@/lib/localPrinter';
import { useSettingsQrCode } from '@/lib/qrCode';

const FONT_FAMILIES = [
  'Arial', 'Arial Black', 'Arial Narrow', 'Calibri', 'Cambria', 'Candara',
  'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Franklin Gothic Medium',
  'Georgia', 'Gill Sans MT', 'Impact', 'Lucida Console', 'Lucida Sans Unicode',
  'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe UI', 'Segoe UI Semibold',
  'Segoe UI Light', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
];
const ALIGNS = ['left', 'center', 'right'];

export const DEFAULT_LABEL_FIELDS = [
  { key: 'order_number', label: 'Order #',           visible: true,  font_size_pt: 17,  bold: true,  align: 'left'   },
  { key: 'time',         label: 'Time',              visible: true,  font_size_pt: 7,   bold: false, align: 'right'  },
  { key: 'size',         label: 'Size',              visible: true,  font_size_pt: 17,  bold: true,  align: 'center' },
  { key: 'item_name',    label: 'Item Name',         visible: true,  font_size_pt: 17,  bold: true,  align: 'center' },
  { key: 'modifiers',    label: 'Modifiers',         visible: true,  font_size_pt: 17,  bold: false, align: 'center' },
  { key: 'comments',     label: 'Comments',          visible: true,  font_size_pt: 17,  bold: false, align: 'center' },
  { key: 'label_count',  label: 'Label Count (1/3)', visible: true,  font_size_pt: 17,  bold: true,  align: 'right'  },
  { key: 'qr_code',      label: 'QR Code',            visible: false, font_size_pt: 7,   bold: false, align: 'center' },
];

export const DEFAULT_PRINTER = {
  id: 'default',
  name: 'Default Label Printer',
  width_mm: 50,
  height_mm: 50,
  font_family: 'Arial Black',
  padding_mm: 1.5,
  connection_type: 'usb',
  os_printer_name: '',
  lan_address: '',
  fields: DEFAULT_LABEL_FIELDS.map(f => ({ ...f })),
};

function makePrinter() {
  return {
    id: `lp_${Date.now()}`,
    name: 'New Label Printer',
    width_mm: 50,
    height_mm: 50,
    font_family: 'Arial Black',
    padding_mm: 1.5,
    connection_type: 'usb',
    os_printer_name: '',
    lan_address: '',
    fields: DEFAULT_LABEL_FIELDS.map(f => ({ ...f })),
  };
}

// Normalize printer data from DB — preserves stored field order, fills missing fields at the end.
export function normalizePrinter(p) {
  if (!p) return { ...DEFAULT_PRINTER, fields: DEFAULT_LABEL_FIELDS.map(f => ({ ...f })) };

  const storedFields = Array.isArray(p.fields) && p.fields.length > 0 ? p.fields : null;

  let fields;
  if (storedFields) {
    // Keep stored fields exactly as-is (preserving user order and settings),
    // then append any default fields that are missing from the stored set.
    const storedKeys = storedFields.map(f => f.key);
    const missing = DEFAULT_LABEL_FIELDS.filter(d => !storedKeys.includes(d.key));
    fields = [
      ...storedFields.map(f => ({
        ...f,
        font_size_pt: Number(f.font_size_pt) || 7,
        visible: f.visible !== false,
      })),
      ...missing,
    ];
  } else {
    fields = DEFAULT_LABEL_FIELDS.map(f => ({ ...f }));
  }

  return {
    ...p,
    width_mm:    Number(p.width_mm)   || 50,
    height_mm:   Number(p.height_mm)  || 30,
    padding_mm:  Number(p.padding_mm) || 1.5,
    font_family: p.font_family        || 'Arial',
    // Printers configured before USB/LAN support existed have no
    // connection_type at all — default them to 'usb' so they route through
    // the local print server (the common case for thermal label printers).
    connection_type: p.connection_type || 'usb',
    os_printer_name: p.os_printer_name || '',
    lan_address: p.lan_address || '',
    fields,
  };
}

function FieldRow({ field, idx, total, onChangeField, onMove }) {
  return (
    <div className={cn(
      "flex items-center gap-2 p-2 rounded-lg border text-sm",
      field.visible ? "bg-card border-border" : "bg-muted/40 border-dashed border-muted-foreground/30 opacity-60"
    )}>
      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={() => onMove(idx, -1)} disabled={idx === 0}
          className="w-5 h-5 flex items-center justify-center hover:bg-muted rounded disabled:opacity-20">
          <ChevronUp className="w-3 h-3" />
        </button>
        <button onClick={() => onMove(idx, 1)} disabled={idx === total - 1}
          className="w-5 h-5 flex items-center justify-center hover:bg-muted rounded disabled:opacity-20">
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      <button onClick={() => onChangeField(idx, 'visible', !field.visible)}
        className="shrink-0 text-muted-foreground hover:text-foreground">
        {field.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>

      <span className="w-32 font-medium text-xs shrink-0">{field.label}</span>

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-muted-foreground">pt</span>
        <input
          type="number" step="0.5" min="4" max="30"
          value={field.font_size_pt}
          onChange={e => onChangeField(idx, 'font_size_pt', parseFloat(e.target.value) || 7)}
          className="w-12 h-6 text-xs border border-input rounded px-1.5 bg-background"
        />
      </div>

      <button
        onClick={() => onChangeField(idx, 'bold', !field.bold)}
        className={cn(
          "w-6 h-6 text-xs font-bold border rounded flex items-center justify-center shrink-0",
          field.bold ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
        )}
      >B</button>

      <div className="flex gap-0.5 shrink-0">
        {ALIGNS.map(a => (
          <button key={a} onClick={() => onChangeField(idx, 'align', a)}
            className={cn(
              "w-6 h-6 text-xs border rounded flex items-center justify-center",
              field.align === a ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
            )}
          >
            {a === 'left' ? '⬅' : a === 'center' ? '↔' : '➡'}
          </button>
        ))}
      </div>
    </div>
  );
}

const PREVIEW_HEADER_KEYS = ['order_number', 'time'];
const PREVIEW_FOOTER_KEYS = ['label_count'];

// Sample data so the preview shows realistic content, not just field names.
// modifiers is an array — one entry per line.
const SAMPLE_DATA = {
  order_number: '#042',
  time: '14:35',
  size: 'MEDIUM',
  item_name: 'FLAT WHITE',
  modifiers: ['Oat Milk', 'Extra Shot'],
  comments: '★ No sugar',
  label_count: '2 / 3',
};

function LiveLabelPreview({ printer, qrDataUrl }) {
  const w    = Number(printer.width_mm)   || 50;
  const h    = Number(printer.height_mm)  || 30;
  const pad  = Number(printer.padding_mm) || 1.5;
  const font = printer.font_family        || 'Arial';

  const scale  = Math.min(360 / mmToPx(w), 2.0);
  const pxW    = mmToPx(w)       * scale;
  const pxH    = mmToPx(h)       * scale;
  const pxPad  = mmToPx(pad)     * scale;
  const pxPadW = mmToPx(pad * 1.5) * scale;

  // Expand fields, splitting modifier arrays into one entry per line
  const expandedFields = [];
  for (const f of (printer.fields || [])) {
    const field = f.key === 'label_count' ? { ...f, visible: true } : f;
    if (field.visible === false) continue;
    if (field.key === 'qr_code') {
      expandedFields.push({ ...field, _lineKey: field.key, content: qrDataUrl });
      continue;
    }
    const sample = SAMPLE_DATA[field.key];
    if (Array.isArray(sample)) {
      sample.forEach((line, i) => expandedFields.push({ ...field, _lineKey: `${field.key}_${i}`, content: line }));
    } else {
      expandedFields.push({ ...field, _lineKey: field.key, content: sample || '' });
    }
  }

  // Fit-to-size: same logic as the printed label (src/lib/labelFit.js) so the
  // preview never shows a layout that would overflow on the actual print.
  const fit = computeLabelFit(printer, expandedFields);
  const scaled = fit.scale < 1;

  const headerFields = expandedFields.filter(f => PREVIEW_HEADER_KEYS.includes(f.key));
  const footerFields = expandedFields.filter(f => PREVIEW_FOOTER_KEYS.includes(f.key));
  const bodyFields   = expandedFields.filter(f => !PREVIEW_HEADER_KEYS.includes(f.key) && !PREVIEW_FOOTER_KEYS.includes(f.key));

  const FieldLine = ({ f }) => {
    if (!f.content) return null;
    if (f.key === 'qr_code') {
      const qrSize = Math.min(pxW * 0.25, pxH * 0.5);
      return (
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
          <img src={f.content} style={{ width: `${qrSize}px`, height: `${qrSize}px`, objectFit: 'contain' }} alt="QR" />
        </div>
      );
    }
    return (
      <div style={{
        fontSize:     `${scaledFontPt(f.font_size_pt, fit.scale) * scale * 1.33}px`,
        fontWeight:   f.bold ? 'bold' : 'normal',
        textAlign:    f.align || 'left',
        fontStyle:    f.key === 'comments' ? 'italic' : 'normal',
        lineHeight:   fit.lineHeight,
        whiteSpace:   'nowrap',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        width:        '100%',
      }}>{f.content}</div>
    );
  };

  return (
    <div className="flex flex-col items-center gap-1 pt-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Live Preview</p>
      <div style={{
        width:         `${pxW}px`,
        height:        `${pxH}px`,
        padding:       `${pxPad}px ${pxPadW}px`,
        fontFamily:    `'${font}', Arial, sans-serif`,
        display:       'flex',
        flexDirection: 'column',
        justifyContent: scaled ? 'center' : 'space-between',
        overflow:      'hidden',
        boxSizing:     'border-box',
        background:    'white',
        border:        '1px solid #ccc',
        borderRadius:  4,
        boxShadow:     '0 2px 8px rgba(0,0,0,0.12)',
        color:         '#000',
      }}>
        {scaled ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {headerFields.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 2 }}>
                <div style={{ flex: 1, minWidth: 0 }}><FieldLine f={headerFields[0]} /></div>
                {headerFields[1] && <div style={{ flexShrink: 0 }}><FieldLine f={headerFields[1]} /></div>}
              </div>
            )}
            {bodyFields.map(f => <FieldLine key={f._lineKey} f={f} />)}
            {footerFields.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                <FieldLine f={footerFields[0]} />
              </div>
            )}
          </div>
        ) : (
          <>
            {headerFields.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 2 }}>
                <div style={{ flex: 1, minWidth: 0 }}><FieldLine f={headerFields[0]} /></div>
                {headerFields[1] && <div style={{ flexShrink: 0 }}><FieldLine f={headerFields[1]} /></div>}
              </div>
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden', width: '100%' }}>
              {bodyFields.map(f => <FieldLine key={f._lineKey} f={f} />)}
            </div>
            {footerFields.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                <FieldLine f={footerFields[0]} />
              </div>
            )}
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{w}mm × {h}mm · {font}{scaled ? ' · fit-to-size' : ''}</p>
    </div>
  );
}

function PrinterEditor({ printer, onChange, onDelete, canDelete, osPrinters, osPrintersLoading, onRefreshOsPrinters, qrDataUrl }) {
  const [fieldsOpen, setFieldsOpen] = useState(true);
  const set = (key, value) => onChange({ ...printer, [key]: value });

  const setField = (idx, key, value) => {
    const fields = printer.fields.map((f, i) => i === idx ? { ...f, [key]: value } : f);
    onChange({ ...printer, fields });
  };

  const moveField = (idx, dir) => {
    const next = idx + dir;
    if (next < 0 || next >= printer.fields.length) return;
    const fields = [...printer.fields];
    [fields[idx], fields[next]] = [fields[next], fields[idx]];
    onChange({ ...printer, fields });
  };

  const w = Number(printer.width_mm) || 50;
  const h = Number(printer.height_mm) || 30;

  return (
    <div className="space-y-4 p-4 border border-border rounded-xl bg-muted/20">
      <div className="flex items-center gap-3">
        <Printer className="w-4 h-4 text-primary shrink-0" />
        <Input value={printer.name} onChange={e => set('name', e.target.value)} className="h-8 font-semibold" placeholder="Display name (e.g. Kitchen Printer)" />
        {canDelete && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Connection</Label>
          <Select value={printer.connection_type || 'usb'} onValueChange={v => set('connection_type', v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="usb"><span className="flex items-center gap-1.5"><Usb className="w-3.5 h-3.5" /> USB</span></SelectItem>
              <SelectItem value="lan"><span className="flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5" /> Network (LAN)</span></SelectItem>
              <SelectItem value="bluetooth"><span className="flex items-center gap-1.5"><Bluetooth className="w-3.5 h-3.5" /> Bluetooth (legacy)</span></SelectItem>
            </SelectContent>
          </Select>
        </div>
        {printer.connection_type === 'lan' && (
          <div className="space-y-1">
            <Label className="text-xs">Printer IP Address</Label>
            <Input value={printer.lan_address || ''} onChange={e => set('lan_address', e.target.value)}
              placeholder="192.168.1.51" className="h-8 text-sm" />
          </div>
        )}
        {printer.connection_type === 'usb' && (
          <div className="space-y-1 col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">USB Printer</Label>
              <button onClick={onRefreshOsPrinters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                {osPrintersLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh list
              </button>
            </div>
            <Select value={printer.os_printer_name || ''} onValueChange={v => set('os_printer_name', v)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={osPrintersLoading ? 'Loading printers…' : 'Select the exact Windows printer'} />
              </SelectTrigger>
              <SelectContent>
                {osPrinters.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Must match Windows Printers &amp; Scanners exactly — pick it from this list, don’t type it</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Width (mm)</Label>
          <Input type="number" step="0.5" value={w}
            onChange={e => set('width_mm', parseFloat(e.target.value) || 50)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Height (mm)</Label>
          <Input type="number" step="0.5" value={h}
            onChange={e => set('height_mm', parseFloat(e.target.value) || 30)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Padding (mm)</Label>
          <Input type="number" step="0.5" value={Number(printer.padding_mm) || 1.5}
            onChange={e => set('padding_mm', parseFloat(e.target.value) || 1.5)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Font Family</Label>
          <Select value={printer.font_family || 'Arial'} onValueChange={v => set('font_family', v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <div>
        <button
          onClick={() => setFieldsOpen(v => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 hover:text-foreground w-full"
        >
          {fieldsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Label Fields — reorder, set font size &amp; alignment
        </button>
        {fieldsOpen && (
          <div className="space-y-1.5">
            {printer.fields.map((field, idx) => (
              <FieldRow key={field.key} field={field} idx={idx} total={printer.fields.length}
                onChangeField={setField} onMove={moveField} />
            ))}
          </div>
        )}
      </div>

      {/* Live preview — uses same render logic as print output */}
      <LiveLabelPreview printer={printer} qrDataUrl={qrDataUrl} />
    </div>
  );
}

export default function LabelPrinterSettings({ printers, onChange, settings }) {
  const [osPrinters, setOsPrinters] = useState([]);
  const [osPrintersLoading, setOsPrintersLoading] = useState(false);
  const qrDataUrl = useSettingsQrCode(settings);

  const refreshOsPrinters = useCallback(async () => {
    setOsPrintersLoading(true);
    const { printers } = await getPrinterList();
    setOsPrinters(printers || []);
    setOsPrintersLoading(false);
  }, []);

  useEffect(() => { refreshOsPrinters(); }, [refreshOsPrinters]);

  // printers is the source of truth — already normalized by Settings.jsx on init
  return (
    <div className="space-y-4">
      {printers.map((printer, idx) => (
        <PrinterEditor
          key={printer.id || idx}
          printer={printer}
          osPrinters={osPrinters}
          osPrintersLoading={osPrintersLoading}
          onRefreshOsPrinters={refreshOsPrinters}
          qrDataUrl={qrDataUrl}
          onChange={updated => {
            const next = [...printers];
            next[idx] = updated;
            onChange(next);
          }}
          onDelete={() => onChange(printers.filter((_, i) => i !== idx))}
          canDelete={printers.length > 1}
        />
      ))}
      <Button variant="outline" size="sm" className="gap-2 w-full" onClick={() => onChange([...printers, makePrinter()])}>
        <Plus className="w-4 h-4" /> Add Another Label Printer
      </Button>
    </div>
  );
}