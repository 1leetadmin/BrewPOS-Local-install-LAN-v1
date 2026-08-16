import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { Search, Filter, RotateCcw, Ban, Printer, Tag, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { printReceipt } from '@/components/pos/ReceiptPrint';
import { buildLabelJobsFromUnits } from '@/lib/printerRouting';
import { printOrderLabelJobs, groupOrderItemsForDisplay } from '@/lib/orderPrinting';
import { cn } from '@/lib/utils';

const statusColors = {
  open: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  completed: 'bg-green-500/10 text-green-600 border-green-500/20',
  voided: 'bg-red-500/10 text-red-600 border-red-500/20',
  refunded: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
};

export default function Orders() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [printPickerOpen, setPrintPickerOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list('-created_date', 100),
  });

  const { data: settingsList = [] } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: () => base44.entities.StoreSettings.list(),
  });
  const labelSettings = settingsList[0] || {};

  const { data: orderItems = [] } = useQuery({
    queryKey: ['orderItems', selectedOrder?.id],
    queryFn: () => base44.entities.OrderItem.filter({ order_id: selectedOrder.id }),
    enabled: !!selectedOrder?.id,
  });

  const updateOrderMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Order.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order updated');
    },
  });

  const filtered = orders.filter(o => {
    const matchSearch = !search || 
      o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handlePrintLabels = async () => {
    if (!selectedOrder) return;
    const { groups, labelTotal } = buildLabelJobsFromUnits(orderItems, null, labelSettings);
    const { sent, fallback } = await printOrderLabelJobs(groups, labelTotal, labelSettings, {
      orderNumber: selectedOrder.order_number,
      onLabelPrinted: (job) => {
        if (job.orderItemId) {
          base44.entities.OrderItem
            .update(job.orderItemId, { printed_at: new Date().toISOString() })
            .catch(() => {});
        }
      },
      onError: (name, err) => toast.error(`${name}: ${err.message}`),
    });
    if (sent > 0) toast.success('Labels sent to printer');
    else if (fallback > 0) toast.info('Connect a Bluetooth printer for silent printing', { duration: 3000 });
    queryClient.invalidateQueries({ queryKey: ['orderItems', selectedOrder?.id] });
    setPrintPickerOpen(false);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border bg-card/50">
        <h1 className="text-2xl font-heading font-bold mb-4">Order History</h1>
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-muted/50"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-lg" />
            ))
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">No orders found</div>
          ) : (
            filtered.map(order => (
              <Card
                key={order.id}
                className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setSelectedOrder(order)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-mono font-bold text-sm">{order.order_number}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {order.created_date ? format(new Date(order.created_date), 'MMM d, h:mm a') : '-'}
                      </p>
                    </div>
                    {order.customer_name && (
                      <span className="text-sm text-muted-foreground">{order.customer_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={cn('text-xs', statusColors[order.status])}>
                      {order.status}
                    </Badge>
                    <span className="font-mono font-bold text-primary">${order.total?.toFixed(2)}</span>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Print Picker Dialog */}
      <Dialog open={printPickerOpen} onOpenChange={setPrintPickerOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Print Order {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Button
              className="h-14 gap-3 text-base justify-start"
              onClick={handlePrintLabels}
            >
              <Tag className="w-5 h-5" />
              <div className="text-left">
                <div className="font-semibold">Drink Labels</div>
                <div className="text-xs font-normal opacity-70">One label per item</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-14 gap-3 text-base justify-start"
              onClick={() => {
              printReceipt({ ...selectedOrder, items: orderItems }, labelSettings);
              setPrintPickerOpen(false);
              }}
            >
              <FileText className="w-5 h-5" />
              <div className="text-left">
                <div className="font-semibold">Receipt</div>
                <div className="text-xs font-normal opacity-70">Full order summary</div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Order {selectedOrder?.order_number}</span>
              <Badge variant="outline" className={cn('text-xs', statusColors[selectedOrder?.status])}>
                {selectedOrder?.status}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {selectedOrder.created_date && format(new Date(selectedOrder.created_date), 'MMMM d, yyyy h:mm a')}
                {selectedOrder.customer_name && ` • ${selectedOrder.customer_name}`}
              </div>

              <div className="space-y-2">
                {groupOrderItemsForDisplay(orderItems).map((line, i) => (
                  <div key={i} className="flex justify-between text-sm py-1">
                    <span>{line.quantity}x {line.name}</span>
                    <span className="font-mono">${(line.unit_price * line.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono">${selectedOrder.subtotal?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-mono">${selectedOrder.tax_total?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span className="font-mono text-primary">${selectedOrder.total?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Paid ({selectedOrder.payment_method})</span>
                  <span className="font-mono">${selectedOrder.amount_paid?.toFixed(2)}</span>
                </div>
                {selectedOrder.change_due > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Change</span>
                    <span className="font-mono">${selectedOrder.change_due?.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setPrintPickerOpen(true)}>
                  <Printer className="w-4 h-4" /> Print
                </Button>
                {selectedOrder.status === 'completed' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => printReceipt({ ...selectedOrder, items: orderItems }, labelSettings)}
                    >
                      <FileText className="w-4 h-4" /> Reprint Receipt
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        updateOrderMutation.mutate({ id: selectedOrder.id, data: { status: 'refunded' } });
                        setSelectedOrder(null);
                      }}
                    >
                      <RotateCcw className="w-4 h-4" /> Refund
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-destructive"
                      onClick={() => {
                        updateOrderMutation.mutate({ id: selectedOrder.id, data: { status: 'voided' } });
                        setSelectedOrder(null);
                      }}
                    >
                      <Ban className="w-4 h-4" /> Void
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}