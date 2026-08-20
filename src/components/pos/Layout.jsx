import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import POSSidebar from './POSSidebar';
import TopBar from './TopBar';
import LockScreen from '@/components/auth/LockScreen';
import { useStaffAuth } from '@/lib/StaffAuthContext';

export default function Layout() {
  const { loading, locked, canAccess, getFirstPermittedRoute, settings } = useStaffAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const prevLocked = useRef(false);

  // Remembered across restarts — matches the pattern already used for
  // Settings cards (localStorage per feature, not a shared blob).
  const [chromeHidden, setChromeHidden] = useState(() => {
    try { return localStorage.getItem('brewpos_chrome_hidden') === 'true'; } catch { return false; }
  });

  const toggleFullscreen = () => {
    const next = !chromeHidden;
    setChromeHidden(next);
    try { localStorage.setItem('brewpos_chrome_hidden', String(next)); } catch { /* ignore */ }
    // Real OS-level fullscreen too (removes the taskbar), best-effort —
    // some environments block this without a direct user gesture, which
    // this button click satisfies.
    try {
      if (next && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (!next && document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch { /* ignore — fullscreen API not available in this environment */ }
  };

  // Per-screen access enforcement:
  // - After unlock: silently redirect to first permitted screen if current is restricted
  // - On navigation while unlocked: show "Access denied" toast + redirect
  useEffect(() => {
    if (loading || !settings?.pin_lock_enabled) { prevLocked.current = locked; return; }
    if (locked) { prevLocked.current = true; return; }

    const justUnlocked = prevLocked.current;
    prevLocked.current = false;

    if (!canAccess(location.pathname)) {
      if (!justUnlocked) toast.error('Access denied');
      navigate(getFirstPermittedRoute(), { replace: true });
    }
  }, [location.pathname, locked, loading, settings, canAccess, getFirstPermittedRoute, navigate]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {!chromeHidden && <TopBar chromeHidden={chromeHidden} onToggleFullscreen={toggleFullscreen} />}
      <div className="flex flex-1 overflow-hidden">
        {!chromeHidden && <POSSidebar />}
        <main className="flex-1 overflow-hidden relative">
          <Outlet />
          {chromeHidden && (
            <button
              onClick={toggleFullscreen}
              className="absolute top-2 right-2 z-50 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white/70 hover:text-white flex items-center justify-center transition-colors"
              title="Exit full screen"
            >
              <Minimize2Icon />
            </button>
          )}
        </main>
      </div>
      {locked && <LockScreen />}
    </div>
  );
}

// Tiny inline icon so the exit-fullscreen button doesn't need its own
// import line pulled all the way up when chrome is hidden — same icon as
// TopBar's, duplicated to keep this file's only conditionally-rendered
// piece self-contained.
function Minimize2Icon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}