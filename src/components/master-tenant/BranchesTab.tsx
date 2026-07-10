'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Loader2, Pencil, Check, X, ListOrdered, UserCheck, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import { type BranchData, type PlanTier, mtHeaders, PlanTierBadge } from './mt-types';

// ─── ADD BRANCH DIALOG ──────────────────────────────────────
function AddBranchDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const mtToken = useAppStore((s) => s.mtToken);
  const [name, setName] = useState('');
  const [planTier, setPlanTier] = useState<PlanTier>('PRO');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setName('');
    setPlanTier('PRO');
    setManagerEmail('');
    setManagerName('');
    setManagerPassword('');
  }, []);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Branch name is required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/master-tenant/branches', {
        method: 'POST',
        headers: mtHeaders(mtToken),
        body: JSON.stringify({
          name: name.trim(),
          planTier,
          managerEmail: managerEmail.trim() || undefined,
          managerName: managerName.trim() || undefined,
          managerPassword: managerPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to create branch');
        return;
      }
      toast.success(`Branch "${name.trim()}" created successfully!`);
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const tierOptions: { value: PlanTier; label: string; desc: string }[] = [
    { value: 'FREE', label: 'Free', desc: 'Basic features' },
    { value: 'PRO', label: 'Pro', desc: 'Advanced features' },
    { value: 'ENTERPRISE', label: 'Enterprise', desc: 'Full access' },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Branch</DialogTitle>
          <DialogDescription>Create a new branch under your franchise group. A default queue will be created automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Branch Name */}
          <div className="space-y-2">
            <Label htmlFor="branch-name">Branch Name <span className="text-red-500">*</span></Label>
            <Input
              id="branch-name"
              placeholder="e.g. CityHealth Midtown Clinic"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Plan Tier */}
          <div className="space-y-2">
            <Label>Plan Tier</Label>
            <div className="grid grid-cols-3 gap-2">
              {tierOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPlanTier(opt.value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-sm transition-all ${
                    planTier === opt.value
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700 font-medium'
                      : 'border-slate-200 text-muted-foreground hover:border-slate-300'
                  }`}
                >
                  <span className="font-semibold">{opt.label}</span>
                  <span className="text-xs">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Manager Details - Optional */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Branch Manager <span className="text-muted-foreground font-normal">(optional)</span></Label>
            </div>
            <div className="space-y-2 pl-6">
              <div className="space-y-1.5">
                <Label htmlFor="mgr-email" className="text-xs text-muted-foreground">Manager Email</Label>
                <Input
                  id="mgr-email"
                  type="email"
                  placeholder="manager@branch.com"
                  value={managerEmail}
                  onChange={(e) => setManagerEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mgr-name" className="text-xs text-muted-foreground">Manager Name</Label>
                <Input
                  id="mgr-name"
                  placeholder="John Doe"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mgr-pw" className="text-xs text-muted-foreground">Manager Password</Label>
                <Input
                  id="mgr-pw"
                  type="password"
                  placeholder="Min 8 chars, 1 uppercase, 1 digit"
                  value={managerPassword}
                  onChange={(e) => setManagerPassword(e.target.value)}
                />
                {managerPassword && (
                  <p className="text-xs text-muted-foreground">
                    Must be at least 8 characters with 1 uppercase letter and 1 digit.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Branch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── BRANCH CARD ────────────────────────────────────────────
function BranchCard({
  branch,
  onToggleActive,
  onEditName,
  actionLoading,
}: {
  branch: BranchData;
  onToggleActive: (b: BranchData) => void;
  onEditName: (b: BranchData) => void;
  actionLoading: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(branch.name);

  useEffect(() => {
    setEditName(branch.name);
    setEditing(false);
  }, [branch.name]);

  const handleSaveName = () => {
    if (editName.trim() && editName.trim() !== branch.name) {
      onEditName({ ...branch, name: editName.trim() });
    } else {
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveName();
    if (e.key === 'Escape') {
      setEditName(branch.name);
      setEditing(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Card className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="h-7 text-sm"
                    autoFocus
                    disabled={actionLoading}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSaveName} disabled={actionLoading}>
                    {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setEditName(branch.name); setEditing(false); }}>
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <CardTitle className="text-base truncate">{branch.name}</CardTitle>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <PlanTierBadge tier={branch.planTier} />
            <Badge className={branch.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
              {branch.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center mb-4">
            <div>
              <p className="text-2xl font-bold">{branch.queueCount}</p>
              <p className="text-xs text-muted-foreground">Queues</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{branch.staffCount}</p>
              <p className="text-xs text-muted-foreground">Staff</p>
            </div>
            <div>
              <p className="text-2xl font-bold">${(branch.walletBalance / 100).toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">Wallet</p>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-8"
              onClick={() => setEditing(true)}
              disabled={actionLoading}
            >
              <Pencil className="w-3 h-3 mr-1" /> Edit Name
            </Button>
            <Button
              variant={branch.isActive ? 'outline' : 'default'}
              size="sm"
              className={`flex-1 text-xs h-8 ${branch.isActive ? 'text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              onClick={() => onToggleActive(branch)}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <ListOrdered className="w-3 h-3 mr-1" />
              )}
              {branch.isActive ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── BRANCHES TAB ───────────────────────────────────────────
export default function BranchesTab() {
  const mtToken = useAppStore((s) => s.mtToken);
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/master-tenant/branches', {
        headers: { Authorization: `Bearer ${mtToken}` },
      });
      const data = await res.json();
      if (data.branches) {
        setBranches(data.branches);
      }
    } catch {
      // Fallback to empty state
      setBranches([]);
    } finally {
      setLoading(false);
    }
  }, [mtToken]);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  const handleToggleActive = async (branch: BranchData) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/master-tenant/branches', {
        method: 'PUT',
        headers: mtHeaders(mtToken),
        body: JSON.stringify({ branchId: branch.id, isActive: !branch.isActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to update branch');
        return;
      }
      toast.success(`${branch.name} is now ${!branch.isActive ? 'active' : 'inactive'}`);
      fetchBranches();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditName = async (branch: BranchData) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/master-tenant/branches', {
        method: 'PUT',
        headers: mtHeaders(mtToken),
        body: JSON.stringify({ branchId: branch.id, name: branch.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to update branch name');
        return;
      }
      toast.success(`Branch renamed to "${branch.name}"`);
      fetchBranches();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Branches</h2>
          <p className="text-sm text-muted-foreground">{branches.length} branch{branches.length !== 1 ? 'es' : ''} in your group</p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Branch
        </Button>
      </div>

      {branches.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-muted-foreground">No branches yet</h3>
            <p className="text-xs text-muted-foreground mt-1">Add your first branch to get started.</p>
            <Button className="mt-4 bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Branch
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((b) => (
            <BranchCard
              key={b.id}
              branch={b}
              onToggleActive={handleToggleActive}
              onEditName={handleEditName}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}

      <AddBranchDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={fetchBranches}
      />
    </div>
  );
}