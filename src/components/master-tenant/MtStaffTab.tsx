'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useAppStore } from '@/stores/app-store';
import type { StaffRow } from './mt-types';

// ─── STAFF TAB ──────────────────────────────────────────────
export default function MtStaffTab() {
  const mtToken = useAppStore((s) => s.mtToken);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch('/api/master-tenant/staff', {
        headers: { Authorization: `Bearer ${mtToken}` },
      });
      const data = await res.json();
      if (data.staff) {
        setStaff(data.staff);
      }
    } catch {
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, [mtToken]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Staff Across All Branches</h2>
        <p className="text-sm text-muted-foreground">
          Staff across all branches under your organization.
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <Table className="min-w-[500px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No staff found
                    </TableCell>
                  </TableRow>
                ) : (
                  staff.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-7 h-7">
                            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">
                              {s.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{s.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{s.email}</TableCell>
                      <TableCell className="text-sm">{s.branchName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">{s.role}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge className={s.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                          {s.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}