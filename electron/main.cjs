const { app, BrowserWindow, shell, dialog, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

function getServerPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'server')
    : path.join(__dirname, '..', 'server');
}

// data-root.js lives in server/, which is copied to resources/server in a
// packaged build (an extraResource, NOT bundled inside app.asar alongside
// this file) — so it must be resolved the same way as the server itself,
// not via a static relative require (that path only exists in dev).
const { DATA_ROOT } = require(path.join(getServerPath(), 'data-root.js'));

const btLogPath = path.join(DATA_ROOT, 'bluetooth-debug.log');
function btLog(msg) {
  try {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    fs.appendFileSync(btLogPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* best effort */ }
}

const APP_PORT = 3000;
const PRINT_SERVER_PORT = 3001;

let printServerProc = null;
let staticServer = null;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

function getDistPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'dist')
    : path.join(__dirname, '..', 'dist');
}

/**
 * Proxy /api/* and /uploads/* requests to the local print server (port 3001).
 * This lets the app use relative fetch('/api/print-receipt') calls — the
 * same pattern used in the browser version — and have them reach the print
 * server automatically inside the Electron wrapper.
 */
function proxyToPrintServer(req, res) {
  const proxyReq = http.request({
    hostname: 'localhost',
    port: PRINT_SERVER_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => {
    res.writeHead(502);
    res.end(JSON.stringify({ success: false, error: 'Print server not running' }));
  });
  req.pipe(proxyReq);
}

/**
 * Minimal static file server for the built Vite app (dist/).
 * Serves index.html as SPA fallback so BrowserRouter deep links work.
 */
function startStaticServer(distPath) {
  return new Promise((resolve) => {
    staticServer = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      urlPath = decodeURIComponent(urlPath);

      // Route API + upload requests to the print server
      if (urlPath.startsWith('/api/') || urlPath.startsWith('/uploads/')) {
        proxyToPrintServer(req, res);
        return;
      }

      if (urlPath === '/') urlPath = '/index.html';

      let filePath = path.join(distPath, urlPath);

      // SPA fallback: serve index.html for any non-file route
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distPath, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
        } else {
          res.writeHead(200);
          res.end(data);
        }
      });
    });

    staticServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`Port ${APP_PORT} already in use — app may already be running.`);
      }
      resolve();
    });
    staticServer.listen(APP_PORT, 'localhost', () => {
      console.log(`BrewPOS app server on http://localhost:${APP_PORT}`);
      resolve();
    });
  });
}

/**
 * Spawn the local print server as a child process.
 * Uses ELECTRON_RUN_AS_NODE so the packaged Electron binary acts as a
 * plain Node.js runtime — no separate Node install needed on the target PC.
 */
function startPrintServer() {
  const serverPath = getServerPath();
  if (!fs.existsSync(path.join(serverPath, 'index.js'))) {
    console.warn('Print server not found at', serverPath);
    return;
  }

  try {
    printServerProc = spawn(process.execPath, ['index.js'], {
      cwd: serverPath,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(PRINT_SERVER_PORT),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    printServerProc.stdout?.on('data', (data) => {
      console.log(`[print-server] ${data.toString().trim()}`);
    });
    printServerProc.stderr?.on('data', (data) => {
      console.error(`[print-server] ${data.toString().trim()}`);
    });
    printServerProc.on('error', (err) => {
      console.warn('Print server failed to start:', err.message);
    });
    printServerProc.on('exit', (code) => {
      console.log(`Print server exited with code ${code}`);
    });
  } catch (err) {
    console.warn('Print server spawn error:', err.message);
  }
}

/**
 * Electron denies permission requests (including 'bluetooth') by default
 * unless a handler explicitly grants them. Without this, navigator.bluetooth
 * .requestDevice() is blocked before it ever starts scanning — which looks
 * exactly like "the button does nothing", even with the device picker (added
 * below) correctly wired up. This is a single-purpose kiosk app that only
 * ever loads our own bundled UI (never arbitrary web content), so it's safe
 * to grant permissions broadly here.
 */
function setupPermissions() {
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    btLog(`permission check: ${permission}`);
    return true;
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    btLog(`permission request: ${permission}`);
    callback(true);
  });

  // Some Bluetooth printers use classic Bluetooth (not BLE) and trigger an
  // OS-level pairing prompt (PIN/passkey/confirm) during requestDevice().
  // Without a handler for this, that step also hangs silently. Auto-confirm
  // simple confirmation prompts; for PIN/passkey, ask via a native dialog
  // since we can't guess the code.
  session.defaultSession.setBluetoothPairingHandler((details, callback) => {
    if (details.pairingKind === 'confirm') {
      callback({ confirmed: true });
      return;
    }
    if (details.pairingKind === 'pin' || details.pairingKind === 'passkey' || details.pairingKind === 'confirmPin') {
      const result = dialog.showMessageBoxSync({
        type: 'question',
        buttons: ['OK', 'Cancel'],
        title: 'Bluetooth Pairing',
        message: `Pairing with "${details.deviceId}"`,
        detail: details.pin ? `Confirm this matches the code shown on the printer: ${details.pin}` : 'Confirm pairing with this printer?',
      });
      callback({ confirmed: result === 0 });
      return;
    }
    callback({ confirmed: true });
  });
}

/**
 * Web Bluetooth (navigator.bluetooth.requestDevice, used for pairing
 * Bluetooth receipt/label printers in Settings) needs Electron's MAIN
 * process to resolve device selection — the browser-style picker doesn't
 * appear on its own. Without this handler, requestDevice() just hangs
 * forever with no error and no picker, which looks exactly like "the
 * Connect button flashes and nothing happens."
 *
 * Devices trickle in as Bluetooth scanning discovers them, so this waits
 * briefly to let the list fill in, then shows a native picker naming each
 * discovered device so you can pick the actual printer.
 */
function setupBluetoothDevicePicker() {
  let pendingTimer = null;
  let latestDeviceList = [];
  let latestCallback = null;

  session.defaultSession.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    btLog(`select-bluetooth-device fired, ${deviceList.length} device(s) so far: ${deviceList.map(d => d.deviceName || d.deviceId).join(', ')}`);
    latestDeviceList = deviceList;
    latestCallback = callback;

    if (pendingTimer) return; // Already waiting to show the picker for this scan.
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      if (!latestDeviceList.length) {
        latestCallback('');
        return;
      }
      const names = latestDeviceList.map((d) => d.deviceName || d.deviceId || 'Unknown device');
      const buttons = [...names, 'Cancel'];
      const choice = dialog.showMessageBoxSync({
        type: 'question',
        buttons,
        cancelId: buttons.length - 1,
        title: 'Select Bluetooth Printer',
        message: 'Choose the Bluetooth printer to pair:',
      });
      latestCallback(choice >= 0 && choice < latestDeviceList.length ? latestDeviceList[choice].deviceId : '');
    }, 2500);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'BrewPOS',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Unlike regular desktop Chrome, Electron does NOT enable Web
      // Bluetooth by default — it has to be turned on explicitly, or
      // navigator.bluetooth doesn't exist at all and requestDevice() can
      // never be called. This is almost certainly why nothing happened
      // when clicking Connect: the code was failing before it ever got to
      // Electron's device picker or permission handling (both already
      // wired up correctly, they just were never reached).
      enableBlinkFeatures: 'WebBluetooth',
    },
  });

  win.loadURL(`http://localhost:${APP_PORT}`);

  // Open external links (Google OAuth, etc.) in the system browser.
  // Same-origin links (like /display for the Customer Display) open in a
  // new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://localhost:${APP_PORT}`)) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  // Windows treats an app's identity (used for notifications, taskbar
  // grouping, and — relevant here — some device-permission prompts like
  // Bluetooth) differently for apps that don't explicitly register one.
  // Electron apps get an auto-generated ID by default, but setting this
  // explicitly and matching it to the installer's appId is the documented
  // fix for a category of "Windows silently denies device access" issues.
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.base44.pos');
  }
  setupPermissions();
  setupBluetoothDevicePicker();
  startPrintServer();

  const distPath = getDistPath();
  if (!fs.existsSync(distPath)) {
    dialog.showErrorBox('BrewPOS Launch Error',
      `Could not find the app files at:\n${distPath}\n\nThe app may not have been packaged correctly.`);
    app.quit();
    return;
  }

  await startStaticServer(distPath);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (printServerProc && !printServerProc.killed) {
    printServerProc.kill();
  }
  if (staticServer) {
    staticServer.close();
  }
});

// Catch uncaught errors so the app doesn't silently fail
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  dialog.showErrorBox('BrewPOS Error', `An unexpected error occurred:\n\n${err.message}`);
});