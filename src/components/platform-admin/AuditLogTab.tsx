'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { AuditLogRow } from './types';

export default function AuditLogTab() {
  const adminToken = useAppStore((s) => s.adminToken);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      const res = await fetch(`/api/admin/audit-log?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
      if (data.pagination) {
        setTotalPages(data.pagination.pages || 1);
        setTotal(data.pagination.total || 0);
      }
    } catch {
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, adminToken]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getActionColor = (action: string) => {
    if (action.includes('DELETE')) return 'bg-red-100 text-red-700';
    if (action.includes('CREATE')) return 'bg-emerald-100 text-emerald-700';
    if (action.includes('UPDATE')) return 'bg-amber-100 text-amber-700';
    if (action.includes('TOP_UP') || action.includes('WALLET')) return 'bg-teal-100 text-teal-700';
    if (action.includes('LOGIN') || action.includes('AUTH')) return 'bg-purple-100 text-purple-700';
    return 'bg-slate-100 text-slate-700';
  };

  const truncateDetails = (details: string, maxLen = 80) => {
    if (!details) return '—';
    try {
      const parsed = JSON.parse(details);
      const str = JSON.stringify(parsed);
      return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
    } catch {
      return details.length > maxLen ? details.slice(0, maxLen) + '…' : details;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Audit Log</h2>
        <div className="flex-1" />
        <Badge variant="outline" className="text-xs">{total} total entries</Badge>
        <Button variant="outline" size="sm" onClick={fetchLogs}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No audit logs found</p>
              <p className="text-sm mt-1">Actions will appear here as they occur.</p>
            </div>
          ) : (
            <div className="max-h-[32rem] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Timestamp</TableHead>
                    <TableHead className="w-[150px]">Action</TableHead>
                    <TableHead className="hidden sm:table-cell">Actor</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead className="hidden lg:table-cell">IP Address</TableHead>
                    <TableHead className="hidden xl:table-cell">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${getActionColor(log.action)}`}>
                          {formatAction(log.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        <div>
                          <p className="font-medium truncate max-w-[160px]">{log.actorName || log.userId}</p>
                          {log.actorEmail && <p className="text-xs text-muted-foreground truncate max-w-[160px]">{log.actorEmail}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="text-xs capitalize">{log.userType.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground font-mono">
                        {log.ipAddress}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground max-w-[200px] truncate" title={log.details}>
                        {truncateDetails(log.details)}
                      </TableCell>
                    </TableRow>
                  ))}
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
    </div>
  );
}