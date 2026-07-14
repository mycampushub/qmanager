'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Loader2, Crown, Pencil, Trash2, ShieldCheck, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { SubTenantRow, MasterTenantRow } from './types';
import { adminHeaders } from './types';

export default function MasterTenantsTab() {
  const adminToken = useAppStore((s) => s.adminToken);
  const [masterTenants, setMasterTenants] = useState<MasterTenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit corporate name dialog
  const [editMt, setEditMt] = useState<MasterTenantRow | null>(null);
  const [editCorpName, setEditCorpName] = useState('');

  // Add sub-tenant dialog
  const [addSubMt, setAddSubMt] = useState<MasterTenantRow | null>(null);
  const [subName, setSubName] = useState('');
  const [subPlan, setSubPlan] = useState('PRO');
  const [subManagerEmail, setSubManagerEmail] = useState('');
  const [subManagerName, setSubManagerName] = useState('');
  const [subManagerPassword, setSubManagerPassword] = useState('');

  // Delete confirmation
  const [deleteMt, setDeleteMt] = useState<MasterTenantRow | null>(null);

  const fetchMasterTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/master-tenants', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.masterTenants) {
        // Map API response: `tenants` → `subTenants`, derive `isActive` from `billingStatus`
        setMasterTenants(
          data.masterTenants.map((mt: { id: string; corporateName: string; billingStatus: string; createdAt: string; updatedAt: string; tenants?: SubTenantRow[] }) => ({
            id: mt.id,
            corporateName: mt.corporateName,
            billingStatus: mt.billingStatus,
            isActive: mt.billingStatus === 'ACTIVE',
            subTenants: (mt.tenants ?? []) as SubTenantRow[],
            createdAt: mt.createdAt,
            updatedAt: mt.updatedAt,
          }))
        );
      }
    } catch {
      toast.error('Failed to load master tenants');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { fetchMasterTenants(); }, [fetchMasterTenants]);

  // Create master tenant
  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('Corporate name is required'); return; }
    setCreating(true);
    try {
      const body: Record<string, unknown> = { corporateName: newName.trim() };
      if (newAdminEmail) {
        body.adminEmail = newAdminEmail;
        body.adminName = newAdminName;
        body.adminPassword = newAdminPassword;
      }
      const res = await fetch('/api/admin/master-tenants', {
        method: 'POST',
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create'); return; }
      toast.success('Master tenant created' + (newAdminEmail ? ' with admin credentials' : ''));
      setCreateOpen(false);
      setNewName('');
      setNewAdminEmail('');
      setNewAdminName('');
      setNewAdminPassword('');
      fetchMasterTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setCreating(false);
    }
  };

  // Toggle billing status
  const handleToggleBilling = async (mt: MasterTenantRow) => {
    setActionLoading(true);
    const newStatus = mt.billingStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch('/api/admin/master-tenants', {
        method: 'PUT',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ masterTenantId: mt.id, billingStatus: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update'); return; }
      toast.success(`${mt.corporateName} is now ${newStatus}`);
      fetchMasterTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  // Edit corporate name
  const openEditCorp = (mt: MasterTenantRow) => {
    setEditMt(mt);
    setEditCorpName(mt.corporateName);
  };

  const handleSaveCorpName = async () => {
    if (!editMt || !editCorpName.trim()) { toast.error('Corporate name is required'); return; }
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/master-tenants', {
        method: 'PUT',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ masterTenantId: editMt.id, corporateName: editCorpName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update name'); return; }
      toast.success('Corporate name updated');
      setEditMt(null);
      fetchMasterTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete master tenant
  const handleDelete = async () => {
    if (!deleteMt) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/master-tenants', {
        method: 'DELETE',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ masterTenantId: deleteMt.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete'); return; }
      toast.success(`${deleteMt.corporateName} deleted`);
      setDeleteMt(null);
      fetchMasterTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  // Add sub-tenant (branch)
  const openAddSub = (mt: MasterTenantRow) => {
    setAddSubMt(mt);
    setSubName('');
    setSubPlan('PRO');
    setSubManagerEmail('');
    setSubManagerName('');
    setSubManagerPassword('');
  };

  const handleAddSubTenant = async () => {
    if (!addSubMt) return;
    if (!subName.trim()) { toast.error('Branch name is required'); return; }
    if (subManagerEmail && (!subManagerName || !subManagerPassword)) {
      toast.error('Manager name and password are required when email is provided');
      return;
    }
    if (subManagerPassword && subManagerPassword.length < 8) {
      toast.error('Manager password must be at least 8 characters');
      return;
    }
    setActionLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: subName.trim(),
        planTier: subPlan,
        masterTenantId: addSubMt.id,
      };
      if (subManagerEmail) {
        body.managerEmail = subManagerEmail;
        body.managerName = subManagerName;
        body.managerPassword = subManagerPassword;
      }
      const res = await fetch('/api/tenants/manage', {
        method: 'POST',
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create branch'); return; }
      toast.success(`Branch "${subName.trim()}" created under ${addSubMt.corporateName}`);
      setAddSubMt(null);
      fetchMasterTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Master Tenants (Branch Groups)</h2>
        <div className="flex-1" />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700" size="sm">
              <Plus className="w-4 h-4 mr-1" /> Create Master Tenant
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Master Tenant</DialogTitle>
              <DialogDescription>Add a new franchise or corporate group.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-2">
                <Label>Corporate Name *</Label>
                <Input placeholder="e.g. CityHealth Medical Group" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground font-medium">HQ Admin Credentials (Optional)</p>
              <div className="space-y-2">
                <Label>Admin Email</Label>
                <Input type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="hq@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Admin Name</Label>
                <Input value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} placeholder="John Doe" />
              </div>
              <div className="space-y-2">
                <Label>Admin Password</Label>
                <Input type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} placeholder="Min 8 chars, 1 uppercase, 1 digit" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : masterTenants.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No master tenants yet.</CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {masterTenants.map((mt) => (
            <motion.div key={mt.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                      <Crown className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{mt.corporateName}</CardTitle>
                      <CardDescription className="text-xs">{mt.billingStatus} &middot; {mt.subTenants?.length || 0} branches</CardDescription>
                    </div>
                    <Badge className={mt.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                      {mt.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Separator />
                  <p className="text-sm font-medium text-muted-foreground">
                    Sub-Tenants ({mt.subTenants?.length || 0})
                  </p>
                  <ScrollArea className="max-h-40">
                    <div className="space-y-1.5">
                      {mt.subTenants?.map((st) => (
                        <div key={st.id} className="flex items-center justify-between text-sm px-2 py-1.5 rounded-md bg-slate-50">
                          <span className="truncate">{st.name}</span>
                          <Badge variant="outline" className="text-xs ml-2 shrink-0">{st.planTier}</Badge>
                        </div>
                      ))}
                      {(!mt.subTenants || mt.subTenants.length === 0) && (
                        <p className="text-xs text-muted-foreground px-2">No branches yet</p>
                      )}
                    </div>
                  </ScrollArea>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 pt-1">
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openEditCorp(mt)}>
                      <Pencil className="w-3.5 h-3.5" /><span className="hidden sm:inline ml-1">Rename</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleToggleBilling(mt)} disabled={actionLoading}>
                      {mt.isActive ? <ShieldX className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline ml-1">{mt.isActive ? 'Deactivate' : 'Activate'}</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openAddSub(mt)}>
                      <Plus className="w-3.5 h-3.5" /><span className="hidden sm:inline ml-1">Branch</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-red-500 hover:text-red-600 ml-auto" onClick={() => setDeleteMt(mt)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Edit Corporate Name Dialog ── */}
      <Dialog open={!!editMt} onOpenChange={(open) => { if (!open) setEditMt(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Corporate Name</DialogTitle>
            <DialogDescription>Change the corporate name for this master tenant.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Label>Corporate Name</Label>
            <Input value={editCorpName} onChange={(e) => setEditCorpName(e.target.value)} placeholder="Enter new corporate name" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMt(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveCorpName} disabled={actionLoading || !editCorpName.trim()}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Sub-Tenant Dialog ── */}
      <Dialog open={!!addSubMt} onOpenChange={(open) => { if (!open) setAddSubMt(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Branch</DialogTitle>
            <DialogDescription>Create a new tenant under {addSubMt?.corporateName}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-2">
              <Label>Branch Name *</Label>
              <Input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="e.g. Downtown Clinic" />
            </div>
            <div className="space-y-2">
              <Label>Plan Tier</Label>
              <div className="flex gap-2">
                {(['FREE', 'PRO', 'ENTERPRISE'] as const).map((tier) => (
                  <Button
                    key={tier}
                    variant={subPlan === tier ? 'default' : 'outline'}
                    size="sm"
                    className={subPlan === tier ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                    onClick={() => setSubPlan(tier)}
                  >
                    {tier}
                  </Button>
                ))}
              </div>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground font-medium">Manager (Optional)</p>
            <div className="space-y-2">
              <Label>Manager Email</Label>
              <Input type="email" value={subManagerEmail} onChange={(e) => setSubManagerEmail(e.target.value)} placeholder="manager@clinic.com" />
            </div>
            <div className="space-y-2">
              <Label>Manager Name</Label>
              <Input value={subManagerName} onChange={(e) => setSubManagerName(e.target.value)} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Manager Password</Label>
              <Input type="password" value={subManagerPassword} onChange={(e) => setSubManagerPassword(e.target.value)} placeholder="Min 8 chars, 1 uppercase, 1 digit" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSubMt(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddSubTenant} disabled={actionLoading || !subName.trim()}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog open={!!deleteMt} onOpenChange={(open) => { if (!open) setDeleteMt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Master Tenant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteMt?.corporateName}</strong>? This action cannot be undone. Master tenants with existing branches cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}