'use client';

import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { rupee, type AddonGroup, type MenuItem } from '@/lib/pos/types';

export interface PickedLine {
  item: MenuItem;
  variation_id: string | null;
  variation_name: string | null;
  addons: { id: string; name: string; price: number; group_id: string }[];
  qty: number;
  note: string;
  unit: number;
}

export function unitPrice(item: MenuItem, variationId: string | null, addons: { price: number }[]) {
  const base = item.variations.length ? item.variations.find((v) => v.id === variationId)?.price ?? 0 : item.price;
  return base + addons.reduce((s, a) => s + a.price, 0);
}

export default function ItemOptionsDialog({
  item, groups, onClose, onAdd,
}: { item: MenuItem | null; groups: AddonGroup[]; onClose: () => void; onAdd: (l: PickedLine) => void }) {
  const [variation, setVariation] = useState<string | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  useEffect(() => {
    setVariation(item?.variations[0]?.id ?? null);
    setAddons([]); setQty(1); setNote('');
  }, [item]);

  const itemGroups = useMemo(() => groups.filter((g) => item?.addon_group_ids.includes(g.id)), [groups, item]);
  if (!item) return null;

  const chosenAddons = itemGroups.flatMap((g) => g.options.filter((o) => addons.includes(o.id)).map((o) => ({ ...o, group_id: g.id })));
  const unit = unitPrice(item, variation, chosenAddons);
  const groupError = itemGroups.find((g) => {
    const n = chosenAddons.filter((a) => a.group_id === g.id).length;
    return n < g.min_select || n > g.max_select;
  });

  function toggle(g: AddonGroup, optId: string) {
    setAddons((cur) => {
      if (cur.includes(optId)) return cur.filter((x) => x !== optId);
      const inGroup = cur.filter((x) => g.options.some((o) => o.id === x));
      if (g.max_select === 1) return [...cur.filter((x) => !inGroup.includes(x)), optId];
      if (inGroup.length >= g.max_select) return cur;
      return [...cur, optId];
    });
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
        </DialogHeader>

        {item.variations.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">{item.variations[0].group_name}</p>
            <div className="grid grid-cols-2 gap-2">
              {item.variations.map((v) => (
                <button key={v.id} onClick={() => setVariation(v.id)}
                  className={cn('rounded-lg border px-3 py-3 text-left', variation === v.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border')}>
                  <div className="font-medium">{v.name}</div>
                  <div className="text-sm text-muted-foreground">{rupee(v.price)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {itemGroups.map((g) => (
          <div key={g.id}>
            <p className="text-sm font-medium mb-2">
              {g.name} <span className="text-muted-foreground font-normal">({g.min_select > 0 ? `pick ${g.min_select}–${g.max_select}` : `up to ${g.max_select}`})</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {g.options.map((o) => (
                <button key={o.id} onClick={() => toggle(g, o.id)}
                  className={cn('rounded-lg border px-3 py-2 text-left', addons.includes(o.id) ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border')}>
                  <div className="text-sm font-medium">{o.name}</div>
                  <div className="text-xs text-muted-foreground">+{rupee(o.price)}</div>
                </button>
              ))}
            </div>
          </div>
        ))}

        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for kitchen (optional)"
          className="w-full rounded-lg border px-3 py-2 text-sm" maxLength={200} />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button className="h-10 w-10 rounded-full border flex items-center justify-center" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="w-4 h-4" /></button>
            <span className="text-lg font-semibold w-6 text-center">{qty}</span>
            <button className="h-10 w-10 rounded-full border flex items-center justify-center" onClick={() => setQty((q) => Math.min(99, q + 1))}><Plus className="w-4 h-4" /></button>
          </div>
          <Button size="lg" disabled={!!groupError || (item.variations.length > 0 && !variation)}
            onClick={() => onAdd({
              item, variation_id: variation,
              variation_name: item.variations.find((v) => v.id === variation)?.name ?? null,
              addons: chosenAddons.map((a) => ({ id: a.id, name: a.name, price: a.price, group_id: a.group_id })),
              qty, note: note.trim(), unit,
            })}>
            Add · {rupee(unit * qty)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
