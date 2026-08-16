---
name: brewpos-export
description: Pull the latest BrewPOS app (code + data) from Base44 and rebuild the fully-local, offline, no-internet Windows installer. Use this whenever Peter says things like "export BrewPOS", "pull the latest from Base44", "rebuild BrewPOS", "update the local install", "sync BrewPOS", or after he's made changes in the Base44 editor and wants a fresh double-click .exe. Triggers on the Base44 app id 6a21c5ce26723b26c970184c and the GitHub repo 1leetadmin/BrewPOS-Local-install-LAN-v1.
---

# BrewPOS Export & Rebuild

Pulls the current state of the BrewPOS app out of Base44 (UI/feature code —
Peter iterates on this in the Base44 web editor) and produces a fresh
Windows installer that runs **100% locally**: no internet connection, no
Base44 dependency, own local user accounts, own local database. Every
order/menu/staff/settings record lives on the POS machine itself.

## Key facts to hold in your head

- Base44 app id: `6a21c5ce26723b26c970184c`
- GitHub repo: `1leetadmin/BrewPOS-Local-install-LAN-v1` (public)
- Two branches matter: `main` (pure, untouched mirror of whatever Base44
  exports — nothing local ever lives here) and `lan-local` (the actual
  build — `main` merged in, with a fixed set of **protected files** that
  the merge never overwrites, listed in `.gitattributes`)
- A GitHub Actions workflow (`.github/workflows/build-windows.yml`) builds
  the installer automatically on every push to `lan-local`, using a real
  Windows runner — cross-compiling Windows native modules (the USB printer
  driver) from Linux is not reliable, don't try it
- You'll need a **GitHub personal access token** with `repo` + `workflow`
  scopes from Peter to push (the repo has no stored credentials) — ask for
  one each time unless he's given you a working one already in this
  conversation

## The protected-file architecture (read this before touching anything)

Every page in BrewPOS calls a single client object (`base44.entities.X...`,
`base44.auth...`) that lives in `src/api/base44Client.js`. That file — plus
a handful of others — has been rewritten to talk to a fully local server
instead of Base44's cloud. These files are marked `merge=ours` in
`.gitattributes`, meaning when `main` (a fresh Base44 export) gets merged
into `lan-local`, these files are NEVER overwritten:

```
server/index.js, server/package.json, server/data-root.js, server/local-db.js,
server/local-auth.js, server/local-uploads.js, server/local-cache-fallback.js,
server/migration-seed/**, src/api/base44Client.js, src/lib/AuthContext.jsx,
src/pages/Login.jsx, src/pages/POSTerminal.jsx,
src/components/pos/BluetoothPrinterPanel.jsx, src/components/pos/ReceiptPrint.jsx
```

If Peter adds a brand-new feature via the Base44 editor that touches one of
these files, the merge will silently keep the OLD local version — check the
merge result for anything relevant and hand-port the change in if needed.
Everything else (new pages, new components, menu/UI changes) flows through
automatically.

## Step-by-step process

1. **Pull the current export from Base44.** Use the Base44 MCP tools
   (`Base44:run_command`, `Base44:read_file`) against the app id above.
   Fastest method: `tar czf` the source (`src server base44 electron
   package.json vite.config.js jsconfig.json components.json
   tailwind.config.js postcss.config.js eslint.config.js index.html
   README.md .gitignore`, excluding `node_modules`/`dist`/`.git`), then
   `base64 -w0` it and read the result — it auto-saves to a file under
   `/mnt/user-data/tool_results/` when large, which your bash tool can
   read directly. Decode and untar into a clean checkout of `main`.

2. **Land it on `main`.** Wipe everything except `.git`, extract the fresh
   export, commit as `Base44 export <today's date>`, push.

3. **Merge into `lan-local`.** `git merge main`. Protected files survive
   automatically via the `merge=ours` driver (must run
   `git config merge.ours.driver true` once per machine/session first).

4. **Sanity-check before pushing:**
   - `npm install && npx vite build` at the repo root — must complete with
     no errors
   - `cd server && npm install` — must complete with no errors (if this
     ever fails on `@thiagoelg/node-printer` again, check
     `server/package.json` hasn't drifted back to a bad version pin)
   - If you changed any of the protected `server/*.js` files, actually
     start the server (`node index.js` with `BREWPOS_DATA_DIR` pointed at
     a scratch folder) and curl a few endpoints — login, list a couple of
     entities, fetch an uploaded image — before pushing. Don't skip this.

5. **Push both branches**, then poll GitHub Actions
   (`GET /repos/1leetadmin/BrewPOS-Local-install-LAN-v1/actions/runs`)
   until the run completes. **If the media/blob log-download endpoint
   403s** (it will — it's outside your allowed network domains), don't
   fight it: the workflow already commits `build-log.txt` to a `ci-logs`
   branch on every run (success or failure) specifically so you can fetch
   it via `GET /repos/.../contents/build-log.txt?ref=ci-logs` (the plain
   Contents API, not blob storage — this one works). Read that file, not
   the raw Actions log, when debugging a failure.

6. **Confirm success**, then tell Peter it's ready and link the artifact
   (`.../actions/runs/<id>/artifacts` in the GitHub UI). He downloads the
   zip, unzips it, and runs `BrewPOS Setup <version>.exe` — that's the
   double-click installer.

## Known landmines already hit once — don't reintroduce them

- **`@thiagoelg/node-printer` version pin.** Base44's export had this
  pinned to `^1.0.2`, which was never published — breaks `npm install`
  entirely. Fixed to `^0.6.2` and moved to `optionalDependencies` in
  `server/package.json` (now protected). If a future Base44 export
  somehow reintroduces this in a way that isn't caught, `npm install` in
  `server/` will fail with `ETARGET` — same fix.
- **`electron` / `electron-builder` must be in `devDependencies`,** not
  `dependencies` — electron-builder hard-refuses to build otherwise. The
  CI workflow now self-heals this automatically on every run (see the
  "Fix electron/electron-builder dependency placement" step), but if
  you're ever building outside CI, check this by hand.
- **electron-builder auto-publish.** Running in CI, electron-builder tries
  to create a GitHub Release by default and fails without a token. The
  build command passes `--publish never` — keep that flag.
- **Data must live outside the app's install folder.** Anything written to
  a path under the app's own directory gets wiped on every reinstall.
  `server/data-root.js` resolves a stable folder
  (`%APPDATA%\BrewPOS` on Windows) — always route new local storage
  through `DATA_ROOT` from that file, never `__dirname`.
- **GitHub Actions log downloads redirect to Azure blob storage**, which
  is outside your allowed domains and will 403. Use the `ci-logs` branch
  trick above instead of fighting the redirect.

## What's local vs. what still needs internet

Fully local, zero internet, zero Base44: menu, orders, staff accounts
(local PIN system unchanged), ingredients, settings, discounts, photo
uploads (menu items, staff, customer-display slides) — all served from a
local JSON-file database (`server/local-db.js`) and local file storage
(`server/local-uploads.js`). Login is a single local admin account
(username `admin`), handled by `server/local-auth.js`.

A few features are wrapped in a cache-first/online-fallback pattern
(`server/local-cache-fallback.js`, per Peter's instruction: try the local
cache first, only hit the network on a miss) because they call outside
cloud services and can't be made to work with zero internet no matter
what: AI menu-photo generation, AI CSV import for ingredients, and
SmartConnect/EFTPOS card payment (card payments need internet regardless).

## Known gaps as of the last export (2026-08-16) — worth closing eventually

- Historical Order/OrderItem records before this date were not migrated
  into the local database (216 orders existed in Base44 at export time;
  order numbering was preserved via the seeded counter, but the
  order/line-item history itself wasn't — retyping ~340 records by hand
  wasn't worth the cost in one sitting). If Peter wants this backfilled,
  pull `Order` and `OrderItem` via `Base44:query_entities` and add them to
  `server/migration-seed/`.
- Ingredient, IngredientTransaction, TimeEntry, and Event entities weren't
  migrated either — same reasoning, lower priority since they're not
  required for the POS to function.
- Two customer-display slideshow photos and one video are still pointing
  at Base44's/an external host, not localized — the video was 40MB, too
  large to move through the available transfer channel in one go. Menu
  item photos ARE fully localized (downloaded, resized to ~700px/JPEG
  quality 82 with `sharp`, seeded into local uploads).
- Only a single shared local admin account exists — no per-staff top-level
  accounts (the existing StaffUser PIN system underneath is unaffected and
  still per-staff).
