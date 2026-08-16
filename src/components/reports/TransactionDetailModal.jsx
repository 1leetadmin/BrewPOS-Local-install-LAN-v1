import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export default function TransactionDetailModal({ open, onClose, title, transactions }) {
  const total = transactions.reduce((s, t) => s + (Number(t.total_cost) || 0), 0);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{transactions.length} transactions · ${total.toFixed(2)} total</p>
        <div className="overflow-x-auto rounded-lg border border-border mt-2">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Ingredient</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Cost</th>
                <th className="px-3 py-2 font-medium">Event</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{format(new Date(t.date), 'dd/MM/yy HH:mm')}</td>
                  <td className="px-3 py-2 font-medium">{t.ingredient_name}</td>
                  <td className="px-3 py-2">
                    <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium',
                      t.transaction_type === 'wastage' ? 'bg-destructive/15 text-destructive' :
                      t.transaction_type === 'purchase' ? 'bg-green-500/15 text-green-600' :
                      t.transaction_type === 'usage' ? 'bg-blue-500/15 text-blue-600' : 'bg-muted text-muted-foreground')}>
                      {t.transaction_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{t.quantity} {t.unit}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">${(t.total_cost || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{t.event_name || '—'}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">No transactions found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}