const { app, dialog } = require('electron');
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

      // Explicitly allow powerful APIs (Bluetooth, microphone, etc.) via
      // Permissions-Policy — harmless and correct to keep even now that the
      // UI runs in a real browser rather than Electron's own window.
      res.setHeader('Permissions-Policy', 'bluetooth=(self), microphone=(self), usb=(self), serial=(self)');

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
 * Finds a real, installed Chromium-based browser (Chrome preferred — this is
 * what's been confirmed working for Bluetooth and voice — falling back to
 * Edge, which ships with every Windows 10/11 install by default).
 */
function findBrowserExecutable() {
  const candidates = [
    // Chrome
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    // Edge (bundled with Windows by default — reliable fallback)
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
  return candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

let browserProc = null;

/**
 * Launches the app's UI in a real, installed browser instead of Electron's
 * own bundled browser engine — in "app mode" (--app=URL), which hides the
 * address bar and tabs so it still looks and feels like a single native
 * app, not a browser window. This is purely local (http://localhost), so
 * it needs no internet access, exactly like the local server it's pointed
 * at. Confirmed necessary because Electron's bundled Chromium has a
 * Bluetooth chooser bug that persisted through every fix tried at the
 * config/permissions layer — a real browser doesn't have that bug, and
 * also correctly supports voice recognition (Electron's engine can't,
 * regardless of configuration — see git history on VoiceRecognition.jsx
 * for the full investigation).
 */
function launchBrowserApp() {
  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    dialog.showErrorBox('BrewPOS Launch Error',
      'Could not find Chrome or Edge installed on this PC. BrewPOS needs one of them installed to run — please install Google Chrome or Microsoft Edge and try again.');
    app.quit();
    return;
  }

  // A dedicated, isolated browser profile (not the user's normal Chrome
  // profile) so this never conflicts with someone's personal browser also
  // being open, and so permissions granted here (Bluetooth, microphone)
  // persist across launches without re-prompting every time.
  const profileDir = path.join(DATA_ROOT, 'browser-profile');
  fs.mkdirSync(profileDir, { recursive: true });

  browserProc = spawn(browserPath, [
    `--app=http://localhost:${APP_PORT}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate',
    'about:blank', // avoids a brief flash of a New Tab page before --app kicks in on some versions
  ], { detached: false });

  browserProc.on('exit', () => {
    // Closing the app window should stop the whole app, including the
    // local server running in the background — matches normal "close the
    // app and it's fully closed" expectations.
    browserProc = null;
    app.quit();
  });

  browserProc.on('error', (err) => {
    dialog.showErrorBox('BrewPOS Launch Error', `Could not start the browser: ${err.message}`);
    app.quit();
  });
}

app.whenReady().then(async () => {
  startPrintServer();

  const distPath = getDistPath();
  if (!fs.existsSync(distPath)) {
    dialog.showErrorBox('BrewPOS Launch Error',
      `Could not find the app files at:\n${distPath}\n\nThe app may not have been packaged correctly.`);
    app.quit();
    return;
  }

  await startStaticServer(distPath);
  launchBrowserApp();
});

app.on('before-quit', () => {
  if (browserProc) { try { browserProc.kill(); } catch { /* already gone */ } }
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