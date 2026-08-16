# Local Print Server

Offline print bridge for the POS app. Runs on the POS machine and sends raw
ESC/POS bytes straight to the USB receipt printer (XPrinter XP-365). The app
calls `http://localhost:3001` — no QZ Tray, no browser USB bridging.

## Run it

```bash
cd server
npm install
npm start
```

Leave it running on the POS machine. The app's **Settings → Receipt printer**
panel and the POS **Printers** button poll `/api/printer-status` to show
connected/disconnected, and order completion / reprint calls
`/api/print-receipt`.

## Endpoints

- `GET  /api/printer-status` → `{ connected: true|false }`
- `POST /api/print-receipt`  body `{ order, orderItems, settings }` → `{ success: true }` or `{ success: false, error }`

## Requirements / one-time setup (Windows)

The `usb` (libusb) package has to *claim* the printer's USB interface, which only
works when Windows is using a libusb-compatible driver for that interface —
**not** the printer's vendor driver.

1. **Build tools** so the native `usb` module compiles: install Python 3 and the
   "Desktop development with C++" workload from Visual Studio Build Tools.
2. **WinUSB driver** via **Zadig** (zadig.akeo.ie): Options → List All Devices,
   select the XP-365, replace its driver with **WinUSB**. (Windows GDI printing
   to it will then stop working — that's intended; only this server prints to it.)
3. `npm install` in this folder, then `npm start`.

If the printer still shows **Disconnected** after that, the USB interface is
still owned by another driver — redo the Zadig step.