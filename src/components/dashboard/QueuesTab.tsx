'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Loader2, Pencil, ShieldCheck, ShieldX, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { StaffUser, Queue } from '@/lib/types';

// ─── QUEUE CRUD DIALOGS ─────────────────────────────────────
function QueueFormDialog({
  open,
  onOpenChange,
  queue,
  tenantId,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: Queue | null;
  tenantId: string;
  onRefresh: () => void;
}) {
  const isEdit = !!queue;
  const [name, setName] = useState(queue?.name || '');
  const [description, setDescription] = useState(queue?.description || '');
  const [prefix, setPrefix] = useState(queue?.prefix || '');
  const [defaultServiceTimeSec, setDefaultServiceTimeSec] = useState(String(queue?.defaultServiceTimeSec || 300));
  const [loading, setLoading] = useState(false);
  const authToken = useAppStore((s) => s.authToken);

  useEffect(() => {
    if (open) {
      setName(queue?.name || '');
      setDescription(queue?.description || '');
      setPrefix(queue?.prefix || '');
      setDefaultServiceTimeSec(String(queue?.defaultServiceTimeSec || 300));
    }
  }, [open, queue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prefix.trim()) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      if (isEdit) {
        const res = await fetch('/api/queues', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            queueId: queue!.id,
            name: name.trim(),
            description: description.trim() || undefined,
            prefix: prefix.trim().toUpperCase(),
            defaultServiceTimeSec: parseInt(defaultServiceTimeSec) || 300,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to update queue'); return; }
        toast.success(`Queue "${name}" updated`);
      } else {
        const res = await fetch('/api/queues', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            tenantId,
            name: name.trim(),
            description: description.trim() || undefined,
            prefix: prefix.trim().toUpperCase(),
            defaultServiceTimeSec: parseInt(defaultServiceTimeSec) || 300,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to create queue'); return; }
        toast.success(`Queue "${name}" created`);
      }
      onOpenChange(false);
      onRefresh();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Queue' : 'Create Queue'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="queue-name">Name *</Label>
            <Input id="queue-name" placeholder="e.g. General, VIP" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="queue-desc">Description</Label>
            <Input id="queue-desc" placeholder="Optional description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="queue-prefix">Prefix * <span className="text-xs text-muted-foreground">(1-2 chars)</span></Label>
            <Input id="queue-prefix" placeholder="e.g. A, VIP" maxLength={2} value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="queue-time">Default Service Time (seconds)</Label>
            <Input id="queue-time" type="number" min={10} value={defaultServiceTimeSec} onChange={(e) => setDefaultServiceTimeSec(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={loading || !name.trim() || !prefix.trim()}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Queue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteQueueDialog({
  open,
  onOpenChange,
  queue,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: Queue | null;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const authToken = useAppStore((s) => s.authToken);

  const handleDelete = async () => {
    if (!queue) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/queues', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ queueId: queue.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete queue'); return; }
      toast.success(`Queue "${queue.name}" deactivated`);
      onOpenChange(false);
      onRefresh();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate Queue</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to deactivate <strong>{queue?.name}</strong>? This action can be undone by re-activating the queue later.
        </p>
        <p className="text-xs text-amber-600">
          Queues with active waiting tickets cannot be deactivated.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── QUEUES TAB (with CRUD) ─────────────────────────────────
export function QueuesTab({ user, tenantData, onRefresh }: { user: StaffUser; tenantData: { queues: Queue[] } | null; onRefresh: () => void }) {
  const queues = tenantData?.queues || [];
  const isManager = user.role === 'MANAGER';
  const authToken = useAppStore((s) => s.authToken);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  // Edit dialog
  const [editQueue, setEditQueue] = useState<Queue | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // Delete dialog
  const [deleteQueue, setDeleteQueue] = useState<Queue | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleOpenEdit = (queue: Queue) => {
    setEditQueue(queue);
    setEditOpen(true);
  };

  const handleOpenDelete = (queue: Queue) => {
    setDeleteQueue(queue);
    setDeleteOpen(true);
  };

  const handleToggleActive = async (queue: Queue) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/queues', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ queueId: queue.id, isActive: !queue.isActive }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to toggle queue'); return; }
      toast.success(`Queue "${queue.name}" ${queue.isActive ? 'deactivated' : 'activated'}`);
      onRefresh();
    } catch {
      toast.error('Network error. Please try again.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Service Queues</h2>
          <Badge variant="secondary">{queues.filter(q => q.isActive).length} active</Badge>
        </div>
        {isManager && (
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Create Queue
          </Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {queues.map((queue) => (
          <motion.div key={queue.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: queues.indexOf(queue) * 0.05 }}>
            <Card className={queue.isActive ? '' : 'opacity-50'}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                      {queue.prefix}
                    </div>
                    <div>
                      <p className="font-medium">{queue.name}</p>
                      <p className="text-xs text-muted-foreground">Avg: {queue._avgServiceTime || queue.defaultServiceTimeSec}s per customer</p>
                    </div>
                  </div>
                  <Badge variant={queue.isActive ? 'default' : 'secondary'} className={queue.isActive ? 'bg-emerald-100 text-emerald-700' : ''}>
                    {queue.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center pt-3 border-t">
                  <div>
                    <p className="text-lg font-bold">{queue.nowServingSerial ? `${queue.prefix}-${String(queue.nowServingSerial).padStart(3, '0')}` : '—'}</p>
                    <p className="text-xs text-muted-foreground">Serving</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-600">{queue._waitingCount || 0}</p>
                    <p className="text-xs text-muted-foreground">Waiting</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{queue._ewt ? `${Math.ceil(queue._ewt / 60)}m` : '—'}</p>
                    <p className="text-xs text-muted-foreground">EWT</p>
                  </div>
                </div>
                {isManager && (
                  <div className="flex items-center gap-1 pt-3 border-t mt-3">
                    <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => handleOpenEdit(queue)} aria-label={`Edit ${queue.name}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => handleToggleActive(queue)} aria-label={`${queue.isActive ? 'Deactivate' : 'Activate'} ${queue.name}`}>
                      {queue.isActive ? <ShieldX className="w-3.5 h-3.5 text-amber-600" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => handleOpenDelete(queue)} aria-label={`Delete ${queue.name}`}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
      {queues.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            No queues configured. Contact your manager to set up service lines.
          </CardContent>
        </Card>
      )}

      {/* CRUD Dialogs */}
      <QueueFormDialog open={createOpen} onOpenChange={setCreateOpen} queue={null} tenantId={user.tenantId} onRefresh={onRefresh} />
      <QueueFormDialog open={editOpen} onOpenChange={setEditOpen} queue={editQueue} tenantId={user.tenantId} onRefresh={onRefresh} />
      <DeleteQueueDialog open={deleteOpen} onOpenChange={setDeleteOpen} queue={deleteQueue} onRefresh={onRefresh} />
    </div>
  );
}