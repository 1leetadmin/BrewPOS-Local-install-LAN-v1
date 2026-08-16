import { useState, useEffect, useCallback } from 'react';
import { Coffee, ArrowLeft, KeyRound, AlertCircle } from 'lucide-react';
import { useStaffAuth } from '@/lib/StaffAuthContext';
import PinKeypad from '@/components/auth/PinKeypad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Full-screen lock overlay. Renders on top of the current layout.
export default function LockScreen() {
  const { settings, staffUsers, unlock, verifyRecoveryPassword, resetStaffPin, lockoutUntil, failedAttempts, loadData } = useStaffAuth();

  const [step, setStep] = useState('select'); // select | pin | forgot | reset
  const [selectedUser, setSelectedUser] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [recoverInput, setRecoverInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');

  // Lockout countdown
  useEffect(() => {
    if (lockoutUntil <= Date.now()) { setLockoutRemaining(0); return; }
    const tick = () => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setLockoutRemaining(remaining > 0 ? remaining : 0);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const handleSelectUser = useCallback((user) => {
    setSelectedUser(user);
    setStep('pin');
    setPinInput('');
    setError('');
  }, []);

  const handleDigit = useCallback(async (digit) => {
    if (lockoutRemaining > 0) return;
    const next = pinInput + digit;
    setPinInput(next);
    setError('');

    if (next.length >= selectedUser.pin_length) {
      const result = await unlock(selectedUser.id, next);
      if (!result.success) {
        setError(result.error || 'Incorrect PIN');
        setPinInput('');
        if (result.lockedOut) {
          // lockoutRemaining will be updated by context
        }
      }
      // success: context dismisses the lock screen
    }
  }, [pinInput, selectedUser, unlock, lockoutRemaining]);

  const handleBackspace = useCallback(() => {
    setPinInput(p => p.slice(0, -1));
    setError('');
  }, []);

  const handleForgotFlow = useCallback(() => {
    setStep('forgot');
    setRecoverInput('');
    setError('');
  }, []);

  const handleRecoverSubmit = useCallback(async () => {
    const valid = await verifyRecoveryPassword(recoverInput);
    if (valid) {
      setStep('reset');
      setError('');
      setNewPin('');
      setNewPinConfirm('');
    } else {
      setError('Incorrect recovery password');
    }
  }, [recoverInput, verifyRecoveryPassword]);

  const handleResetPin = useCallback(async () => {
    if (newPin.length < 4) { setError('PIN must be at least 4 digits'); return; }
    if (newPin !== newPinConfirm) { setError('PINs do not match'); return; }
    await resetStaffPin(selectedUser.id, newPin);
    setStep('pin');
    setPinInput('');
    setError('');
    setNewPin('');
    setNewPinConfirm('');
    // showToast handled by caller? — simple inline message
    setError('');
  }, [newPin, newPinConfirm, selectedUser, resetStaffPin]);

  const storeName = settings?.store_name || 'QuickPOS';

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Coffee className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-heading font-bold">{storeName}</h1>
          {step === 'select' && <p className="text-sm text-muted-foreground">Select your name to continue</p>}
          {step === 'pin' && <p className="text-sm text-muted-foreground">Enter your PIN</p>}
        </div>

        {/* Step: Select staff */}
        {step === 'select' && (
          <div className="space-y-2">
            {staffUsers.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                No staff users configured. An admin must set up staff from the Settings page first.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {staffUsers.map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className="p-4 rounded-xl border border-border bg-card hover:bg-accent transition-colors text-center active:scale-95"
                  >
                    <p className="font-semibold text-sm">{user.name}</p>
                    <span className="text-[10px] text-muted-foreground capitalize">{user.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step: PIN entry */}
        {step === 'pin' && selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 justify-center">
              <button onClick={() => setStep('select')} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <p className="text-sm font-medium">{selectedUser.name}</p>
            </div>

            {/* PIN dots */}
            <div className="flex justify-center gap-3">
              {Array.from({ length: selectedUser.pin_length }).map((_, i) => (
                <div key={i} className={cn(
                  'w-4 h-4 rounded-full border-2',
                  i < pinInput.length ? 'bg-primary border-primary' : 'border-border'
                )} />
              ))}
            </div>

            {/* Error / lockout */}
            {error && (
              <div className="flex items-center gap-2 justify-center text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            {lockoutRemaining > 0 && (
              <div className="text-center text-sm text-destructive">
                Locked — try again in {lockoutRemaining}s
              </div>
            )}

            <PinKeypad
              onDigit={handleDigit}
              onBackspace={handleBackspace}
              disabled={lockoutRemaining > 0}
            />

            <button onClick={handleForgotFlow} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">
              Forgot PIN?
            </button>
          </div>
        )}

        {/* Step: Forgot PIN — enter master recovery password */}
        {step === 'forgot' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 justify-center">
              <button onClick={() => setStep('pin')} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <p className="text-sm font-medium">Recovery</p>
            </div>
            {!settings?.master_recovery_password_hash ? (
              <div className="text-center text-sm text-muted-foreground py-4">
                No recovery password set. Contact an administrator.
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground text-center">Enter the master recovery password</p>
                <Input
                  type="password"
                  value={recoverInput}
                  onChange={e => setRecoverInput(e.target.value)}
                  placeholder="Recovery password"
                  className="text-center text-lg"
                  onKeyDown={e => e.key === 'Enter' && handleRecoverSubmit()}
                />
                {error && (
                  <div className="flex items-center gap-2 justify-center text-sm text-destructive">
                    <AlertCircle className="w-4 h-4" /> {error}
                  </div>
                )}
                <Button onClick={handleRecoverSubmit} className="w-full" disabled={!recoverInput}>
                  Verify
                </Button>
              </>
            )}
          </div>
        )}

        {/* Step: Reset PIN */}
        {step === 'reset' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 justify-center">
              <KeyRound className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium">Set new PIN for {selectedUser?.name}</p>
            </div>
            <Input
              type="password"
              value={newPin}
              onChange={e => setNewPin(e.target.value)}
              placeholder="New PIN"
              className="text-center text-lg"
            />
            <Input
              type="password"
              value={newPinConfirm}
              onChange={e => setNewPinConfirm(e.target.value)}
              placeholder="Confirm new PIN"
              className="text-center text-lg"
            />
            {error && (
              <div className="flex items-center gap-2 justify-center text-sm text-destructive">
                <AlertCircle className="w-4 h-4" /> {error}
              </div>
            )}
            <Button onClick={handleResetPin} className="w-full" disabled={!newPin || !newPinConfirm}>
              Save New PIN
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}