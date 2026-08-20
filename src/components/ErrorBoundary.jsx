// ============================================================================
// src/components/ErrorBoundary.jsx
//
// Without this, an uncaught error anywhere in the render tree unmounts the
// ENTIRE React app — React's default behavior. On a dark-themed app like
// this one, that shows up as exactly "the screen goes black and everything
// hangs": no UI, no click handlers, nothing responds, because React has
// torn the whole tree down and there's nothing left to catch the error.
//
// This catches render errors at the boundary it wraps, shows a recoverable
// message with the actual error (helps diagnose next time) and a way back
// (reload, or go to POS) instead of a dead black screen — and logs to the
// same debug log used elsewhere in the app so the error is captured even
// if nobody's looking at the screen when it happens.
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

import React from 'react';
import { AlertTriangle } from 'lucide-react';

function debugLog(message) {
  try {
    fetch(`http://${window.location.hostname}:3001/api/debug-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `[error-boundary] ${message}` }),
    }).catch(() => {});
  } catch { /* best effort */ }
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    debugLog(`Uncaught render error at ${window.location.pathname}: ${error?.message}\n${error?.stack}\nComponent stack:${info?.componentStack}`);
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-8">
          <div className="max-w-md w-full text-center space-y-4">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              This screen hit an error and couldn't display. Your data is safe — this only
              affects the current view.
            </p>
            <p className="text-xs font-mono text-muted-foreground bg-muted rounded-lg p-3 text-left break-words">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <button
                onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted"
              >
                Go to POS
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
