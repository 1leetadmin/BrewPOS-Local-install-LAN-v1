import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { hashValue } from '@/lib/pinHash';
import { validateDisplayName } from '@/lib/nameValidation';
import { Shield, User } from 'lucide-react';

const PERMISSION_LABELS = [
  { key: 'pos_terminal', label: 'POS Terminal' },
  { key: 'orders', label: 'Orders' },
  { key: 'menu_items', label: 'Menu Items' },
  { key: 'ingredients', label: 'Ingredients' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'settings', label: 'Settings' },
  { key: 'reports', label: 'Cost Reports' },
  { key: 'cds', label: 'Customer Display' },
  { key: 'staff_management', label: 'Staff & Access' },
  { key: 'timekeeping', label: 'Timekeeping' },
];

const DEFAULT_PERMS = {
  pos_terminal: true, dashboard: false, orders: true, menu_items: false,
  ingredients: false, settings: false, reports: false, cds: false,
  staff_management: false, timekeeping: false,
};

// Create / edit dialog for a StaffUser.
export default function StaffUserForm({ open, onClose, onSave, user }) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [role, setRole] = useState('staff');
  const [pinLength, setPinLength] = useState(4);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [permissions, setPermissions] = useState(DEFAULT_PERMS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(user?.name || '');
      setNameError('');
      setRole(user?.role || 'staff');
      setPinLength(user?.pin_length || 4);
      setPin('');
      setPinConfirm('');
      setPermissions(user?.permissions || DEFAULT_PERMS);
    }
  }, [open, user]);

  const handleSave = async () => {
    const validated = validateDisplayName(name);
    if (!validated.valid) {
      setNameError(validated.reason);
      return;
    }
    if (pin !== pinConfirm) return;

    setSaving(true);
    const pinHash = pin ? await hashValue(pin) : user?.pin_hash;
    await onSave({
      name: validated.name,
      role,
      pin_length: pinLength,
      pin_hash: pinHash,
      permissions,
      is_active: true,
    });
    setSaving(false);
    onClose();
  };

  const isAdmin = role === 'admin';

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            {user ? 'Edit Staff User' : 'New Staff User'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={e => { setName(e.target.value); setNameError(''); }}
              placeholder="Staff name"
              maxLength={40}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>PIN Length</Label>
              <Select value={String(pinLength)} onValueChange={v => setPinLength(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[4,5,6,7,8].map(n => <SelectItem key={n} value={String(n)}>{n} digits</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{user ? 'New PIN (leave blank to keep)' : 'PIN'}</Label>
              <Input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                placeholder={'•'.repeat(pinLength)}
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm PIN</Label>
              <Input
                type="password"
                value={pinConfirm}
                onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                placeholder={'•'.repeat(pinLength)}
              />
            </div>
          </div>

          {/* Permissions — hidden for admin (always full access) */}
          {!isAdmin && (
            <div className="space-y-2">
              <Label>Screen Permissions</Label>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3">
                {PERMISSION_LABELS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm">{label}</span>
                    <Switch
                      checked={permissions[key] ?? false}
                      onCheckedChange={v => setPermissions(p => ({ ...p, [key]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {isAdmin && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm text-muted-foreground">
              <User className="w-4 h-4 text-primary" />
              Admin role always has full access to all screens.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || pin !== pinConfirm || (!user && pin.length !== pinLength)}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}