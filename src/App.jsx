import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import { ThemeProvider } from '@/lib/ThemeProvider';
import Layout from '@/components/pos/Layout';
import POSTerminal from '@/pages/POSTerminal';
import Orders from '@/pages/Orders';
import MenuManagement from '@/pages/MenuManagement';
import Dashboard from '@/pages/Dashboard';
import Settings from '@/pages/Settings';
import ModifierPresets from '@/pages/ModifierPresets';
import Discounts from '@/pages/Discounts';
import StaffAccess from '@/pages/StaffAccess';
import CustomerDisplay from '@/pages/CustomerDisplay';
import CdsSettings from '@/pages/CdsSettings';
import Ingredients from '@/pages/Ingredients';
import IngredientDashboard from '@/pages/IngredientDashboard';
import StaffPortal from '@/pages/StaffPortal';
import StaffTimekeeping from '@/pages/StaffTimekeeping';
import { StaffAuthProvider } from '@/lib/StaffAuthContext';
import KdsBoard from '@/pages/KdsBoard';
import OrderReadyDisplay from '@/pages/OrderReadyDisplay';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();

  // Customer Display Screen, KDS staff board, and the customer-facing
  // order-ready screen are all public, dedicated-purpose surfaces meant to
  // run unattended on a tablet/second screen — bypass the auth gate
  // entirely so they don't need anyone to log in on that device.
  if (location.pathname === '/display') return <CustomerDisplay />;
  if (location.pathname === '/kds') return <KdsBoard />;
  if (location.pathname === '/order-ready') return <OrderReadyDisplay />;

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/portal" element={<StaffPortal />} />
        <Route element={<StaffAuthProvider><Layout /></StaffAuthProvider>}>
          <Route path="/" element={<POSTerminal />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/menu" element={<MenuManagement />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/ingredients" element={<Ingredients />} />
          <Route path="/ingredient-reports" element={<IngredientDashboard />} />
          <Route path="/modifier-presets" element={<ModifierPresets />} />
          <Route path="/discounts" element={<Discounts />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/staff" element={<StaffAccess />} />
          <Route path="/timekeeping" element={<StaffTimekeeping />} />
          <Route path="/cds-settings" element={<CdsSettings />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <ThemeProvider>
          <Router>
            <AuthenticatedApp />
          </Router>
        </ThemeProvider>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App