'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { authFetch } from '@/lib/supabase/authFetch';
import AdminNav from '@/components/admin/AdminNav';
import { IndianRupee, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  'Vegetables & Fruits',
  'Grocery & Dry',
  'Dairy',
  'Cleaning',
  'Stationary',
  'Utilities',
  'Maintenance',
  'Miscellaneous',
];

const CAT_COLORS: Record<string, string> = {
  'Vegetables & Fruits': 'bg-green-100 text-green-800',
  'Grocery & Dry':       'bg-amber-100 text-amber-800',
  'Dairy':               'bg-blue-100 text-blue-800',
  'Cleaning':            'bg-cyan-100 text-cyan-800',
  'Stationary':          'bg-purple-100 text-purple-800',
  'Utilities':           'bg-orange-100 text-orange-800',
  'Maintenance':         'bg-red-100 text-red-800',
  'Miscellaneous':       'bg-gray-100 text-gray-700',
};

interface Expense {
  id: string;
  amount: number;
  description: string;
  category: string;
  expense_date: string;
  created_at: string;
  staff_name: string;
}

interface StaffMember { id: string; name: string; }

function todayIST() {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

type Range = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

function getRangeDates(range: Range, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const ist = (d: Date) => d.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
  const today = ist(now);
  if (range === 'today')     return { from: today, to: today };
  if (range === 'yesterday') { const d = new Date(now); d.setDate(d.getDate() - 1); const y = ist(d); return { from: y, to: y }; }
  if (range === 'week')      { const d = new Date(now); const dow = d.getDay(); const diff = (dow + 6) % 7; d.setDate(d.getDate() - diff); return { from: ist(d), to: today }; }
  if (range === 'month')     { return { from: today.slice(0, 7) + '-01', to: today }; }
  return { from: customFrom || today, to: customTo || today };
}

export default function AdminExpensesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading]         = useState(true);
  const [expenses, setExpenses]       = useState<Expense[]>([]);
  const [staff, setStaff]             = useState<StaffMember[]>([]);
  const [range, setRange]             = useState<Range>('today');
  const [customFrom, setCustomFrom]   = useState('');
  const [customTo, setCustomTo]       = useState('');
  const [filterStaff, setFilterStaff] = useState('');
  const [filterCat, setFilterCat]     = useState('');
  const [deleting, setDeleting]       = useState<string | null>(null);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const { from, to } = getRangeDates(range, customFrom, customTo);
    const params = new URLSearchParams({ from, to });
    if (filterStaff) params.set('staff_id', filterStaff);
    if (filterCat)   params.set('category', filterCat);
    try {
      const res = await authFetch(`/api/cash-expenses?${params}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Failed to load'); return; }
      setExpenses(data.expenses ?? []);
    } finally { setLoading(false); }
  }, [range, customFrom, customTo, filterStaff, filterCat]);

  const refresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => load({ silent: true }), 300);
  }, [load]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/admin/login'); return; }
      fetch('/api/staff').then(r => r.json()).then(d => setStaff(d.staff ?? []));
      load();
    });
  }, [router, supabase.auth, load]);

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return;
    setDeleting(id);
    try {
      const res = await authFetch(`/api/cash-expenses/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Deleted'); refresh(); }
      else { const d = await res.json(); toast.error(d.error ?? 'Delete failed'); }
    } finally { setDeleting(null); }
  }

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const { from, to } = getRangeDates(range, customFrom, customTo);

  // Group by category for summary
  const byCategory: Record<string, number> = {};
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount);
  }
  const catSorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  const RANGES: { key: Range; label: string }[] = [
    { key: 'today',     label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week',      label: 'This Week' },
    { key: 'month',     label: 'This Month' },
    { key: 'custom',    label: 'Custom' },
  ];

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <AdminNav />
      <main className="flex-1 p-4 md:p-6 overflow-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <IndianRupee className="w-6 h-6" /> Cash Expenses
            </h2>
            <p className="text-muted-foreground text-sm">All petty-cash entries logged by staff</p>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-5">
          <CardContent className="p-4 space-y-3">
            {/* Range tabs */}
            <div className="flex flex-wrap gap-1.5">
              {RANGES.map(r => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    range === r.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >{r.label}</button>
              ))}
            </div>

            {/* Custom date inputs */}
            {range === 'custom' && (
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <Label>From</Label>
                  <Input type="date" value={customFrom} max={todayIST()} onChange={e => setCustomFrom(e.target.value)} className="w-36" />
                </div>
                <div>
                  <Label>To</Label>
                  <Input type="date" value={customTo} max={todayIST()} onChange={e => setCustomTo(e.target.value)} className="w-36" />
                </div>
                <Button onClick={() => load()} size="sm">Apply</Button>
              </div>
            )}

            {/* Staff + category filters */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="w-44">
                <Label>Staff</Label>
                <Select value={filterStaff || 'all'} onValueChange={v => setFilterStaff(v === 'all' ? '' : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="All staff" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All staff</SelectItem>
                    {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-48">
                <Label>Category</Label>
                <Select value={filterCat || 'all'} onValueChange={v => setFilterCat(v === 'all' ? '' : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="All categories" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary chips */}
        {!loading && expenses.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-semibold">
              <IndianRupee className="w-3.5 h-3.5" />
              Total: ₹{total.toFixed(2)} · {expenses.length} entries
            </div>
            {catSorted.slice(0, 4).map(([cat, amt]) => (
              <div key={cat} className={cn('px-3 py-1.5 rounded-full text-xs font-medium', CAT_COLORS[cat] ?? 'bg-gray-100 text-gray-700')}>
                {cat}: ₹{amt.toFixed(2)}
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <IndianRupee className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No expenses found</p>
            <p className="text-sm mt-1">
              {from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`}
            </p>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                    <th className="text-left px-4 py-3 font-medium">Description</th>
                    <th className="text-left px-3 py-3 font-medium">Category</th>
                    <th className="text-right px-4 py-3 font-medium">Amount</th>
                    <th className="text-left px-4 py-3 font-medium">Staff</th>
                    <th className="text-left px-3 py-3 font-medium">Time</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-t hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(e.expense_date)}</td>
                      <td className="px-4 py-3 font-medium max-w-[200px] truncate">{e.description}</td>
                      <td className="px-3 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', CAT_COLORS[e.category] ?? 'bg-gray-100 text-gray-700')}>
                          {e.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">₹{Number(e.amount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{e.staff_name}</td>
                      <td className="px-3 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtTime(e.created_at)}</td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => deleteExpense(e.id)}
                          disabled={deleting === e.id}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete expense"
                        >
                          {deleting === e.id
                            ? <div className="w-4 h-4 border-2 border-muted border-t-foreground rounded-full animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-muted-foreground">{expenses.length} entries</td>
                    <td className="px-4 py-3 text-right font-bold text-base">₹{total.toFixed(2)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
