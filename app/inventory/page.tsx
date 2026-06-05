'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ChevronDown, ChevronUp, CheckCircle2, Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Types ────────────────────────────────────────── */

interface StaffProfile {
  id: string;
  name: string;
  designation: string | null;
  photo_url: string | null;
}

interface InventoryItem {
  id: string;
  category: string;
  name: string;
  unit: string;
  min_level: number;
  latest: { quantity: number; log_date: string } | null;
}

/* ── Mini PIN pad ─────────────────────────────────── */

function KioskPinPad({ onSubmit, loading }: { onSubmit: (pin: string) => void; loading: boolean }) {
  const [pin, setPin] = useState('');
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  const handleKey = useCallback(
    (key: string) => {
      if (loading) return;
      if (key === 'del') {
        setPin((p) => p.slice(0, -1));
      } else if (pin.length < 4) {
        const next = pin + key;
        setPin(next);
        if (next.length === 4) {
          setTimeout(() => {
            onSubmit(next);
            setPin('');
          }, 120);
        }
      }
    },
    [pin, loading, onSubmit]
  );

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xs">
      <div className="flex gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-4 w-4 rounded-full border-2 border-white/40 transition-all duration-150',
              i < pin.length ? 'bg-white border-white scale-125' : 'bg-transparent'
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 w-full px-2">
        {KEYS.map((key, idx) => {
          if (key === '') return <div key={idx} />;
          return (
            <button
              key={idx}
              onClick={() => handleKey(key)}
              disabled={loading}
              className={cn(
                'flex items-center justify-center rounded-2xl text-2xl font-semibold select-none',
                'bg-white/10 border border-white/20 text-white',
                'active:scale-95 active:bg-white/25 transition-all duration-100',
                'disabled:opacity-40 h-16 sm:h-20',
                key === 'del' && 'text-lg'
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

/* ── Category section (collapsible) ──────────────── */

function CategorySection({
  category,
  items,
  quantities,
  onChange,
}: {
  category: string;
  items: InventoryItem[];
  quantities: Record<string, string>;
  onChange: (id: string, val: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const filled = items.filter((i) => quantities[i.id] !== '' && quantities[i.id] !== undefined).length;

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-white">{category}</span>
          <span className="text-xs text-white/40 font-normal">
            {filled}/{items.length} filled
          </span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-white/50" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/50" />
        )}
      </button>

      {open && (
        <div className="divide-y divide-white/10">
          {items.map((item) => {
            const val = quantities[item.id] ?? '';
            const num = val === '' ? null : Number(val);
            const hasMin = item.min_level > 0;
            const isCritical = hasMin && num !== null && num <= item.min_level;
            const isLow = hasMin && num !== null && num > item.min_level && num <= item.min_level * 1.5;

            return (
              <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium leading-tight">{item.name}</p>
                  {item.latest && (
                    <p className="text-xs text-white/40 mt-0.5">
                      Last: {item.latest.quantity} {item.unit}
                      {' · '}
                      {new Date(item.latest.log_date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={val}
                    onChange={(e) => onChange(item.id, e.target.value)}
                    placeholder={item.latest ? String(item.latest.quantity) : '—'}
                    className={cn(
                      'w-20 text-right rounded-xl px-3 py-1.5 text-sm font-medium outline-none',
                      'bg-white/10 border text-white placeholder-white/30',
                      isCritical
                        ? 'border-red-400 bg-red-500/20'
                        : isLow
                        ? 'border-amber-400 bg-amber-500/20'
                        : val !== ''
                        ? 'border-green-400 bg-green-500/10'
                        : 'border-white/20'
                    )}
                  />
                  <span className="text-xs text-white/40 w-8">{item.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════ */

export default function StaffInventoryPage() {
  const router = useRouter();
  const todayIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];

  // Auth state
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Inventory state
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [logDate, setLogDate] = useState(todayIST);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load items once staff is authenticated
  useEffect(() => {
    if (!staff) return;
    setLoadingItems(true);
    fetch('/api/inventory')
      .then((r) => r.json())
      .then(({ items: data }) => {
        setItems(data ?? []);
        // Pre-fill last known quantities
        const pre: Record<string, string> = {};
        for (const item of data ?? []) {
          if (item.latest) pre[item.id] = String(item.latest.quantity);
        }
        setQuantities(pre);
      })
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
    if (!res.ok) {
      const { error } = await res.json();
      toast.error(error ?? 'Invalid PIN');
      return;
    }
    const profile = await res.json();
    setStaff(profile);
  }, []);

  function setQty(id: string, val: string) {
    setQuantities((p) => ({ ...p, [id]: val }));
  }

  async function handleSubmit() {
    const entries = items
      .filter((i) => quantities[i.id] !== '' && quantities[i.id] !== undefined)
      .map((i) => ({ item_id: i.id, quantity: Number(quantities[i.id]) }));

    if (entries.length === 0) {
      toast.error('Please fill in at least one quantity');
      return;
    }

    setSaving(true);
    const res = await fetch('/api/inventory/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log_date: logDate, entries }),
    });
    setSaving(false);

    if (!res.ok) {
      const { error } = await res.json();
      toast.error(error ?? 'Failed to save');
      return;
    }

    const { saved: n } = await res.json();
    toast.success(`Saved ${n} items`);
    setSaved(true);
  }

  // Group items by category
  const groups: Record<string, InventoryItem[]> = {};
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }

  const totalFilled = items.filter(
    (i) => quantities[i.id] !== '' && quantities[i.id] !== undefined
  ).length;

  /* ── PIN screen ─────────────────────────────── */
  if (!staff) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-between px-4 py-8">
        <div className="w-full flex items-center">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>

        <div className="flex flex-col items-center gap-8 w-full">
          <div className="text-center">
            <div className="text-4xl mb-3">📦</div>
            <h1 className="text-2xl font-bold text-white">Stock Check</h1>
            <p className="text-white/50 text-sm mt-1">Enter your PIN to log inventory</p>
          </div>
          <KioskPinPad onSubmit={handlePin} loading={verifying} />
        </div>

        <div />
      </main>
    );
  }

  /* ── Success screen ─────────────────────────── */
  if (saved) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center gap-6 px-4">
        <CheckCircle2 className="w-20 h-20 text-green-400" />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">Stock check saved!</h2>
          <p className="text-white/50 mt-1">
            {totalFilled} items logged for{' '}
            {new Date(logDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => router.push('/')}
          className="mt-4 bg-white/10 border border-white/20 text-white rounded-xl px-8 py-3 font-medium hover:bg-white/20 transition-colors"
        >
          Done
        </button>
      </main>
    );
  }

  /* ── Stock check form ───────────────────────── */
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 pb-32">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-900/90 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center">
          <p className="text-white font-semibold text-sm">Stock Check</p>
          <p className="text-white/40 text-xs">Hi, {staff.name}</p>
        </div>
        <div className="w-16" />
      </div>

      {/* Date picker */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <div>
            <p className="text-xs text-white/50 mb-0.5">Check date</p>
            <input
              type="date"
              value={logDate}
              max={todayIST}
              onChange={(e) => setLogDate(e.target.value)}
              className="bg-transparent text-white text-sm font-medium outline-none"
            />
          </div>
          <div className="text-right">
            <p className="text-xs text-white/50">Filled</p>
            <p className="text-white font-bold">
              {totalFilled} <span className="text-white/40 font-normal text-xs">/ {items.length}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Items */}
      {loadingItems ? (
        <div className="flex justify-center items-center pt-20">
          <div className="h-8 w-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : (
        <div className="px-4 pt-2 space-y-3">
          {Object.entries(groups).map(([cat, catItems]) => (
            <CategorySection
              key={cat}
              category={cat}
              items={catItems}
              quantities={quantities}
              onChange={setQty}
            />
          ))}
        </div>
      )}

      {/* Sticky submit */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-4 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent">
        <button
          onClick={handleSubmit}
          disabled={saving || totalFilled === 0}
          className={cn(
            'w-full rounded-2xl py-4 font-bold text-base transition-all',
            totalFilled > 0
              ? 'bg-blue-500 hover:bg-blue-400 text-white active:scale-[0.98]'
              : 'bg-white/10 text-white/30 cursor-not-allowed'
          )}
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving…
            </span>
          ) : (
            `Save Stock Check${totalFilled > 0 ? ` (${totalFilled} items)` : ''}`
          )}
        </button>
      </div>
    </main>
  );
}
