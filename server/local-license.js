// ============================================================================
// server/local-license.js
//
// BrewPOS license gate. A license key is a signed, tamper-proof token:
//
//   base64url(JSON payload) + "." + base64url(ECDSA signature)
//
// It is generated ONLY by the separate keygen tool (keygen/index.html),
// which holds Peter's private signing key. This file only ever sees the
// PUBLIC key (see PUBLIC_KEY_JWK below) — it can verify a key is genuine,
// but it can never create one. That asymmetry is the whole point: even
// someone with full access to this installed app cannot mint their own
// working license.
//
// Verification is 100% offline — no server call, no phone-home. Trial
// tracking works the same way: a timestamped, locally-stored marker with
// no external dependency. (Note: like any purely offline trial system, a
// determined user could reset it by wiping app data or rolling back the
// system clock — full tamper-proofing would require an online check-in,
// which was explicitly ruled out here in favor of offline-first.)
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');
const { subtle } = webcrypto;
const { DATA_ROOT } = require('./data-root');

const LICENSE_FILE = path.join(DATA_ROOT, 'license.json');
const TRIAL_FILE = path.join(DATA_ROOT, '_trial_started.json');

// Peter's PUBLIC signing key only. Safe to ship — it can verify keys but
// cannot generate new ones. Replaced by the real value the first time the
// keygen tool is run (see keygen/index.html "Setup" step).
const PUBLIC_KEY_JWK = {
  "key_ops": ["verify"],
  "ext": true,
  "kty": "EC",
  "x": "gSHvOPw_iruS8S2p-X08mLyMciRDFhO0KA5GC6U17EI",
  "y": "5B6RH1tv9UnVzgW9ACwl82-CJr33dVTRys3Wi9eCReQ",
  "crv": "P-256"
};

let cachedPublicKey = null;
async function getPublicKey() {
  if (cachedPublicKey) return cachedPublicKey;
  cachedPublicKey = await subtle.importKey(
    'jwk', PUBLIC_KEY_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']
  );
  return cachedPublicKey;
}

async function verifyLicenseKey(licenseKey) {
  const parts = (licenseKey || '').trim().split('.');
  if (parts.length !== 2) return { valid: false, reason: 'Malformed license key' };
  const [payloadB64, sigB64] = parts;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'Malformed license key' };
  }

  let sigValid = false;
  try {
    const pubKey = await getPublicKey();
    sigValid = await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pubKey,
      Buffer.from(sigB64, 'base64url'),
      Buffer.from(payloadB64)
    );
  } catch (err) {
    return { valid: false, reason: 'Could not verify signature: ' + err.message };
  }

  if (!sigValid) return { valid: false, reason: 'Invalid or tampered license key' };
  if (payload.expires && Date.now() > payload.expires) {
    return { valid: false, reason: 'License expired', payload };
  }
  return { valid: true, payload };
}

function ensureDir() {
  if (!fs.existsSync(DATA_ROOT)) fs.mkdirSync(DATA_ROOT, { recursive: true });
}

function getOrStartTrial(trialDays) {
  ensureDir();
  let trial;
  if (fs.existsSync(TRIAL_FILE)) {
    trial = JSON.parse(fs.readFileSync(TRIAL_FILE, 'utf8'));
  } else {
    trial = { startedAt: Date.now() };
    fs.writeFileSync(TRIAL_FILE, JSON.stringify(trial));
  }
  const days = trialDays != null ? trialDays : 14;
  const expiresAt = trial.startedAt + days * 24 * 60 * 60 * 1000;
  const daysRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
  return { startedAt: trial.startedAt, expiresAt, daysRemaining, active: Date.now() < expiresAt };
}

const LocalLicense = {
  // Called at server startup and whenever the app wants to know if it
  // should show the app or the license-required screen.
  async getStatus() {
    ensureDir();

    if (fs.existsSync(LICENSE_FILE)) {
      const stored = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
      const result = await verifyLicenseKey(stored.key);
      if (result.valid) {
        return { licensed: true, mode: 'licensed', customer: result.payload.customer, expires: result.payload.expires || null };
      }
      // Stored key no longer valid (expired, or file tampered with) — fall
      // through to trial status instead of hard-failing.
    }

    const trial = getOrStartTrial(undefined);
    if (trial.active) {
      return { licensed: true, mode: 'trial', daysRemaining: trial.daysRemaining, trialExpires: trial.expiresAt };
    }

    return { licensed: false, mode: 'expired', trialExpires: trial.expiresAt };
  },

  async activate(licenseKey) {
    const result = await verifyLicenseKey(licenseKey);
    if (!result.valid) throw new Error(result.reason || 'Invalid license key');
    ensureDir();
    fs.writeFileSync(LICENSE_FILE, JSON.stringify({ key: licenseKey.trim(), activatedAt: Date.now() }));
    return { success: true, customer: result.payload.customer, expires: result.payload.expires || null };
  },
};

module.exports = LocalLicense;
