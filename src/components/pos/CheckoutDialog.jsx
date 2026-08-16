import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreditCard, Banknote, Smartphone, Printer, ArrowRightLeft, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import EftposPayment from '@/components/pos/EftposPayment';

const paymentMethods = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'eftpos', label: 'EFTPOS', icon: Wifi },
  { value: 'mobile', label: 'Mobile', icon: Smartphone },
  { value: 'split', label: 'Split', icon: ArrowRightLeft },
];

const quickAmounts = [1, 5, 10, 20, 50, 100];

export default function CheckoutDialog({ open, onClose, totals, onComplete, eftposEnabled = false }) {
  const visibleMethods = eftposEnabled ? paymentMethods : paymentMethods.filter(m => m.value !== 'eftpos');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const total = totals?.total || 0;
  const numericPaid = parseFloat(amountPaid) || 0;
  const changeDue = Math.max(0, numericPaid - total);
  const splitCashNum = parseFloat(splitCash) || 0;
  const splitCardNum = parseFloat(splitCard) || 0;
  const splitSum = splitCashNum + splitCardNum;
  const canComplete = paymentMethod === 'split'
    ? splitSum >= total - 0.001
    : paymentMethod !== 'cash' || numericPaid >= total;

  const handleComplete = async () => {
    setIsProcessing(true);
    if (paymentMethod === 'split') {
      await onComplete({
        payment_method: 'split',
        amount_paid: total,
        change_due: 0,
        cash_amount: splitCashNum,
        card_amount: splitCardNum,
      });
    } else {
      await onComplete({
        payment_method: paymentMethod,
        amount_paid: paymentMethod === 'cash' ? numericPaid : total,
        change_due: paymentMethod === 'cash' ? changeDue : 0,
      });
    }
    setIsProcessing(false);
    setAmountPaid('');
    setSplitCash('');
    setSplitCard('');
    setPaymentMethod('cash');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-heading">Complete Payment</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-5">
          {/* Total */}
          <div className="text-center py-4 bg-muted rounded-xl">
            <p className="text-sm text-muted-foreground">Total Due</p>
            <p className="text-4xl font-mono font-black text-primary mt-1">
              ${totals?.total?.toFixed(2)}
            </p>
          </div>

          {/* Payment Method */}
          <div className="grid grid-cols-3 gap-2">
            {visibleMethods.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setPaymentMethod(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                  paymentMethod === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/30"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-semibold">{label}</span>
              </button>
            ))}
          </div>

          {/* Cash amount */}
          {paymentMethod === 'cash' && (
            <div className="space-y-3">
              <Input
                type="number"
                placeholder="Amount received"
                value={amountPaid}
                onChange={e => setAmountPaid(e.target.value)}
                className="text-center text-2xl h-14 font-mono font-bold"
                step="0.01"
              />
              <div className="grid grid-cols-3 gap-2">
                {quickAmounts.map(amt => (
                  <Button
                    key={amt}
                    variant="outline"
                    size="sm"
                    onClick={() => setAmountPaid(String(amt))}
                    className="font-mono"
                  >
                    ${amt}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                className="w-full font-mono"
                onClick={() => setAmountPaid(String(totals?.total?.toFixed(2)))}
              >
                Exact: ${totals?.total?.toFixed(2)}
              </Button>
              {numericPaid > 0 && (
                <div className="text-center py-2 bg-green-500/10 rounded-lg border border-green-500/20">
                  <p className="text-sm text-muted-foreground">Change Due</p>
                  <p className="text-2xl font-mono font-bold text-green-600">${changeDue.toFixed(2)}</p>
                </div>
              )}
            </div>
          )}

          {/* Split amounts */}
          {paymentMethod === 'split' && (
            <div className="space-y-3">
              <Input
                type="number"
                placeholder="Cash amount"
                value={splitCash}
                onChange={e => setSplitCash(e.target.value)}
                className="text-center text-lg h-12 font-mono font-bold"
                step="0.01"
              />
              <Input
                type="number"
                placeholder="Card amount"
                value={splitCard}
                onChange={e => setSplitCard(e.target.value)}
                className="text-center text-lg h-12 font-mono font-bold"
                step="0.01"
              />
              <div className="text-center text-sm">
                {splitSum > 0 && (
                  <span className={splitSum >= total ? 'text-green-600 font-medium' : 'text-amber-600'}>
                    {splitSum >= total ? 'Covers total' : `$${(total - splitSum).toFixed(2)} remaining`}
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                className="w-full font-mono"
                onClick={() => setSplitCard(String(Math.max(0, total - splitCashNum).toFixed(2)))}
              >
                Auto-fill card: ${Math.max(0, total - splitCashNum).toFixed(2)}
              </Button>
            </div>
          )}

          {/* EFTPOS terminal flow */}
          {paymentMethod === 'eftpos' && (
            <EftposPayment
              total={total}
              onComplete={async (paymentData) => {
                setIsProcessing(true);
                await onComplete(paymentData);
                setIsProcessing(false);
                setPaymentMethod('cash');
              }}
            />
          )}

          {/* Actions */}
          {paymentMethod !== 'eftpos' && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1" disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                onClick={handleComplete}
                disabled={!canComplete || isProcessing}
                className="flex-1 h-12 text-base font-bold shadow-lg shadow-primary/25"
              >
                {isProcessing ? 'Processing...' : 'Complete Sale'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}