'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus, ShieldCheck, ShieldX, UserCog, X, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { StaffUser } from '@/lib/types';

export function StaffTab({ tenantId }: { tenantId: string }) {
  const authToken = useAppStore((s) => s.authToken);
  const authUser = useAppStore((s) => s.authUser);
  const managerLabel = authUser?.tenant?.masterTenantId ? 'Branch Manager' : 'Admin (Tenant Admin)';
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'AGENT' | 'MANAGER'>('AGENT');
  const [deleteConfirmMember, setDeleteConfirmMember] = useState<StaffUser | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const fetchStaff = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/staff?tenantId=${tenantId}`, { headers });
      const data = await res.json();
      setStaff(Array.isArray(data.staff) ? data.staff : []);
    } catch {
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [tenantId, authToken]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('AGENT');
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ tenantId, email: formEmail.trim(), name: formName.trim(), password: formPassword, role: formRole }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Staff member ${formName} created`);
        setDialogOpen(false);
        resetForm();
        fetchStaff();
      } else {
        toast.error(data.error || 'Failed to create staff');
      }
    } catch {
      toast.error('Failed to create staff');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (member: StaffUser) => {
    try {
      const res = await fetch('/api/staff', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ userId: member.id, isActive: !member.isActive }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${member.name} is now ${!member.isActive ? 'active' : 'inactive'}`);
        fetchStaff();
      } else {
        toast.error(data.error || 'Failed to update staff');
      }
    } catch {
      toast.error('Failed to update staff');
    }
  };

  const handleChangeRole = async (member: StaffUser) => {
    const newRole = member.role === 'MANAGER' ? 'AGENT' : 'MANAGER';
    try {
      const res = await fetch('/api/staff', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ userId: member.id, role: newRole }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${member.name} is now ${newRole}`);
        fetchStaff();
      } else {
        toast.error(data.error || 'Failed to change role');
      }
    } catch {
      toast.error('Failed to change role');
    }
  };

  const handleDelete = async (member: StaffUser) => {
    setDeleteConfirmMember(member);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmMember) return;
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/staff?userId=${deleteConfirmMember.id}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${deleteConfirmMember.name} has been removed`);
        fetchStaff();
      } else {
        toast.error(data.error || 'Failed to delete staff');
      }
    } catch {
      toast.error('Failed to delete staff');
    } finally {
      setDeleteConfirmMember(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Staff Management</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <UserPlus className="w-4 h-4 mr-1" /> Add Staff
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Staff Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="Full name" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="staff@example.com" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" placeholder="Min 8 chars, 1 uppercase, 1 digit" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} />
                <p className="text-xs text-muted-foreground">Min 8 characters, 1 uppercase letter, 1 digit</p>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={formRole} onValueChange={(v) => setFormRole(v as 'AGENT' | 'MANAGER')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AGENT">Agent</SelectItem>
                    <SelectItem value="MANAGER">{managerLabel}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Create Staff
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No staff members found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member) => (
                    <TableRow key={member.id} className={!member.isActive ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{member.email}</TableCell>
                      <TableCell>
                        <Badge variant={member.role === 'MANAGER' ? 'default' : 'secondary'} className={member.role === 'MANAGER' ? 'bg-emerald-100 text-emerald-700' : ''}>
                          {member.role === 'MANAGER' ? managerLabel : 'Agent'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={member.isActive ? 'text-emerald-600 border-emerald-300 bg-emerald-50' : 'text-red-600 border-red-300 bg-red-50'}>
                          {member.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(member)}
                            title={member.isActive ? 'Deactivate' : 'Activate'}
                            aria-label={`${member.isActive ? 'Deactivate' : 'Activate'} ${member.name}`}
                          >
                            {member.isActive ? <ShieldX className="w-4 h-4 text-amber-600" /> : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleChangeRole(member)}
                            title={`Change role to ${member.role === 'MANAGER' ? 'Agent' : managerLabel}`}
                            aria-label={`Change role for ${member.name}`}
                          >
                            <UserCog className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(member)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Delete staff member"
                            aria-label={`Delete ${member.name}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={!!deleteConfirmMember} onOpenChange={(open) => { if (!open) setDeleteConfirmMember(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteConfirmMember?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}