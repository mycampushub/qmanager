'use client';

import { useState, useEffect, useMemo, useCallback, useReducer } from 'react';
import { motion } from 'framer-motion';
import { Plus, Loader2, Pencil, ShieldCheck, ShieldX, Trash2, Search, MapPin, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { StaffUser, Queue, Location } from '@/lib/types';

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
  const authToken = useAppStore((s) => s.authToken);

  // Single form state via reducer — avoids multiple setState calls in effects
  type FormState = { locationId: string; name: string; description: string; prefix: string; defaultServiceTimeSec: string };
  const initialForm: FormState = {
    locationId: queue?.locationId || '__none__',
    name: queue?.name || '',
    description: queue?.description || '',
    prefix: queue?.prefix || '',
    defaultServiceTimeSec: String(queue?.defaultServiceTimeSec || 300),
  };
  const [form, setForm] = useReducer((prev: FormState, next: Partial<FormState>) => ({ ...prev, ...next }), initialForm);
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);

  // Fetch locations when dialog opens
  useEffect(() => {
    if (!open) return;
    const headers: Record<string, string> = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    fetch(`/api/locations?tenantId=${tenantId}`, { headers })
      .then((res) => res.json())
      .then((data) => {
        setLocations(Array.isArray(data.locations) ? data.locations.filter((l: Location) => l.isActive) : []);
      })
      .catch(() => setLocations([]))
      .finally(() => setLocationsLoading(false));
  }, [open, tenantId, authToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.prefix.trim()) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const payloadLocationId = form.locationId === '__none__' ? undefined : form.locationId;

      if (isEdit) {
        const res = await fetch('/api/queues', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            queueId: queue!.id,
            locationId: payloadLocationId,
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            prefix: form.prefix.trim().toUpperCase(),
            defaultServiceTimeSec: parseInt(form.defaultServiceTimeSec) || 300,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to update queue'); return; }
        toast.success(`Queue "${form.name}" updated`);
      } else {
        const res = await fetch('/api/queues', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            tenantId,
            locationId: payloadLocationId,
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            prefix: form.prefix.trim().toUpperCase(),
            defaultServiceTimeSec: parseInt(form.defaultServiceTimeSec) || 300,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to create queue'); return; }
        toast.success(`Queue "${form.name}" created`);
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
            <Label htmlFor="queue-location">Location</Label>
            <Select value={form.locationId} onValueChange={(v) => setForm({ locationId: v })} disabled={locationsLoading}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={locationsLoading ? 'Loading locations...' : 'Select location'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No location</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Optional: assign this queue to a location</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="queue-name">Name *</Label>
            <Input id="queue-name" placeholder="e.g. General, VIP" value={form.name} onChange={(e) => setForm({ name: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="queue-desc">Description</Label>
            <Input id="queue-desc" placeholder="Optional description" value={form.description} onChange={(e) => setForm({ description: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="queue-prefix">Prefix * <span className="text-xs text-muted-foreground">(1-2 chars)</span></Label>
            <Input id="queue-prefix" placeholder="e.g. A, VIP" maxLength={2} value={form.prefix} onChange={(e) => setForm({ prefix: e.target.value.toUpperCase() })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="queue-time">Default Service Time (seconds)</Label>
            <Input id="queue-time" type="number" min={10} value={form.defaultServiceTimeSec} onChange={(e) => setForm({ defaultServiceTimeSec: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={loading || !form.name.trim() || !form.prefix.trim()}>
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

// ─── QUEUES TAB (with CRUD, Search, Filter, Join Pause) ─────
export function QueuesTab({ user, tenantData, onRefresh }: { user: StaffUser; tenantData: { queues: Queue[] } | null; onRefresh: () => void }) {
  const queues = tenantData?.queues || [];
  const isManager = user.role === 'MANAGER';
  const authToken = useAppStore((s) => s.authToken);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<string>('__all__');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  // Edit dialog
  const [editQueue, setEditQueue] = useState<Queue | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // Delete dialog
  const [deleteQueue, setDeleteQueue] = useState<Queue | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Join pause toggling state per queue id
  const [togglingJoinPause, setTogglingJoinPause] = useState<Record<string, boolean>>({});

  // Derive unique location names from queues
  const locationNames = useMemo(() => {
    const names = new Set<string>();
    queues.forEach((q) => {
      if (q.location?.name) names.add(q.location.name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [queues]);

  // Client-side filtered queues
  const filteredQueues = useMemo(() => {
    let result = queues;
    // Search filter
    if (searchQuery.trim()) {
      const lower = searchQuery.trim().toLowerCase();
      result = result.filter((q) => q.name.toLowerCase().includes(lower));
    }
    // Location filter
    if (locationFilter !== '__all__') {
      result = result.filter((q) => q.location?.name === locationFilter);
    }
    return result;
  }, [queues, searchQuery, locationFilter]);

  // Group filtered queues by location object
  const groupedQueues = useMemo(() => {
    return filteredQueues.reduce<Record<string, Queue[]>>((acc, q) => {
      const groupName = q.location?.name || 'Unassigned';
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(q);
      return acc;
    }, {});
  }, [filteredQueues]);

  const locationTags = useMemo(() => {
    return Object.keys(groupedQueues).sort((a, b) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });
  }, [groupedQueues]);

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

  const handleToggleJoinPause = useCallback(async (queue: Queue) => {
    setTogglingJoinPause((prev) => ({ ...prev, [queue.id]: true }));
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/queues', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ queueId: queue.id, joinPaused: !queue.joinPaused }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to toggle join pause'); return; }
      toast.success(`Queue "${queue.name}" join ${!queue.joinPaused ? 'paused' : 'resumed'}`);
      onRefresh();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setTogglingJoinPause((prev) => ({ ...prev, [queue.id]: false }));
    }
  }, [authToken, onRefresh]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9"
          placeholder="Search queues..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Location filter tabs */}
      {locationNames.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
          <Button
            variant={locationFilter === '__all__' ? 'default' : 'outline'}
            size="sm"
            className="shrink-0"
            onClick={() => setLocationFilter('__all__')}
          >
            All Locations
          </Button>
          {locationNames.map((locName) => (
            <Button
              key={locName}
              variant={locationFilter === locName ? 'default' : 'outline'}
              size="sm"
              className="shrink-0"
              onClick={() => setLocationFilter(locName)}
            >
              {locName}
            </Button>
          ))}
        </div>
      )}

      {/* Grouped queue cards */}
      {locationTags.map((tag) => (
        <div key={tag} className="space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{tag}</h3>
            <div className="flex-1 h-px bg-border" />
            <Badge variant="outline" className="text-xs">{groupedQueues[tag].length}</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {groupedQueues[tag].map((queue, idx) => (
              <motion.div key={queue.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                <Card className={`${queue.isActive ? '' : 'opacity-50'} ${queue.joinPaused ? 'opacity-75' : ''}`}>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                          {queue.prefix}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{queue.name}</p>
                            {queue.joinPaused && (
                              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50 gap-1">
                                <Pause className="w-3 h-3" />
                                PAUSED
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">Avg: {queue._avgServiceTime || queue.defaultServiceTimeSec}s per customer</p>
                        </div>
                      </div>
                      <Badge variant={queue.isActive ? 'default' : 'secondary'} className={queue.isActive ? 'bg-emerald-100 text-emerald-700' : ''}>
                        {queue.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center pt-3 border-t">
                      <div>
                        <p className="text-base sm:text-lg font-bold">{queue.nowServingSerial ? `${queue.prefix}-${String(queue.nowServingSerial).padStart(3, '0')}` : '—'}</p>
                        <p className="text-xs text-muted-foreground">Serving</p>
                      </div>
                      <div>
                        <p className="text-base sm:text-lg font-bold text-amber-600">{queue._waitingCount || 0}</p>
                        <p className="text-xs text-muted-foreground">Waiting</p>
                      </div>
                      <div>
                        <p className="text-base sm:text-lg font-bold">{queue._ewt ? `${Math.ceil(queue._ewt / 60)}m` : '—'}</p>
                        <p className="text-xs text-muted-foreground">EWT</p>
                      </div>
                    </div>
                    {isManager && (
                      <div className="flex items-center justify-between pt-3 border-t mt-3">
                        <div className="flex items-center gap-1">
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
                        {/* Join Pause toggle */}
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${queue.joinPaused ? 'text-amber-600' : 'text-emerald-600'}`}>
                            Join
                          </span>
                          <Switch
                            checked={!queue.joinPaused}
                            disabled={togglingJoinPause[queue.id]}
                            onCheckedChange={() => handleToggleJoinPause(queue)}
                            className={`data-[state=unchecked]:bg-amber-400 data-[state=checked]:bg-emerald-500 ${togglingJoinPause[queue.id] ? 'opacity-50' : ''}`}
                            aria-label={`Toggle join pause for ${queue.name}`}
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      ))}

      {filteredQueues.length === 0 && queues.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            No queues match your search or filter.
          </CardContent>
        </Card>
      )}

      {queues.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            No queues configured. Contact your manager to set up service lines.
          </CardContent>
        </Card>
      )}

      {/* CRUD Dialogs — key prop forces remount for form reset */}
      <QueueFormDialog key={createOpen ? 'create-open' : 'create-closed'} open={createOpen} onOpenChange={setCreateOpen} queue={null} tenantId={user.tenantId} onRefresh={onRefresh} />
      <QueueFormDialog key={editQueue?.id ?? 'edit-none'} open={editOpen} onOpenChange={setEditOpen} queue={editQueue} tenantId={user.tenantId} onRefresh={onRefresh} />
      <DeleteQueueDialog open={deleteOpen} onOpenChange={setDeleteOpen} queue={deleteQueue} onRefresh={onRefresh} />
    </div>
  );
}