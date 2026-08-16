# Headshot Coffee POS — Local/LAN Fork Setup Guide

> **For the full repeatable "pull latest from Base44 and rebuild" process,
> see [`SKILL.md`](./SKILL.md)** — that's what Claude follows when you ask
> it to export/update BrewPOS. This guide covers one-time human setup.

## Concept

Two branches in one GitHub repo (public):

- **main** — untouched mirror of whatever Base44 exports. Nothing local lives here.
- **lan-local** — your real running fork: local Node/Express server, the fully
  local/offline data+auth layer, network-printer code, protected files. This
  is the branch the Windows installer is built from.

Periodically a new Base44 export lands on `main`, then `main` merges into
`lan-local`. The protected files (listed in `.gitattributes` — there are
quite a few now, not just the original 4) never get touched by that merge
because of a custom merge driver — Base44's copy of those files is
discarded automatically, yours wins every time.

A GitHub Actions workflow (`.github/workflows/build-windows.yml`) builds
the actual Windows installer automatically on every push to `lan-local`,
using a real Windows runner. Check the Actions tab for the download.

## One-time setup

1. **Create the private repo on GitHub** (github.com → New repository → Private).
   Do not initialize with a README — you already have a project on disk.

2. **In your existing project folder**, open a terminal (or Git Bash) and run:

   ```
   git init
   git add -A
   git commit -m "Initial import from Base44"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```

3. **Create the lan-local branch** from main:

   ```
   git checkout -b lan-local
   git push -u origin lan-local
   ```

4. **Register the merge driver** (once per machine — tells git what `merge=ours`
   in `.gitattributes` means):

   ```
   git config --global merge.ours.driver true
   ```

5. **Copy the two files from this output** into your project root:
   - `.gitattributes` — lists your protected files
   - `git-sync-from-base44.bat` — the sync script

   Commit them on the `lan-local` branch:

   ```
   git checkout lan-local
   git add .gitattributes git-sync-from-base44.bat
   git commit -m "Add merge protection and sync script"
   git push
   ```

6. Make your local-only changes (network printer code, server/index.js, etc.)
   directly on `lan-local` and commit as normal.

## Ongoing workflow, every time you get a new Base44 export

Ask Claude to run the `brewpos-export` skill (e.g. "pull the latest from
Base44 and rebuild BrewPOS") — it handles all of this end to end, including
watching the GitHub Actions build and confirming it succeeded.

Doing it by hand instead:
1. Export from Base44, extract/copy the files over your project folder as usual.
2. Double-click `git-sync-from-base44.bat`.
3. Read the output — it tells you if there was a real conflict (rare, only
   happens if Base44 changes a file *outside* your protected list in a way
   that also changed on lan-local). If so it'll tell you to resolve manually.
4. Test the app on `lan-local` before pushing — pushing triggers the
   Windows build automatically.

## Notes

- To protect a new file, add one line to `.gitattributes` — no code changes
  needed elsewhere.
- The repo doubles as your off-machine backup. If the Windows PC dies,
  clone `lan-local` onto a new machine and you're back running in minutes.
- The running POS PC needs **zero internet** day-to-day — all data, auth,
  and photo storage is local (see `SKILL.md` for exactly what's local vs.
  what still needs internet). Pushing to GitHub is only needed when you
  want to pull in a Base44 update or get a fresh build — do that from any
  machine/moment with internet access, it doesn't need to happen on the LAN.

