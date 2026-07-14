'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Upload, Globe, Download, Languages, CreditCard, Info, Monitor, Copy, ExternalLink, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import { useLocale, type Locale } from '@/lib/i18n';
import { QRCodeDisplay } from '@/components/QRCode';

export default function SettingsTab({ tenantId }: { tenantId: string }) {
  const authToken = useAppStore((s) => s.authToken);
  const { locale, setLocale, t } = useLocale();

  // ── Logo Upload State ──
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Tenant Contact Info ──
  const [tenantName, setTenantName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // ── Payment Gateway State ──
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  // ── TV Display URL ──
  const [copied, setCopied] = useState(false);
  const displayUrl = typeof window !== 'undefined' ? `${window.location.origin}/?display=${tenantId}` : '';

  const handleCopyDisplayUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      toast.success('Display URL copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy URL');
    }
  }, [displayUrl]);

  const handleOpenDisplay = useCallback(() => {
    window.open(displayUrl, '_blank');
  }, [displayUrl]);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  // ── Fetch Tenant Settings ──
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const data = await res.json();
      if (data.tenant) {
        const t = data.tenant;
        setTenantName(t.name || '');
        setLogoUrl(t.logoUrl || null);
        setContactEmail(t.contactEmail || '');
        setContactPhone(t.contactPhone || '');
        setAddress(t.address || '');
        setWelcomeMessage(t.welcomeMessage || '');
      }
    } catch { /* silent */ }
    finally { setLoadingSettings(false); }
  }, [tenantId, authHeaders]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // ── Logo Upload ──
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Only image files are allowed'); return; }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tenantId', tenantId);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setLogoUrl(data.logoUrl);
        toast.success('Logo uploaded successfully');
      } else {
        toast.error(data.error || 'Upload failed');
      }
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Save Settings ──
  const handleSaveSettings = async () => {
    if (!tenantName.trim()) { toast.error('Tenant name is required'); return; }
    setSavingSettings(true);
    try {
      const res = await fetch('/api/tenants/manage', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, name: tenantName.trim(), contactEmail, contactPhone, address, welcomeMessage }),
      });
      const data = await res.json();
      if (res.ok) { toast.success('Settings saved'); fetchSettings(); }
      else { toast.error(data.error || 'Failed to save'); }
    } catch { toast.error('Failed to save settings'); }
    finally { setSavingSettings(false); }
  };

  // ── Payment via Gateway ──
  const handlePayment = async () => {
    const tk = parseInt(paymentAmount);
    if (isNaN(tk) || tk <= 0) { toast.error('Enter a valid amount'); return; }
    setPaymentProcessing(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, amountCents: tk * 100, method: 'MANUAL' }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Payment of ৳${tk} processed successfully`);
        setPaymentAmount('');
      } else {
        toast.error(data.error || 'Payment failed');
      }
    } catch { toast.error('Payment processing failed'); }
    finally { setPaymentProcessing(false); }
  };

  // ── Handle Locale Change ──
  const handleLocaleChange = (newLocale: string) => {
    setLocale(newLocale as Locale);
    toast.success(`Language changed to ${newLocale === 'en' ? 'English' : 'বাংলা'}`);
  };

  // ── CSV Export ──
  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const res = await fetch(`/api/tenants/analytics/export?tenantId=${tenantId}&format=${format}`, { headers: authHeaders() });
      if (format === 'csv' && res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `queueflow-analytics-${new Date().toISOString().slice(0, 10)}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Export downloaded');
      } else if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `queueflow-analytics-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Export downloaded');
      } else {
        toast.error('Export failed');
      }
    } catch { toast.error('Export failed'); }
  };

  if (loadingSettings) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      {/* ── TV Display ── */}
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="w-4 h-4 text-emerald-600" /> TV Display
          </CardTitle>
          <CardDescription>Set up a real-time queue display on a TV or monitor in your waiting area</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* URL + Copy + Open */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white border border-slate-200">
                <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  readOnly
                  value={displayUrl}
                  className="flex-1 min-w-0 bg-transparent text-sm font-mono text-foreground outline-none truncate"
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyDisplayUrl}
              className="shrink-0"
            >
              {copied ? <Check className="w-4 h-4 mr-1 text-emerald-600" /> : <Copy className="w-4 h-4 mr-1" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              size="sm"
              onClick={handleOpenDisplay}
              className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
            >
              <ExternalLink className="w-4 h-4 mr-1" /> Open
            </Button>
          </div>

          {/* QR Code + Instructions */}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="shrink-0 p-3 bg-white rounded-xl border border-slate-200">
              <QRCodeDisplay value={displayUrl} size={120} />
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium text-foreground">How to set up:</p>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Open the URL above on your TV or smart display&apos;s browser</li>
                <li>Or scan the QR code from a tablet/phone connected to the TV</li>
                <li>The display auto-updates in real-time — no refresh needed</li>
                <li>For best results, use fullscreen mode (F11) on the TV browser</li>
              </ol>
              <p className="text-xs text-muted-foreground pt-1">
                The display shows: current ticket being served, queue status, estimated wait times, and a QR code for customers to join.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Logo Upload ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" /> Logo
          </CardTitle>
          <CardDescription>Upload a logo for your organization (max 2MB, PNG/JPG/WebP)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Tenant logo" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-muted-foreground">QF</span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                {uploading ? 'Uploading...' : 'Upload Logo'}
              </Button>
              {logoUrl && (
                <p className="text-xs text-muted-foreground truncate max-w-xs">{logoUrl}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tenant Name ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Business Name</CardTitle>
          <CardDescription>Your organization name displayed to customers and staff</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tenant Name</Label>
            <Input placeholder="e.g. QuickBite Restaurant" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
          </div>
          <Button onClick={handleSaveSettings} className="bg-emerald-600 hover:bg-emerald-700" disabled={savingSettings || !tenantName.trim()}>
            {savingSettings && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save Name
          </Button>
        </CardContent>
      </Card>

      {/* ── Contact Information ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contact Information</CardTitle>
          <CardDescription>Business contact details displayed to customers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input type="email" placeholder="info@company.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input type="tel" placeholder="+880..." value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input placeholder="Business address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Welcome Message</Label>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              placeholder="Welcome to our service! We're here to help."
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
            />
          </div>
          <Button onClick={handleSaveSettings} className="bg-emerald-600 hover:bg-emerald-700" disabled={savingSettings}>
            {savingSettings && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* ── Language / i18n ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Languages className="w-4 h-4" /> Language
          </CardTitle>
          <CardDescription>Customer-facing language preference</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select value={locale} onValueChange={handleLocaleChange}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="bn">বাংলা (Bengali)</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs">
              <Globe className="w-3 h-3 mr-1" /> Customer UI
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ── Data Export ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4" /> Data Export
          </CardTitle>
          <CardDescription>Export analytics and ticket data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('json')}>
              <Download className="w-4 h-4 mr-1" /> Export JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Payment Gateway ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Payment Gateway
          </CardTitle>
          <CardDescription>Process wallet top-up via payment gateway</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              Manual payment mode is active. In production, this integrates with SSLCommerz/BKash/Aamarpay for automated processing.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="sr-only">Amount (TK)</Label>
              <Input type="number" placeholder="Amount in TK" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} min="1" />
            </div>
            <Button onClick={handlePayment} className="bg-emerald-600 hover:bg-emerald-700" disabled={paymentProcessing}>
              {paymentProcessing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CreditCard className="w-4 h-4 mr-1" />}
              {paymentProcessing ? 'Processing...' : 'Pay & Top Up'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {[100, 500, 1000, 5000].map((amt) => (
              <Button key={amt} variant="outline" size="sm" onClick={() => setPaymentAmount(String(amt))}>
                ৳{amt}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}