'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Delete, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

type DenomKey = 'count_500' | 'count_200' | 'count_100' | 'count_50' | 'count_20_note' | 'count_20_coin' | 'count_10_note' | 'count_10_coin';
type Counts = Record<DenomKey, number>;

const DENOM_CONFIG: Array<{ key: DenomKey; value: number; type: 'note' | 'coin' }> = [
  { key: 'count_500',      value: 500, type: 'note' },
  { key: 'count_200',      value: 200, type: 'note' },
  { key: 'count_100',      value: 100, type: 'note' },
  { key: 'count_50',       value: 50,  type: 'note' },
  { key: 'count_20_note',  value: 20,  type: 'note' },
  { key: 'count_20_coin',  value: 20,  type: 'coin' },
  { key: 'count_10_note',  value: 10,  type: 'note' },
  { key: 'count_10_coin',  value: 10,  type: 'coin' },
];

const EMPTY_COUNTS: Counts = {
  count_500: 0, count_200: 0, count_100: 0, count_50: 0,
  count_20_note: 0, count_20_coin: 0, count_10_note: 0, count_10_coin: 0,
};

interface StaffProfile { id: string; name: string; role: string; }

function PinPad({ onSubmit, loading }: { onSubmit: (pin: string) => void; loading: boolean }) {
  const [pin, setPin] = useState('');
  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','del'];

  const handleKey = useCallback((key: string) => {
    if (loading) return;
    if (key === 'del') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) setTimeout(() => { onSubmit(next); setPin(''); }, 120);
  }, [pin, loading, onSubmit]);

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xs">
      <div className="flex gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={cn(
            'h-4 w-4 rounded-full border-2 border-white/40 transition-all duration-150',
            i < pin.length ? 'bg-white border-white scale-125' : 'bg-transparent'
          )} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 w-full px-2">
        {KEYS.map((key, idx) => {
          if (key === '') return <div key={idx} />;
          return (
            <button key={idx} onClick={() => handleKey(key)} disabled={loading}
              className={cn(
                'flex items-center justify-center rounded-2xl text-2xl font-semibold select-none h-16 sm:h-20',
                'bg-white/10 border border-white/20 text-white',
                'active:scale-95 active:bg-white/25 transition-all duration-100 disabled:opacity-40'
              )}
            >
              {key === 'del' ? <Delete className="w-6 h-6" /> : key}
            </button>
          );
        })}
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-white/60">
          <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="text-sm">Verifying…</span>
        </div>
      )}
    </div>
  );
}

export default function CounterCashPage() {
  const router = useRouter();
  const todayIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];

  const [staff, setStaff]         = useState<StaffProfile | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [logDate, setLogDate]     = useState(todayIST);
  const [counts, setCounts]       = useState<Counts>(EMPTY_COUNTS);
  const [saving, setSaving]       = useState<'counter' | 'taken_home' | null>(null);
  const [savedType, setSavedType] = useState<'counter' | 'taken_home'>('counter');

  const total = DENOM_CONFIG.reduce((sum, d) => sum + counts[d.key] * d.value, 0);
  const saved = saving === null && savedType !== null && total === 0 && counts === EMPTY_COUNTS;

  const [isDone, setIsDone] = useState(false);
  const [savedTotal, setSavedTotal] = useState(0);

  const handlePin = useCallback(async (pin: string) => {
    setVerifying(true);
    const res = await fetch('/api/staff/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    setVerifying(false);
    if (!res.ok) { toast.error((await res.json()).error ?? 'Invalid PIN'); return; }
    setStaff(await res.json());
  }, []);

  function setCount(key: DenomKey, value: number) {
    setCounts(p => ({ ...p, [key]: Math.max(0, isNaN(value) ? 0 : value) }));
  }

  async function handleSubmit(entryType: 'counter' | 'taken_home') {
    setSaving(entryType);
    const body: Record<string, unknown> = {
      log_date: logDate,
      staff_id: staff?.id,
      entry_type: entryType,
      cash_taken_by: entryType === 'taken_home' ? staff?.name : null,
    };
    for (const d of DENOM_CONFIG) body[d.key] = counts[d.key];
    const res = await fetch('/api/counter-cash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(null);
    if (!res.ok) { toast.error((await res.json()).error ?? 'Failed'); return; }
    setSavedTotal(total);
    setSavedType(entryType);
    setIsDone(true);
  }

  /* ── PIN screen ─────────────────────────────── */
  if (!staff) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-emerald-950 to-slate-900 flex flex-col items-center justify-between px-4 py-8">
        <div className="w-full">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 text-white/60 hover:text-white text-sm">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
        <div className="flex flex-col items-center gap-8 w-full">
          <div className="text-center">
            <div className="text-4xl mb-3">💵</div>
            <h1 className="text-2xl font-bold text-white">Counter Cash</h1>
            <p className="text-white/50 text-sm mt-1">Enter your PIN to continue</p>
          </div>
          <PinPad onSubmit={handlePin} loading={verifying} />
        </div>
        <div />
      </main>
    );
  }

  /* ── Success screen ──────────────────────────── */
  if (isDone) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-emerald-950 to-slate-900 flex flex-col items-center justify-center gap-6 px-4">
        {savedType === 'taken_home' ? (
          <>
            <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center">
              <Home className="w-10 h-10 text-orange-400" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white">Taken Home!</h2>
              <p className="text-white/60 mt-1">₹{savedTotal.toLocaleString('en-IN')} · {staff.name}</p>
              <p className="text-white/40 text-sm mt-1">
                {new Date(logDate + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
              </p>
            </div>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-20 h-20 text-green-400" />
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white">Saved!</h2>
              <p className="text-white/60 mt-1">
                ₹{savedTotal.toLocaleString('en-IN')} · {new Date(logDate + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
              </p>
            </div>
          </>
        )}
        <button onClick={() => router.push('/')}
          className="bg-white/10 border border-white/20 text-white rounded-xl px-8 py-3 font-medium hover:bg-white/20"
        >
          Done
        </button>
      </main>
    );
  }

  /* ── Form ────────────────────────────────────── */
  const isFounder = staff.role === 'founder';

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 via-emerald-950 to-slate-900 pb-36">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-slate-900/90 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 text-white/60 hover:text-white text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center">
          <p className="text-white font-semibold text-sm">Counter Cash</p>
          <p className="text-white/40 text-xs">Hi, {staff.name}</p>
        </div>
        <div className="w-16" />
      </div>

      <div className="px-4 pt-4 pb-2 space-y-3">
        {/* Date + live total */}
        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <div>
            <p className="text-xs text-white/50 mb-0.5">Date</p>
            <input type="date" value={logDate} max={todayIST}
              onChange={e => setLogDate(e.target.value)}
              className="bg-transparent text-white text-sm font-medium outline-none"
            />
          </div>
          <div className="text-right">
            <p className="text-xs text-white/50">Counter Total</p>
            <p className={cn('font-bold text-xl transition-all', total > 0 ? 'text-emerald-300' : 'text-white/30')}>
              ₹{total.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Notes section */}
        <p className="text-white/40 text-xs uppercase tracking-widest px-1">Notes</p>
        <div className="rounded-2xl overflow-hidden border border-white/10 divide-y divide-white/10">
          {DENOM_CONFIG.filter(d => d.type === 'note').map(d => {
            const count = counts[d.key];
            const sub   = count * d.value;
            const active = count > 0;
            return (
              <div key={d.key} className={cn('px-4 py-3 bg-white/5 flex items-center gap-3 transition-colors', active && 'bg-emerald-500/10')}>
                <div className="w-14 shrink-0">
                  <p className="text-white font-bold text-sm">₹{d.value}</p>
                  <p className="text-white/30 text-xs">note</p>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button onClick={() => setCount(d.key, count - 1)} disabled={count <= 0}
                    className="w-9 h-9 shrink-0 rounded-xl bg-white/10 border border-white/20 text-white text-xl font-bold flex items-center justify-center active:scale-95 transition-all disabled:opacity-30"
                  >−</button>
                  <input type="number" inputMode="numeric" min={0}
                    value={count === 0 ? '' : count}
                    onChange={e => setCount(d.key, parseInt(e.target.value || '0', 10))}
                    placeholder="0"
                    className={cn(
                      'w-0 flex-1 min-w-0 text-center rounded-xl px-1 py-2 text-lg font-bold outline-none transition-colors',
                      'bg-white/10 border text-white placeholder-white/20',
                      active ? 'border-emerald-400 bg-emerald-500/20' : 'border-white/20'
                    )}
                  />
                  <button onClick={() => setCount(d.key, count + 1)}
                    className="w-9 h-9 shrink-0 rounded-xl bg-white/10 border border-white/20 text-white text-xl font-bold flex items-center justify-center active:scale-95 transition-all"
                  >+</button>
                </div>
                <div className="w-16 text-right shrink-0">
                  {sub > 0
                    ? <span className="text-emerald-300 font-semibold text-sm">₹{sub.toLocaleString('en-IN')}</span>
                    : <span className="text-white/20 text-sm">—</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Coins section */}
        <p className="text-white/40 text-xs uppercase tracking-widest px-1">Coins</p>
        <div className="rounded-2xl overflow-hidden border border-white/10 divide-y divide-white/10">
          {DENOM_CONFIG.filter(d => d.type === 'coin').map(d => {
            const count = counts[d.key];
            const sub   = count * d.value;
            const active = count > 0;
            return (
              <div key={d.key} className={cn('px-4 py-3 bg-white/5 flex items-center gap-3 transition-colors', active && 'bg-emerald-500/10')}>
                <div className="w-14 shrink-0">
                  <p className="text-white font-bold text-sm">₹{d.value}</p>
                  <p className="text-white/30 text-xs">coin</p>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button onClick={() => setCount(d.key, count - 1)} disabled={count <= 0}
                    className="w-9 h-9 shrink-0 rounded-xl bg-white/10 border border-white/20 text-white text-xl font-bold flex items-center justify-center active:scale-95 transition-all disabled:opacity-30"
                  >−</button>
                  <input type="number" inputMode="numeric" min={0}
                    value={count === 0 ? '' : count}
                    onChange={e => setCount(d.key, parseInt(e.target.value || '0', 10))}
                    placeholder="0"
                    className={cn(
                      'w-0 flex-1 min-w-0 text-center rounded-xl px-1 py-2 text-lg font-bold outline-none transition-colors',
                      'bg-white/10 border text-white placeholder-white/20',
                      active ? 'border-emerald-400 bg-emerald-500/20' : 'border-white/20'
                    )}
                  />
                  <button onClick={() => setCount(d.key, count + 1)}
                    className="w-9 h-9 shrink-0 rounded-xl bg-white/10 border border-white/20 text-white text-xl font-bold flex items-center justify-center active:scale-95 transition-all"
                  >+</button>
                </div>
                <div className="w-16 text-right shrink-0">
                  {sub > 0
                    ? <span className="text-emerald-300 font-semibold text-sm">₹{sub.toLocaleString('en-IN')}</span>
                    : <span className="text-white/20 text-sm">—</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Total summary */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-emerald-300 font-semibold">Counter Total</p>
            <p className="text-white text-2xl font-bold">₹{total.toLocaleString('en-IN')}</p>
          </div>
          {total > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {DENOM_CONFIG.filter(d => counts[d.key] > 0).map(d => (
                <span key={d.key} className="text-xs text-emerald-300/70 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  ₹{d.value}{d.type === 'coin' ? '¢' : ''}×{counts[d.key]}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Founder hint */}
        {isFounder && total > 0 && (
          <p className="text-white/30 text-xs text-center px-4">
            "Enter Cash" logs the counter closing balance · "Take Cash Home" records these denominations as cash you're taking
          </p>
        )}
      </div>

      {/* Fixed action buttons */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-4 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent">
        {isFounder ? (
          <div className="flex gap-3">
            <button
              onClick={() => handleSubmit('taken_home')}
              disabled={!!saving || total === 0}
              className={cn(
                'flex-1 rounded-2xl py-4 font-bold text-sm transition-all',
                total > 0 && !saving
                  ? 'bg-orange-500 hover:bg-orange-400 text-white active:scale-[0.98]'
                  : 'bg-white/10 text-white/30 cursor-not-allowed'
              )}
            >
              {saving === 'taken_home'
                ? <span className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving…
                  </span>
                : total > 0 ? `🏠 Take Cash Home` : 'Take Cash Home'}
            </button>
            <button
              onClick={() => handleSubmit('counter')}
              disabled={!!saving || total === 0}
              className={cn(
                'flex-1 rounded-2xl py-4 font-bold text-sm transition-all',
                total > 0 && !saving
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-white active:scale-[0.98]'
                  : 'bg-white/10 text-white/30 cursor-not-allowed'
              )}
            >
              {saving === 'counter'
                ? <span className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving…
                  </span>
                : total > 0 ? `Enter Cash · ₹${total.toLocaleString('en-IN')}` : 'Enter at least one denomination'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => handleSubmit('counter')}
            disabled={!!saving || total === 0}
            className={cn(
              'w-full rounded-2xl py-4 font-bold text-base transition-all',
              total > 0
                ? 'bg-emerald-500 hover:bg-emerald-400 text-white active:scale-[0.98]'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            )}
          >
            {saving
              ? <span className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </span>
              : total > 0
                ? `Save · ₹${total.toLocaleString('en-IN')}`
                : 'Enter at least one denomination'}
          </button>
        )}
      </div>
    </main>
  );
}
