// ============================================================================
// src/lib/nameValidation.js
//
// Validates a human display name (staff name, and anywhere else a name
// gets entered) before it's saved. Two layers of defense exist for the
// most serious risk (control-character injection into printed output —
// see textToBytes in server/printer.js and src/lib/bluetoothPrinter.js,
// which strip control bytes at the print layer regardless of source) —
// this is the earlier, user-facing layer: catches the problem at entry
// time with a clear message, rather than only silently stripping bytes
// much later at print time.
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

const MAX_NAME_LENGTH = 40;

// Unicode letters/numbers/marks (covers international names — José, Müller,
// 田中, etc.) plus spaces and the handful of punctuation marks real names
// actually use. Deliberately excludes emoji, symbols, and all control
// characters — not because they'd crash anything (the print layer already
// neutralizes the actual risk), but because a name field showing up as
// emoji/symbols on a lock screen, timekeeping report, or printed label is
// just bad data hygiene, and there's no legitimate reason a staff name
// needs them.
const VALID_NAME_PATTERN = /^[\p{L}\p{M}\p{N}\s'.\-]+$/u;

/**
 * Validates a proposed display name. Returns { valid: true } or
 * { valid: false, reason: string } with a message suitable to show the
 * user directly.
 */
export function validateDisplayName(rawName) {
  const name = String(rawName || '').trim();

  if (!name) {
    return { valid: false, reason: 'Name is required' };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { valid: false, reason: `Name must be ${MAX_NAME_LENGTH} characters or fewer` };
  }
  if (!VALID_NAME_PATTERN.test(name)) {
    return { valid: false, reason: 'Name can only contain letters, numbers, spaces, and basic punctuation (no emoji or symbols)' };
  }
  return { valid: true, name };
}
