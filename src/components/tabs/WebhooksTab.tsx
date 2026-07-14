'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Copy, Check, Trash2, Webhook, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';

const EVENT_OPTIONS = ['TICKET_CREATED', 'TICKET_CALLED', 'TICKET_COMPLETED', 'TICKET_SKIPPED', 'TICKET_CANCELLED', 'FEEDBACK_SUBMITTED'];

interface WebhookItem {
  id: string;
  url: string;
  events: string;
  secret: string;
  isActive: boolean;
  successCount: number;
  failureCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) return '••••••••';
  return '••••' + secret.slice(-4);
}

function timeAgo(d: string | null): string {
  if (!d) return 'Never';
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function WebhooksTab({ tenantId }: { tenantId: string }) {
  const authToken = useAppStore((s) => s.authToken);
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formUrl, setFormUrl] = useState('');
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [formSecret, setFormSecret] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/webhooks?tenantId=${tenantId}`, { headers: authHeaders() });
      if (res.ok) { const d = await res.json(); setWebhooks(Array.isArray(d.webhooks) ? d.webhooks : []); }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [tenantId, authHeaders]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => { setFormUrl(''); setFormEvents([]); setFormSecret(''); };

  const handleCreate = async () => {
    if (!formUrl.trim()) { toast.error('URL is required'); return; }
    try { new URL(formUrl); } catch { toast.error('Invalid URL'); return; }
    if (formEvents.length === 0) { toast.error('Select at least one event'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/webhooks', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ tenantId, url: formUrl.trim(), events: formEvents, secret: formSecret || undefined }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      toast.success('Webhook created');
      setDialogOpen(false); resetForm(); fetchData();
    } catch { toast.error('Network error'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (wh: WebhookItem) => {
    try {
      const res = await fetch('/api/webhooks', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ id: wh.id, isActive: !wh.isActive }) });
      if (res.ok) { toast.success(wh.isActive ? 'Webhook disabled' : 'Webhook enabled'); fetchData(); }
    } catch { toast.error('Network error'); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/webhooks?id=${deleteId}&confirm=true`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) { toast.success('Webhook deleted'); fetchData(); }
      else { const d = await res.json(); toast.error(d.error || 'Failed'); }
    } catch { toast.error('Network error'); }
    finally { setDeleteId(null); }
  };

  const copySecret = (id: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Webhooks</h2>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700" size="sm"><Plus className="w-4 h-4 mr-1" /> Add Webhook</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Webhook</DialogTitle><DialogDescription>Webhooks notify external systems when events occur in your queues.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2"><Label>Endpoint URL *</Label><Input placeholder="https://your-server.com/webhook" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Events *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {EVENT_OPTIONS.map((ev) => (
                    <label key={ev} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={formEvents.includes(ev)} onChange={(e) => {
                        setFormEvents(e.target.checked ? [...formEvents, ev] : formEvents.filter(x => x !== ev));
                      }} className="rounded border-slate-300" />
                      {ev}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Signing Secret <span className="text-muted-foreground text-xs">(auto-generated if empty)</span></Label>
                <Input placeholder="whsec_..." value={formSecret} onChange={(e) => setFormSecret(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {webhooks.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Webhook className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <p className="text-muted-foreground font-medium">No webhooks configured</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">Webhooks let you integrate QueueFlow with external systems like Slack, CRM, or custom services.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => {
            const events = JSON.parse(wh.events || '[]') as string[];
            return (
              <Card key={wh.id} className={!wh.isActive ? 'opacity-50' : ''}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5"><Webhook className="w-5 h-5 text-muted-foreground" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono truncate">{wh.url}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {events.map((ev) => <Badge key={ev} variant="outline" className="text-xs">{ev.replace('TICKET_', '').replace('FEEDBACK_', '')}</Badge>)}
                      </div>
                      <div className="flex items-center flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                        <span>Secret: {maskSecret(wh.secret)}
                          <button className="ml-1 hover:text-foreground" onClick={() => copySecret(wh.id, wh.secret)}>
                            {copiedId === wh.id ? <Check className="w-3 h-3 inline text-emerald-500" /> : <Copy className="w-3 h-3 inline" />}
                          </button>
                        </span>
                        <span className="text-emerald-600">✓ {wh.successCount}</span>
                        <span className="text-red-500">✗ {wh.failureCount}</span>
                        <span>Last: {timeAgo(wh.lastTriggeredAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.isActive} onCheckedChange={() => toggleActive(wh)} />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setDeleteId(wh.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Webhook?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. All event deliveries to this endpoint will stop.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}