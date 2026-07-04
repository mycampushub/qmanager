'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';

export function WalletTab({ tenantId }: { tenantId: string }) {
  const authToken = useAppStore((s) => s.authToken);
  const [walletData, setWalletData] = useState<{
    tenant: { id: string; name: string; planTier: string; walletBalance: number };
    usage: { todayTickets: number; totalCharged: number };
    transactions: Array<{ id: string; type: string; amountCents: number; description: string | null; createdBy: string | null; createdAt: string }>;
  } | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchWallet = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/tenants/wallet?tenantId=${tenantId}`, { headers });
      const data = await res.json();
      setWalletData(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [tenantId, authToken]);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  const handleTopUp = async () => {
    const tk = parseInt(topUpAmount);
    if (isNaN(tk) || tk <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/tenants/wallet', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tenantId, amountCents: tk * 100 }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Added ${tk} TK to wallet`);
        setTopUpAmount('');
        fetchWallet();
      } else {
        toast.error(data.error);
      }
    } catch { toast.error('Top-up failed'); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!walletData) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Wallet &amp; Billing</h2>

      {/* Balance Card */}
      <Card className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-0">
        <CardContent className="pt-6 pb-6">
          <p className="text-emerald-100 text-sm">Current Balance</p>
          <p className="text-4xl font-bold mt-1">৳{(walletData.tenant.walletBalance / 100).toLocaleString()}</p>
          <div className="flex gap-4 mt-4 text-sm text-emerald-100">
            <span>Tier: <strong className="text-white">{walletData.tenant.planTier}</strong></span>
            <span>Cost: <strong className="text-white">৳1/ticket</strong></span>
          </div>
        </CardContent>
      </Card>

      {/* Usage Stats */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Today&apos;s Usage</p>
            <p className="text-2xl font-bold">{walletData.usage.todayTickets} tickets</p>
            <p className="text-sm text-muted-foreground">৳{(walletData.usage.todayTickets * 100 / 100).toFixed(2)} spent today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Total Charged</p>
            <p className="text-2xl font-bold">৳{(walletData.usage.totalCharged / 100).toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">all time</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64">
            <div className="space-y-2">
              {walletData.transactions.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No transactions yet</p>}
              {walletData.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{tx.description || tx.type}</p>
                    <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge variant={tx.amountCents > 0 ? 'default' : 'secondary'} className={tx.amountCents > 0 ? 'bg-emerald-100 text-emerald-700' : ''}>
                    {tx.amountCents > 0 ? '+' : ''}৳{(tx.amountCents / 100).toFixed(2)}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Top Up */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Top Up Wallet</CardTitle>
          <CardDescription>Quick manual top-up or use Payment Gateway in Settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="sr-only">Amount (TK)</Label>
              <Input type="number" placeholder="Amount in TK" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} min="1" />
            </div>
            <Button onClick={handleTopUp} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-1" /> Quick Top Up
            </Button>
          </div>
          <div className="flex gap-2 mt-3">
            {[100, 500, 1000, 5000].map((amt) => (
              <Button key={amt} variant="outline" size="sm" onClick={() => setTopUpAmount(String(amt))}>
                ৳{amt}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}