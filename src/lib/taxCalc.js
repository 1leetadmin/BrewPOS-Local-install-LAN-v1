// Computes order totals with correct tax handling for both tax-inclusive
// and tax-exclusive pricing.
//
// tax_inclusive === true  → menu prices already contain tax. The line-item
//   subtotal IS the total owed; taxTotal is the tax portion *extracted* from
//   that subtotal (for receipt display only) and is NOT added on top.
// tax_inclusive === false → tax is added on top of the subtotal as before.

export function computeOrderTotals(cart, taxRate = 0, taxInclusive = false, appliedDiscount = null) {
  const subtotal = cart.reduce(
    (sum, item) => sum + (item.unit_price ?? 0) * item.quantity,
    0
  );

  let taxTotal;
  let total; // pre-discount total owed

  if (taxInclusive) {
    // Tax is embedded in the prices. Extract the tax portion for display:
    //   subtotal = net + tax = net * (1 + r)
    //   tax = subtotal - net = subtotal - subtotal / (1 + r)
    taxTotal = subtotal - subtotal / (1 + taxRate / 100);
    total = subtotal;
  } else {
    taxTotal = subtotal * (taxRate / 100);
    total = subtotal + taxTotal;
  }

  const discountAmount = appliedDiscount
    ? total * (appliedDiscount.percentage / 100)
    : 0;

  const finalTotal = total - discountAmount;

  return {
    subtotal,
    taxTotal,
    discountAmount,
    total: finalTotal,
    discountType: appliedDiscount ? 'percentage' : 'none',
    discountPct: appliedDiscount?.percentage ?? 0,
  };
}