// ============================================================================
// src/components/LicenseGate.jsx
//
// Full-screen gate shown when BrewPOS isn't licensed for this machine —
// either the trial ran out, or no key has been entered yet. Verification is
// entirely local (server/local-license.js); nothing here talks to the
// internet or Base44.
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

import React, { useState } from 'react';
import { license } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Loader2 } from 'lucide-react';

export default function LicenseGate({ status, onActivated }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleActivate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await license.activate(key);
      onActivated(result);
    } catch (err) {
      setError(err.message || 'That license key isn\u2019t valid.');
    } finally {
      setLoading(false);
    }
  };

  const expired = status?.mode === 'expired';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1c1c1e] px-4">
      <div className="w-full max-w-sm bg-[#262629] border border-[#3a3a40] rounded-2xl p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-full bg-[#4cc2ff] flex items-center justify-center mb-4">
            <KeyRound className="w-6 h-6 text-black" />
          </div>
          <h1 className="text-lg font-semibold text-[#e8e8ea]">BrewPOS</h1>
          <p className="text-sm text-[#9a9aa0] mt-1 text-center">
            {expired
              ? 'Your free trial has ended. Enter a license key to keep using BrewPOS.'
              : 'Enter your license key to activate BrewPOS.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-[#ff6b5e] bg-[#ff6b5e1a] border border-[#ff6b5e33] rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleActivate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="license-key" className="text-[#e8e8ea]">License Key</Label>
            <Input
              id="license-key"
              type="text"
              autoFocus
              placeholder="Paste your license key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="h-12 bg-[#1c1c1e] border-[#3a3a40] text-[#e8e8ea]"
              required
            />
          </div>
          <Button type="submit" className="w-full h-12" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Activate'}
          </Button>
        </form>
      </div>
    </div>
  );
}
