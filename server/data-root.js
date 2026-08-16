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
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

const os = require('os');
const path = require('path');

function resolveDataRoot() {
  if (process.env.BREWPOS_DATA_DIR) return process.env.BREWPOS_DATA_DIR;
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'BrewPOS');
  }
  return path.join(os.homedir(), '.brewpos-data');
}

module.exports = { DATA_ROOT: resolveDataRoot() };
