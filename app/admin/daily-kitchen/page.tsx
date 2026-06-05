'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AdminNav from '@/components/admin/AdminNav';
import { ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KitchenItem { id: string; name: string; unit: string; sort_order: number; }
interface LogEntry    { item_id: string; shift: 'in' | 'closing'; quantity: number; }

function todayIST() {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
}

function shiftDate(date: string, days: number) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function DailyKitchenAdminPage() {
  const router = useRouter();
  const supabase = createClient();

  const [date, setDate]       = useState(todayIST());
  const [items, setItems]     = useState<KitchenItem[]>([]);
  const [logs, setLogs]       = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/admin/login');
    });
  }, [router, supabase.auth]);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const [iRes, lRes] = await Promise.all([
      fetch('/api/daily-kitchen/items'),
      fetch(`/api/daily-kitchen/log?date=${d}`),
    ]);
    const { items: iData } = await iRes.json();
    const { logs: lData }  = await lRes.json();
    setItems(iData ?? []);
    setLogs(lData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const logMap: Record<string, { in?: number; closing?: number }> = {};
  for (const l of logs) {
    if (!logMap[l.item_id]) logMap[l.item_id] = {};
    logMap[l.item_id][l.shift] = l.quantity;
  }

  const inCount      = logs.filter(l => l.shift === 'in').length;
  const closingCount = logs.filter(l => l.shift === 'closing').length;
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="flex min-h-screen">
      <AdminNav />
      <main className="flex-1 p-4 md:p-6 overflow-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold">Daily Kitchen</h2>
            <p className="text-muted-foreground text-sm">Morning IN &amp; Closing counts</p>
          </div>
          {/* Date nav */}
          <div className="flex items-center gap-2">
            <button onClick={() => setDate(d => shiftDate(d, -1))}
              className="p-2 rounded-lg border hover:bg-muted transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input type="date" value={date} max={todayIST()}
              onChange={e => setDate(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm font-medium bg-background"
            />
            <button onClick={() => setDate(d => shiftDate(d, 1))} disabled={date >= todayIST()}
              className="p-2 rounded-lg border hover:bg-muted transition-colors disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => setDate(todayIST())}
              className="text-xs px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors font-medium">
              Today
            </button>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex gap-3 mb-4">
          <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border',
            inCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400'
                        : 'bg-muted text-muted-foreground border-transparent')}>
            <Sun className="w-3.5 h-3.5" />
            Morning IN · {inCount} items
          </div>
          <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border',
            closingCount > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-400'
                             : 'bg-muted text-muted-foreground border-transparent')}>
            <Moon className="w-3.5 h-3.5" />
            Closing · {closingCount} items
          </div>
          <span className="text-sm text-muted-foreground self-center">{fmt(date)}</span>
        </div>

        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="h-8 w-8 border-2 border-muted border-t-foreground rounded-full animate-spin" />
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                  <th className="text-left px-4 py-2.5 font-medium">Item</th>
                  <th className="text-center px-3 py-2.5 font-medium w-16">Unit</th>
                  <th className="text-center px-4 py-2.5 font-medium w-24">
                    <span className="flex items-center justify-center gap-1"><Sun className="w-3.5 h-3.5 text-amber-500" /> IN</span>
                  </th>
                  <th className="text-center px-4 py-2.5 font-medium w-24">
                    <span className="flex items-center justify-center gap-1"><Moon className="w-3.5 h-3.5 text-indigo-500" /> Closing</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item, idx) => {
                  const row = logMap[item.id] ?? {};
                  return (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-medium">{item.name}</td>
                      <td className="px-3 py-2.5 text-center text-muted-foreground text-xs">{item.unit}</td>
                      <td className="px-4 py-2.5 text-center">
                        {row.in !== undefined
                          ? <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 font-semibold text-sm min-w-[3rem]">{row.in}</span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {row.closing !== undefined
                          ? <span className="inline-block px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300 font-semibold text-sm min-w-[3rem]">{row.closing}</span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
