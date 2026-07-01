'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Delete, Sun, Moon, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StaffProfile { id: string; name: string; }
interface KitchenItem  { id: string; name: string; unit: string; category: string; }

/* ── PIN pad (same style as /inventory) ─────────── */
function KioskPinPad({ onSubmit, loading }: { onSubmit: (pin: string) => void; loading: boolean }) {
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

/* ══════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════ */

export default function DailyKitchenPage() {
  const router = useRouter();
  const todayIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];

  const [staff, setStaff]       = useState<StaffProfile | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [items, setItems]       = useState<KitchenItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [shift, setShift]       = useState<'in' | 'closing' | 'wastage'>('in');
  const [logDate, setLogDate]   = useState(todayIST);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [existingLogs, setExistingLogs] = useState<Record<string, number>>({});
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    if (!staff) return;
    setLoadingItems(true);
    fetch('/api/daily-kitchen/items')
      .then(r => r.json())
      .then(d => setItems(d.items ?? []))
      .finally(() => setLoadingItems(false));
  }, [staff]);

  // Load already-logged quantities for this shift+date.
  // For Closing, pre-fill the form inputs so staff just adjusts from last value.
  useEffect(() => {
    if (!staff) return;
    fetch(`/api/daily-kitchen/log?date=${logDate}`)
      .then(r => r.json())
      .then(d => {
        const map: Record<string, number> = {};
        for (const l of (d.logs ?? []) as Array<{ item_id: string; shift: string; quantity: number }>) {
          if (l.shift === shift) map[l.item_id] = l.quantity;
        }
        setExistingLogs(map);
        if (shift === 'closing') {
          setQuantities(prev => {
            const next = { ...prev };
            for (const [itemId, qty] of Object.entries(map)) {
              if (next[itemId] === undefined || next[itemId] === '') {
                next[itemId] = String(qty);
              }
            }
            return next;
          });
        }
      });
  }, [staff, shift, logDate]);

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

  function adjustQty(itemId: string, delta: number) {
    setQuantities(prev => {
      const current = prev[itemId] !== undefined && prev[itemId] !== '' ? Number(prev[itemId]) : (existingLogs[itemId] ?? 0);
      const next = Math.max(0, current + delta);
      return { ...prev, [itemId]: String(next) };
    });
  }

  async function handleSubmit() {
    const entries = items
      .filter(i => {
        const v = quantities[i.id];
        if (v === undefined || v === '') return false;
        // Closing allows 0 (stock fully consumed); IN requires > 0
        return shift === 'closing' ? true : Number(v) > 0;
      })
      .map(i => ({ item_id: i.id, quantity: Number(quantities[i.id]) }));
    if (entries.length === 0) { toast.error('Fill at least one quantity'); return; }
    setSaving(true);
    const res = await fetch('/api/daily-kitchen/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log_date: logDate, shift, entries, staff_id: staff?.id }),
    });
    setSaving(false);
    if (!res.ok) { toast.error((await res.json()).error ?? 'Failed'); return; }
    setSaved(true);
  }

  const filled = items.filter(i => {
    const v = quantities[i.id];
    if (v === undefined || v === '') return false;
    return shift === 'closing' ? true : Number(v) > 0;
  }).length;

  // Group items by category
  const categories = Array.from(new Set(items.map(i => i.category || 'Miscellaneous')));
  const itemsByCategory = categories.map(cat => ({
    category: cat,
    items: items.filter(i => (i.category || 'Miscellaneous') === cat),
  }));

  /* ── PIN screen ──────────────────────────────── */
  if (!staff) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-teal-950 to-slate-900 flex flex-col items-center justify-between px-4 py-8">
        <div className="w-full">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 text-white/60 hover:text-white text-sm">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
        <div className="flex flex-col items-center gap-8 w-full">
          <div className="text-center">
            <div className="text-4xl mb-3">🥬</div>
            <h1 className="text-2xl font-bold text-white">Daily Kitchen</h1>
            <p className="text-white/50 text-sm mt-1">Enter your PIN to continue</p>
          </div>
          <KioskPinPad onSubmit={handlePin} loading={verifying} />
        </div>
        <div />
      </main>
    );
  }

  /* ── Success screen ──────────────────────────── */
  if (saved) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-teal-950 to-slate-900 flex flex-col items-center justify-center gap-6 px-4">
        <CheckCircle2 className="w-20 h-20 text-green-400" />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">Saved!</h2>
          <p className="text-white/50 mt-1">
            {filled} items · {shift === 'in' ? 'Morning IN' : shift === 'wastage' ? 'Wastage' : 'Closing'} · {new Date(logDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setSaved(false); setQuantities({}); setShift(shift === 'in' ? 'closing' : 'in'); }}
            className="bg-white/10 border border-white/20 text-white rounded-xl px-6 py-3 font-medium hover:bg-white/20"
          >
            Log {shift === 'in' ? 'Closing' : 'Morning IN'}
          </button>
          {shift !== 'wastage' && (
            <button
              onClick={() => { setSaved(false); setQuantities({}); setShift('wastage'); }}
              className="bg-red-500/20 border border-red-500/40 text-red-300 rounded-xl px-6 py-3 font-medium hover:bg-red-500/30"
            >
              Log Wastage
            </button>
          )}
          <button onClick={() => router.push('/')}
            className="bg-white/10 border border-white/20 text-white rounded-xl px-6 py-3 font-medium hover:bg-white/20"
          >
            Done
          </button>
        </div>
      </main>
    );
  }

  /* ── Form ────────────────────────────────────── */
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 via-teal-950 to-slate-900 pb-32">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-slate-900/90 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 text-white/60 hover:text-white text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center">
          <p className="text-white font-semibold text-sm">Daily Kitchen</p>
          <p className="text-white/40 text-xs">Hi, {staff.name}</p>
        </div>
        <div className="w-16" />
      </div>

      {/* Date + shift selector */}
      <div className="px-4 pt-4 pb-2 space-y-2">
        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <div>
            <p className="text-xs text-white/50 mb-0.5">Date</p>
            <input type="date" value={logDate} max={todayIST}
              onChange={e => { setLogDate(e.target.value); setQuantities({}); }}
              className="bg-transparent text-white text-sm font-medium outline-none"
            />
          </div>
          <div className="text-right">
            <p className="text-xs text-white/50">Filled</p>
            <p className="text-white font-bold text-lg">
              {filled}<span className="text-white/40 font-normal text-xs"> / {items.length}</span>
            </p>
          </div>
        </div>

        {/* Shift toggle */}
        <div className="flex rounded-xl overflow-hidden border border-white/15">
          <button
            onClick={() => { setShift('in'); setQuantities({}); }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all',
              shift === 'in'
                ? 'bg-amber-500/30 text-amber-300 border-r border-amber-500/30'
                : 'bg-white/5 text-white/40 hover:bg-white/10 border-r border-white/10'
            )}
          >
            <Sun className="w-3.5 h-3.5" /> Morning IN
          </button>
          <button
            onClick={() => { setShift('closing'); setQuantities({}); }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all',
              shift === 'closing'
                ? 'bg-indigo-500/30 text-indigo-300 border-r border-indigo-500/30'
                : 'bg-white/5 text-white/40 hover:bg-white/10 border-r border-white/10'
            )}
          >
            <Moon className="w-3.5 h-3.5" /> Closing
          </button>
          <button
            onClick={() => { setShift('wastage'); setQuantities({}); }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all',
              shift === 'wastage'
                ? 'bg-red-500/30 text-red-300'
                : 'bg-white/5 text-white/40 hover:bg-white/10'
            )}
          >
            <Trash2 className="w-3.5 h-3.5" /> Wastage
          </button>
        </div>
      </div>

      {/* Items list */}
      {loadingItems ? (
        <div className="flex justify-center pt-20">
          <div className="h-8 w-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : (
        <div className="px-4 pt-2 space-y-3">
          {itemsByCategory.map(({ category, items: catItems }) => (
            <div key={category}>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider px-1 mb-1">{category}</p>
              <div className="rounded-2xl overflow-hidden border border-white/10 divide-y divide-white/10">
                {catItems.map(item => {
                  const val      = quantities[item.id] ?? '';
                  const hasVal   = val !== '';
                  const existing = existingLogs[item.id];
                  const numVal   = val !== '' ? Number(val) : undefined;
                  return (
                    <div key={item.id} className={cn(
                      'px-4 py-3 bg-white/5 transition-colors',
                      hasVal && shift === 'closing' && 'bg-indigo-500/10',
                      hasVal && shift === 'wastage' && 'bg-red-500/10',
                    )}>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium">{item.name}</p>
                          {shift === 'in' && existing !== undefined && (
                            <p className="text-xs mt-0.5 font-medium text-amber-400/80">
                              ✓ logged today: {existing} {item.unit}
                            </p>
                          )}
                          {shift === 'wastage' && existing !== undefined && (
                            <p className="text-xs mt-0.5 font-medium text-red-400/80">
                              ✓ wastage today: {existing} {item.unit}
                            </p>
                          )}
                          {shift === 'closing' && existing !== undefined && !hasVal && (
                            <p className="text-xs mt-0.5 text-indigo-300/60">
                              prev: {existing} {item.unit}
                            </p>
                          )}
                        </div>
                        {shift === 'closing' ? (
                          /* +/- stepper for Closing */
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => adjustQty(item.id, -1)}
                              disabled={numVal !== undefined && numVal <= 0}
                              className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 text-white text-lg font-bold flex items-center justify-center active:scale-95 transition-all disabled:opacity-30"
                            >−</button>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="any"
                              value={val}
                              onChange={e => setQuantities(p => ({ ...p, [item.id]: e.target.value }))}
                              placeholder="—"
                              className={cn(
                                'w-16 text-center rounded-xl px-2 py-1.5 text-sm font-bold outline-none',
                                'bg-white/10 border text-white placeholder-white/30',
                                hasVal ? 'border-indigo-400 bg-indigo-500/20' : 'border-white/20'
                              )}
                            />
                            <button
                              onClick={() => adjustQty(item.id, +1)}
                              className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 text-white text-lg font-bold flex items-center justify-center active:scale-95 transition-all"
                            >+</button>
                            {item.unit && <span className="text-xs text-white/40 w-6 text-right">{item.unit}</span>}
                          </div>
                        ) : (
                          /* plain input for IN / Wastage */
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="any"
                              value={val}
                              onChange={e => setQuantities(p => ({ ...p, [item.id]: e.target.value }))}
                              placeholder="—"
                              className={cn(
                                'w-20 text-right rounded-xl px-3 py-1.5 text-sm font-medium outline-none',
                                'bg-white/10 border text-white placeholder-white/30',
                                hasVal
                                  ? shift === 'wastage'
                                    ? 'border-red-400 bg-red-500/20'
                                    : 'border-amber-400 bg-amber-500/20'
                                  : 'border-white/20'
                              )}
                            />
                            {item.unit && <span className="text-xs text-white/40 w-8">{item.unit}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sticky submit */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-4 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent">
        <button
          onClick={handleSubmit}
          disabled={saving || filled === 0}
          className={cn(
            'w-full rounded-2xl py-4 font-bold text-base transition-all',
            filled > 0
              ? shift === 'in'
                ? 'bg-amber-500 hover:bg-amber-400 text-white active:scale-[0.98]'
                : shift === 'wastage'
                  ? 'bg-red-500 hover:bg-red-400 text-white active:scale-[0.98]'
                  : 'bg-indigo-500 hover:bg-indigo-400 text-white active:scale-[0.98]'
              : 'bg-white/10 text-white/30 cursor-not-allowed'
          )}
        >
          {saving
            ? <span className="flex items-center justify-center gap-2"><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</span>
            : `Save ${shift === 'in' ? 'Morning IN' : shift === 'wastage' ? 'Wastage' : 'Closing'}${filled > 0 ? ` (${filled})` : ''}`}
        </button>
      </div>
    </main>
  );
}
