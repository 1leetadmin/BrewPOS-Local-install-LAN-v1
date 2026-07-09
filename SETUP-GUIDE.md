# Headshot Coffee POS — Local/LAN Fork Setup Guide

## Concept

Two branches in one private GitHub repo:

- **main** — untouched mirror of whatever Base44 exports. Nothing local lives here.
- **lan-local** — your real running fork: local Node/Express server, network-printer
  code, protected files. This is the branch you actually run on the Windows PC.

Periodically you drop a new Base44 export into the folder, commit it to `main`,
then merge `main` into `lan-local`. Your 4 protected files never get touched by
that merge because of a custom merge driver — Base44's copy of those files is
discarded automatically, yours wins every time.

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
   - `.gitattributes` — lists your 4 protected files
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

1. Export from Base44, extract/copy the files over your project folder as usual.
2. Double-click `git-sync-from-base44.bat`.
3. Read the output — it tells you if there was a real conflict (rare, only
   happens if Base44 changes a file *outside* your protected list in a way
   that also changed on lan-local). If so it'll tell you to resolve manually.
4. Test the app on `lan-local` before pushing.

## Notes

- If you ever add a 5th file to the protected list, add one line to
  `.gitattributes` — no code changes needed elsewhere.
- The private repo doubles as your off-machine backup. If the Windows PC dies,
  clone `lan-local` onto a new machine and you're back running in minutes.
- Because you have zero internet at the café, `git push`/`pull` to GitHub
  needs to happen from a machine or moment with internet access (e.g. before
  you leave the shop, or from a laptop at home) — it doesn't need to be live
  on the LAN. The POS PC itself can run fully offline day-to-day; git sync is
  just for backup/version history, not runtime.
