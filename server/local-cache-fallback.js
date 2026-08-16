// ============================================================================
// server/local-cache-fallback.js
//
// A handful of BrewPOS features genuinely require the internet no matter
// what (AI image generation, AI CSV import, EFTPOS card processing) because
// they call outside cloud services, not just Base44's database.
//
// Policy (per Peter): local cache is always checked FIRST. If there's a
// usable cached result, use it — no network call at all. Only if the cache
// misses do we attempt to reach the internet/AI/EFTPOS service. If that
// also fails (no internet), the caller gets a clear, friendly error instead
// of a crash — the rest of the app keeps working.
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_ROOT } = require('./data-root');

const CACHE_DIR = path.join(DATA_ROOT, 'cache');

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function keyFor(namespace, input) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return path.join(CACHE_DIR, `${namespace}_${hash}.json`);
}

const FRIENDLY_OFFLINE_ERROR =
  'This feature needs an internet connection and none is available right now. ' +
  'Everything else in BrewPOS keeps working offline.';

const CacheFallback = {
  // namespace: 'generate-image' | 'invoke-llm' | 'extract-file' | 'eftpos'
  // input: whatever uniquely identifies the request (used as the cache key)
  // onlineFn: async () => result — only called on a cache miss
  async run(namespace, input, onlineFn) {
    ensureDir();
    const file = keyFor(namespace, input);

    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        // Corrupt cache entry — fall through and try online instead.
      }
    }

    try {
      const result = await onlineFn();
      try {
        fs.writeFileSync(file, JSON.stringify(result));
      } catch (writeErr) {
        console.warn(`[cache-fallback] Could not cache ${namespace} result:`, writeErr.message);
      }
      return result;
    } catch (err) {
      const friendly = new Error(FRIENDLY_OFFLINE_ERROR);
      friendly.offline = true;
      friendly.cause = err;
      throw friendly;
    }
  },

  FRIENDLY_OFFLINE_ERROR,
};

module.exports = CacheFallback;
