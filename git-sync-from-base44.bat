@echo off
REM ============================================================
REM git-sync-from-base44.bat
REM
REM Run this AFTER you export a fresh build from Base44 and
REM copy/extract it over the top of your repo folder.
REM
REM What it does:
REM   1. Commits the new export to the "main" branch
REM   2. Switches to "lan-local" and merges main into it
REM   3. Protected files (.gitattributes, merge=ours) are kept
REM      automatically — Base44's versions of those files are
REM      discarded, your local versions survive untouched
REM   4. Runs your existing transform/patch scripts
REM
REM Prerequisite (one-time, per machine):
REM   git config --global merge.ours.driver true
REM ============================================================

setlocal

echo === Step 1: Committing new Base44 export to main ===
git checkout main
if errorlevel 1 goto :error

git add -A
git commit -m "Base44 export %date% %time%"
if errorlevel 1 (
    echo No changes detected in export, or commit failed. Continuing anyway...
)

echo.
echo === Step 2: Merging main into lan-local ===
git checkout lan-local
if errorlevel 1 goto :error

git merge main -m "Sync Base44 export into lan-local"
if errorlevel 1 (
    echo.
    echo *** MERGE CONFLICT ***
    echo Something outside the protected files list conflicted.
    echo Resolve manually, then run: git add -A ^&^& git commit
    goto :end
)

echo.
echo === Step 3: Verifying protected files are still local versions ===
git status server/index.js src/pages/POSTerminal.jsx src/components/pos/BluetoothPrinterPanel.jsx src/components/pos/ReceiptPrint.jsx

echo.
echo === Step 4: Running local transform/patch scripts ===
call transform-base44-csv.mjs
call PATCH_STORE_SETTINGS.bat

echo.
echo === Done. Currently on branch: ===
git branch --show-current

goto :end

:error
echo.
echo *** Git command failed. Check the output above. ***

:end
endlocal
pause
