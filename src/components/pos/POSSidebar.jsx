import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutGrid, ClipboardList, Package, BarChart3,
  Settings, Coffee, LogOut, Sliders, ChevronLeft, ChevronRight, Tag, ShieldCheck, Lock, Monitor, Boxes, PieChart, Clock
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { useStaffAuth, ROUTE_PERMISSIONS } from '@/lib/StaffAuthContext';

const navItems = [
  { path: '/', icon: LayoutGrid, label: 'POS Terminal' },
  { path: '/orders', icon: ClipboardList, label: 'Orders' },
  { path: '/menu', icon: Package, label: 'Menu Items' },
  { path: '/modifier-presets', icon: Sliders, label: 'Modifier Presets' },
  { path: '/discounts', icon: Tag, label: 'Discounts' },
  { path: '/dashboard', icon: BarChart3, label: 'Dashboard' },
  { path: '/ingredients', icon: Boxes, label: 'Ingredients' },
  { path: '/ingredient-reports', icon: PieChart, label: 'Cost Reports' },
  { path: '/settings', icon: Settings, label: 'Settings' },
  { path: '/cds-settings', icon: Monitor, label: 'Customer Display' },
  { path: '/staff', icon: ShieldCheck, label: 'Staff & Access' },
  { path: '/timekeeping', icon: Clock, label: 'Timekeeping' },
];

function LockButton({ expanded }) {
  const { settings, lockSession } = useStaffAuth();
  if (!settings?.pin_lock_enabled) return null;
  return (
    <button
      onClick={lockSession}
      className="flex items-center gap-3 px-3 py-3 rounded-lg text-sidebar-foreground/50 hover:text-primary hover:bg-sidebar-accent transition-all w-full whitespace-nowrap"
    >
      <Lock className="w-5 h-5 shrink-0" />
      {expanded && <span className="text-sm font-medium">Lock</span>}
    </button>
  );
}

export default function POSSidebar() {
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const { settings, currentStaff } = useStaffAuth();

  const visibleNavItems = navItems.filter(({ path }) => {
    if (!settings?.pin_lock_enabled) return true;
    if (!currentStaff || currentStaff.role === 'admin') return true;
    const perm = ROUTE_PERMISSIONS[path];
    if (!perm) return true;
    if (settings.admin_only_screens?.[perm]) return false;
    return currentStaff.permissions?.[perm] ?? false;
  });

  return (
    <div className={cn(
      "transition-all duration-300 bg-sidebar h-screen flex flex-col border-r border-sidebar-border overflow-hidden shrink-0",
      expanded ? "w-[220px]" : "w-[72px]"
    )}>
      {/* Logo + toggle */}
      <div className="h-16 flex items-center px-3 gap-2 border-b border-sidebar-border">
        <Coffee className="w-7 h-7 text-primary shrink-0 ml-1" />
        {expanded && (
          <span className="font-display font-bold text-lg text-sidebar-foreground whitespace-nowrap flex-1">
            QuickPOS
          </span>
        )}
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors shrink-0"
          title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {expanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
        {visibleNavItems.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                "flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 whitespace-nowrap",
                active 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-primary/20" 
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {expanded && <span className="text-sm font-medium">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Lock + Logout */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <LockButton expanded={expanded} />
        <button
          onClick={() => base44.auth.logout()}
          className="flex items-center gap-3 px-3 py-3 rounded-lg text-sidebar-foreground/50 hover:text-destructive hover:bg-sidebar-accent transition-all w-full whitespace-nowrap"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {expanded && <span className="text-sm font-medium">Logout</span>}
        </button>
      </div>
    </div>
  );
}