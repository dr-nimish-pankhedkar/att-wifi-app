'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Delete, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UI, getLang, setLang, itemName, type Lang } from '@/lib/lang';

interface StaffProfile { id: string; name: string; }
interface KitchenItem  { id: string; name: string; name_mr: string | null; unit: string; }

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-white/20 text-xs font-semibold">
      <button onClick={() => onChange('en')}
        className={cn('px-2.5 py-1 transition-colors', lang === 'en' ? 'bg-white text-slate-900' : 'text-white/50 hover:text-white')}>
        EN
      </button>
      <button onClick={() => onChange('mr')}
        className={cn('px-2.5 py-1 transition-colors', lang === 'mr' ? 'bg-white text-slate-900' : 'text-white/50 hover:text-white')}>
        मराठी
      </button>
    </div>
  );
}

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

  const [lang, setLangState]    = useState<Lang>('en');
  const [staff, setStaff]       = useState<StaffProfile | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [items, setItems]       = useState<KitchenItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [shift, setShift]       = useState<'in' | 'closing'>('in');
  const [logDate, setLogDate]   = useState(todayIST);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => { setLangState(getLang()); }, []);
  const switchLang = (l: Lang) => { setLang(l); setLangState(l); };
  const t = UI[lang];

  useEffect(() => {
    if (!staff) return;
    setLoadingItems(true);
    fetch('/api/daily-kitchen/items')
      .then(r => r.json())
      .then(d => setItems(d.items ?? []))
      .finally(() => setLoadingItems(false));
  }, [staff]);

  const handlePin = useCallback(async (pin: string) => {
    setVerifying(true);
    const res = await fetch('/api/staff/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    setVerifying(false);
    if (!res.ok) { toast.error((await res.json()).error ?? t.invalidPin); return; }
    setStaff(await res.json());
  }, [t.invalidPin]);

  async function handleSubmit() {
    const entries = items
      .filter(i => quantities[i.id] !== '' && quantities[i.id] !== undefined)
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

  const filled = items.filter(i => quantities[i.id] !== '' && quantities[i.id] !== undefined).length;

  /* ── PIN screen ──────────────────────────────── */
  if (!staff) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-teal-950 to-slate-900 flex flex-col items-center justify-between px-4 py-8">
        <div className="w-full flex items-center justify-between">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 text-white/60 hover:text-white text-sm">
            <ArrowLeft className="w-4 h-4" /> {t.back}
          </button>
          <LangToggle lang={lang} onChange={switchLang} />
        </div>
        <div className="flex flex-col items-center gap-8 w-full">
          <div className="text-center">
            <div className="text-4xl mb-3">🥬</div>
            <h1 className="text-2xl font-bold text-white">{t.dailyKitchen}</h1>
            <p className="text-white/50 text-sm mt-1">{t.enterPin}</p>
          </div>
          <KioskPinPad onSubmit={handlePin} loading={verifying} />
        </div>
        <div />
      </main>
    );
  }

  /* ── Success screen ──────────────────────────── */
  if (saved) {
    const otherShift = shift === 'in' ? t.closing : t.morningIn;
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-teal-950 to-slate-900 flex flex-col items-center justify-center gap-6 px-4">
        <CheckCircle2 className="w-20 h-20 text-green-400" />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">{t.saved}</h2>
          <p className="text-white/50 mt-1">
            {filled} {t.items} · {shift === 'in' ? t.morningIn : t.closing} · {new Date(logDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setSaved(false); setQuantities({}); setShift(shift === 'in' ? 'closing' : 'in'); }}
            className="bg-white/10 border border-white/20 text-white rounded-xl px-6 py-3 font-medium hover:bg-white/20"
          >
            {t.logOther(otherShift)}
          </button>
          <button onClick={() => router.push('/')}
            className="bg-white/10 border border-white/20 text-white rounded-xl px-6 py-3 font-medium hover:bg-white/20"
          >
            {t.done}
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
          <ArrowLeft className="w-4 h-4" /> {t.back}
        </button>
        <div className="text-center">
          <p className="text-white font-semibold text-sm">{t.dailyKitchen}</p>
          <p className="text-white/40 text-xs">{t.hi} {staff.name}</p>
        </div>
        <LangToggle lang={lang} onChange={switchLang} />
      </div>

      {/* Date + shift selector */}
      <div className="px-4 pt-4 pb-2 space-y-2">
        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <div>
            <p className="text-xs text-white/50 mb-0.5">{t.date}</p>
            <input type="date" value={logDate} max={todayIST}
              onChange={e => { setLogDate(e.target.value); setQuantities({}); }}
              className="bg-transparent text-white text-sm font-medium outline-none"
            />
          </div>
          <div className="text-right">
            <p className="text-xs text-white/50">{t.filled}</p>
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
              'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all',
              shift === 'in'
                ? 'bg-amber-500/30 text-amber-300 border-r border-amber-500/30'
                : 'bg-white/5 text-white/40 hover:bg-white/10 border-r border-white/10'
            )}
          >
            <Sun className="w-4 h-4" /> {t.morningIn}
          </button>
          <button
            onClick={() => { setShift('closing'); setQuantities({}); }}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all',
              shift === 'closing'
                ? 'bg-indigo-500/30 text-indigo-300'
                : 'bg-white/5 text-white/40 hover:bg-white/10'
            )}
          >
            <Moon className="w-4 h-4" /> {t.closing}
          </button>
        </div>
      </div>

      {/* Items list */}
      {loadingItems ? (
        <div className="flex justify-center pt-20">
          <div className="h-8 w-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : (
        <div className="px-4 pt-2">
          <div className="rounded-2xl overflow-hidden border border-white/10 divide-y divide-white/10">
            {items.map(item => {
              const val = quantities[item.id] ?? '';
              const hasVal = val !== '';
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 bg-white/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium">
                      {itemName(item.name, item.name_mr, lang)}
                    </p>
                    {lang === 'mr' && itemName(item.name, item.name_mr, lang) !== item.name && (
                      <p className="text-xs text-white/30 leading-tight">{item.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setQuantities(p => ({ ...p, [item.id]: String(Math.max(0, (p[item.id] === '' || p[item.id] === undefined ? 0 : Number(p[item.id])) - 1)) }))}
                      className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 text-white text-lg font-bold flex items-center justify-center active:scale-90 active:bg-white/25 transition-all select-none"
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
                        'w-16 text-center rounded-xl px-2 py-1.5 text-sm font-medium outline-none',
                        'bg-white/10 border text-white placeholder-white/30',
                        hasVal
                          ? shift === 'in'
                            ? 'border-amber-400 bg-amber-500/20'
                            : 'border-indigo-400 bg-indigo-500/20'
                          : 'border-white/20'
                      )}
                    />
                    <button
                      onClick={() => setQuantities(p => ({ ...p, [item.id]: String((p[item.id] === '' || p[item.id] === undefined ? 0 : Number(p[item.id])) + 1) }))}
                      className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 text-white text-lg font-bold flex items-center justify-center active:scale-90 active:bg-white/25 transition-all select-none"
                    >+</button>
                    {item.unit && <span className="text-xs text-white/40 w-8">{item.unit}</span>}
                  </div>
                </div>
              );
            })}
          </div>
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
                : 'bg-indigo-500 hover:bg-indigo-400 text-white active:scale-[0.98]'
              : 'bg-white/10 text-white/30 cursor-not-allowed'
          )}
        >
          {saving
            ? <span className="flex items-center justify-center gap-2"><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t.saving}</span>
            : filled > 0
              ? t.saveBtn(shift === 'in' ? t.morningIn : t.closing, filled)
              : t.saveBtnEmpty(shift === 'in' ? t.morningIn : t.closing)}
        </button>
      </div>
    </main>
  );
}
