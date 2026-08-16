// Offline order queue — saves completed orders to localStorage when the POS
// loses its internet connection, then pushes them to the server automatically
// once the connection is restored.

import { base44 } from '@/api/base44Client';

const QUEUE_KEY = 'pos_offline_orders';
const COUNTER_KEY = 'pos_local_order_counter';

// Race an API call against a timeout so a dead connection fails fast instead
// of hanging the POS for 30+ seconds waiting for a TCP timeout.
export function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout')), ms)),
  ]);
}

export function getOfflineOrders() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function getOfflineQueueLength() {
  return getOfflineOrders().length;
}

export function addOfflineOrder(order) {
  const orders = getOfflineOrders();
  orders.push(order);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(orders));
  return orders;
}

function removeOfflineOrder(localId) {
  const orders = getOfflineOrders().filter((o) => o._localId !== localId);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(orders));
}

// Local order counter — continues from the last known server counter so
// offline orders still get a sequential number for receipts and labels.
export function getNextLocalOrderNumber(serverCounter) {
  let local = parseInt(localStorage.getItem(COUNTER_KEY) || '-1', 10);
  if (Number.isNaN(local)) local = -1;
  if (local < 0 && typeof serverCounter === 'number') local = serverCounter;
  local = (local + 1) % 1000;
  localStorage.setItem(COUNTER_KEY, String(local));
  return String(local).padStart(3, '0');
}

// Sync the local counter to the server's latest value (called after every
// successful online order or sync so the next offline order continues correctly).
export function syncLocalCounter(serverCounter) {
  if (typeof serverCounter === 'number') {
    localStorage.setItem(COUNTER_KEY, String(serverCounter));
  }
}

// Process the queue — creates Order + OrderItem records on the server for each
// queued order. Stops on the first failure (likely still offline or server down)
// so remaining orders stay in the queue for the next attempt.
export async function syncOfflineOrders(queryClient) {
  const orders = getOfflineOrders();
  if (orders.length === 0) return { synced: 0, failed: 0, remaining: 0 };

  let synced = 0;
  let failed = 0;

  for (const queued of [...orders]) {
    try {
      // Read & increment the server counter
      let orderNumber = queued.localOrderNumber || '000';
      if (queued.settingsId) {
        const fresh = await base44.entities.StoreSettings.filter({ id: queued.settingsId });
        const freshSettings = fresh[0];
        if (freshSettings) {
          const currentCounter = freshSettings.order_counter ?? 0;
          orderNumber = String(currentCounter).padStart(3, '0');
          const nextCounter = (currentCounter + 1) % 1000;
          await base44.entities.StoreSettings.update(freshSettings.id, { order_counter: nextCounter });
          syncLocalCounter(nextCounter);
        }
      }

      // Create the order record
      const order = await base44.entities.Order.create({
        ...queued.orderData,
        order_number: orderNumber,
      });

      // Create one OrderItem per physical unit
      if (queued.units?.length) {
        await base44.entities.OrderItem.bulkCreate(
          queued.units.map((u) => ({
            ...u,
            order_id: order.id,
            order_number: orderNumber,
            placed_at: queued.placedAt,
          }))
        );
      }

      // Update discount used_amount for prepaid tracking
      if (queued.discountUpdate) {
        try {
          const freshD = await base44.entities.Discount.filter({ id: queued.discountUpdate.id });
          const d = freshD[0];
          if (d) {
            await base44.entities.Discount.update(d.id, {
              used_amount: (d.used_amount || 0) + queued.discountUpdate.amount,
            });
          }
        } catch {
          // Non-fatal — order itself was created successfully
        }
      }

      removeOfflineOrder(queued._localId);
      synced++;
    } catch (err) {
      failed++;
      break; // Stop on first failure — likely still offline
    }
  }

  if (synced > 0) {
    queryClient.invalidateQueries({ queryKey: ['storeSettings'] });
    queryClient.invalidateQueries({ queryKey: ['discounts'] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  }

  return { synced, failed, remaining: getOfflineQueueLength() };
}