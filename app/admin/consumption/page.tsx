'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AdminNav from '@/components/admin/AdminNav';
import { TrendingDown, TrendingUp, Minus, MessageCircle, Mail, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConsumptionRow {
  id: string; name: string; unit: string; category: string;
  opening_qty: number | null; opening_date: string | null;
  closing_qty:  number | null; closing_date:  string | null;
  consumption:  number | null;
}

/* ── Week helpers ───────────────────────────────── */
function getWeekBounds(offset = 0): { from: string; to: string; label: string } {
  const now = new Date();
  // Monday of current week
  const day = now.getDay(); // 0=Sun
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon + offset * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const labelFmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return {
    from:  fmt(mon),
    to:    fmt(sun),
    label: `${labelFmt(mon)} – ${labelFmt(sun)} ${sun.getFullYear()}`,
  };
}

function fmtQty(q: number | null, unit: string) {
  if (q === null) return '—';
  return `${q % 1 === 0 ? q : q.toFixed(2)} ${unit}`;
}

/* ── Report formatter for sharing ─────────────── */
function buildShareText(rows: ConsumptionRow[], label: string): string {
  const lines: string[] = [
    `*café tan 90° — Weekly Consumption*`,
    `*Week: ${label}*`,
    '',
  ];

  const withData = rows.filter(r => r.consumption !== null);
  const used     = withData.filter(r => (r.consumption ?? 0) > 0);
  const restocked = withData.filter(r => (r.consumption ?? 0) < 0);
  const unchanged = withData.filter(r => r.consumption === 0);

  if (used.length) {
    lines.push('*Consumed this week:*');
    used.forEach(r => lines.push(`  • ${r.name}: ${r.opening_qty} → ${r.closing_qty} ${r.unit} _(${r.consumption} used)_`));
    lines.push('');
  }
  if (restocked.length) {
    lines.push('*Restocked (net increase):*');
    restocked.forEach(r => lines.push(`  • ${r.name}: ${r.opening_qty} → ${r.closing_qty} ${r.unit}`));
    lines.push('');
  }
  if (unchanged.length) {
    lines.push('*No change:*');
    unchanged.forEach(r => lines.push(`  • ${r.name}: ${r.closing_qty} ${r.unit}`));
    lines.push('');
  }

  const noData = rows.filter(r => r.consumption === null);
  if (noData.length) {
    lines.push(`_${noData.length} items had no stock check in this period_`);
  }

  return lines.join('\n');
}

/* ══════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════ */

export default function ConsumptionPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [weekOffset, setWeekOffset] = useState(0);
  const [rows,    setRows]    = useState<ConsumptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<'all' | 'used' | 'restocked' | 'nodata'>('all');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/admin/login');
    });
  }, [router, supabase.auth]);

  const week = getWeekBounds(weekOffset);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/inventory/consumption?from=${week.from}&to=${week.to}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setLoading(false);
  }, [week.from, week.to]);

  useEffect(() => { load(); }, [load]);

  const displayed = rows.filter(r => {
    if (filter === 'used')      return (r.consumption ?? 0) > 0;
    if (filter === 'restocked') return (r.consumption ?? 0) < 0;
    if (filter === 'nodata')    return r.consumption === null;
    return true;
  });

  const usedCount      = rows.filter(r => (r.consumption ?? 0) > 0).length;
  const restockedCount = rows.filter(r => (r.consumption ?? 0) < 0).length;
  const noDataCount    = rows.filter(r => r.consumption === null).length;

  function shareWhatsApp() {
    const text = buildShareText(rows, week.label);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  function shareEmail() {
    const text = buildShareText(rows, week.label).replace(/\*/g, '').replace(/_/g, '');
    const subject = encodeURIComponent(`café tan 90° – Weekly Consumption – ${week.label}`);
    const body    = encodeURIComponent(text);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }

  return (
    <div className="flex min-h-screen">
      <AdminNav />
      <main className="flex-1 p-4 md:p-6 overflow-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-bold">Consumption Report</h2>
            <p className="text-muted-foreground text-sm">Weekly stock usage based on inventory checks</p>
          </div>
          <div className="flex gap-2">
            <button onClick={shareWhatsApp}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </button>
            <button onClick={shareEmail}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-muted text-sm font-medium transition-colors">
              <Mail className="w-4 h-4" /> Email
            </button>
          </div>
        </div>

        {/* Week navigator */}
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setWeekOffset(o => o - 1)}
            className="p-2 rounded-lg border hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 text-center">
            <p className="font-semibold text-sm">{week.label}</p>
            <p className="text-xs text-muted-foreground">{week.from} → {week.to}</p>
          </div>
          <button onClick={() => setWeekOffset(o => o + 1)} disabled={weekOffset >= 0}
            className="p-2 rounded-lg border hover:bg-muted transition-colors disabled:opacity-40">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}
            className="text-xs px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors disabled:opacity-40 font-medium">
            This Week
          </button>
        </div>

        {/* Summary chips + filter */}
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { key: 'all',       label: `All (${rows.length})`,           cls: 'bg-muted text-foreground' },
            { key: 'used',      label: `Consumed (${usedCount})`,         cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
            { key: 'restocked', label: `Restocked (${restockedCount})`,   cls: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
            { key: 'nodata',    label: `No data (${noDataCount})`,        cls: 'bg-muted text-muted-foreground' },
          ].map(({ key, label, cls }) => (
            <button key={key} onClick={() => setFilter(key as typeof filter)}
              className={cn('px-3 py-1.5 rounded-full text-sm font-medium border transition-all',
                filter === key ? cls + ' ring-2 ring-offset-1 ring-current' : 'border-transparent ' + cls)}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="h-8 w-8 border-2 border-muted border-t-foreground rounded-full animate-spin" />
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">Item</th>
                  <th className="text-center px-3 py-2.5 font-medium">Unit</th>
                  <th className="text-center px-4 py-2.5 font-medium">Opening<br/><span className="font-normal opacity-70">{week.from}</span></th>
                  <th className="text-center px-4 py-2.5 font-medium">Closing<br/><span className="font-normal opacity-70">{week.to}</span></th>
                  <th className="text-center px-4 py-2.5 font-medium">Consumed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayed.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No data for this period</td></tr>
                )}
                {displayed.map(row => {
                  const c = row.consumption;
                  const used      = c !== null && c > 0;
                  const restocked = c !== null && c < 0;
                  return (
                    <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{row.name}</td>
                      <td className="px-3 py-2.5 text-center text-muted-foreground text-xs">{row.unit}</td>
                      <td className="px-4 py-2.5 text-center text-muted-foreground">
                        {row.opening_qty !== null ? (
                          <span title={row.opening_date ?? ''}>{row.opening_qty}</span>
                        ) : <span className="opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center text-muted-foreground">
                        {row.closing_qty !== null ? (
                          <span title={row.closing_date ?? ''}>{row.closing_qty}</span>
                        ) : <span className="opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {c === null ? (
                          <span className="text-muted-foreground/40">—</span>
                        ) : used ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 font-semibold">
                            <TrendingDown className="w-3 h-3" />{c}
                          </span>
                        ) : restocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400 font-semibold">
                            <TrendingUp className="w-3 h-3" />{Math.abs(c)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Minus className="w-3 h-3" />0
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-4">
          Consumption = opening stock − closing stock. Negative = net restocking during the week.
          Opening uses the most recent check on or before the week start; closing uses the most recent on or before the week end.
        </p>
      </main>
    </div>
  );
}
