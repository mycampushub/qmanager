'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus, ShieldCheck, ShieldX, UserCog, X, Loader2, ListChecks
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { StaffUser } from '@/lib/types';

interface QueueOption {
  id: string;
  name: string;
  prefix: string;
}

interface QueueAssignment {
  id: string;
  agent: { id: string; name: string; email: string };
  queue: { id: string; name: string; prefix: string };
  isActive: boolean;
}

export function StaffTab({ tenantId }: { tenantId: string }) {
  const authToken = useAppStore((s) => s.authToken);
  const authUser = useAppStore((s) => s.authUser);
  const managerLabel = authUser?.tenant?.masterTenantId ? 'Branch Manager' : 'Admin (Tenant Admin)';
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [assignments, setAssignments] = useState<QueueAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'AGENT' | 'MANAGER'>('AGENT');
  const [deleteConfirmMember, setDeleteConfirmMember] = useState<StaffUser | null>(null);

  // Queue assignment dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningAgent, setAssigningAgent] = useState<StaffUser | null>(null);
  const [localAssignments, setLocalAssignments] = useState<Record<string, boolean>>({});
  const [assignSaving, setAssignSaving] = useState(false);

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
    }
  }, [tenantId, authToken]);

  const fetchQueues = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/queues?tenantId=${tenantId}`, { headers });
      const data = await res.json();
      const queueList = Array.isArray(data.queues) ? data.queues : [];
      setQueues(queueList.map((q: Record<string, unknown>) => ({
        id: q.id as string,
        name: q.name as string,
        prefix: q.prefix as string,
      })));
    } catch {
      // silently fail - queues not critical for staff tab
    }
  }, [tenantId, authToken]);

  const fetchAssignments = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/queue-assignments', { headers });
      const data = await res.json();
      setAssignments(Array.isArray(data.assignments) ? data.assignments : []);
    } catch {
      // silently fail
    }
  }, [authToken]);

  useEffect(() => {
    Promise.all([fetchStaff(), fetchQueues(), fetchAssignments()]).finally(() => {
      setLoading(false);
    });
  }, [fetchStaff, fetchQueues, fetchAssignments]);

  // Helper: get assigned queue IDs for a given agent
  const getAgentQueueIds = useCallback((agentId: string): string[] => {
    return assignments
      .filter((a) => a.agent.id === agentId && a.isActive)
      .map((a) => a.queue.id);
  }, [assignments]);

  // Get assignment record ID for a specific agent+queue pair
  const getAssignmentId = useCallback((agentId: string, queueId: string): string | null => {
    const found = assignments.find(
      (a) => a.agent.id === agentId && a.queue.id === queueId && a.isActive
    );
    return found?.id ?? null;
  }, [assignments]);

  // Open queue assignment dialog for an agent
  const openAssignDialog = (member: StaffUser) => {
    setAssigningAgent(member);
    const assigned: Record<string, boolean> = {};
    const agentQueueIds = getAgentQueueIds(member.id);
    for (const q of queues) {
      assigned[q.id] = agentQueueIds.includes(q.id);
    }
    setLocalAssignments(assigned);
    setAssignDialogOpen(true);
  };

  // Toggle a queue assignment in the dialog (local state only until save)
  const toggleLocalAssignment = (queueId: string) => {
    setLocalAssignments((prev) => ({ ...prev, [queueId]: !prev[queueId] }));
  };

  // Save queue assignments (diff against current server state)
  const handleSaveAssignments = async () => {
    if (!assigningAgent) return;
    setAssignSaving(true);

    try {
      const currentIds = getAgentQueueIds(assigningAgent.id);
      const newIds = Object.entries(localAssignments)
        .filter(([, assigned]) => assigned)
        .map(([id]) => id);

      const toAdd = newIds.filter((id) => !currentIds.includes(id));
      const toRemove = currentIds.filter((id) => !newIds.includes(id));

      let hasError = false;

      // Add new assignments
      for (const queueId of toAdd) {
        const res = await fetch('/api/queue-assignments', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ agentId: assigningAgent.id, queueId }),
        });
        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error || 'Failed to assign queue');
          hasError = true;
        }
      }

      // Remove old assignments
      for (const queueId of toRemove) {
        const assignmentId = getAssignmentId(assigningAgent.id, queueId);
        if (assignmentId) {
          const res = await fetch('/api/queue-assignments', {
            method: 'DELETE',
            headers: authHeaders(),
            body: JSON.stringify({ assignmentId }),
          });
          if (!res.ok) {
            const data = await res.json();
            toast.error(data.error || 'Failed to remove queue assignment');
            hasError = true;
          }
        }
      }

      if (!hasError) {
        toast.success(`${assigningAgent.name}'s queue assignments updated`);
        setAssignDialogOpen(false);
        setAssigningAgent(null);
        await fetchAssignments();
      }
    } catch {
      toast.error('Failed to update queue assignments');
    } finally {
      setAssignSaving(false);
    }
  };

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
              <DialogDescription className="text-sm text-muted-foreground">
                Create a new staff account. Agents can be assigned to specific queues.
              </DialogDescription>
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Team Members</CardTitle>
            {queues.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {assignments.filter((a) => a.isActive).length} assignment{assignments.filter((a) => a.isActive).length !== 1 ? 's' : ''} across {queues.length} queue{queues.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
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
                    <TableHead>Assigned Queues</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member) => {
                    const agentQueueIds = getAgentQueueIds(member.id);
                    const assignedQueues = queues.filter((q) => agentQueueIds.includes(q.id));
                    const isManager = member.role === 'MANAGER';

                    return (
                      <TableRow key={member.id} className={!member.isActive ? 'opacity-50' : ''}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{member.email}</TableCell>
                        <TableCell>
                          <Badge variant={isManager ? 'default' : 'secondary'} className={isManager ? 'bg-emerald-100 text-emerald-700' : ''}>
                            {isManager ? managerLabel : 'Agent'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isManager ? (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 font-normal">
                              All Queues
                            </Badge>
                          ) : queues.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No queues yet</span>
                          ) : assignedQueues.length === 0 ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Unassigned</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => openAssignDialog(member)}
                              >
                                Assign
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {assignedQueues.slice(0, 3).map((q) => (
                                <Badge key={q.id} variant="secondary" className="font-normal text-xs">
                                  {q.prefix} {q.name}
                                </Badge>
                              ))}
                              {assignedQueues.length > 3 && (
                                <Badge variant="outline" className="font-normal text-xs">
                                  +{assignedQueues.length - 3} more
                                </Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 text-muted-foreground hover:text-emerald-600"
                                onClick={() => openAssignDialog(member)}
                                title="Manage queue assignments"
                                aria-label={`Manage queues for ${member.name}`}
                              >
                                <ListChecks className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={member.isActive ? 'text-emerald-600 border-emerald-300 bg-emerald-50' : 'text-red-600 border-red-300 bg-red-50'}>
                            {member.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!isManager && queues.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openAssignDialog(member)}
                                title="Manage queue assignments"
                                aria-label={`Manage queues for ${member.name}`}
                              >
                                <ListChecks className="w-4 h-4 text-emerald-600" />
                              </Button>
                            )}
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
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Queue Assignment Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAssignDialogOpen(false);
          setAssigningAgent(null);
          setLocalAssignments({});
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Queue Assignments</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {assigningAgent && (
                <>Assign queues to <strong>{assigningAgent.name}</strong>. Unassigned agents see all queues by default.</>
              )}
            </DialogDescription>
          </DialogHeader>
          {queues.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No queues available. Create queues first in the Queues tab.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-72 pr-2">
              <div className="space-y-1">
                {queues.map((queue) => (
                  <div
                    key={queue.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant="secondary" className="font-mono text-xs shrink-0">
                        {queue.prefix}
                      </Badge>
                      <span className="text-sm font-medium truncate">{queue.name}</span>
                    </div>
                    <Switch
                      checked={localAssignments[queue.id] ?? false}
                      onCheckedChange={() => toggleLocalAssignment(queue.id)}
                      aria-label={`Toggle ${queue.name} assignment`}
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          <Separator />
          <div className="text-xs text-muted-foreground px-1">
            {assigningAgent && (
              <>
                {Object.values(localAssignments).filter(Boolean).length === 0
                  ? 'No queues assigned — agent will see all queues.'
                  : `${Object.values(localAssignments).filter(Boolean).length} of ${queues.length} queues assigned. Agent will only see assigned queues.`}
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAssignDialogOpen(false);
                setAssigningAgent(null);
                setLocalAssignments({});
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAssignments}
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={assignSaving}
            >
              {assignSaving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Save Assignments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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