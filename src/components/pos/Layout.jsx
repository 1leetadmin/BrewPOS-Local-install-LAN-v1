import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import POSSidebar from './POSSidebar';
import LockScreen from '@/components/auth/LockScreen';
import { useStaffAuth } from '@/lib/StaffAuthContext';

export default function Layout() {
  const { loading, locked, canAccess, getFirstPermittedRoute, settings } = useStaffAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const prevLocked = useRef(false);

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
    <div className="flex h-screen overflow-hidden bg-background">
      <POSSidebar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      {locked && <LockScreen />}
    </div>
  );
}