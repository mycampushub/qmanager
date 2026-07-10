'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, CalendarDays, UserCheck, UserX, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';

interface Appt {
  id: string;
  tenantId: string;
  queueId: string;
  customerName: string;
  customerPhone: string | null;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  notes: string | null;
  queue?: { id: string; name: string; prefix: string };
}

const STATUS_CFG: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  SCHEDULED: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700', icon: Clock },
  CHECKED_IN: { label: 'Checked In', cls: 'bg-amber-100 text-amber-700', icon: UserCheck },
  SERVING: { label: 'Serving', cls: 'bg-emerald-100 text-emerald-700', icon: AlertTriangle },
  COMPLETED: { label: 'Completed', cls: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700', icon: XCircle },
  NO_SHOW: { label: 'No Show', cls: 'bg-slate-100 text-slate-600', icon: UserX },
};

export default function AppointmentsTab({ tenantId }: { tenantId: string }) {
  const authToken = useAppStore((s) => s.authToken);
  const [appointments, setAppointments] = useState<Appt[]>([]);
  const [queues, setQueues] = useState<{ id: string; name: string; prefix: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formQueue, setFormQueue] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formTime, setFormTime] = useState('10:00');

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, qRes] = await Promise.all([
        fetch(`/api/appointments?tenantId=${tenantId}&scheduledDate=${selectedDate}`, { headers: authHeaders() }),
        fetch(`/api/queues?tenantId=${tenantId}`, { headers: authHeaders() }),
      ]);
      if (aRes.ok) { const d = await aRes.json(); setAppointments(Array.isArray(d.appointments) ? d.appointments : []); }
      if (qRes.ok) { const d = await qRes.json(); setQueues(Array.isArray(d.queues) ? d.queues : []); }
    } catch { toast.error('Failed to load appointments'); }
    finally { setLoading(false); }
  }, [tenantId, selectedDate, authHeaders]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!formName.trim() || !formQueue || !formDate || !formTime) { toast.error('Fill all required fields'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/appointments', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ tenantId, queueId: formQueue, customerName: formName.trim(), customerPhone: formPhone.trim() || undefined, scheduledDate: formDate, scheduledTime: formTime }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create'); return; }
      toast.success('Appointment created');
      setDialogOpen(false);
      setFormName(''); setFormPhone(''); setFormQueue(''); setFormDate(new Date().toISOString().slice(0, 10)); setFormTime('10:00');
      fetchData();
    } catch { toast.error('Network error'); }
    finally { setSaving(false); }
  };

  const handleStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/appointments', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ id, status }) });
      const data = await res.json();
      if (res.ok) { toast.success(`Appointment ${status.toLowerCase().replace('_', ' ')}`); fetchData(); }
      else toast.error(data.error || 'Failed to update');
    } catch { toast.error('Network error'); }
  };

  const stats = { total: appointments.length, checkedIn: appointments.filter(a => a.status === 'CHECKED_IN').length, completed: appointments.filter(a => a.status === 'COMPLETED').length, noShow: appointments.filter(a => a.status === 'NO_SHOW').length };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  const grouped = queues.map(q => ({ queue: q, items: appointments.filter(a => a.queueId === q.id) })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold">Appointments</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-40" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700" size="sm"><Plus className="w-4 h-4 mr-1" /> New</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Appointment</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2"><Label>Customer Name *</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} /></div>
                <div className="space-y-2"><Label>Phone</Label><Input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+880..." /></div>
                <div className="space-y-2"><Label>Queue *</Label>
                  <Select value={formQueue} onValueChange={setFormQueue}>
                    <SelectTrigger><SelectValue placeholder="Select queue" /></SelectTrigger>
                    <SelectContent>{queues.map(q => <SelectItem key={q.id} value={q.id}>{q.prefix} — {q.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Date *</Label><Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Time *</Label><Input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([{ l: 'Total', v: stats.total, c: '' }, { l: 'Checked In', v: stats.checkedIn, c: 'text-amber-600' }, { l: 'Completed', v: stats.completed, c: 'text-emerald-600' }, { l: 'No Shows', v: stats.noShow, c: 'text-red-600' }]).map((s) => (
          <Card key={s.l}><CardContent className="pt-3 pb-3 text-center"><p className={`text-2xl font-bold ${s.c}`}>{s.v}</p><p className="text-xs text-muted-foreground">{s.l}</p></CardContent></Card>
        ))}
      </div>

      {grouped.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No appointments for {selectedDate}</CardContent></Card>
      ) : (
        grouped.map(({ queue, items }) => (
          <Card key={queue.id}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{queue.prefix} — {queue.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {items.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)).map((a) => {
                const cfg = STATUS_CFG[a.status] || STATUS_CFG.SCHEDULED;
                const Icon = cfg.icon;
                return (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border">
                    <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{a.customerName}</span>
                        <Badge variant="outline" className={cfg.cls}>{cfg.label}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{a.scheduledTime}</span>
                        {a.customerPhone && <span>{a.customerPhone}</span>}
                      </div>
                    </div>
                    {a.status === 'SCHEDULED' && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatus(a.id, 'CHECKED_IN')}>Check In</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => handleStatus(a.id, 'NO_SHOW')}>No Show</Button>
                      </div>
                    )}
                    {a.status === 'CHECKED_IN' && (
                      <Badge className="bg-amber-100 text-amber-700 text-xs">Waiting</Badge>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}