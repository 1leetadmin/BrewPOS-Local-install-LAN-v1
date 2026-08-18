// ============================================================================
// src/lib/spokenNumber.js
//
// Converts a spoken number phrase into a plain digit string. Order numbers
// get read out as ordinary numbers ("one twenty three" for 123, "forty
// seven", "nine oh five", or plain digit-by-digit "one two three") — this
// handles all of those with one digit-group concatenation approach rather
// than arithmetic summing (which breaks on phrasing like "one twenty
// three": summing gives 1+20+3=24, not the intended 123).
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

const ONES = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, for: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Extracts the first number found in a spoken phrase and returns it as a
 * plain digit string (e.g. "123"), or null if no number is found. Digits
 * already in the text take priority; otherwise walks the words building up
 * a digit string by concatenating each word's digit-group value (not by
 * summing), which correctly handles both digit-by-digit speech ("one two
 * three" -> "123") and grouped speech ("one twenty three" -> "123",
 * "forty seven" -> "47").
 */
export function parseSpokenNumber(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  const digitMatch = lower.match(/\d+/);
  if (digitMatch) return String(parseInt(digitMatch[0], 10));

  const words = lower.replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  let result = '';
  let found = false;
  let i = 0;
  let pendingHundredPad = false; // true right after "hundred" until a remainder digit is added

  while (i < words.length) {
    const word = words[i];

    if (word === 'and') { i++; continue; }

    if (word === 'hundred') {
      // "one hundred twenty eight" — the digit(s) so far are the hundreds
      // group; whatever comes next (if anything) is the remainder. If
      // nothing follows ("two hundred" alone), pad with "00" at the end.
      if (!result) result = '1';
      found = true;
      pendingHundredPad = true;
      i++;
      continue;
    }

    if (word in TENS) {
      let val = TENS[word];
      i++;
      if (i < words.length && words[i] in ONES && ONES[words[i]] <= 9) {
        val += ONES[words[i]];
        i++;
      }
      result += String(val);
      found = true;
      pendingHundredPad = false;
      continue;
    }

    if (word in ONES) {
      // A single-digit remainder right after "hundred" needs zero-padding
      // ("three hundred and five" -> "3" + "05" = "305", not "35").
      result += pendingHundredPad ? String(ONES[word]).padStart(2, '0') : String(ONES[word]);
      found = true;
      pendingHundredPad = false;
      i++;
      continue;
    }

    if (found) break; // a non-number word after the number has started ends it
    i++; // skip leading filler words ("order", "number", "wipe", etc.)
  }

  if (pendingHundredPad) result += '00';
  return found ? String(parseInt(result, 10)) : null;
}
