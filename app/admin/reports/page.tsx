'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AdminNav from '@/components/admin/AdminNav';
import AttendanceTable, { AttendanceTableSkeleton } from '@/components/admin/AttendanceTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Search } from 'lucide-react';

interface StaffMember { id: string; name: string; }

export default function ReportsPage() {
  const [records, setRecords] = useState<unknown[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ from: '', to: '', staff_id: '' });
  const router = useRouter();
  const supabase = createClient();

  const loadRecords = useCallback(async (pg = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pg) });
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.staff_id) params.set('staff_id', filters.staff_id);
    const res = await fetch(`/api/attendance?${params}`);
    const data = await res.json();
    setRecords(data.records ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/admin/login'); return; }
      fetch('/api/staff').then((r) => r.json()).then((d) => setStaff(d.staff ?? []));
      loadRecords();
    });
  }, [router, supabase.auth, loadRecords]);

  function handleExport() {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.staff_id) params.set('staff_id', filters.staff_id);
    window.open(`/api/export?${params}`, '_blank');
  }

  return (
    <div className="flex min-h-screen">
      <AdminNav />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold">Reports</h2>
            <p className="text-muted-foreground text-sm">Filter and export attendance records</p>
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 border rounded-lg bg-muted/20">
          <div>
            <Label className="text-xs">From Date</Label>
            <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">To Date</Label>
            <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Staff Member</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filters.staff_id}
              onChange={(e) => setFilters({ ...filters, staff_id: e.target.value })}
            >
              <option value="">All Staff</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => { setPage(1); loadRecords(1); }}>
              <Search className="w-4 h-4 mr-2" /> Search
            </Button>
          </div>
        </div>

        {loading ? <AttendanceTableSkeleton /> : <AttendanceTable records={records as never} />}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
            <span>Showing {Math.min((page - 1) * 20 + 1, total)}–{Math.min(page * 20, total)} of {total}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => { setPage(p => p - 1); loadRecords(page - 1); }}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page * 20 >= total} onClick={() => { setPage(p => p + 1); loadRecords(page + 1); }}>
                Next
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
