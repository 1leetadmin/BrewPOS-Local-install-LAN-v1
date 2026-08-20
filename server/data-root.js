// ============================================================================
// server/data-root.js
//
// Resolves a stable folder for BrewPOS's local data that lives OUTSIDE the
// app's install directory. This matters a lot: every time you rebuild and
// reinstall BrewPOS (after pulling a new Base44 feature update), the
// installer replaces everything under the app's install folder. If your
// menu/orders/staff data lived in there, a reinstall would wipe it. Instead
// everything lands in the OS's standard per-user app-data folder, which
// installers never touch:
//
//   Windows: %APPDATA%\BrewPOS\   (e.g. C:\Users\<name>\AppData\Roaming\BrewPOS)
//   macOS/Linux (dev machines): ~/.brewpos-data
//
// Vanilla builds (see VANILLA_BUILD marker, checked by local-db.js and
// server/index.js) use a SEPARATE folder (BrewPOS-Vanilla) instead of the
// normal one. Without this, a vanilla build installed on a machine that has
// ever run a normal BrewPOS build before would just find that machine's
// existing data folder already there and use it — the "skip seeding" logic
// only applies to a genuinely new folder, so it wouldn't have shown a truly
// blank canvas on any machine with prior BrewPOS history, including for
// testing restore-from-backup, which needs a guaranteed-empty starting
// point regardless of what's been installed on that PC before.
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

const os = require('os');
const path = require('path');
const fs = require('fs');

function isVanillaBuild() {
  return fs.existsSync(path.join(__dirname, 'VANILLA_BUILD'));
}

function resolveDataRoot() {
  if (process.env.BREWPOS_DATA_DIR) return process.env.BREWPOS_DATA_DIR;
  const folderName = isVanillaBuild() ? 'BrewPOS-Vanilla' : 'BrewPOS';
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, folderName);
  }
  return path.join(os.homedir(), `.${folderName.toLowerCase()}-data`);
}

module.exports = { DATA_ROOT: resolveDataRoot() };
