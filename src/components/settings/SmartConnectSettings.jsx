import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { RefreshCw, Link2, CheckCircle2, AlertCircle } from 'lucide-react';

// Settings panel for the Shift4 SmartConnect EFTPOS integration.
// Lets the user enable the integration, set a unique register ID, configure
// the API URL, and pair the register to an EFTPOS terminal via a pairing code.
export default function SmartConnectSettings({ settings, onChange, onSave }) {
  const sc = settings.smartconnect || {};
  const [pairingCode, setPairingCode] = useState('');
  const [pairing, setPairing] = useState(false);

  const updateSc = (key, value) => onChange('smartconnect', { ...sc, [key]: value });

  const generateRegisterId = () => {
    const id = (crypto.randomUUID && crypto.randomUUID()) ||
      'reg-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    updateSc('register_id', id);
    toast.success('Register ID generated');
  };

  const handlePair = async () => {
    if (!sc.register_id) {
      toast.error('Generate a Register ID first');
      return;
    }
    if (!pairingCode) {
      toast.error('Enter the pairing code from the terminal');
      return;
    }
    setPairing(true);
    try {
      // Persist the register_id to the DB before pairing — the backend
      // function reads it from StoreSettings, not from the request body.
      if (onSave) await onSave();
      const res = await base44.functions.invoke('smartconnect', {
        action: 'pair',
        pairingCode: pairingCode.trim(),
      });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      onChange('smartconnect', { ...sc, paired: true, paired_device_name: data.deviceName || '' });
      toast.success('Terminal paired successfully');
      setPairingCode('');
    } catch (err) {
      toast.error(`Pairing failed: ${err.message}`);
    } finally {
      setPairing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Enable SmartConnect EFTPOS</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Show an EFTPOS payment button in the checkout</p>
        </div>
        <Switch checked={sc.enabled ?? false} onCheckedChange={v => updateSc('enabled', v)} />
      </div>

      {sc.enabled && (
        <>
          <div className="space-y-2">
            <Label>Register ID</Label>
            <div className="flex gap-2">
              <Input
                value={sc.register_id || ''}
                onChange={e => updateSc('register_id', e.target.value)}
                placeholder="Unique ID for this POS register"
                className="font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={generateRegisterId} title="Generate new ID">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Must be unique across all your registers. Click the refresh button to auto-generate a GUID.</p>
          </div>

          <div className="space-y-2">
            <Label>SmartConnect API URL</Label>
            <Input
              value={sc.base_url || ''}
              onChange={e => updateSc('base_url', e.target.value)}
              placeholder="Provided by Shift4 in the API reference"
            />
            <p className="text-xs text-amber-600">
              The API base URL and endpoint paths are in Shift4's gated API reference.
              Contact amanda.frith@shift4.com to get access, then enter the correct URL here.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Pairing Status</Label>
            <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/20">
              {sc.paired ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-sm font-medium text-green-600">Paired</p>
                    {sc.paired_device_name && <p className="text-xs text-muted-foreground">{sc.paired_device_name}</p>}
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium text-amber-600">Not paired</p>
                    <p className="text-xs text-muted-foreground">Enter the pairing code shown on your EFTPOS terminal</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {!sc.paired && (
            <div className="space-y-2">
              <Label>Pairing Code</Label>
              <div className="flex gap-2">
                <Input
                  value={pairingCode}
                  onChange={e => setPairingCode(e.target.value)}
                  placeholder="Code from terminal"
                  className="font-mono text-lg text-center tracking-widest"
                  maxLength={10}
                />
                <Button onClick={handlePair} disabled={pairing} className="gap-2">
                  <Link2 className="w-4 h-4" />
                  {pairing ? 'Pairing…' : 'Pair Terminal'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Initiate pairing on the EFTPOS terminal first, then enter the displayed code here.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}