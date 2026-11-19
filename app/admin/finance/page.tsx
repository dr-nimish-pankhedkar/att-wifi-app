'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import AdminNav from '@/components/admin/AdminNav';
import { createClient } from '@/lib/supabase/client';
import { authFetch } from '@/lib/supabase/authFetch';
import { cn } from '@/lib/utils';

interface Finance {
  period: { from: string; to: string; days: number };
  kpi: { sales: number; bills: number; avg_bill: number; cash: number; upi: number; discounts: number; expenses: number; staff_cost: number; net: number };
  daily: { date: string; sales: number; expenses: number }[];
  by_hour: { hour: number; bills: number; sales: number }[];
  top_by_revenue: { name: string; qty: number; revenue: number }[];
  top_by_qty: { name: string; qty: number; revenue: number }[];
  expense_categories: { category: string; amount: number }[];
  recent_expenses: { amount: number; category: string | null; expense_date: string; description: string | null }[];
  staff: { staff_id: string; name: string; cost: number; present: number; late: number; absent: number; half: number }[];
  attendance_unsalaried: { staff_id: string; name: string; present: number; late: number; absent: number; half: number }[];
  counter_cash: { date: string; total: number } | null;
  cash_taken_home: number;
  feedback: { loved: number; okay: number; improve: number };
}

const SALES = '#2a78d6';     // blue
const EXPENSE = '#e2752d';   // orange
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const todayIST = () => new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

type Preset = 'today' | '7d' | 'month' | 'last_month' | 'custom';

function presetRange(p: Preset): { from: string; to: string } {
  const t = todayIST();
  if (p === 'today') return { from: t, to: t };
  if (p === '7d') return { from: addDays(t, -6), to: t };
  const [y, m] = t.split('-').map(Number);
  if (p === 'last_month') {
    const first = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    const last = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
    return { from: first, to: last };
  }
  return { from: `${t.slice(0, 7)}-01`, to: t };
}

export default function FinanceDashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [preset, setPreset] = useState<Preset>('month');
  const [range, setRange] = useState(presetRange('month'));
  const [data, setData] = useState<Finance | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => (user ? setReady(true) : router.replace('/admin/login')));
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/admin/finance?from=${range.from}&to=${range.to}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not load');
      setData(json);
    } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
  }, [range]);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-stone-50">
      <AdminNav />
      <main className="flex-1 p-4 md:p-6 overflow-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold">Finance dashboard</h1>
            <p className="text-sm text-muted-foreground">Sales from the POS, expenses entered in the app, and staff cost from salaries &amp; attendance.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([['today', 'Today'], ['7d', '7 days'], ['month', 'This month'], ['last_month', 'Last month']] as [Preset, string][]).map(([k, l]) => (
              <button key={k} onClick={() => { setPreset(k); setRange(presetRange(k)); }}
                className={cn('px-3 py-1.5 rounded-full text-sm border', preset === k ? 'bg-stone-900 text-white border-stone-900' : 'bg-white')}>{l}</button>
            ))}
            <input type="date" className="rounded-lg border px-2 py-1 text-sm" value={range.from} max={range.to}
              onChange={(e) => { setPreset('custom'); setRange({ ...range, from: e.target.value }); }} />
            <span className="text-sm text-muted-foreground">to</span>
            <input type="date" className="rounded-lg border px-2 py-1 text-sm" value={range.to} min={range.from} max={todayIST()}
              onChange={(e) => { setPreset('custom'); setRange({ ...range, to: e.target.value }); }} />
          </div>
        </div>

        {!data && <p className="text-muted-foreground">{loading ? 'Loading…' : ''}</p>}
        {data && <Body d={data} dim={loading} />}
      </main>
    </div>
  );
}

function Body({ d, dim }: { d: Finance; dim: boolean }) {
  const k = d.kpi;
  return (
    <div className={cn('space-y-5 transition-opacity', dim && 'opacity-60')}>
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Sales" value={inr(k.sales)} sub={`${k.bills} bills · avg ${inr(k.avg_bill)}`} accent={SALES} />
        <Tile label="Expenses" value={inr(k.expenses)} sub={`${d.expense_categories.length} categories`} accent={EXPENSE} />
        <Tile label="Staff cost" value={inr(k.staff_cost)} sub={`for ${d.period.days} day${d.period.days > 1 ? 's' : ''}`} />
        <Tile label="Sales − expenses − staff" value={inr(k.net)} sub="before rent, power & Zomato/Swiggy"
          valueClass={k.net < 0 ? 'text-red-600' : 'text-green-700'} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile small label="Cash sales" value={inr(k.cash)} />
        <Tile small label="UPI sales" value={inr(k.upi)} />
        <Tile small label="Discounts given" value={inr(k.discounts)} />
        <Tile small label="Customer feedback" value={`😍 ${d.feedback.loved} · 🙂 ${d.feedback.okay} · 😕 ${d.feedback.improve}`} />
      </div>

      <Card title="Daily sales vs expenses" legend={[['Sales', SALES], ['Expenses', EXPENSE]]}>
        <DailyChart rows={d.daily} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Top items by revenue">
          <BarList rows={d.top_by_revenue.map((i) => ({ label: i.name, value: i.revenue, note: `${i.qty} sold` }))} color={SALES} format={inr} empty="No sales in this period" />
        </Card>
        <Card title="Busiest hours (bills)">
          <BarList rows={d.by_hour.map((h) => ({ label: hourLabel(h.hour), value: h.bills, note: inr(h.sales) }))} color={SALES} format={(n) => String(n)} empty="No sales in this period" />
        </Card>
        <Card title="Expenses by category">
          <BarList rows={d.expense_categories.map((c) => ({ label: c.category, value: c.amount }))} color={EXPENSE} format={inr} empty="No expenses entered in this period" />
        </Card>
        <Card title="Recent expenses">
          {d.recent_expenses.length === 0 ? <Empty text="No expenses entered in this period" /> : (
            <ul className="divide-y text-sm">
              {d.recent_expenses.map((e, i) => (
                <li key={i} className="flex justify-between gap-3 py-1.5">
                  <span className="truncate"><span className="text-muted-foreground">{shortDate(e.expense_date)}</span> · {e.description || e.category || 'Expense'}</span>
                  <span className="font-medium tabular-nums">{inr(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Staff: attendance & cost">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-1.5 font-medium">Staff</th>
                <th className="font-medium text-right">On time</th><th className="font-medium text-right">Late</th>
                <th className="font-medium text-right">Absent</th><th className="font-medium text-right">Half-days</th>
                <th className="font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {[...d.staff, ...d.attendance_unsalaried.map((a) => ({ ...a, cost: null as number | null }))].map((s) => (
                <tr key={s.staff_id} className="border-b last:border-0">
                  <td className="py-1.5">{s.name}</td>
                  <td className="text-right tabular-nums">{s.present}</td>
                  <td className={cn('text-right tabular-nums', s.late > 0 && 'text-amber-700 font-medium')}>{s.late}</td>
                  <td className={cn('text-right tabular-nums', s.absent > 0 && 'text-red-600 font-medium')}>{s.absent}</td>
                  <td className="text-right tabular-nums">{s.half}</td>
                  <td className="text-right tabular-nums">{s.cost == null ? <span className="text-xs text-muted-foreground">no salary set</span> : inr(s.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        <Tile small label="Last counter cash count" value={d.counter_cash ? inr(d.counter_cash.total) : '—'} sub={d.counter_cash ? shortDate(d.counter_cash.date) : 'none in this period'} />
        <Tile small label="Cash taken home" value={inr(d.cash_taken_home)} />
      </div>

      <p className="text-xs text-muted-foreground">
        Sales cover POS bills from 18 Nov 2026 onwards (earlier sales were in PetPooja). Expenses are only those entered in the app under Expenses.
        Staff cost spreads each person&apos;s monthly pay (base + fuel + bonus accrual) over the days in the period.
      </p>
    </div>
  );
}

function Tile({ label, value, sub, accent, valueClass, small }: { label: string; value: string; sub?: string; accent?: string; valueClass?: string; small?: boolean }) {
  return (
    <div className="rounded-xl border bg-white p-4" style={accent ? { borderTop: `3px solid ${accent}` } : undefined}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('font-bold tabular-nums', small ? 'text-lg' : 'text-2xl', valueClass)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Card({ title, legend, children }: { title: string; legend?: [string, string][]; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">{title}</h2>
        {legend && (
          <div className="flex gap-3 text-xs">
            {legend.map(([l, c]) => <span key={l} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{l}</span>)}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) { return <p className="text-sm text-muted-foreground py-4 text-center">{text}</p>; }

function BarList({ rows, color, format, empty }: { rows: { label: string; value: number; note?: string }[]; color: string; format: (n: number) => string; empty: string }) {
  if (!rows.length) return <Empty text={empty} />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="truncate">{r.label}{r.note && <span className="text-xs text-muted-foreground"> · {r.note}</span>}</span>
            <span className="font-medium tabular-nums">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded bg-stone-100 mt-1">
            <div className="h-2 rounded" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DailyChart({ rows }: { rows: { date: string; sales: number; expenses: number }[] }) {
  const max = useMemo(() => Math.max(1, ...rows.flatMap((r) => [r.sales, r.expenses])), [rows]);
  if (rows.every((r) => r.sales === 0 && r.expenses === 0)) return <Empty text="Nothing recorded in this period" />;
  const labelEvery = Math.ceil(rows.length / 10);
  return (
    <div>
      <div className="flex items-end gap-[3px] h-44 border-b">
        {rows.map((r) => (
          <div key={r.date} className="flex-1 h-full flex items-end gap-px group relative" title={`${shortDate(r.date)} · sales ${inr(r.sales)} · expenses ${inr(r.expenses)}`}>
            <div className="flex-1 rounded-t-sm" style={{ height: `${(r.sales / max) * 100}%`, background: SALES, minHeight: r.sales ? 2 : 0 }} />
            <div className="flex-1 rounded-t-sm" style={{ height: `${(r.expenses / max) * 100}%`, background: EXPENSE, minHeight: r.expenses ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] mt-1">
        {rows.map((r, i) => (
          <div key={r.date} className="flex-1 text-[10px] text-muted-foreground text-center truncate">{i % labelEvery === 0 ? shortDate(r.date) : ''}</div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-1">Tallest bar = {inr(max)} · tap or hover a bar for details</p>
    </div>
  );
}
