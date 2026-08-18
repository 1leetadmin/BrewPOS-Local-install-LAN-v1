import { Minus, Plus, Trash2, ShoppingCart, Receipt, Tag, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { computeOrderTotals } from '@/lib/taxCalc';

export default function CartPanel({
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onCheckout,
  customerName,
  onCustomerNameChange,
  taxRate = 0,
  taxInclusive = false,
  discounts = [],
  appliedDiscount,
  onApplyDiscount,
  onEditItem,
}) {
  const totals = computeOrderTotals(cart, taxRate, taxInclusive, appliedDiscount);
  const { subtotal, taxTotal, discountAmount, total } = totals;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const activeDiscounts = discounts.filter(d => d.is_active);

  return (
    <div className="w-[340px] bg-card border-l border-border flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            <h2 className="font-heading font-bold text-base">Current Order</h2>
            {itemCount > 0 && (
              <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                {itemCount}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClearCart} className="text-destructive hover:text-destructive h-8">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        <Input
          placeholder="Customer name (optional)"
          value={customerName}
          onChange={e => onCustomerNameChange(e.target.value)}
          className="mt-3 h-9 text-sm bg-muted/50"
        />
      </div>

      {/* Items */}
      <ScrollArea className="flex-1">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
            <Receipt className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No items yet</p>
            <p className="text-xs mt-1">Tap items or use voice to add</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {cart.map((item, idx) => (
              <div key={idx} className="bg-muted/40 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onEditItem?.(idx)}
                    className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                    title="Tap to adjust modifiers"
                  >
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-semibold truncate">{item.name}</p>
                      {onEditItem && <Pencil className="w-4 h-4 text-muted-foreground shrink-0" />}
                    </div>
                    {item.modifiers?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.modifiers.map((m, mi) => (
                          <span key={mi} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                            {m.option}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">${item.unit_price?.toFixed(2)} each</p>
                  </button>
                  <span className="text-sm font-mono font-bold text-primary whitespace-nowrap">
                    ${(item.unit_price * item.quantity).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onUpdateQuantity(idx, item.quantity - 1)}
                      className="w-7 h-7 rounded-md bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQuantity(idx, item.quantity + 1)}
                      className="w-7 h-7 rounded-md bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => onRemoveItem(idx)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Totals & Checkout */}
      <div className="border-t border-border p-4 space-y-3">
        {/* Discount selector */}
        {activeDiscounts.length > 0 && (
          <div>
            {appliedDiscount ? (
              <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">
                    {appliedDiscount.name} ({appliedDiscount.discount_type === 'fixed_amount' ? `$${(appliedDiscount.fixed_amount || 0).toFixed(2)}` : `${appliedDiscount.percentage}%`})
                  </span>
                </div>
                <button onClick={() => onApplyDiscount(null)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {activeDiscounts.map(d => (
                  <button
                    key={d.id}
                    onClick={() => onApplyDiscount(d)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors font-medium"
                  >
                    <Tag className="w-3 h-3" />
                    {d.name} {d.discount_type === 'fixed_amount' ? `$${(d.fixed_amount || 0).toFixed(2)}` : `${d.percentage}%`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5 text-sm">
          {discountAmount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount ({appliedDiscount.discount_type === 'fixed_amount' ? `$${(appliedDiscount.fixed_amount || 0).toFixed(2)}` : `${appliedDiscount.percentage}%`})</span>
              <span className="font-mono">-${discountAmount.toFixed(2)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span className="font-mono text-primary">${total.toFixed(2)}</span>
          </div>
        </div>
        <Button
          onClick={() => onCheckout(totals)}
          disabled={cart.length === 0}
          className="w-full h-14 text-lg font-bold rounded-xl shadow-lg shadow-primary/25"
          size="lg"
        >
          Charge ${total.toFixed(2)}
        </Button>
      </div>
    </div>
  );
}