'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Eye, Pencil, ShieldCheck, ShieldX, ShieldBan, Wallet, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { TenantRow, BlockLevel } from './types';
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

  // Block dialog state
  const [blockDialogTenant, setBlockDialogTenant] = useState<TenantRow | null>(null);
  const [blockDialogLevel, setBlockDialogLevel] = useState<BlockLevel>('NONE');
  const [blockDialogReason, setBlockDialogReason] = useState('');

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

  // Block level change handler
  const handleBlockLevelChange = (t: TenantRow, newLevel: BlockLevel) => {
    if (newLevel === 'NONE' || t.blockLevel === newLevel) {
      // Unblocking or no change — call API directly
      updateBlockLevel(t, 'NONE', '');
    } else {
      // SOFT or HARD — open dialog to ask for reason
      setBlockDialogTenant(t);
      setBlockDialogLevel(newLevel);
      setBlockDialogReason('');
    }
  };

  const updateBlockLevel = async (t: TenantRow, level: BlockLevel, reason: string) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/tenants/manage', {
        method: 'PUT',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ tenantId: t.id, blockLevel: level, blockReason: reason || null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update block level'); return; }
      const label = level === 'NONE' ? 'unblocked' : level === 'SOFT' ? 'soft-blocked' : 'hard-blocked';
      toast.success(`${t.name} has been ${label}`);
      setBlockDialogTenant(null);
      setBlockDialogReason('');
      fetchTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlockDialogConfirm = () => {
    if (!blockDialogTenant) return;
    if (blockDialogLevel !== 'NONE' && !blockDialogReason.trim()) {
      toast.error('Please provide a reason for blocking');
      return;
    }
    updateBlockLevel(blockDialogTenant, blockDialogLevel, blockDialogReason.trim());
  };

  const blockLevelBadge = (level: BlockLevel) => {
    if (level === 'SOFT') return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">SOFT BLOCK</Badge>;
    if (level === 'HARD') return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">HARD BLOCK</Badge>;
    return null;
  };

  const rowBlockClass = (level: BlockLevel) => {
    if (level === 'SOFT') return 'border-l-4 border-l-amber-400 bg-amber-50/40';
    if (level === 'HARD') return 'border-l-4 border-l-red-500 bg-red-50/40';
    return '';
  };

  return (
    <TooltipProvider>
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
                    <TableHead className="hidden md:table-cell">Block</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No tenants found</TableCell>
                    </TableRow>
                  ) : (
                    tenants.map((t) => (
                      <TableRow key={t.id} className={rowBlockClass(t.blockLevel)}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {t.name}
                            {t.blockLevel !== 'NONE' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">{blockLevelBadge(t.blockLevel)}</span>
                                </TooltipTrigger>
                                {t.blockReason && (
                                  <TooltipContent side="bottom" className="max-w-xs">
                                    <p className="text-xs">{t.blockReason}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            )}
                          </div>
                          {t.blockLevel !== 'NONE' && t.blockReason && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{t.blockReason}</p>
                          )}
                        </TableCell>
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
                        <TableCell className="hidden md:table-cell">
                          <Select
                            value={t.blockLevel}
                            onValueChange={(v) => handleBlockLevelChange(t, v as BlockLevel)}
                            disabled={actionLoading}
                          >
                            <SelectTrigger className="w-[130px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NONE">
                                <span className="flex items-center gap-1.5">None</span>
                              </SelectItem>
                              <SelectItem value="SOFT">
                                <span className="flex items-center gap-1.5 text-amber-600">
                                  <ShieldBan className="w-3 h-3" /> Soft Block
                                </span>
                              </SelectItem>
                              <SelectItem value="HARD">
                                <span className="flex items-center gap-1.5 text-red-600">
                                  <ShieldBan className="w-3 h-3" /> Hard Block
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
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
                <div>
                  <p className="text-muted-foreground">Block Level</p>
                  <div className="mt-0.5">{blockLevelBadge(detailTenant.blockLevel) || <span className="text-sm text-muted-foreground">None</span>}</div>
                </div>
                {detailTenant.blockReason && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Block Reason</p>
                    <p className="font-medium text-sm">{detailTenant.blockReason}</p>
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

      {/* ── Block Reason Dialog ── */}
      <Dialog open={!!blockDialogTenant} onOpenChange={(open) => { if (!open) { setBlockDialogTenant(null); setBlockDialogReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {blockDialogLevel === 'SOFT' ? 'Soft Block' : 'Hard Block'} Tenant
            </DialogTitle>
            <DialogDescription>
              {blockDialogLevel === 'SOFT'
                ? `Agents keep serving existing queue. No new ticket joins will be allowed for ${blockDialogTenant?.name}.`
                : `Full shutdown — all operations for ${blockDialogTenant?.name} will be halted immediately.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Label htmlFor="block-reason">Reason <span className="text-red-500">*</span></Label>
            <Input
              id="block-reason"
              value={blockDialogReason}
              onChange={(e) => setBlockDialogReason(e.target.value)}
              placeholder="e.g. Abuse reported, payment overdue..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBlockDialogTenant(null); setBlockDialogReason(''); }}>Cancel</Button>
            <Button
              className={blockDialogLevel === 'SOFT' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'}
              onClick={handleBlockDialogConfirm}
              disabled={actionLoading || !blockDialogReason.trim()}
            >
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {blockDialogLevel === 'SOFT' ? 'Soft Block' : 'Hard Block'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}