'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Wallet } from 'lucide-react';
import PosLogin from '@/components/pos/PosLogin';
import QuickNav from '@/components/pos/QuickNav';
import { Button } from '@/components/ui/button';
import { getSession, posApi, SessionExpired, type StoredSession } from '@/lib/pos/client';
import { usePosLive } from '@/lib/pos/useLive';
import { rupee } from '@/lib/pos/types';
import { cn } from '@/lib/utils';

interface Due {
  id: string; bill_no: number; customer_name: string | null; customer_phone: string | null; total: number; settled_at: string;
  due_paid_at: string | null; due_paid_mode: 'cash' | 'upi' | null;
  pos_tables: { name: string } | null; settled_by_profile: { name: string } | null; due_paid_by_profile: { name: string } | null;
}

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

export default function DuesPage() {
  const [session, setSess] = useState<StoredSession | null>(null);
  const [booted, setBooted] = useState(false);
  const [data, setData] = useState<{ dues: Due[]; collected_today: Due[] } | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { setSess(getSession()); setBooted(true); }, []);
  const load = useCallback(async () => {
    try { setData(await posApi('/api/pos/dues')); }
    catch (e) { if (e instanceof SessionExpired) setSess(null); else toast.error((e as Error).message); }
  }, []);
  useEffect(() => { if (session) load(); }, [session, load]);
  usePosLive(load, !!session, 30_000);

  async function collect(d: Due, mode: 'cash' | 'upi') {
    if (!confirm(`${d.customer_name ?? 'Customer'} paid ${rupee(Number(d.total))} by ${mode === 'cash' ? 'cash' : 'UPI'}?`)) return;
    setBusy(d.id);
    try { await posApi('/api/pos/dues', { method: 'POST', body: JSON.stringify({ order_id: d.id, mode }) }); toast.success('Due marked paid'); load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  if (!booted) return null;
  if (!session) return <PosLogin title="Dues" subtitle="Enter your PIN" onLogin={setSess} />;

  const term = q.trim().toLowerCase();
  const dues = (data?.dues ?? []).filter((d) => !term || d.customer_name?.toLowerCase().includes(term) || d.customer_phone?.includes(term) || String(d.bill_no) === term);
  const outstanding = (data?.dues ?? []).reduce((a, d) => a + Number(d.total), 0);
  const today = data?.collected_today ?? [];
  const tCash = today.filter((d) => d.due_paid_mode === 'cash').reduce((a, d) => a + Number(d.total), 0);
  const tUpi = today.filter((d) => d.due_paid_mode === 'upi').reduce((a, d) => a + Number(d.total), 0);

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-10 bg-white border-b px-3 py-2 flex items-center justify-between">
        <h1 className="font-semibold flex items-center gap-1"><Wallet className="w-4 h-4 text-red-600" /> Dues</h1>
        <QuickNav compact />
      </header>
      <main className="p-3 space-y-3 max-w-lg mx-auto">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border bg-white p-3"><p className="text-xs text-muted-foreground">Still to collect</p><p className="text-xl font-bold text-red-700">{rupee(outstanding)}</p><p className="text-xs">{data?.dues.length ?? 0} bills</p></div>
          <div className="rounded-xl border bg-white p-3"><p className="text-xs text-muted-foreground">Collected today</p><p className="text-xl font-bold text-green-700">{rupee(tCash + tUpi)}</p><p className="text-xs">Cash {rupee(tCash)} · UPI {rupee(tUpi)}</p></div>
        </div>
        <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Search name, phone or bill no." value={q} onChange={(e) => setQ(e.target.value)} />
        {!data && <p className="text-sm text-muted-foreground">Loading…</p>}
        {data && dues.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">No dues 🎉</p>}
        <ul className="space-y-2">
          {dues.map((d) => {
            const days = Math.floor((Date.now() - new Date(d.settled_at).getTime()) / 86400_000);
            return (
              <li key={d.id} className={cn('rounded-xl border bg-white p-3', days >= 7 && 'border-red-400')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{d.customer_name ?? 'No name'}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.customer_phone && <a className="underline" href={`tel:${d.customer_phone}`}>{d.customer_phone}</a>} · Bill #{d.bill_no}{d.pos_tables ? ` · ${d.pos_tables.name}` : ''} · {ago(d.settled_at)}
                      {d.settled_by_profile?.name ? ` · by ${d.settled_by_profile.name}` : ''}
                    </p>
                  </div>
                  <span className="text-lg font-bold text-red-700 shrink-0">{rupee(Number(d.total))}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Button variant="outline" disabled={busy === d.id} onClick={() => collect(d, 'cash')}>Paid by cash</Button>
                  <Button variant="outline" disabled={busy === d.id} onClick={() => collect(d, 'upi')}>Paid by UPI</Button>
                </div>
              </li>
            );
          })}
        </ul>
        {today.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mt-4 mb-1">Collected today</h2>
            <ul className="rounded-xl border bg-white divide-y text-sm">
              {today.map((d) => (
                <li key={d.id} className="flex justify-between px-3 py-2">
                  <span>{d.customer_name} · #{d.bill_no} · {d.due_paid_mode === 'cash' ? 'Cash' : 'UPI'}{d.due_paid_by_profile?.name ? ` · ${d.due_paid_by_profile.name}` : ''}</span>
                  <span className="font-medium">{rupee(Number(d.total))}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
