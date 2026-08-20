// ============================================================================
// src/components/pos/TopBar.jsx
//
// Persistent top bar shown above the sidebar+content on every authenticated
// page. Shows:
//   - Trial countdown (only while on a trial license — disappears once
//     activated with a paid key)
//   - App version (build ID stamped by CI — see vite.config.js's
//     __APP_VERSION__ and scripts/set-artifact-names.cjs)
//   - A fullscreen toggle that hides this bar + the sidebar entirely,
//     leaving just the current page, and also requests real OS-level
//     fullscreen (removes the taskbar too) — for running the POS
//     distraction-free on an actual counter
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Maximize2, Minimize2 } from 'lucide-react';

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export default function TopBar({ chromeHidden, onToggleFullscreen }) {
  const { licenseStatus } = useAuth();

  const isTrial = licenseStatus?.mode === 'trial';
  const daysRemaining = licenseStatus?.daysRemaining;

  return (
    <div className="h-9 shrink-0 bg-sidebar border-b border-sidebar-border flex items-center justify-end gap-3 px-3 text-xs">
      {isTrial && (
        <span
          className={`px-2 py-0.5 rounded-full font-medium ${
            daysRemaining <= 3
              ? 'bg-destructive/20 text-destructive'
              : 'bg-primary/15 text-primary'
          }`}
        >
          Trial — {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left
        </span>
      )}
      <span className="text-sidebar-foreground/40 font-mono">v{APP_VERSION}</span>
      <button
        onClick={onToggleFullscreen}
        className="w-6 h-6 rounded flex items-center justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        title={chromeHidden ? 'Exit full screen' : 'Full screen (hide menu bar)'}
      >
        {chromeHidden ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
