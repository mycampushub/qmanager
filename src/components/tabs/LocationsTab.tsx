'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Pencil, Trash2, Loader2, MapPin, ArrowUp, ArrowDown, FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';

interface Location {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  _queueCount: number;
}

const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

export default function LocationsTab({ tenantId }: { tenantId: string }) {
  const authToken = useAppStore((s) => s.authToken);

  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await fetch(`/api/locations?tenantId=${tenantId}`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setLocations(Array.isArray(data.locations) ? data.locations : []);
    } catch {
      toast.error('Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, [tenantId, authHeaders]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const resetForm = () => {
    setEditId(null);
    setFormName('');
    setFormDescription('');
  };

  const handleSave = async () => {
    const trimmed = formName.trim();
    if (!trimmed) {
      toast.error('Location name is required');
      return;
    }
    if (trimmed.length > 100) {
      toast.error('Name must be 100 characters or less');
      return;
    }

    setSaving(true);
    try {
      const isEdit = !!editId;
      const body: Record<string, unknown> = {
        tenantId,
        name: trimmed,
        description: formDescription.trim() || null,
      };
      if (isEdit) body.id = editId;

      const res = await fetch('/api/locations', {
        method: isEdit ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || `Failed to ${isEdit ? 'update' : 'create'} location`);
        return;
      }
      toast.success(isEdit ? 'Location updated' : 'Location created');
      setDialogOpen(false);
      resetForm();
      fetchLocations();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/locations?id=${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        toast.success('Location removed');
        fetchLocations();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete location');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const handleReorder = async (location: Location, direction: 'up' | 'down') => {
    const sorted = [...locations].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((l) => l.id === location.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const other = sorted[swapIdx];
    try {
      const res = await fetch('/api/locations', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          id: location.id,
          tenantId,
          name: location.name,
          description: location.description,
          sortOrder: other.sortOrder,
        }),
      });
      if (res.ok) {
        fetchLocations();
      } else {
        toast.error('Failed to reorder');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const openEdit = (loc: Location) => {
    setEditId(loc.id);
    setFormName(loc.name);
    setFormDescription(loc.description || '');
    setDialogOpen(true);
  };

  const sorted = [...locations].sort((a, b) => a.sortOrder - b.sortOrder);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Locations</h2>
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
            {locations.length}
          </Badge>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700" size="sm">
              <Plus className="w-4 h-4 mr-1" /> Add Location
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? 'Edit' : 'Add'} Location</DialogTitle>
              <DialogDescription>
                {editId ? 'Update the location details below.' : 'Create a new location to organize queues by physical area.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="loc-name">Name *</Label>
                <Input
                  id="loc-name"
                  placeholder="e.g. Dhanmondi Branch"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">
                  {formName.length}/100 characters
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-desc">Description</Label>
                <Input
                  id="loc-desc"
                  placeholder="Optional description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={saving}
              >
                {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {editId ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Content */}
      {sorted.length === 0 ? (
        <motion.div
          {...fadeInUp}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-emerald-400" />
          </div>
          <p className="text-muted-foreground max-w-md">
            No locations created yet. Locations help organize queues by physical area.
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sorted.map((loc, idx) => (
            <motion.div key={loc.id} {...fadeInUp} transition={{ duration: 0.25, delay: idx * 0.04 }}>
              <Card className="h-full">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                        <MapPin className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{loc.name}</span>
                          {loc.isActive ? (
                            <Badge className="bg-emerald-100 text-emerald-700 text-xs border-0">Active</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Inactive</Badge>
                          )}
                        </div>
                        {loc.description && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{loc.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-emerald-700 border-emerald-200">
                            {loc._queueCount} {loc._queueCount === 1 ? 'queue' : 'queues'}
                          </Badge>
                          <span>#{loc.sortOrder}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === 0}
                        onClick={() => handleReorder(loc, 'up')}
                        aria-label="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === sorted.length - 1}
                        onClick={() => handleReorder(loc, 'down')}
                        aria-label="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(loc)}
                        aria-label="Edit location"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(loc.id)}
                        aria-label="Delete location"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}