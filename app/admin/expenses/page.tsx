'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { authFetch } from '@/lib/supabase/authFetch';
import AdminNav from '@/components/admin/AdminNav';
import { IndianRupee, Banknote, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  'Vegetables & Fruits','Grocery & Dry','Dairy','Cleaning',
  'Stationary','Utilities','Maintenance','Miscellaneous',
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

const DENOM_KEYS: Array<{ key: string; label: string; value: number }> = [
  { key: 'count_500',      label: '₹500',      value: 500 },
  { key: 'count_200',      label: '₹200',      value: 200 },
  { key: 'count_100',      label: '₹100',      value: 100 },
  { key: 'count_50',       label: '₹50',       value: 50  },
  { key: 'count_20_note',  label: '₹20 note',  value: 20  },
  { key: 'count_20_coin',  label: '₹20 coin',  value: 20  },
  { key: 'count_10_note',  label: '₹10 note',  value: 10  },
  { key: 'count_10_coin',  label: '₹10 coin',  value: 10  },
  { key: 'count_20',       label: '₹20',       value: 20  }, // legacy
  { key: 'count_10',       label: '₹10',       value: 10  }, // legacy
];

interface Expense {
  id: string; amount: number; description: string;
  category: string; expense_date: string; created_at: string; staff_name: string;
}
interface StaffMember { id: string; name: string; }
interface CounterLog {
  id: string; log_date: string; entry_type: string | null;
  count_500: number; count_200: number; count_100: number; count_50: number;
  count_20_note: number; count_20_coin: number; count_10_note: number; count_10_coin: number;
  count_20: number; count_10: number;
  total: number; cash_taken: number; cash_taken_by: string | null;
  logged_by_name: string | null; created_at: string;
}

type Range    = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
type MainTab  = 'expenses' | 'counter';

function todayIST() {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
}
function prevDay(d: string) {
  const dt = new Date(d + 'T12:00:00');
  dt.setDate(dt.getDate() - 1);
  return dt.toISOString().split('T')[0];
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}
function getRangeDates(range: Range, customFrom: string, customTo: string) {
  const now = new Date();
  const ist = (d: Date) => d.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
  const today = ist(now);
  if (range === 'today')     return { from: today, to: today };
  if (range === 'yesterday') { const d = new Date(now); d.setDate(d.getDate()-1); const y=ist(d); return { from:y, to:y }; }
  if (range === 'week')      { const d = new Date(now); const dow=d.getDay(); const diff=(dow+6)%7; d.setDate(d.getDate()-diff); return { from: ist(d), to: today }; }
  if (range === 'month')     { return { from: today.slice(0,7)+'-01', to: today }; }
  return { from: customFrom || today, to: customTo || today };
}

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' }, { key: 'custom', label: 'Custom' },
];

export default function AdminExpensesPage() {
  const router  = useRouter();
  const supabase = createClient();

  const [mainTab, setMainTab]         = useState<MainTab>('expenses');
  const [range, setRange]             = useState<Range>('month');
  const [customFrom, setCustomFrom]   = useState('');
  const [customTo, setCustomTo]       = useState('');

  // Cash expenses state
  const [loading, setLoading]         = useState(true);
  const [expenses, setExpenses]       = useState<Expense[]>([]);
  const [staff, setStaff]             = useState<StaffMember[]>([]);
  const [filterStaff, setFilterStaff] = useState('');
  const [filterCat, setFilterCat]     = useState('');
  const [deleting, setDeleting]       = useState<string | null>(null);

  // Counter cash state
  const [counterLoading, setCounterLoading] = useState(false);
  const [allCounterLogs, setAllCounterLogs] = useState<CounterLog[]>([]);
  const [expandedDate, setExpandedDate]     = useState<string | null>(null);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { from, to } = getRangeDates(range, customFrom, customTo);

  // ── Load expenses ────────────────────────────────────────────
  const loadExpenses = useCallback(async (opts?: { silent?: boolean }) => {
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

  // ── Load counter cash ────────────────────────────────────────
  const loadCounter = useCallback(async () => {
    setCounterLoading(true);
    const { from, to } = getRangeDates(range, customFrom, customTo);
    // Fetch one day before range start so we can compute opening balance for first row
    const params = new URLSearchParams({ from: prevDay(from), to });
    try {
      const res = await authFetch(`/api/counter-cash?${params}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Failed to load counter cash'); return; }
      setAllCounterLogs(data.logs ?? []);
    } finally { setCounterLoading(false); }
  }, [range, customFrom, customTo]);

  const refresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      loadExpenses({ silent: true });
    }, 300);
  }, [loadExpenses]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/admin/login'); return; }
      fetch('/api/staff').then(r => r.json()).then(d => setStaff(d.staff ?? []));
      loadExpenses();
    });
  }, [router, supabase.auth, loadExpenses]);

  useEffect(() => {
    if (mainTab === 'counter') loadCounter();
  }, [mainTab, loadCounter]);

  // ── Expenses helpers ─────────────────────────────────────────
  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return;
    setDeleting(id);
    try {
      const res = await authFetch(`/api/cash-expenses/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Deleted'); refresh(); }
      else { const d = await res.json(); toast.error(d.error ?? 'Delete failed'); }
    } finally { setDeleting(null); }
  }

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const byCategory: Record<string, number> = {};
  for (const e of expenses) byCategory[e.category] = (byCategory[e.category] ?? 0) + Number(e.amount);
  const catSorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  // ── Counter cash computation ─────────────────────────────────
  // Separate counter (closing balance) from taken_home (cash taken by founder)
  const counterLogs = allCounterLogs.filter(l => !l.entry_type || l.entry_type === 'counter');
  const takenHomeLogs = allCounterLogs.filter(l => l.entry_type === 'taken_home');

  // Group taken_home events by date
  const takenHomeByDate: Record<string, CounterLog[]> = {};
  for (const t of takenHomeLogs) {
    (takenHomeByDate[t.log_date] ??= []).push(t);
  }

  // Group expenses by date for Cash OUT per day
  const expensesByDate: Record<string, number> = {};
  for (const e of expenses) {
    expensesByDate[e.expense_date] = (expensesByDate[e.expense_date] ?? 0) + Number(e.amount);
  }

  // Build display rows: sorted asc to compute running opening, then reverse for display
  const logsAsc = [...counterLogs].reverse(); // asc by date
  type CounterRow = CounterLog & {
    opening: number | null; cashOut: number; cashIn: number | null;
    takenHomeTotal: number; takenHomeEvents: CounterLog[];
  };
  const allRows: CounterRow[] = logsAsc.map((log, idx) => {
    const opening = idx === 0 ? null : logsAsc[idx - 1].total;
    const cashOut = expensesByDate[log.log_date] ?? 0;
    const takenHomeEvents = takenHomeByDate[log.log_date] ?? [];
    const takenHomeTotal = takenHomeEvents.reduce((s, t) => s + Number(t.total), 0);
    // Include legacy cash_taken on counter entry for backward compat
    const legacyTaken = Number(log.cash_taken ?? 0);
    const totalTaken = legacyTaken + takenHomeTotal;
    const cashIn = opening !== null ? log.total + cashOut + totalTaken - opening : null;
    return { ...log, opening, cashOut, cashIn, takenHomeTotal: totalTaken, takenHomeEvents };
  });
  // Filter to only show rows within the actual range (exclude the pre-fetched opening day)
  const displayRows = allRows
    .filter(r => r.log_date >= from && r.log_date <= to)
    .reverse(); // desc for display

  const latestClosing = displayRows[0]?.total ?? 0;
  const totalCashOut  = displayRows.reduce((s, r) => s + r.cashOut, 0);
  const totalCashIn   = displayRows.reduce((s, r) => s + (r.cashIn ?? 0), 0);

  const noLogs = !counterLoading && displayRows.length === 0;

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <AdminNav />
      <main className="flex-1 p-4 md:p-6 overflow-auto">

        {/* Header + main tabs */}
        <div className="mb-5">
          <h2 className="text-2xl font-bold mb-1">Finance</h2>
          <div className="flex gap-1 border-b">
            {([['expenses','Cash Expenses', <IndianRupee key="i" className="w-4 h-4"/>],
               ['counter', 'Counter Cash',  <Banknote key="b" className="w-4 h-4"/>]] as const).map(([key, label, icon]) => (
              <button key={key} onClick={() => setMainTab(key as MainTab)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                  mainTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >{icon}{label}</button>
            ))}
          </div>
        </div>

        {/* Shared range controls */}
        <Card className="mb-5">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {RANGES.map(r => (
                <button key={r.key} onClick={() => setRange(r.key)}
                  className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    range === r.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                  )}>{r.label}</button>
              ))}
            </div>
            {range === 'custom' && (
              <div className="flex flex-wrap gap-3 items-end">
                <div><Label>From</Label><Input type="date" value={customFrom} max={todayIST()} onChange={e => setCustomFrom(e.target.value)} className="w-36" /></div>
                <div><Label>To</Label><Input type="date" value={customTo} max={todayIST()} onChange={e => setCustomTo(e.target.value)} className="w-36" /></div>
                <Button onClick={() => { loadExpenses(); if (mainTab === 'counter') loadCounter(); }} size="sm">Apply</Button>
              </div>
            )}
            {mainTab === 'expenses' && (
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
            )}
          </CardContent>
        </Card>

        {/* ═══════════════════ CASH EXPENSES TAB ═══════════════════ */}
        {mainTab === 'expenses' && (
          <>
            {!loading && expenses.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-semibold">
                  <IndianRupee className="w-3.5 h-3.5" />
                  ₹{totalExpenses.toLocaleString('en-IN')} · {expenses.length} entries
                </div>
                {catSorted.slice(0,4).map(([cat,amt]) => (
                  <div key={cat} className={cn('px-3 py-1.5 rounded-full text-xs font-medium', CAT_COLORS[cat] ?? 'bg-gray-100 text-gray-700')}>
                    {cat}: ₹{amt.toLocaleString('en-IN')}
                  </div>
                ))}
              </div>
            )}

            {loading ? (
              <div className="space-y-2">{Array.from({length:5}).map((_,i) => <Skeleton key={i} className="h-12 w-full"/>)}</div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <IndianRupee className="w-10 h-10 mx-auto mb-3 opacity-20"/>
                <p className="font-medium">No expenses found</p>
                <p className="text-sm mt-1">{from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`}</p>
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
                        <th className="px-3 py-3"/>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map(e => (
                        <tr key={e.id} className="border-t hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(e.expense_date)}</td>
                          <td className="px-4 py-3 font-medium max-w-[200px] truncate">{e.description}</td>
                          <td className="px-3 py-3">
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', CAT_COLORS[e.category] ?? 'bg-gray-100 text-gray-700')}>{e.category}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">₹{Number(e.amount).toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{e.staff_name}</td>
                          <td className="px-3 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtTime(e.created_at)}</td>
                          <td className="px-3 py-3">
                            <button onClick={() => deleteExpense(e.id)} disabled={deleting === e.id}
                              className="text-muted-foreground hover:text-destructive transition-colors">
                              {deleting === e.id
                                ? <div className="w-4 h-4 border-2 border-muted border-t-foreground rounded-full animate-spin"/>
                                : <Trash2 className="w-4 h-4"/>}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/20">
                        <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-muted-foreground">{expenses.length} entries</td>
                        <td className="px-4 py-3 text-right font-bold text-base">₹{totalExpenses.toLocaleString('en-IN')}</td>
                        <td colSpan={3}/>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ═══════════════════ COUNTER CASH TAB ═══════════════════ */}
        {mainTab === 'counter' && (
          <>
            {/* Summary chips */}
            {!counterLoading && displayRows.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="px-3 py-1.5 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                  💵 Latest Closing: ₹{latestClosing.toLocaleString('en-IN')}
                </div>
                <div className="px-3 py-1.5 rounded-full text-sm font-semibold bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300">
                  ↑ Cash IN: ₹{totalCashIn.toLocaleString('en-IN')}
                </div>
                <div className="px-3 py-1.5 rounded-full text-sm font-semibold bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">
                  ↓ Cash OUT: ₹{totalCashOut.toLocaleString('en-IN')}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground mb-3">
              Cash IN = Closing − Opening + Expenses + Cash Taken Home · reflects daily cash received from sales
            </p>

            {counterLoading ? (
              <div className="space-y-2">{Array.from({length:5}).map((_,i) => <Skeleton key={i} className="h-14 w-full"/>)}</div>
            ) : noLogs ? (
              <div className="text-center py-16 text-muted-foreground">
                <Banknote className="w-10 h-10 mx-auto mb-3 opacity-20"/>
                <p className="font-medium">No counter cash recorded</p>
                <p className="text-sm mt-1">{from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`}</p>
                <p className="text-xs mt-2 text-muted-foreground/60">Staff can log closing cash from the kiosk home page</p>
              </div>
            ) : (
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                        <th className="text-left px-4 py-3 font-medium">Date</th>
                        <th className="text-right px-4 py-3 font-medium">Opening</th>
                        <th className="text-right px-4 py-3 font-medium text-green-700 dark:text-green-400">↑ Cash IN</th>
                        <th className="text-right px-4 py-3 font-medium text-red-700 dark:text-red-400">↓ Expenses</th>
                        <th className="text-right px-4 py-3 font-medium text-orange-700 dark:text-orange-400">↓ Taken</th>
                        <th className="text-right px-4 py-3 font-medium text-emerald-700 dark:text-emerald-400">= Closing</th>
                        <th className="text-left px-4 py-3 font-medium">Logged by</th>
                        <th className="px-3 py-3 w-8"/>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map(row => {
                        const isExpanded = expandedDate === row.log_date;
                        return (
                          <>
                            <tr key={row.log_date} className="border-t hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 font-medium whitespace-nowrap">{fmtDate(row.log_date)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                {row.opening !== null ? `₹${row.opening.toLocaleString('en-IN')}` : '—'}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {row.cashIn !== null
                                  ? <span className="font-semibold text-green-700 dark:text-green-400">₹{row.cashIn.toLocaleString('en-IN')}</span>
                                  : <span className="text-muted-foreground/40">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {row.cashOut > 0
                                  ? <span className="font-semibold text-red-700 dark:text-red-400">₹{row.cashOut.toLocaleString('en-IN')}</span>
                                  : <span className="text-muted-foreground/40">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {row.takenHomeTotal > 0
                                  ? <div>
                                      <span className="font-semibold text-orange-700 dark:text-orange-400">₹{row.takenHomeTotal.toLocaleString('en-IN')}</span>
                                      {row.takenHomeEvents.length > 0 && (
                                        <p className="text-xs text-muted-foreground">{row.takenHomeEvents.map(t => t.cash_taken_by ?? t.logged_by_name ?? '?').filter((v, i, a) => a.indexOf(v) === i).join(', ')}</p>
                                      )}
                                    </div>
                                  : <span className="text-muted-foreground/40">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                <span className="font-bold text-emerald-700 dark:text-emerald-400">₹{Number(row.total).toLocaleString('en-IN')}</span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground text-xs">{row.logged_by_name ?? '—'}</td>
                              <td className="px-3 py-3">
                                <button onClick={() => setExpandedDate(isExpanded ? null : row.log_date)}
                                  className="text-muted-foreground hover:text-foreground transition-colors">
                                  {isExpanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${row.log_date}-detail`} className="bg-muted/20">
                                <td colSpan={8} className="px-6 py-4 space-y-4">
                                  {/* Counter closing breakdown */}
                                  <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Counter Closing — Denomination Breakdown</p>
                                    <div className="flex flex-wrap gap-2">
                                      {DENOM_KEYS.filter(d => (row as unknown as Record<string, number>)[d.key] > 0).map(d => {
                                        const count = (row as unknown as Record<string, number>)[d.key];
                                        return (
                                          <div key={d.key} className="flex items-center gap-1.5 bg-background border rounded-lg px-3 py-1.5">
                                            <span className="text-xs text-muted-foreground">{d.label}</span>
                                            <span className="text-xs font-bold">×{count}</span>
                                            <span className="text-xs text-muted-foreground">=</span>
                                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">₹{(count * d.value).toLocaleString('en-IN')}</span>
                                          </div>
                                        );
                                      })}
                                      {DENOM_KEYS.every(d => (row as unknown as Record<string, number>)[d.key] === 0) && (
                                        <span className="text-xs text-muted-foreground italic">No denominations recorded</span>
                                      )}
                                    </div>
                                  </div>
                                  {/* Taken home events */}
                                  {row.takenHomeEvents.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-2">
                                        🏠 Cash Taken Home ({row.takenHomeEvents.length} event{row.takenHomeEvents.length > 1 ? 's' : ''})
                                      </p>
                                      <div className="space-y-2">
                                        {row.takenHomeEvents.map((evt, i) => (
                                          <div key={evt.id} className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 px-3 py-2">
                                            <div className="flex items-center justify-between mb-1.5">
                                              <span className="text-xs font-semibold text-orange-800 dark:text-orange-300">
                                                {evt.cash_taken_by ?? evt.logged_by_name ?? `Event ${i + 1}`}
                                              </span>
                                              <span className="text-xs font-bold text-orange-700 dark:text-orange-400">₹{Number(evt.total).toLocaleString('en-IN')}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                              {DENOM_KEYS.filter(d => (evt as unknown as Record<string, number>)[d.key] > 0).map(d => {
                                                const count = (evt as unknown as Record<string, number>)[d.key];
                                                return (
                                                  <span key={d.key} className="text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">
                                                    {d.label}×{count}
                                                  </span>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30 font-semibold">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{displayRows.length} day{displayRows.length !== 1 ? 's' : ''}</td>
                        <td className="px-4 py-3"/>
                        <td className="px-4 py-3 text-right tabular-nums text-green-700 dark:text-green-400">₹{totalCashIn.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-700 dark:text-red-400">₹{totalCashOut.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-orange-700 dark:text-orange-400">₹{displayRows.reduce((s,r) => s + r.takenHomeTotal, 0).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">₹{latestClosing.toLocaleString('en-IN')}</td>
                        <td colSpan={2}/>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
