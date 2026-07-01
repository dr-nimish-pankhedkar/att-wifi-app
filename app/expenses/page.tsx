'use client';

import { useState, useCallback } from 'react';
import { ArrowLeft, Delete, IndianRupee, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface StaffProfile { id: string; name: string; designation: string | null; photo_url: string | null; }

interface Expense { id: string; amount: number; description: string; category: string; expense_date: string; }

const CATEGORIES = [
  'Vegetables & Fruits',
  'Grocery & Dry',
  'Dairy',
  'Cleaning',
  'Stationary',
  'Utilities',
  'Maintenance',
  'Miscellaneous',
];

function todayIST() {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
}

/* ── PIN pad ──────────────────────────────────────── */

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

/* ── Main page ────────────────────────────────────── */

export default function ExpensesPage() {
  const [staff, setStaff]             = useState<StaffProfile | null>(null);
  const [pinLoading, setPinLoading]   = useState(false);

  const [category, setCategory]       = useState('Miscellaneous');
  const [amount, setAmount]           = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate]               = useState(todayIST());
  const [saving, setSaving]           = useState(false);
  const [session, setSession]         = useState<Expense[]>([]);

  async function handlePin(pin: string) {
    setPinLoading(true);
    try {
      const res = await fetch('/api/staff/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Incorrect PIN'); return; }
      setStaff(data);
    } finally { setPinLoading(false); }
  }

  async function handleAdd() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (!description.trim()) { toast.error('Add a short description'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/cash-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          description: description.trim(),
          category,
          expense_date: date,
          staff_id: staff?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Failed to save'); return; }
      toast.success('Expense recorded!');
      setSession(prev => [data.expense, ...prev]);
      setAmount('');
      setDescription('');
    } finally { setSaving(false); }
  }

  /* ── PIN screen ── */
  if (!staff) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-emerald-900 via-teal-950 to-slate-900 flex flex-col items-center justify-between px-4 py-10 safe-area-inset">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-4">
            <IndianRupee className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Cash Expenses</h1>
          <p className="text-white/50 text-sm mt-1">Enter your PIN to continue</p>
        </div>
        <PinPad onSubmit={handlePin} loading={pinLoading} />
        <Link href="/" className="text-white/30 hover:text-white/60 text-sm transition-colors">
          ← Back
        </Link>
      </main>
    );
  }

  /* ── Expense entry screen ── */
  const total = session.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-900 via-teal-950 to-slate-900 px-4 py-6 safe-area-inset">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => setStaff(null)} className="text-white/50 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-white font-semibold">{staff.name}</p>
          <p className="text-white/50 text-xs">{staff.designation ?? 'Staff'}</p>
        </div>
        <div className="w-5" />
      </div>

      {/* Date selector */}
      <div className="flex items-center justify-between mb-5">
        <span className="text-white/60 text-sm">Date</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const d = new Date(date + 'T12:00:00');
              d.setDate(d.getDate() - 1);
              setDate(d.toISOString().split('T')[0]);
            }}
            className="text-white/50 hover:text-white text-xs px-2 py-1 border border-white/20 rounded-lg transition-colors"
          >← Prev</button>
          <span className="text-white text-sm font-medium">
            {new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <button
            onClick={() => {
              const today = todayIST();
              if (date >= today) return;
              const d = new Date(date + 'T12:00:00');
              d.setDate(d.getDate() + 1);
              setDate(d.toISOString().split('T')[0]);
            }}
            disabled={date >= todayIST()}
            className="text-white/50 hover:text-white text-xs px-2 py-1 border border-white/20 rounded-lg transition-colors disabled:opacity-30"
          >Next →</button>
        </div>
      </div>

      {/* Category pills */}
      <div className="mb-4">
        <p className="text-white/60 text-xs mb-2 uppercase tracking-wider">Category</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium border transition-all',
                category === cat
                  ? 'bg-emerald-400 border-emerald-400 text-slate-900'
                  : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div className="mb-3">
        <p className="text-white/60 text-xs mb-2 uppercase tracking-wider">Amount (₹)</p>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-xl font-medium">₹</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-white/10 border border-white/20 text-white text-xl font-semibold rounded-xl pl-9 pr-4 py-3.5 placeholder-white/20 focus:outline-none focus:ring-2 ring-emerald-400/60"
          />
        </div>
      </div>

      {/* Description */}
      <div className="mb-5">
        <p className="text-white/60 text-xs mb-2 uppercase tracking-wider">Description</p>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. Tomatoes from market"
          className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 placeholder-white/30 focus:outline-none focus:ring-2 ring-emerald-400/60"
        />
      </div>

      {/* Add button */}
      <button
        onClick={handleAdd}
        disabled={saving || !amount || !description.trim()}
        className={cn(
          'w-full py-4 rounded-2xl font-bold text-lg transition-all active:scale-[0.98]',
          saving || !amount || !description.trim()
            ? 'bg-white/10 text-white/30 cursor-not-allowed'
            : 'bg-emerald-400 text-slate-900 hover:bg-emerald-300 shadow-lg shadow-emerald-900/40'
        )}
      >
        {saving ? 'Saving…' : '+ Add Expense'}
      </button>

      {/* Session log */}
      {session.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/50 text-xs uppercase tracking-wider">Added this session</p>
            <p className="text-emerald-400 font-bold text-sm">Total ₹{total.toFixed(2)}</p>
          </div>
          <div className="space-y-2">
            {session.map((e) => (
              <div key={e.id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{e.description}</p>
                  <p className="text-white/40 text-xs">{e.category}</p>
                </div>
                <span className="text-emerald-300 font-semibold text-sm shrink-0">₹{Number(e.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
