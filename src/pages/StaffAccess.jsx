import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, Plus, Trash2, Pencil, Lock, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import StaffUserForm from '@/components/staff/StaffUserForm';
import { hashValue } from '@/lib/pinHash';
import { useStaffAuth } from '@/lib/StaffAuthContext';

const PERMISSION_LABELS = [
  { key: 'pos_terminal', label: 'POS' },
  { key: 'orders', label: 'Orders' },
  { key: 'menu_items', label: 'Menu' },
  { key: 'ingredients', label: 'Ingredients' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'settings', label: 'Settings' },
  { key: 'reports', label: 'Reports' },
  { key: 'cds', label: 'CDS' },
  { key: 'staff_management', label: 'Staff' },
  { key: 'timekeeping', label: 'Timekeeping' },
];

export default function StaffAccess() {
  const { loadData } = useStaffAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryPw, setRecoveryPw] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');

  const { data: settingsList } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: () => base44.entities.StoreSettings.list(),
  });
  const settings = settingsList?.[0];

  const { data: staffList } = useQuery({
    queryKey: ['staffUsers'],
    queryFn: () => base44.entities.StaffUser.filter({}),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (data) => {
      const { id, created_date, updated_date, created_by_id, ...clean } = data;
      if (settings?.id) return base44.entities.StoreSettings.update(settings.id, clean);
      return base44.entities.StoreSettings.create(clean);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storeSettings'] });
      loadData();
      toast.success('Settings saved');
    },
  });

  const saveUserMutation = useMutation({
    mutationFn: async ({ user, data }) => {
      if (user?.id) return base44.entities.StaffUser.update(user.id, data);
      return base44.entities.StaffUser.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffUsers'] });
      loadData();
      toast.success('Staff user saved');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id) => base44.entities.StaffUser.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffUsers'] });
      loadData();
      toast.success('Staff user deleted');
    },
  });

  const handleSaveRecovery = async () => {
    if (recoveryPw !== recoveryConfirm) { toast.error('Passwords do not match'); return; }
    if (recoveryPw.length < 4) { toast.error('Password too short'); return; }
    const hash = await hashValue(recoveryPw);
    saveSettingsMutation.mutate({
      ...(settings || { store_name: 'My Store' }),
      master_recovery_password_hash: hash,
    });
    setRecoveryOpen(false);
    setRecoveryPw('');
    setRecoveryConfirm('');
    toast.success('Recovery password set');
  };

  const updatePinLock = (key, value) => {
    saveSettingsMutation.mutate({
      ...(settings || { store_name: 'My Store' }),
      [key]: value,
    });
  };

  const hasRecoveryPw = !!(settings?.master_recovery_password_hash);

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-heading font-bold">Staff & Access</h1>
          </div>
          <Button onClick={() => { setEditingUser(null); setFormOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Add Staff
          </Button>
        </div>

        {/* Global PIN Lock Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="w-5 h-5 text-primary" /> PIN Lock
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Enable PIN Lock</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Require staff to enter a PIN before accessing the POS</p>
              </div>
              <Switch
                checked={settings?.pin_lock_enabled ?? false}
                onCheckedChange={v => updatePinLock('pin_lock_enabled', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-Lock Timeout</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Lock after inactivity (1–45 minutes)</p>
              </div>
              <Input
                type="number"
                min={1}
                max={45}
                value={settings?.auto_lock_minutes ?? 5}
                onChange={e => updatePinLock('auto_lock_minutes', Math.min(45, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-20"
              />
            </div>
          </CardContent>
        </Card>

        {/* Screen Access Levels */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="w-5 h-5 text-primary" /> Screen Access Levels
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">
              Toggle a screen to <span className="font-medium text-foreground">Admin Only</span> to lock it behind an admin PIN — staff members won't see or access it, even with permission. <span className="font-medium text-foreground">General</span> screens are accessible to any staff member with the relevant permission.
            </p>
            {PERMISSION_LABELS.map(({ key, label }) => {
              const isLocked = settings?.admin_only_screens?.[key] ?? false;
              return (
                <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{isLocked ? 'Admin only' : 'General access'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-medium', !isLocked ? 'text-foreground' : 'text-muted-foreground')}>General</span>
                    <Switch
                      checked={isLocked}
                      onCheckedChange={v => updatePinLock('admin_only_screens', { ...(settings?.admin_only_screens || {}), [key]: v })}
                    />
                    <span className={cn('text-xs font-medium', isLocked ? 'text-foreground' : 'text-muted-foreground')}>Admin Only</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Master Recovery Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="w-5 h-5 text-primary" /> Master Recovery Password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasRecoveryPw ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Recovery password is set</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Used to reset forgotten PINs. Cannot be retrieved if lost.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setRecoveryOpen(true); setRecoveryPw(''); setRecoveryConfirm(''); }}>
                  Change
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-700 dark:text-amber-400">
                  <KeyRound className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>No recovery password set. Set one now — it's the only way to reset a forgotten PIN.</span>
                </div>
                <div className="space-y-2">
                  <Label>Recovery Password</Label>
                  <Input type="password" value={recoveryPw} onChange={e => setRecoveryPw(e.target.value)} placeholder="Set a recovery password" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm</Label>
                  <Input type="password" value={recoveryConfirm} onChange={e => setRecoveryConfirm(e.target.value)} placeholder="Confirm password" />
                </div>
                <Button onClick={handleSaveRecovery} disabled={!recoveryPw || recoveryPw !== recoveryConfirm}>
                  Set Recovery Password
                </Button>
              </div>
            )}
            {recoveryOpen && hasRecoveryPw && (
              <div className="space-y-3 pt-3 border-t border-border">
                <p className="text-sm font-medium">Set new recovery password</p>
                <div className="space-y-2">
                  <Input type="password" value={recoveryPw} onChange={e => setRecoveryPw(e.target.value)} placeholder="New password" />
                </div>
                <div className="space-y-2">
                  <Input type="password" value={recoveryConfirm} onChange={e => setRecoveryConfirm(e.target.value)} placeholder="Confirm" />
                </div>
                <Button onClick={handleSaveRecovery} disabled={!recoveryPw || recoveryPw !== recoveryConfirm}>
                  Update
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Staff User List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="w-5 h-5 text-primary" /> Staff Users
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(staffList || []).map(user => (
              <div key={user.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{user.name}</p>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] capitalize">
                      {user.role}
                    </Badge>
                  </div>
                  {user.role !== 'admin' && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {PERMISSION_LABELS.filter(p => user.permissions?.[p.key]).map(p => (
                        <span key={p.key} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{p.label}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingUser(user); setFormOpen(true); }}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteUserMutation.mutate(user.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            {(!staffList || staffList.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">No staff users yet. Add one to get started.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <StaffUserForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        user={editingUser}
        onSave={(data) => saveUserMutation.mutate({ user: editingUser, data })}
      />
    </ScrollArea>
  );
}