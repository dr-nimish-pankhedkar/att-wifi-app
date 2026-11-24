'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CloudOff, LogOut, Volume2 } from 'lucide-react';
import PosLogin from '@/components/pos/PosLogin';
import QuickNav from '@/components/pos/QuickNav';
import { usePosLive } from '@/lib/pos/useLive';
import { cn } from '@/lib/utils';
import { getSession, isNetworkError, posApi, SessionExpired, setSession, type StoredSession } from '@/lib/pos/client';
import { SOURCE_LABEL, type KotStatus, type OrderSource } from '@/lib/pos/types';

interface TicketItem { id: string; name: string; variation_name: string | null; addons: { name: string }[]; qty: number; note: string | null; kot_status: KotStatus; ready_at?: string | null }
interface Ticket { key: string; order_id: string; bill_no: number; source: OrderSource; table: string | null; customer_name: string | null; round: number; created_at: string; items: TicketItem[] }

const FALLBACK_POLL_MS = 6000;

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.4, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
    });
  } catch { /* audio blocked */ }
}

/** Long, loud ring for a KOT that is running late. */
function alarm() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    for (let i = 0; i < 8; i++) {
      const t = i * 0.3;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'square'; o.frequency.value = i % 2 ? 660 : 990; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.5, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.25);
    }
  } catch { /* audio blocked */ }
}

function minutesSince(iso: string, now: number) { return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)); }

export default function KitchenPage() {
  const [session, setSess] = useState<StoredSession | null>(null);
  const [booted, setBooted] = useState(false);
  const [started, setStarted] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [alertMin, setAlertMin] = useState(20);
  const seen = useRef<Set<string> | null>(null);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => { setSess(getSession()); setBooted(true); }, []);

  const load = useCallback(async () => {
    try {
      const res = await posApi<{ tickets: Ticket[]; alert_minutes?: number }>('/api/pos/kitchen');
      if (res.alert_minutes) setAlertMin(res.alert_minutes);
      const fresh = res.tickets.filter((t) => t.items.some((i) => i.kot_status === 'new'));
      if (seen.current) {
        if (fresh.some((t) => !seen.current!.has(t.key))) beep();
      }
      seen.current = new Set(res.tickets.map((t) => t.key));
      setTickets(res.tickets); setOnline(true);
    } catch (e) {
      if (e instanceof SessionExpired) setSess(null);
      else if (isNetworkError(e)) setOnline(false);
      else toast.error((e as Error).message);
    }
  }, []);

  async function keepAwake() {
    try {
      const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
      if (nav.wakeLock) wakeLock.current = await nav.wakeLock.request('screen');
    } catch { /* not supported */ }
  }

  useEffect(() => {
    if (!session || !started) return;
    load();
    const clock = setInterval(() => setNow(Date.now()), 15000);
    const vis = () => { if (document.visibilityState === 'visible') { keepAwake(); load(); } };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(clock); document.removeEventListener('visibilitychange', vis); wakeLock.current?.release().catch(() => {}); };
  }, [session, started, load]);

  usePosLive(load, !!session && started, FALLBACK_POLL_MS);

  // Ring every ~30 s while any KOT is still not ready after the alert time.
  const lateCount = tickets.filter((t) => t.items.some((i) => i.kot_status === 'new' || i.kot_status === 'preparing') && minutesSince(t.created_at, now) >= alertMin).length;
  const lastRing = useRef(0);
  useEffect(() => {
    if (!started || !lateCount) return;
    if (Date.now() - lastRing.current >= 29000) { lastRing.current = Date.now(); alarm(); }
  }, [now, lateCount, started]);

  async function move(t: Ticket, kot_status: 'preparing' | 'ready' | 'served') {
    setTickets((cur) => cur.map((x) => x.key !== t.key ? x : {
      ...x, items: x.items.map((i) => ({ ...i, kot_status: (kot_status === 'served' ? (i.kot_status === 'ready' ? 'served' : i.kot_status) : kot_status) as KotStatus })),
    }).filter((x) => x.items.some((i) => i.kot_status !== 'served')));
    try { await posApi('/api/pos/kitchen', { method: 'POST', body: JSON.stringify({ order_id: t.order_id, round: t.round, kot_status }) }); }
    catch (e) { toast.error((e as Error).message); }
    load();
  }

  if (!booted) return null;
  if (!session) return <PosLogin title="Kitchen" subtitle="Enter your PIN to open the order board" onLogin={setSess} />;

  if (!started) {
    return (
      <main className="min-h-screen bg-stone-900 flex flex-col items-center justify-center gap-6 text-white px-6 text-center">
        <Volume2 className="w-12 h-12" />
        <h1 className="text-2xl font-bold">Start kitchen shift</h1>
        <p className="text-white/60 max-w-sm">Tap once so the tablet can play the new-order sound and keep the screen on.</p>
        <button className="rounded-xl bg-amber-500 text-black font-bold text-lg px-10 py-4" onClick={() => { beep(); keepAwake(); setStarted(true); }}>
          Start shift
        </button>
      </main>
    );
  }

  const cols: { key: 'new' | 'preparing' | 'ready'; label: string }[] = [
    { key: 'new', label: 'New' }, { key: 'preparing', label: 'Preparing' }, { key: 'ready', label: 'Ready' },
  ];
  const stageOf = (t: Ticket): 'new' | 'preparing' | 'ready' =>
    t.items.some((i) => i.kot_status === 'new') ? 'new' : t.items.some((i) => i.kot_status === 'preparing') ? 'preparing' : 'ready';

  return (
    <main className="min-h-screen bg-stone-900 text-white">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-lg">Kitchen orders</h1>
          <QuickNav dark />
        </div>
        <div className="flex items-center gap-3 text-sm">
          {lateCount > 0 && <span className="rounded-full bg-red-600 px-3 py-1 font-bold animate-pulse">⏰ {lateCount} late (over {alertMin} min)</span>}
          {!online && <span className="flex items-center gap-1 text-red-400"><CloudOff className="w-4 h-4" /> No internet — retrying</span>}
          <span className="text-white/50">{session.staff.name}</span>
          <button onClick={() => { if (confirm('Log out of this device? You will need a PIN to log in again.')) { setSession(null); setSess(null); } }}><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3">
        {cols.map((c) => {
          const list = tickets.filter((t) => stageOf(t) === c.key);
          return (
            <section key={c.key}>
              <h2 className="text-sm font-semibold text-white/60 mb-2">{c.label} ({list.length})</h2>
              <div className="space-y-3">
                {list.map((t) => {
                  const mins = minutesSince(t.created_at, now);
                  const late = c.key !== 'ready' && mins >= alertMin;
                  const readyAt = t.items.map((i) => i.ready_at).filter(Boolean).sort().pop();
                  const took = readyAt ? Math.max(0, Math.round((new Date(readyAt).getTime() - new Date(t.created_at).getTime()) / 60000)) : null;
                  return (
                    <div key={t.key} className={cn('rounded-xl p-3 bg-white text-stone-900 border-l-8', late && 'ring-4 ring-red-500 animate-pulse',
                      c.key === 'new' && 'border-amber-500', c.key === 'preparing' && 'border-blue-500', c.key === 'ready' && 'border-green-500')}>
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-extrabold">{t.table ?? SOURCE_LABEL[t.source]}</span>
                        {c.key === 'ready' && took !== null
                          ? <span className="text-sm font-semibold text-green-700">made in {took} min</span>
                          : <span className={cn('text-sm font-semibold', late ? 'text-white bg-red-600 rounded px-2' : mins >= alertMin * 0.75 ? 'text-red-600' : 'text-stone-500')}>{late ? '⏰ ' : ''}{mins} min</span>}
                      </div>
                      <p className="text-xs text-stone-500">#{t.bill_no}{t.round > 1 ? ` · add-on KOT ${t.round}` : ''}{t.customer_name ? ` · ${t.customer_name}` : ''}</p>
                      <ul className="mt-2 space-y-1">
                        {t.items.map((i) => (
                          <li key={i.id} className={cn('text-base', i.kot_status === 'served' && 'line-through opacity-40')}>
                            <span className="font-bold">{i.qty} ×</span> {i.name}{i.variation_name && i.variation_name !== 'Regular' ? <span className="font-bold text-red-700"> ({i.variation_name})</span> : ''}
                            {i.addons?.length > 0 && <div className="text-sm text-stone-600 pl-6">+ {i.addons.map((a) => a.name).join(', ')}</div>}
                            {i.note && <div className="text-sm font-semibold text-amber-700 pl-6">“{i.note}”</div>}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3">
                        {c.key === 'new' && <button className="w-full rounded-lg bg-blue-600 text-white font-bold py-3" onClick={() => move(t, 'preparing')}>Start preparing</button>}
                        {c.key === 'preparing' && <button className="w-full rounded-lg bg-green-600 text-white font-bold py-3" onClick={() => move(t, 'ready')}>Ready</button>}
                        {c.key === 'ready' && <button className="w-full rounded-lg bg-stone-200 font-bold py-3" onClick={() => move(t, 'served')}>Picked up</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {tickets.length === 0 && <p className="text-center text-white/40 mt-10">No pending orders</p>}
    </main>
  );
}
