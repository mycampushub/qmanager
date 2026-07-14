'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Plus, Pencil, Trash2, Clock, X as XIcon, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface ServiceWindow {
  id: string;
  tenantId: string;
  queueId: string | null;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
  isActive: boolean;
  queue?: { id: string; name: string; prefix: string };
}

export default function ServiceWindowsTab({ tenantId }: { tenantId: string }) {
  const authToken = useAppStore((s) => s.authToken);
  const [windows, setWindows] = useState<ServiceWindow[]>([]);
  const [queues, setQueues] = useState<{ id: string; name: string; prefix: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formDay, setFormDay] = useState('1');
  const [formOpen, setFormOpen] = useState('09:00');
  const [formClose, setFormClose] = useState('17:00');
  const [formQueueId, setFormQueueId] = useState('__all__');
  const [formClosed, setFormClosed] = useState(false);
  const [saving, setSaving] = useState(false);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const fetchData = useCallback(async () => {
    try {
      const [swRes, qRes] = await Promise.all([
        fetch(`/api/service-windows?tenantId=${tenantId}`, { headers: authHeaders() }),
        fetch(`/api/queues?tenantId=${tenantId}`, { headers: authHeaders() }),
      ]);
      if (swRes.ok) { const d = await swRes.json(); setWindows(Array.isArray(d.serviceWindows) ? d.serviceWindows : []); }
      if (qRes.ok) { const d = await qRes.json(); setQueues(Array.isArray(d.queues) ? d.queues : []); }
    } catch { toast.error('Failed to load service windows'); }
    finally { setLoading(false); }
  }, [tenantId, authHeaders]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => { setEditId(null); setFormDay('1'); setFormOpen('09:00'); setFormClose('17:00'); setFormQueueId('__all__'); setFormClosed(false); };

  const handleSave = async () => {
    if (!formClosed && formOpen >= formClose) {
      toast.error('Close time must be after open time');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        tenantId,
        dayOfWeek: parseInt(formDay),
        openTime: formOpen,
        closeTime: formClose,
        queueId: formQueueId === '__all__' ? null : formQueueId,
        isClosed: formClosed,
      };
      const isEdit = !!editId;
      if (isEdit) (body as Record<string, unknown>).id = editId;
      const res = await fetch('/api/service-windows', { method: isEdit ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to save'); return; }
      toast.success(isEdit ? 'Service window updated' : 'Service window created');
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch { toast.error('Network error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/service-windows?id=${id}`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) { toast.success('Service window removed'); fetchData(); }
      else { const d = await res.json(); toast.error(d.error || 'Failed to delete'); }
    } catch { toast.error('Network error'); }
  };

  const openEdit = (w: ServiceWindow) => {
    setEditId(w.id);
    setFormDay(String(w.dayOfWeek));
    setFormOpen(w.openTime);
    setFormClose(w.closeTime);
    setFormQueueId(w.queueId || '__all__');
    setFormClosed(w.isClosed);
    setDialogOpen(true);
  };

  const currentDay = new Date().getDay();
  const currentTime = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const todayWindow = windows.find(w => w.dayOfWeek === currentDay && w.isActive && !w.queueId);
  const isOpen = todayWindow ? !todayWindow.isClosed && todayWindow.openTime <= currentTime && currentTime < todayWindow.closeTime : true;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Service Windows</h2>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700" size="sm"><Plus className="w-4 h-4 mr-1" /> Add Window</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? 'Edit' : 'Add'} Service Window</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Day of Week</Label>
                <Select value={formDay} onValueChange={setFormDay}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <div className="space-y-2 flex-1"><Label>Open Time</Label><Input type="time" value={formOpen} onChange={(e) => setFormOpen(e.target.value)} /></div>
                <div className="space-y-2 flex-1"><Label>Close Time</Label><Input type="time" value={formClose} onChange={(e) => setFormClose(e.target.value)} /></div>
              </div>
              <div className="space-y-2">
                <Label>Queue</Label>
                <Select value={formQueueId} onValueChange={setFormQueueId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Queues</SelectItem>
                    {queues.map((q) => <SelectItem key={q.id} value={q.id}>{q.prefix} — {q.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Closed this day</Label>
                <Switch checked={formClosed} onCheckedChange={setFormClosed} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{editId ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className={isOpen ? 'border-emerald-200 bg-emerald-50/30' : 'border-red-200 bg-red-50/30'}>
        <CardContent className="pt-4 pb-4 flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isOpen ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`} />
          <span className="font-medium">{isOpen ? 'Currently OPEN' : 'Currently CLOSED'}</span>
          {todayWindow && <span className="text-sm text-muted-foreground ml-auto">
            {todayWindow.isClosed ? 'Closed today' : `${todayWindow.openTime} — ${todayWindow.closeTime}`}
          </span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Weekly Schedule</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {DAYS.map((day, dayIdx) => {
              const dayWindows = windows.filter(w => w.dayOfWeek === dayIdx && w.isActive);
              const isToday = dayIdx === currentDay;
              return (
                <div key={dayIdx} className={`flex items-center gap-3 p-3 rounded-lg border ${isToday ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-100'}`}>
                  <div className="w-20 sm:w-28 shrink-0">
                    <span className={`text-sm font-medium ${isToday ? 'text-emerald-700' : ''}`}>{day}</span>
                    {isToday && <Badge className="ml-2 bg-emerald-100 text-emerald-700 text-xs">Today</Badge>}
                  </div>
                  <div className="flex-1 flex flex-wrap gap-2">
                    {dayWindows.length === 0 && <span className="text-sm text-muted-foreground">No schedule</span>}
                    {dayWindows.map((w) => (
                      <Badge key={w.id} variant="outline" className={`text-xs ${w.isClosed ? 'border-red-300 text-red-600' : 'border-emerald-300 text-emerald-700'}`}>
                        {w.isClosed ? 'Closed' : `${w.openTime}–${w.closeTime}`}
                        {w.queue && <span className="ml-1 opacity-60">({w.queue.prefix})</span>}
                        <button className="ml-1 p-1 hover:text-foreground" onClick={() => openEdit(w)}><Pencil className="w-3 h-3 inline" /></button>
                        <button className="p-1 hover:text-red-500" onClick={() => handleDelete(w.id)}><Trash2 className="w-3 h-3 inline" /></button>
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}