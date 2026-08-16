import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { hashValue, verifyValue } from '@/lib/pinHash';

const StaffAuthContext = createContext();

// Maps each route to its permission key
export const ROUTE_PERMISSIONS = {
  '/': 'pos_terminal',
  '/orders': 'orders',
  '/menu': 'menu_items',
  '/modifier-presets': 'menu_items',
  '/discounts': 'menu_items',
  '/ingredients': 'ingredients',
  '/ingredient-reports': 'reports',
  '/dashboard': 'dashboard',
  '/settings': 'settings',
  '/cds-settings': 'cds',
  '/staff': 'staff_management',
  '/timekeeping': 'timekeeping',
};

// Order in which we check for the first permitted screen after unlock
const PERMISSION_ROUTE_ORDER = [
  { perm: 'pos_terminal', route: '/' },
  { perm: 'orders', route: '/orders' },
  { perm: 'menu_items', route: '/menu' },
  { perm: 'ingredients', route: '/ingredients' },
  { perm: 'dashboard', route: '/dashboard' },
  { perm: 'reports', route: '/ingredient-reports' },
  { perm: 'settings', route: '/settings' },
  { perm: 'cds', route: '/cds-settings' },
  { perm: 'staff_management', route: '/staff' },
  { perm: 'timekeeping', route: '/timekeeping' },
];

export function StaffAuthProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [staffUsers, setStaffUsers] = useState([]);
  const [currentStaff, setCurrentStaff] = useState(null);
  const [locked, setLocked] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [loading, setLoading] = useState(true);
  const inactivityTimerRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [settingsList, users] = await Promise.all([
        base44.entities.StoreSettings.list(),
        base44.entities.StaffUser.filter({ is_active: true }),
      ]);
      const s = settingsList?.[0] || null;
      setSettings(s);
      setStaffUsers(users || []);
      // Lock on first load only if pin lock is enabled AND there are staff users
      if (s?.pin_lock_enabled && (users || []).length > 0) {
        setLocked(true);
      }
    } catch (err) {
      console.error('Failed to load staff auth data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Inactivity auto-lock
  const resetTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (!settings?.pin_lock_enabled || !currentStaff) return;
    const minutes = settings.auto_lock_minutes || 5;
    inactivityTimerRef.current = setTimeout(() => {
      setLocked(true);
      setCurrentStaff(null);
      setFailedAttempts(0);
      setLockoutUntil(0);
    }, minutes * 60 * 1000);
  }, [settings, currentStaff]);

  useEffect(() => {
    if (!settings?.pin_lock_enabled || !currentStaff) return;
    const events = ['mousemove', 'touchstart', 'keydown', 'click'];
    const handler = () => resetTimer();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [settings, currentStaff, resetTimer]);

  const lockSession = useCallback(() => {
    setLocked(true);
    setCurrentStaff(null);
    setFailedAttempts(0);
    setLockoutUntil(0);
  }, []);

  const unlock = useCallback(async (staffUserId, pin) => {
    if (lockoutUntil > Date.now()) {
      return { success: false, lockedOut: true };
    }
    const user = staffUsers.find(u => u.id === staffUserId);
    if (!user) return { success: false, error: 'User not found' };

    const valid = await verifyValue(pin, user.pin_hash);
    if (valid) {
      setCurrentStaff(user);
      setLocked(false);
      setFailedAttempts(0);
      setLockoutUntil(0);
      return { success: true, user };
    }

    const next = failedAttempts + 1;
    setFailedAttempts(next);
    if (next >= 5) {
      setLockoutUntil(Date.now() + 30000);
      setFailedAttempts(0);
      return { success: false, error: 'Too many attempts. Locked for 30 seconds.', lockedOut: true };
    }
    return { success: false, error: `Incorrect PIN (${5 - next} attempts remaining)` };
  }, [staffUsers, failedAttempts, lockoutUntil]);

  const canAccess = useCallback((route) => {
    if (!settings?.pin_lock_enabled) return true;
    if (!currentStaff) return false;
    if (currentStaff.role === 'admin') return true;
    const perm = ROUTE_PERMISSIONS[route];
    if (!perm) return true;
    // Admin-only screens: non-admins can never access, even with permission
    if (settings.admin_only_screens?.[perm]) return false;
    return currentStaff.permissions?.[perm] ?? false;
  }, [settings, currentStaff]);

  const getFirstPermittedRoute = useCallback(() => {
    if (!settings?.pin_lock_enabled || !currentStaff) return '/';
    if (currentStaff.role === 'admin') return '/';
    for (const { perm, route } of PERMISSION_ROUTE_ORDER) {
      if (settings.admin_only_screens?.[perm]) continue;
      if (currentStaff.permissions?.[perm]) return route;
    }
    return '/';
  }, [settings, currentStaff]);

  const verifyRecoveryPassword = useCallback(async (password) => {
    if (!settings?.master_recovery_password_hash) return false;
    return verifyValue(password, settings.master_recovery_password_hash);
  }, [settings]);

  const resetStaffPin = useCallback(async (staffUserId, newPin) => {
    const pinHash = await hashValue(newPin);
    await base44.entities.StaffUser.update(staffUserId, { pin_hash: pinHash });
    await loadData();
  }, [loadData]);

  return (
    <StaffAuthContext.Provider value={{
      settings, staffUsers, currentStaff, locked, loading,
      failedAttempts, lockoutUntil,
      lockSession, unlock, canAccess, getFirstPermittedRoute,
      verifyRecoveryPassword, resetStaffPin, loadData,
    }}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  const ctx = useContext(StaffAuthContext);
  if (!ctx) throw new Error('useStaffAuth must be used within StaffAuthProvider');
  return ctx;
}