// ============================================================================
// src/components/dashboard/SalesImportUpload.jsx
//
// Lets the user drop in any combination of Loyverse's 5 CSV report exports
// (Sales Summary, Category Sales, Item Sales, Modifier Sales, Payment Type
// Sales) and combines them into one SalesImport record. File type is
// detected from each file's header row, not its filename — filenames are
// user-editable and unreliable. A partial set of files (e.g. just Item
// Sales) still produces a usable, if less complete, import.
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, FileText, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { parseLoyverseFile, buildLoyverseImportRecord, suggestLabelFromFilename } from '@/lib/loyverseImport';

const TYPE_LABELS = {
  'sales-summary': 'Sales Summary',
  'category-sales-summary': 'Category Sales',
  'item-sales-summary': 'Item Sales',
  'modifier-sales': 'Modifier Sales',
  'payment-type-sales': 'Payment Type Sales',
  'unknown': 'Unrecognized file',
};

export default function SalesImportUpload({ open, onOpenChange, onImported }) {
  const [pending, setPending] = useState([]); // [{ filename, detected, dataRows }]
  const [label, setLabel] = useState('');
  const [importing, setImporting] = useState(false);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList);
    const parsed = [];
    for (const file of files) {
      const text = await file.text();
      const { detected, dataRows } = parseLoyverseFile(text);
      parsed.push({ filename: file.name, detected, dataRows });
      if (!label && parsed.length === 1) setLabel(suggestLabelFromFilename(file.name));
    }
    setPending(prev => [...prev, ...parsed]);
  };

  const removeFile = (idx) => setPending(prev => prev.filter((_, i) => i !== idx));

  const handleImport = async () => {
    const recognized = pending.filter(p => p.detected.type !== 'unknown');
    if (recognized.length === 0) {
      toast.error('No recognized Loyverse files to import');
      return;
    }
    if (!label.trim()) {
      toast.error('Give this import a label (e.g. "Woolfest 2025")');
      return;
    }
    setImporting(true);
    try {
      const record = buildLoyverseImportRecord(recognized, label.trim());
      await base44.entities.SalesImport.create(record);
      toast.success(`Imported "${label.trim()}" — ${record.total_items_sold} items, $${record.total_revenue.toFixed(2)} revenue`);
      setPending([]);
      setLabel('');
      onOpenChange(false);
      onImported?.();
    } catch (err) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Sales Data (Loyverse)</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          From Loyverse: Reports → export any of Sales Summary, Category Sales, Item Sales,
          Modifier Sales, or Payment Type Sales as CSV. Add as many as you have — more files
          means more detail available in the dashboard.
        </p>

        <div className="space-y-1">
          <Label className="text-xs">Label</Label>
          <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Woolfest 2025" />
        </div>

        <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
          <Upload className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Click to choose CSV files (any number, any combination)</span>
          <input
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}
          />
        </label>

        {pending.length > 0 && (
          <div className="space-y-1.5">
            {pending.map((p, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-muted rounded-lg text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {p.detected.type === 'unknown' ? (
                    <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.filename}</p>
                    <p className="text-muted-foreground">
                      {TYPE_LABELS[p.detected.type]}
                      {p.detected.granularity ? ` (${p.detected.granularity})` : ''}
                      {' — '}{p.dataRows.length} row{p.dataRows.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <button onClick={() => removeFile(idx)} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button onClick={handleImport} disabled={importing || pending.length === 0} className="w-full">
          {importing ? 'Importing…' : 'Import'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
