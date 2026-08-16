import { Button } from '@/components/ui/button';
import { FileSpreadsheet, FileText, FileType, Mail } from 'lucide-react';

export default function ExportButtons({ onExport, disabled }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => onExport('csv')} className="gap-1.5">
        <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => onExport('pdf')} className="gap-1.5">
        <FileType className="w-3.5 h-3.5" /> PDF
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => onExport('docx')} className="gap-1.5">
        <FileText className="w-3.5 h-3.5" /> Word
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => onExport('email')} className="gap-1.5">
        <Mail className="w-3.5 h-3.5" /> Email
      </Button>
    </div>
  );
}