// SHA-256 hashing for PINs and master recovery password.
// Uses the browser's built-in Web Crypto API — no npm packages needed.
// A fixed app-level salt is prepended before hashing.

const APP_SALT = 'quickpos_v1_pin_salt';

export async function hashValue(value) {
  const encoder = new TextEncoder();
  const data = encoder.encode(APP_SALT + value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyValue(value, hash) {
  if (!hash) return false;
  const computed = await hashValue(value);
  return computed === hash;
}