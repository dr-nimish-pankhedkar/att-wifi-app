'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { posApi } from '@/lib/pos/client';
import type { LoyaltyConfig } from '@/lib/pos/loyalty';
import { cn } from '@/lib/utils';

export interface Customer { id: string; phone: string; name: string | null; visits: number; balance: number }

/* In-memory customer directory (never written to the device's storage). */
let cache: { at: number; customers: Customer[]; loyalty: LoyaltyConfig } | null = null;
let inflight: Promise<void> | null = null;

export function useCustomers() {
  const [state, setState] = useState(cache);
  useEffect(() => {
    if (cache && Date.now() - cache.at < 60_000) { setState(cache); return; }
    inflight ??= posApi<{ customers: Customer[]; loyalty: LoyaltyConfig }>('/api/pos/customers')
      .then((r) => { cache = { at: Date.now(), ...r }; })
      .catch(() => {})
      .finally(() => { inflight = null; });
    inflight.then(() => setState(cache));
  }, []);
  return state;
}
export function forgetCustomers() { cache = null; }

function match(list: Customer[], name: string, phone: string): Customer[] {
  const digits = phone.replace(/\D/g, '');
  const n = name.trim().toLowerCase();
  if (digits.length >= 3) return list.filter((c) => c.phone.includes(digits)).slice(0, 6);
  if (n.length >= 2) {
    const starts = list.filter((c) => c.name?.toLowerCase().split(/\s+/).some((w) => w.startsWith(n)) || c.name?.toLowerCase().startsWith(n));
    const contains = list.filter((c) => !starts.includes(c) && c.name?.toLowerCase().includes(n));
    return [...starts, ...contains].slice(0, 6);
  }
  return [];
}

/**
 * Name + phone fields that suggest existing customers as you type in either one.
 * Typing a full known number fills the name automatically; tapping a suggestion fills both.
 */
export default function CustomerPicker({ name, phone, onChange, customers, showBalance = true }: {
  name: string; phone: string; onChange: (v: { name: string; phone: string }) => void;
  customers: Customer[] | undefined; showBalance?: boolean;
}) {
  const [focus, setFocus] = useState<'name' | 'phone' | null>(null);
  const list = useMemo(() => customers ?? [], [customers]);
  const suggestions = useMemo(() => (focus ? match(list, focus === 'name' ? name : '', focus === 'phone' ? phone : '') : []), [list, focus, name, phone]);
  const exact = list.find((c) => c.phone === phone.replace(/\D/g, '').slice(-10));
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Full known number typed → fill the name straight away.
  useEffect(() => {
    if (exact && !name.trim() && exact.name) onChange({ name: exact.name, phone });
  }, [exact]); // eslint-disable-line react-hooks/exhaustive-deps

  const onBlur = () => { blurTimer.current = setTimeout(() => setFocus(null), 150); };
  const onFocus = (f: 'name' | 'phone') => { if (blurTimer.current) clearTimeout(blurTimer.current); setFocus(f); };

  return (
    <div className="relative">
      <div className="grid grid-cols-2 gap-2">
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Customer name" autoComplete="off"
          value={name} onFocus={() => onFocus('name')} onBlur={onBlur}
          onChange={(e) => onChange({ name: e.target.value, phone })} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Mobile number" inputMode="numeric" autoComplete="off"
          value={phone} onFocus={() => onFocus('phone')} onBlur={onBlur}
          onChange={(e) => onChange({ name, phone: e.target.value.replace(/[^\d+ ]/g, '').slice(0, 14) })} />
      </div>
      {suggestions.length > 0 && !(exact && suggestions.length === 1 && suggestions[0].id === exact.id && name) && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-60 overflow-auto">
          {suggestions.map((c) => (
            <li key={c.id}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-stone-50 flex justify-between gap-2"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange({ name: c.name ?? '', phone: c.phone }); setFocus(null); }}>
                <span className="truncate"><span className="font-medium">{c.name || 'No name'}</span> <span className="text-muted-foreground">{c.phone}</span></span>
                {showBalance && c.balance > 0 && <span className="text-xs text-amber-700 shrink-0">🎁 {c.balance}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {phone.replace(/\D/g, '').length === 10 && (
        <p className={cn('text-xs mt-1', exact ? 'text-green-700' : 'text-muted-foreground')}>
          {exact ? `Returning customer · ${exact.visits} visit${exact.visits === 1 ? '' : 's'}${showBalance ? ` · 🎁 ${exact.balance} points` : ''}` : 'New customer — will be saved on payment'}
        </p>
      )}
    </div>
  );
}
