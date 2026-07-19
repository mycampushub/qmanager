'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Plus, Pencil, Trash2, MonitorDot, UserCheck,
  AlertCircle, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { ServiceCounter } from '@/lib/types';

/* ── Types ────────────────────────────────────────────── */

interface QueueOption {
  id: string;
  name: string;
  prefix: string;
}

/* ── Component ────────────────────────────────────────── */

export default function CountersTab({ tenantId }: { tenantId: string }) {
  const authToken = useAppStore((s) => s.authToken);

  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState('');
  const [counters, setCounters] = useState<ServiceCounter[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCounter, setEditingCounter] = useState<ServiceCounter | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<ServiceCounter | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ── Auth headers helper ─────────────────────────────── */
  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  /* ── Data fetching ────────────────────────────────────── */
  const fetchQueues = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) {
        const d = await res.json();
        const list = Array.isArray(d.tenant?._queues) ? d.tenant._queues : (Array.isArray(d.queues) ? d.queues : []);
        const mapped = list.map((q: { id: string; name: string; prefix: string }) => ({ id: q.id, name: q.name, prefix: q.prefix }));
        setQueues(mapped);
        // Auto-select first queue if none selected
        if (mapped.length > 0 && !selectedQueueId) {
          setSelectedQueueId(mapped[0].id);
        }
      }
    } catch {
      // silent
    }
  }, [tenantId, authHeaders, selectedQueueId]);

  const fetchCounters = useCallback(async (queueId: string) => {
    if (!queueId) return;
    try {
      const res = await fetch(`/api/counters?queueId=${queueId}`, { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setCounters(Array.isArray(d.counters) ? d.counters : []);
      }
    } catch {
      setCounters([]);
    }
  }, [authHeaders]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    await fetchQueues();
    setLoading(false);
  }, [fetchQueues]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // When selected queue changes, fetch counters
  useEffect(() => {
    if (selectedQueueId) {
      fetchCounters(selectedQueueId);
    } else {
      setCounters([]);
    }
  }, [selectedQueueId, fetchCounters]);

  /* ── Selected queue info ─────────────────────────────── */
  const selectedQueue = queues.find(q => q.id === selectedQueueId);

  /* ── Form reset / open ──────────────────────────────── */
  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormIsActive(true);
    setEditingCounter(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (counter: ServiceCounter) => {
    setEditingCounter(counter);
    setFormName(counter.name);
    setFormDescription(counter.description || '');
    setFormIsActive(counter.isActive);
    setDialogOpen(true);
  };

  /* ── Save (create or update) ────────────────────────── */
  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Counter name is required');
      return;
    }
    if (!selectedQueueId) {
      toast.error('Please select a queue first');
      return;
    }

    setSaving(true);
    try {
      const url = editingCounter ? `/api/counters/${editingCounter.id}` : '/api/counters';
      const method = editingCounter ? 'PUT' : 'POST';
      const body: Record<string, unknown> = {
        tenantId,
        queueId: selectedQueueId,
        name: formName.trim(),
        description: formDescription.trim() || null,
        isActive: formIsActive,
      };

      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || `Failed to ${editingCounter ? 'update' : 'create'} counter`);
        return;
      }

      toast.success(editingCounter ? 'Counter updated' : 'Counter created');
      setDialogOpen(false);
      resetForm();
      fetchCounters(selectedQueueId);
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  /* ── Delete ─────────────────────────────────────────── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget._servingTicket) {
      toast.error('Cannot delete a counter that is currently serving a ticket');
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/counters/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
        body: JSON.stringify({ tenantId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to delete counter');
        return;
      }

      toast.success('Counter deleted');
      setDeleteTarget(null);
      fetchCounters(selectedQueueId);
    } catch {
      toast.error('Network error');
    } finally {
      setDeleting(false);
    }
  };

  /* ── Loading state ───────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Service Counters</h2>
          {counters.length > 0 && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-100">
              {counters.length} counter{counters.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              size="sm"
              disabled={!selectedQueueId}
              onClick={openCreateDialog}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Counter
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingCounter ? 'Edit Counter' : 'Create Counter'}</DialogTitle>
              <DialogDescription>
                {editingCounter
                  ? 'Update counter details below.'
                  : 'Add a new service counter to the selected queue.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Queue</Label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50 text-sm">
                  <span className="font-medium">{selectedQueue?.prefix}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{selectedQueue?.name}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="counter-name">Counter Name *</Label>
                <Input
                  id="counter-name"
                  placeholder="e.g., Counter 1, Window A…"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="counter-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="counter-desc"
                  placeholder="e.g., Main reception, Priority service…"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  maxLength={255}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Active</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Inactive counters won't be assigned tickets</p>
                </div>
                <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={saving || !formName.trim()}
              >
                {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                {editingCounter ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Queue Selector ──────────────────────────────── */}
      <div className="space-y-2">
        <Label>Select Queue</Label>
        <Select value={selectedQueueId} onValueChange={setSelectedQueueId}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue placeholder="Choose a queue…" />
          </SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            {queues.map((q) => (
              <SelectItem key={q.id} value={q.id}>
                {q.prefix} — {q.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── No queue selected ──────────────────────────── */}
      {!selectedQueueId && queues.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
              <MonitorDot className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="font-medium text-emerald-800">Select a queue</p>
            <p className="text-sm text-emerald-600/80 mt-1">Choose a queue above to manage its service counters.</p>
          </CardContent>
        </Card>
      )}

      {/* ── Counters list ──────────────────────────────── */}
      {selectedQueueId && (
        <AnimatePresence mode="wait">
          {counters.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <Card className="border-emerald-200 bg-emerald-50/30">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                    <MonitorDot className="w-6 h-6 text-emerald-600" />
                  </div>
                  <p className="font-medium text-emerald-800">No counters yet</p>
                  <p className="text-sm text-emerald-600/80 mt-1">
                    Create service counters for <strong>{selectedQueue?.name}</strong> to assign agents.
                  </p>
                  <Button
                    className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
                    size="sm"
                    onClick={openCreateDialog}
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add First Counter
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {counters.map((counter, idx) => {
                const isServing = !!counter._servingTicket;
                const servingTicket = counter._servingTicket || null;

                return (
                  <motion.div
                    key={counter.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.04 }}
                  >
                    <Card className={`hover:shadow-sm transition-shadow ${!counter.isActive ? 'opacity-60' : ''} ${isServing ? 'border-emerald-400 ring-1 ring-emerald-200' : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                              isServing
                                ? 'bg-emerald-100'
                                : counter.isActive
                                  ? 'bg-slate-100'
                                  : 'bg-slate-50'
                            }`}>
                              <MonitorDot className={`w-4.5 h-4.5 ${
                                isServing
                                  ? 'text-emerald-600'
                                  : counter.isActive
                                    ? 'text-slate-600'
                                    : 'text-slate-400'
                              }`} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{counter.name}</p>
                              {counter.description && (
                                <p className="text-xs text-muted-foreground truncate">{counter.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {!isServing && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => openEditDialog(counter)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-red-600"
                              onClick={() => setDeleteTarget(counter)}
                              disabled={isServing}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Status badges */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {counter.isActive ? (
                            <Badge variant="secondary" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-500 hover:bg-slate-100">
                              Inactive
                            </Badge>
                          )}
                          {isServing && servingTicket && (
                            <Badge className="text-xs bg-emerald-600 text-white hover:bg-emerald-600">
                              <UserCheck className="w-3 h-3 mr-1" />
                              Serving {servingTicket.formattedSerial}
                            </Badge>
                          )}
                        </div>

                        {/* Serving ticket info */}
                        {isServing && servingTicket && (
                          <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                            <div className="flex items-center gap-2 text-sm">
                              <UserCheck className="w-4 h-4 text-emerald-600" />
                              <span className="font-medium text-emerald-800">
                                {servingTicket.formattedSerial}
                              </span>
                              {servingTicket.customerName && (
                                <span className="text-emerald-600">— {servingTicket.customerName}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ── Delete Confirmation Dialog ──────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Counter</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
              {deleteTarget?._servingTicket && (
                <span className="block mt-2 flex items-center gap-1.5 text-amber-700 font-medium">
                  <AlertCircle className="w-4 h-4" />
                  This counter is currently serving a ticket and cannot be deleted.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || !!deleteTarget?._servingTicket}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}