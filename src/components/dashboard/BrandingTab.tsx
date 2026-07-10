'use client';

import { useState, useEffect, useRef } from 'react';
import { Palette, Loader2, Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import { QRCodeDisplay } from '@/components/QRCode';
import type { Queue } from '@/lib/types';

// ─── QUEUE QR CODES SECTION ─────────────────────────────────
function QueueQRCodes({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [queues, setQueues] = useState<Queue[]>([]);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const tenantUrl = `${origin}/?tenant=${tenantId}`;
  const generalRef = useRef<HTMLDivElement>(null);
  const qrRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/tenants/${tenantId}/queues`);
        const data = await res.json();
        if (Array.isArray(data.queues)) setQueues(data.queues);
      } catch { /* silent */ }
    })();
  }, [tenantId]);

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  };

  const handleDownload = (name: string, el: HTMLDivElement | null) => {
    if (!el) return;
    const svg = el.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qrcode-${tenantName.toLowerCase().replace(/\s+/g, '-')}-${name.toLowerCase().replace(/\s+/g, '-')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setQrRef = (queueId: string) => (el: HTMLDivElement | null) => {
    qrRefs.current.set(queueId, el);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Queue QR Codes</CardTitle>
            <CardDescription className="text-xs mt-1">Print these QR codes so customers can scan to join your queue instantly</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* General tenant QR code */}
        <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-lg border bg-slate-50/50 mb-6">
          <div className="shrink-0 bg-white p-3 rounded-xl shadow-sm border" ref={generalRef}>
            <QRCodeDisplay value={tenantUrl} size={140} />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="font-semibold">General Queue Join Link</p>
            <p className="text-xs text-muted-foreground mt-1 break-all">{tenantUrl}</p>
            <p className="text-xs text-muted-foreground mt-2">Customers scan this to see all your queues and pick one.</p>
            <div className="flex gap-2 mt-3 justify-center sm:justify-start">
              <Button variant="outline" size="sm" onClick={() => handleCopy(tenantUrl)}>
                <Copy className="w-3.5 h-3.5 mr-1" /> Copy Link
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleDownload('general', generalRef.current)}>
                <Download className="w-3.5 h-3.5 mr-1" /> Download SVG
              </Button>
            </div>
          </div>
        </div>

        {/* Per-queue QR codes */}
        {queues.length > 0 && (
          <>
            <p className="text-sm font-medium mb-3">Per-Queue QR Codes</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {queues.map((q) => {
                const queueUrl = `${origin}/?tenant=${tenantId}&queue=${q.id}`;
                return (
                  <div key={q.id} className="flex flex-col items-center gap-2 p-3 rounded-lg border bg-white">
                    <div className="bg-white p-2 rounded-lg shadow-sm border" ref={setQrRef(q.id)}>
                      <QRCodeDisplay value={queueUrl} size={100} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">{q.prefix}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[120px]">{q.name}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleCopy(queueUrl)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleDownload(q.prefix, qrRefs.current.get(q.id) ?? null)}>
                        <Download className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── BRANDING TAB ───────────────────────────────────────────
export function BrandingTab({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [branding, setBranding] = useState({ primaryColor: '#059669', secondaryColor: '#34d399', logoText: 'QF', welcomeMessage: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/tenants/branding?tenantId=${tenantId}`);
        const data = await res.json();
        if (data.branding) {
          setBranding((prev) => ({ ...prev, ...data.branding }));
        }
        if (data.welcomeMessage) {
          setBranding((prev) => ({ ...prev, welcomeMessage: data.welcomeMessage }));
        }
      } catch { /* use defaults */ }
      finally { setLoading(false); }
    })();
  }, [tenantId]);

  const authToken = useAppStore((s) => s.authToken);

  const handleSave = async () => {
    setSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/tenants/branding', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ tenantId, brandingConfig: branding }),
      });
      if (res.ok) {
        toast.success('Branding updated successfully');
      } else {
        toast.error('Failed to save branding');
      }
    } catch { toast.error('Failed to save branding'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Branding &amp; Appearance</h2>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Customize</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Primary Color</Label>
              <div className="flex gap-2">
                <Input type="color" value={branding.primaryColor} onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })} className="w-12 h-10 p-1 cursor-pointer" />
                <Input value={branding.primaryColor} onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })} className="flex-1 font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Secondary Color</Label>
              <div className="flex gap-2">
                <Input type="color" value={branding.secondaryColor} onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })} className="w-12 h-10 p-1 cursor-pointer" />
                <Input value={branding.secondaryColor} onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })} className="flex-1 font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Logo Text (2 letters)</Label>
              <Input maxLength={2} value={branding.logoText} onChange={(e) => setBranding({ ...branding, logoText: e.target.value.toUpperCase() })} className="w-24 text-center text-2xl font-bold" />
            </div>
            <div className="space-y-2">
              <Label>Welcome Message</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={branding.welcomeMessage}
                onChange={(e) => setBranding({ ...branding, welcomeMessage: e.target.value })}
                placeholder="Welcome to our service! Please join the queue."
              />
            </div>
            <Button onClick={handleSave} className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Palette className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* Live Preview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ticket Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-xl overflow-hidden">
              <div className="p-4 text-white text-center" style={{ backgroundColor: branding.primaryColor }}>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/20 text-2xl font-bold mb-2">
                  {branding.logoText}
                </div>
                <p className="font-semibold">{tenantName}</p>
              </div>
              <div className="p-6 text-center">
                <p className="text-3xl font-bold" style={{ color: branding.primaryColor }}>A-006</p>
                <p className="text-muted-foreground mt-1">General Queue</p>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Position</span>
                    <span className="font-medium">5th in line</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Est. Wait</span>
                    <span className="font-medium">~15 min</span>
                  </div>
                </div>
                <div className="mt-4">
                  <Progress value={60} className="h-2" />
                </div>
                <p className="text-xs text-muted-foreground mt-3">{branding.welcomeMessage || 'Welcome!'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue QR Codes */}
      <QueueQRCodes tenantId={tenantId} tenantName={tenantName} />
    </div>
  );
}