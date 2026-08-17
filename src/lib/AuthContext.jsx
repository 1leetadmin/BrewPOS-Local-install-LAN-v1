// ============================================================================
// src/lib/AuthContext.jsx
//
// Local-only version. Same context shape/values that ProtectedRoute and
// App.jsx already expect (isAuthenticated, isLoadingAuth, authChecked,
// authError, logout, navigateToLogin, checkUserAuth) — just backed by the
// local server's admin login instead of Base44's cloud "app public
// settings" check.
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { base44, license } from '@/api/base44Client';
import LicenseGate from '@/components/LicenseGate';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // License gate — checked once on startup, independent of login. Whole app
  // is blocked (not just individual features) until this resolves to
  // licensed/trial. See server/local-license.js.
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [licenseChecked, setLicenseChecked] = useState(false);

  useEffect(() => {
    license.status()
      .then((status) => setLicenseStatus(status))
      .catch(() => setLicenseStatus({ licensed: false, mode: 'error' }))
      .finally(() => setLicenseChecked(true));
  }, []);

  const checkUserAuth = useCallback(async () => {
    if (!base44.auth.isAuthenticated()) {
      setIsAuthenticated(false);
      setAuthChecked(true);
      return;
    }
    setIsLoadingAuth(true);
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (err) {
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: err.message });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    base44.auth.logout(shouldRedirect ? '/login' : undefined);
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin();
  };

  // Block everything behind the license gate until it's resolved AND valid.
  // Deliberately rendered before authChecked/login — an unlicensed install
  // shouldn't even reach the login screen. Also block on the initial check
  // itself so there's no flash of the login screen before the gate appears.
  if (!licenseChecked) {
    return <div className="min-h-screen bg-[#1c1c1e]" />;
  }
  if (licenseStatus && !licenseStatus.licensed) {
    return (
      <LicenseGate
        status={licenseStatus}
        onActivated={(result) => setLicenseStatus({ licensed: true, mode: 'licensed', ...result })}
      />
    );
  }

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false, // No cloud "app settings" concept locally.
      authError,
      appPublicSettings: null,
      authChecked,
      licenseStatus,
      logout,
      navigateToLogin,
      checkUserAuth,
      setUser,
      setIsAuthenticated,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
