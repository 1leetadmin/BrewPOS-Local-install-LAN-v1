import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { buildLabelData, mmToPx } from '@/components/pos/DrinkLabelPrint';
import { normalizePrinter, DEFAULT_PRINTER } from '@/components/pos/LabelPrinterSettings';
import { computeLabelFit, scaledFontPt } from '@/lib/labelFit';
import { useSettingsQrCode } from '@/lib/qrCode';

const HEADER_KEYS = ['order_number', 'time'];
const FOOTER_KEYS = ['label_count'];

function LabelPreview({ labelData }) {
  const { printer, fields } = labelData;
  const w   = Number(printer.width_mm)   || 50;
  const h   = Number(printer.height_mm)  || 30;
  const pad = Number(printer.padding_mm) || 1.5;
  const font = printer.font_family || 'Arial';

  // Scale to fit preview area (max 420px wide)
  const scale = Math.min(420 / mmToPx(w), 1.8);
  const pxW = mmToPx(w) * scale;
  const pxH = mmToPx(h) * scale;
  const pxPad = mmToPx(pad) * scale;
  const pxPadW = mmToPx(pad * 1.5) * scale;

  // Fit-to-size — same logic as the printed label so the preview matches output.
  const fit = computeLabelFit(printer, fields);
  const scaled = fit.scale < 1;

  const headerFields = fields.filter(f => HEADER_KEYS.includes(f.key));
  const footerFields = fields.filter(f => FOOTER_KEYS.includes(f.key));
  const bodyFields   = fields.filter(f => !HEADER_KEYS.includes(f.key) && !FOOTER_KEYS.includes(f.key));

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
        fontSize: `${scaledFontPt(f.font_size_pt, fit.scale) * scale * 1.33}px`,
        fontWeight: f.bold ? 'bold' : 'normal',
        textAlign: f.align || 'left',
        fontStyle: f.key === 'comments' ? 'italic' : 'normal',
        lineHeight: fit.lineHeight,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        width: '100%',
      }}>{f.content}</div>
    );
  };

  const headerRow = headerFields.length > 0 && (
    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 2 }}>
      <div style={{ flex: 1, minWidth: 0 }}><FieldLine f={headerFields[0]} /></div>
      {headerFields[1] && <div style={{ flexShrink: 0 }}><FieldLine f={headerFields[1]} /></div>}
    </div>
  );
  const footerRow = footerFields.length > 0 && (
    <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
      <FieldLine f={footerFields[0]} />
    </div>
  );

  return (
    <div className="flex items-center justify-center py-4">
      <div
        style={{
          width: `${pxW}px`,
          height: `${pxH}px`,
          padding: `${pxPad}px ${pxPadW}px`,
          fontFamily: `'${font}', Arial, sans-serif`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: scaled ? 'center' : 'space-between',
          overflow: 'hidden',
          boxSizing: 'border-box',
          background: 'white',
          border: '1px solid #ccc',
          borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          color: '#000',
        }}
      >
        {scaled ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {headerRow}
            {bodyFields.map((f, i) => <FieldLine key={`${f.key}_${i}`} f={f} />)}
            {footerRow}
          </div>
        ) : (
          <>
            {headerRow}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden', width: '100%' }}>
              {bodyFields.map((f, i) => <FieldLine key={`${f.key}_${i}`} f={f} />)}
            </div>
            {footerRow}
          </>
        )}
      </div>
    </div>
  );
}

export default function LabelPreviewModal({ open, onClose, onPrint, jobs, orderNumber, labelTotal, settings }) {
  const [currentIdx, setCurrentIdx] = useState(0);

  const printer = normalizePrinter(
    (settings?.label_printers && settings.label_printers.length > 0)
      ? settings.label_printers[0]
      : DEFAULT_PRINTER
  );

  const qrDataUrl = useSettingsQrCode(settings);

  // jobs are pre-expanded, pre-numbered physical labels carrying their
  // whole-order labelIndex; labelTotal is the count across the entire order.
  const jobsList = jobs || [];
  const total = labelTotal || jobsList.length;

  const labelData = jobsList.length > 0
    ? buildLabelData(jobsList[currentIdx].item, orderNumber, jobsList[currentIdx].labelIndex, total, printer, qrDataUrl)
    : null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-primary" />
            Label Preview — Order #{orderNumber}
          </DialogTitle>
        </DialogHeader>

        {labelData ? (
          <>
            <LabelPreview labelData={labelData} />

            {jobsList.length > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Label {currentIdx + 1} of {jobsList.length}
                </span>
                <Button variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => setCurrentIdx(i => Math.min(jobsList.length - 1, i + 1))}
                  disabled={currentIdx === jobsList.length - 1}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            <div className="text-xs text-muted-foreground text-center">
              {printer.width_mm}mm × {printer.height_mm}mm · {printer.font_family}
            </div>
          </>
        ) : (
          <p className="text-center text-muted-foreground py-6 text-sm">No labels to preview.</p>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 gap-2" onClick={() => { onPrint(); onClose(); }}>
            <Printer className="w-4 h-4" /> Print All Labels
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}