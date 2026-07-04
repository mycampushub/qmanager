'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Eye, Pencil, ShieldCheck, ShieldX, Wallet, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { TenantRow } from './types';
import { adminHeaders } from './types';

export default function TenantsTab() {
  const adminToken = useAppStore((s) => s.adminToken);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  // Dialog states
  const [detailTenant, setDetailTenant] = useState<TenantRow | null>(null);
  const [editTenant, setEditTenant] = useState<TenantRow | null>(null);
  const [editName, setEditName] = useState('');
  const [topupTenant, setTopupTenant] = useState<TenantRow | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), search });
      const res = await fetch(`/api/admin/tenants?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.tenants) setTenants(data.tenants);
      if (data.pagination) setTotalPages(data.pagination.totalPages || 1);
    } catch {
      toast.error('Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, [page, search, adminToken]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  // Toggle active/inactive
  const handleToggleActive = async (t: TenantRow) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/tenants/manage', {
        method: 'PUT',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ tenantId: t.id, isActive: !t.isActive }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update status'); return; }
      toast.success(`${t.name} is now ${!t.isActive ? 'active' : 'inactive'}`);
      fetchTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open edit dialog
  const openEdit = (t: TenantRow) => {
    setEditTenant(t);
    setEditName(t.name);
  };

  // Save edit name
  const handleSaveName = async () => {
    if (!editTenant || !editName.trim()) { toast.error('Name is required'); return; }
    setActionLoading(true);
    try {
      const res = await fetch('/api/tenants/manage', {
        method: 'PUT',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ tenantId: editTenant.id, name: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update name'); return; }
      toast.success('Tenant name updated');
      setEditTenant(null);
      setEditName('');
      fetchTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  // Wallet top-up
  const handleTopUp = async () => {
    if (!topupTenant) return;
    const amount = parseFloat(topupAmount);
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid positive amount'); return; }
    setActionLoading(true);
    try {
      const res = await fetch('/api/tenants/wallet', {
        method: 'POST',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ tenantId: topupTenant.id, amountCents: Math.round(amount * 100) }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to top up wallet'); return; }
      toast.success(`$${amount.toFixed(2)} added to ${topupTenant.name}'s wallet`);
      setTopupTenant(null);
      setTopupAmount('');
      fetchTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h2 className="text-lg font-semibold">All Tenants</h2>
        <div className="flex-1" />
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search tenants..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Plan Tier</TableHead>
                    <TableHead className="hidden md:table-cell">Wallet Balance</TableHead>
                    <TableHead className="hidden lg:table-cell">Tickets Today</TableHead>
                    <TableHead className="hidden lg:table-cell">Staff</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No tenants found</TableCell>
                    </TableRow>
                  ) : (
                    tenants.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className="capitalize">{t.planTier}</Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">${(t.walletBalance / 100).toFixed(2)}</TableCell>
                        <TableCell className="hidden lg:table-cell">{t.todayTicketCount}</TableCell>
                        <TableCell className="hidden lg:table-cell">{t.staffCount}</TableCell>
                        <TableCell>
                          <Badge className={t.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                            {t.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailTenant(t)} aria-label={`View ${t.name} details`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openEdit.bind(null, t)} aria-label={`Edit ${t.name} name`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleToggleActive(t)}
                              disabled={actionLoading}
                              aria-label={t.isActive ? `Deactivate ${t.name}` : `Activate ${t.name}`}
                            >
                              {t.isActive ? <ShieldX className="w-4 h-4 text-red-500" /> : <ShieldCheck className="w-4 h-4 text-emerald-500" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setTopupTenant(t); setTopupAmount(''); }} aria-label={`Top up ${t.name} wallet`}>
                              <Wallet className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* ── View Details Dialog ── */}
      <Dialog open={!!detailTenant} onOpenChange={(open) => { if (!open) setDetailTenant(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tenant Details</DialogTitle>
            <DialogDescription>Complete information for this tenant.</DialogDescription>
          </DialogHeader>
          {detailTenant && (
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Name</p>
                  <p className="font-medium">{detailTenant.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Plan Tier</p>
                  <p className="font-medium capitalize">{detailTenant.planTier}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Wallet Balance</p>
                  <p className="font-medium">${(detailTenant.walletBalance / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge className={detailTenant.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                    {detailTenant.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Staff Count</p>
                  <p className="font-medium">{detailTenant.staffCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tickets Today</p>
                  <p className="font-medium">{detailTenant.todayTicketCount}</p>
                </div>
                {detailTenant.createdAt && (
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-medium">{new Date(detailTenant.createdAt).toLocaleDateString()}</p>
                  </div>
                )}
                {detailTenant.masterTenant && (
                  <div>
                    <p className="text-muted-foreground">Master Tenant</p>
                    <p className="font-medium">{detailTenant.masterTenant.corporateName}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailTenant(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Name Dialog ── */}
      <Dialog open={!!editTenant} onOpenChange={(open) => { if (!open) setEditTenant(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tenant Name</DialogTitle>
            <DialogDescription>Change the display name for this tenant.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Label>New Name</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Enter new tenant name" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTenant(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveName} disabled={actionLoading || !editName.trim()}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Wallet Top-Up Dialog ── */}
      <Dialog open={!!topupTenant} onOpenChange={(open) => { if (!open) setTopupTenant(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wallet Top-Up</DialogTitle>
            <DialogDescription>Add funds to {topupTenant?.name}'s wallet. Current balance: ${topupTenant ? (topupTenant.walletBalance / 100).toFixed(2) : '0.00'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Label>Amount (USD)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              placeholder="e.g. 50.00"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopupTenant(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleTopUp} disabled={actionLoading || !topupAmount || parseFloat(topupAmount) <= 0}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Top Up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}