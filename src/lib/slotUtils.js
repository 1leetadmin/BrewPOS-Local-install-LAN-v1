// Shared slot-array helpers used by POSPageEditor and POSTerminal inline edit.

// Pad a slots array to `count` entries with nulls (null = empty slot).
export function padSlots(slots, count) {
  const padded = [...(slots || [])];
  while (padded.length < count) padded.push(null);
  return padded;
}

// Trim trailing nulls so the stored array stays clean (internal nulls are
// preserved — they represent fixed empty slots the user chose to leave blank).
export function trimTrailingNulls(arr) {
  const copy = [...arr];
  while (copy.length > 0 && copy[copy.length - 1] === null) copy.pop();
  return copy;
}