'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  ShoppingCart, ClipboardList, Package, Settings2, Plus, Trash2, Pencil,
  Check, X, ChevronDown, ChevronUp, MoveRight, GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Types ──────────────────────────────────────────────── */

interface Bucket {
  id: string;
  name: string;
  sort_order: number;
}

interface InventoryItem {
  id: string;
  bucket_id: string | null;
  category: string;
  name: string;
  unit: string;
  min_level: number;
  sort_order: number;
  active: boolean;
  latest: { quantity: number; log_date: string; notes: string | null; logged_by_name: string | null; created_at: string | null } | null;
}

type Tab = 'stock' | 'log' | 'shopping' | 'manage';

/* ── Palette — cycles through these colors per bucket ───── */
const COLORS = [
  { border: 'border-blue-500',   bg: 'bg-blue-50',   header: 'bg-blue-500',   text: 'text-blue-700'   },
  { border: 'border-violet-500', bg: 'bg-violet-50',  header: 'bg-violet-500', text: 'text-violet-700' },
  { border: 'border-emerald-500',bg: 'bg-emerald-50', header: 'bg-emerald-500',text: 'text-emerald-700'},
  { border: 'border-orange-500', bg: 'bg-orange-50',  header: 'bg-orange-500', text: 'text-orange-700' },
  { border: 'border-cyan-500',   bg: 'bg-cyan-50',    header: 'bg-cyan-500',   text: 'text-cyan-700'   },
  { border: 'border-rose-500',   bg: 'bg-rose-50',    header: 'bg-rose-500',   text: 'text-rose-700'   },
  { border: 'border-amber-500',  bg: 'bg-amber-50',   header: 'bg-amber-500',  text: 'text-amber-700'  },
  { border: 'border-indigo-500', bg: 'bg-indigo-50',  header: 'bg-indigo-500', text: 'text-indigo-700' },
];

function bucketColor(index: number) {
  return COLORS[index % COLORS.length];
}

/* ── Stock helpers ──────────────────────────────────────── */

function stockStatus(item: InventoryItem): 'none' | 'critical' | 'low' | 'ok' {
  if (!item.latest) return 'none';
  const { quantity: qty } = item.latest;
  const min = item.min_level;
  if (min <= 0) return 'ok';
  if (qty <= min) return 'critical';
  if (qty <= min * 1.5) return 'low';
  return 'ok';
}

function StockBadge({ item }: { item: InventoryItem }) {
  if (!item.latest) return <span className="text-xs text-gray-400 italic">not logged</span>;
  const st = stockStatus(item);
  const cls =
    st === 'critical' ? 'bg-red-100 text-red-700 border border-red-300' :
    st === 'low'      ? 'bg-amber-100 text-amber-700 border border-amber-300' :
                        'bg-green-100 text-green-700 border border-green-300';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {item.latest.quantity} {item.unit}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════
   BUCKET CARD
══════════════════════════════════════════════════════════ */

function BucketCard({
  bucket,
  items,
  colorIdx,
  tab,
  quantities,
  onQtyChange,
  onMoveItem,
  onRefresh,
  allBuckets,
}: {
  bucket: Bucket;
  items: InventoryItem[];
  colorIdx: number;
  tab: Tab;
  quantities: Record<string, string>;
  onQtyChange: (id: string, val: string) => void;
  onMoveItem: (itemId: string, toBucketId: string | null) => void;
  onRefresh: () => void;
  allBuckets: Bucket[];
}) {
  const [open, setOpen] = useState(true);
  const [editingBucket, setEditingBucket] = useState(false);
  const [bucketName, setBucketName] = useState(bucket.name);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', unit: '', min_level: '' });
  const [addingItem, setAddingItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', unit: '', min_level: '0' });
  const [movingItem, setMovingItem] = useState<string | null>(null);
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [unitDraft, setUnitDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [localItems, setLocalItems] = useState(items);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  useEffect(() => { setLocalItems(items); }, [items]);

  function handleItemDrop(dragId: string, overId: string) {
    if (dragId === overId) return;
    const reordered = [...localItems];
    const from = reordered.findIndex(i => i.id === dragId);
    const to   = reordered.findIndex(i => i.id === overId);
    if (from === -1 || to === -1) return;
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setLocalItems(reordered);
    Promise.all(
      reordered.map((item, i) =>
        fetch(`/api/inventory/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: (i + 1) * 10 }),
        })
      )
    ).then(() => onRefresh());
  }

  async function saveUnit(itemId: string, unit: string) {
    const res = await fetch(`/api/inventory/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit: unit.trim() }),
    });
    setEditingUnit(null);
    if (!res.ok) { toast.error('Failed to update unit'); return; }
    onRefresh();
  }

  const color = bucketColor(colorIdx);

  const criticalCount = localItems.filter(i => stockStatus(i) === 'critical').length;
  const lowCount = localItems.filter(i => stockStatus(i) === 'low').length;

  async function saveBucketName() {
    if (!bucketName.trim()) return;
    const res = await fetch(`/api/inventory/buckets/${bucket.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: bucketName.trim() }),
    });
    if (!res.ok) { toast.error('Failed to rename'); return; }
    toast.success('Bucket renamed');
    setEditingBucket(false);
    onRefresh();
  }

  async function deleteBucket() {
    if (!confirm(`Delete bucket "${bucket.name}"? Items will become unassigned.`)) return;
    const res = await fetch(`/api/inventory/buckets/${bucket.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Delete failed'); return; }
    toast.success('Bucket deleted');
    onRefresh();
  }

  async function saveItemEdit(item: InventoryItem) {
    setSaving(true);
    const res = await fetch(`/api/inventory/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        unit: editForm.unit,
        min_level: Number(editForm.min_level),
      }),
    });
    setSaving(false);
    if (!res.ok) { toast.error('Save failed'); return; }
    setEditingItem(null);
    onRefresh();
  }

  async function deactivateItem(item: InventoryItem) {
    const res = await fetch(`/api/inventory/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });
    if (!res.ok) { toast.error('Failed'); return; }
    toast.success('Item removed');
    onRefresh();
  }

  async function moveItem(itemId: string, toBucketId: string | null) {
    const res = await fetch(`/api/inventory/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket_id: toBucketId }),
    });
    if (!res.ok) { toast.error('Move failed'); return; }
    setMovingItem(null);
    onMoveItem(itemId, toBucketId);
    onRefresh();
  }

  async function addItemToBucket() {
    if (!newItem.name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newItem.name.trim(),
        unit: newItem.unit,
        min_level: Number(newItem.min_level),
        bucket_id: bucket.id,
        category: bucket.name,
      }),
    });
    setSaving(false);
    if (!res.ok) { toast.error('Add failed'); return; }
    toast.success('Item added');
    setAddingItem(false);
    setNewItem({ name: '', unit: '', min_level: '0' });
    onRefresh();
  }

  return (
    <div className={`rounded-xl border-2 ${color.border} overflow-hidden shadow-sm`}>
      {/* Card header */}
      <div className={`${color.header} text-white px-4 py-2.5 flex items-center justify-between`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {tab === 'manage' && editingBucket ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                value={bucketName}
                onChange={(e) => setBucketName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveBucketName()}
                className="flex-1 bg-white/20 text-white placeholder-white/60 rounded px-2 py-0.5 text-sm font-semibold outline-none border border-white/40"
                autoFocus
              />
              <button onClick={saveBucketName} className="p-1 hover:bg-white/20 rounded">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => { setEditingBucket(false); setBucketName(bucket.name); }} className="p-1 hover:bg-white/20 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <span className="font-bold text-sm truncate">{bucket.name}</span>
              <span className="text-white/60 text-xs shrink-0">{items.length} items</span>
              {criticalCount > 0 && (
                <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full shrink-0">{criticalCount} low</span>
              )}
              {lowCount > 0 && criticalCount === 0 && (
                <span className="text-xs bg-amber-400 text-white px-1.5 py-0.5 rounded-full shrink-0">{lowCount} near</span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {tab === 'manage' && !editingBucket && (
            <>
              <button onClick={() => setEditingBucket(true)} className="p-1 hover:bg-white/20 rounded" title="Rename">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={deleteBucket} className="p-1 hover:bg-white/20 rounded" title="Delete bucket">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button onClick={() => setOpen(o => !o)} className="p-1 hover:bg-white/20 rounded">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Items */}
      {open && (
        <div>
          {items.length === 0 && tab !== 'manage' && (
            <div className="px-4 py-3 text-sm text-muted-foreground italic">No items</div>
          )}

          <div className="divide-y">
            {localItems.map((item) => {
              const st = stockStatus(item);
              const rowBg =
                st === 'critical' ? 'bg-red-50' :
                st === 'low'      ? 'bg-amber-50' : '';

              /* ── Manage mode row ── */
              if (tab === 'manage') {
                if (editingItem === item.id) {
                  return (
                    <div key={item.id} className="px-3 py-2 flex flex-wrap items-center gap-2 bg-muted/30">
                      <input
                        value={editForm.name}
                        onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                        className="flex-1 min-w-28 border rounded px-2 py-1 text-sm"
                        placeholder="Name"
                      />
                      <input
                        value={editForm.unit}
                        onChange={e => setEditForm(p => ({ ...p, unit: e.target.value }))}
                        className="w-16 border rounded px-2 py-1 text-sm"
                        placeholder="unit"
                      />
                      <input
                        type="number"
                        value={editForm.min_level}
                        onChange={e => setEditForm(p => ({ ...p, min_level: e.target.value }))}
                        className="w-20 border rounded px-2 py-1 text-sm"
                        placeholder="min"
                      />
                      <button onClick={() => saveItemEdit(item)} disabled={saving} className="p-1 text-green-600">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingItem(null)} className="p-1 text-muted-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id}
                    draggable={movingItem !== item.id}
                    onDragStart={e => { setDragKey(item.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverKey(item.id); }}
                    onDrop={e => { e.preventDefault(); if (dragKey) handleItemDrop(dragKey, item.id); setDragKey(null); setOverKey(null); }}
                    onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                    className={cn(
                      'px-3 py-2 flex items-center gap-2 transition-colors',
                      dragKey === item.id && 'opacity-40',
                      overKey === item.id && dragKey !== item.id && 'bg-primary/5 border-t-2 border-primary'
                    )}
                  >
                    {movingItem === item.id ? (
                      <div className="flex items-center gap-2 flex-1 flex-wrap">
                        <span className="text-sm font-medium text-muted-foreground flex-1">{item.name}</span>
                        <div className="flex items-center gap-1.5">
                          <MoveRight className="w-3.5 h-3.5 text-muted-foreground" />
                          <select
                            defaultValue=""
                            onChange={e => { if (e.target.value) moveItem(item.id, e.target.value === 'none' ? null : e.target.value); }}
                            className="border rounded px-2 py-1 text-sm"
                          >
                            <option value="" disabled>Move to…</option>
                            {allBuckets.filter(b => b.id !== bucket.id).map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                          <button onClick={() => setMovingItem(null)} className="p-0.5 text-muted-foreground">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <GripVertical className="w-4 h-4 text-muted-foreground/30 cursor-grab active:cursor-grabbing shrink-0" />
                        <span className="flex-1 text-sm font-medium">{item.name}</span>
                        {/* Inline unit editor */}
                        {editingUnit === item.id ? (
                          <input
                            value={unitDraft}
                            onChange={e => setUnitDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveUnit(item.id, unitDraft);
                              if (e.key === 'Escape') setEditingUnit(null);
                            }}
                            onBlur={() => saveUnit(item.id, unitDraft)}
                            className="w-16 border rounded px-2 py-0.5 text-xs text-center"
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={() => { setEditingUnit(item.id); setUnitDraft(item.unit); }}
                            className="text-xs text-muted-foreground border-b border-dashed border-muted-foreground/40 hover:text-foreground hover:border-foreground transition-colors min-w-8 text-center"
                            title="Click to edit unit"
                          >
                            {item.unit || <span className="italic opacity-50">unit</span>}
                          </button>
                        )}
                        {item.min_level > 0 && (
                          <span className="text-xs text-muted-foreground hidden sm:block">min {item.min_level}</span>
                        )}
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => { setMovingItem(item.id); }}
                            className="p-1.5 text-muted-foreground hover:text-foreground" title="Move to another bucket"
                          >
                            <MoveRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setEditingItem(item.id); setEditForm({ name: item.name, unit: item.unit, min_level: String(item.min_level) }); }}
                            className="p-1.5 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deactivateItem(item)}
                            className="p-1.5 text-muted-foreground hover:text-red-500"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              }

              /* ── Log mode row ── */
              if (tab === 'log') {
                const val = quantities[item.id] ?? '';
                const isFromLog = !!item.latest && val === String(item.latest.quantity);
                const isFromMin = !item.latest && item.min_level > 0 && val === String(item.min_level);
                const inputCls = isFromLog ? 'bg-blue-50 border-blue-300 text-blue-800'
                               : isFromMin  ? 'bg-amber-50 border-amber-300 text-amber-800'
                               : '';
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">{item.name}</span>
                      {item.latest ? (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Last: {item.latest.quantity} {item.unit} · {new Date(item.latest.log_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-600 mt-0.5">min level — verify count</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{item.unit}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={val}
                      onChange={e => onQtyChange(item.id, e.target.value)}
                      placeholder="qty"
                      className={`w-24 border rounded px-2 py-1 text-sm text-right transition-colors ${inputCls}`}
                    />
                  </div>
                );
              }

              /* ── Stock / Shopping mode row ── */
              return (
                <div key={item.id} className={`flex items-center justify-between px-4 py-2.5 ${rowBg}`}>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{item.name}</span>
                    {item.min_level > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">min {item.min_level} {item.unit}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <StockBadge item={item} />
                    {item.latest ? (
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.latest.log_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          {item.latest.created_at && (
                            <span className="ml-1">
                              {new Date(item.latest.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </span>
                          )}
                        </p>
                        {item.latest.logged_by_name && (
                          <p className="text-xs text-muted-foreground/60">{item.latest.logged_by_name}</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add item row (manage mode) */}
          {tab === 'manage' && (
            <div className={`px-3 py-2 ${color.bg}`}>
              {addingItem ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={newItem.name}
                    onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
                    placeholder="Item name"
                    className="flex-1 min-w-28 border rounded px-2 py-1 text-sm"
                    autoFocus
                  />
                  <input
                    value={newItem.unit}
                    onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))}
                    placeholder="unit"
                    className="w-16 border rounded px-2 py-1 text-sm"
                  />
                  <input
                    type="number"
                    value={newItem.min_level}
                    onChange={e => setNewItem(p => ({ ...p, min_level: e.target.value }))}
                    placeholder="min"
                    className="w-16 border rounded px-2 py-1 text-sm"
                  />
                  <button onClick={addItemToBucket} disabled={saving} className={`px-3 py-1 rounded text-xs font-medium ${color.header} text-white disabled:opacity-50`}>
                    {saving ? '…' : 'Add'}
                  </button>
                  <button onClick={() => setAddingItem(false)} className="p-1 text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingItem(true)}
                  className={`flex items-center gap-1.5 text-xs font-medium ${color.text} hover:underline`}
                >
                  <Plus className="w-3.5 h-3.5" /> Add item
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>('stock');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);

  // Log tab state
  const todayIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
  const [logDate, setLogDate] = useState(todayIST);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Add bucket
  const [addingBucket, setAddingBucket] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [itemsRes, bucketsRes] = await Promise.all([
      fetch('/api/inventory'),
      fetch('/api/inventory/buckets'),
    ]);
    if (itemsRes.ok) {
      const { items: data } = await itemsRes.json();
      const list = data ?? [];
      setItems(list);
      // pre-fill quantities with latest known
      setQuantities((prev) => {
        const next = { ...prev };
        for (const item of list) {
          if (next[item.id] !== undefined) continue;
          if (item.latest) {
            next[item.id] = String(item.latest.quantity);
          } else if (item.min_level > 0) {
            next[item.id] = String(item.min_level);
          }
        }
        return next;
      });
    }
    if (bucketsRes.ok) {
      const { buckets: data } = await bucketsRes.json();
      setBuckets(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function setQty(id: string, val: string) {
    setQuantities(p => ({ ...p, [id]: val }));
  }

  async function handleSave() {
    const entries = items
      .filter(i => quantities[i.id] !== '' && quantities[i.id] !== undefined)
      .map(i => ({ item_id: i.id, quantity: Number(quantities[i.id]) }));
    if (entries.length === 0) { toast.error('Enter at least one quantity'); return; }
    setSaving(true);
    const res = await fetch('/api/inventory/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log_date: logDate, entries }),
    });
    setSaving(false);
    if (!res.ok) { toast.error((await res.json()).error ?? 'Failed'); return; }
    const { saved: n } = await res.json();
    toast.success(`Saved ${n} items for ${logDate}`);
    load();
  }

  async function addBucket() {
    if (!newBucketName.trim()) { toast.error('Name required'); return; }
    const res = await fetch('/api/inventory/buckets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newBucketName.trim() }),
    });
    if (!res.ok) { toast.error('Failed'); return; }
    toast.success('Bucket added');
    setAddingBucket(false);
    setNewBucketName('');
    load();
  }

  /* Group items by bucket */
  const itemsByBucket: Record<string, InventoryItem[]> = {};
  const unassigned: InventoryItem[] = [];
  for (const item of items) {
    if (item.bucket_id) {
      if (!itemsByBucket[item.bucket_id]) itemsByBucket[item.bucket_id] = [];
      itemsByBucket[item.bucket_id].push(item);
    } else {
      unassigned.push(item);
    }
  }

  /* For shopping tab: only buckets that have low/critical items */
  const shoppingBuckets = buckets.filter(b => {
    const bItems = itemsByBucket[b.id] ?? [];
    return bItems.some(i => stockStatus(i) === 'critical' || (stockStatus(i) === 'none' && i.min_level > 0));
  });

  const critical = items.filter(i => stockStatus(i) === 'critical').length;
  const low = items.filter(i => stockStatus(i) === 'low').length;
  const totalFilled = items.filter(i => quantities[i.id] !== '' && quantities[i.id] !== undefined).length;

  const displayBuckets = tab === 'shopping' ? shoppingBuckets : buckets;

  const TABS = [
    { id: 'stock' as Tab,    label: 'Current Stock',   icon: <Package className="w-4 h-4" /> },
    { id: 'log' as Tab,      label: 'Log Stock Check', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'shopping' as Tab, label: 'Shopping List',   icon: <ShoppingCart className="w-4 h-4" /> },
    { id: 'manage' as Tab,   label: 'Manage',          icon: <Settings2 className="w-4 h-4" /> },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {buckets.length} buckets · {items.length} items
            {critical > 0 && <span className="ml-2 text-red-600 font-medium">{critical} critical</span>}
            {low > 0 && <span className="ml-2 text-amber-600 font-medium">{low} low</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> Below min</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Near min</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" /> Good</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-0.5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Loading…</div>
      ) : buckets.length === 0 && items.length === 0 ? (
        /* ── Setup required ── */
        <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-semibold text-amber-900">Database tables not set up yet</h3>
              <p className="text-sm text-amber-800 mt-1">
                Run the following SQL files in your <strong>Supabase SQL Editor</strong> in order, then refresh this page.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg bg-white border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">Step 1 — Create items table + seed data</p>
              <code className="text-xs text-gray-700 font-mono">supabase/inventory-schema.sql</code>
            </div>
            <div className="rounded-lg bg-white border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">Step 2 — Create buckets + link items</p>
              <code className="text-xs text-gray-700 font-mono">supabase/inventory-buckets-schema.sql</code>
            </div>
          </div>
          <button onClick={load} className="text-sm font-medium text-amber-800 underline">
            Refresh after running migrations
          </button>
        </div>
      ) : (
        <>
          {/* Log tab: date + save controls */}
          {tab === 'log' && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Date:</label>
                <input type="date" value={logDate} max={todayIST}
                  onChange={e => setLogDate(e.target.value)}
                  className="border rounded px-3 py-1.5 text-sm"
                />
              </div>
              <span className="text-xs text-muted-foreground">{totalFilled} / {items.length} filled</span>
              <button onClick={handleSave} disabled={saving || totalFilled === 0}
                className="ml-auto bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Stock Check'}
              </button>
            </div>
          )}

          {/* Shopping: empty state */}
          {tab === 'shopping' && shoppingBuckets.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">All stocked up!</p>
            </div>
          )}

          {/* Bucket grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayBuckets.map((bucket, idx) => {
              const bucketItems = (itemsByBucket[bucket.id] ?? []).filter(i =>
                tab === 'shopping'
                  ? (stockStatus(i) === 'critical' || (stockStatus(i) === 'none' && i.min_level > 0))
                  : true
              );
              if (tab === 'shopping' && bucketItems.length === 0) return null;
              return (
                <BucketCard
                  key={bucket.id}
                  bucket={bucket}
                  items={bucketItems}
                  colorIdx={idx}
                  tab={tab}
                  quantities={quantities}
                  onQtyChange={setQty}
                  onMoveItem={() => {}}
                  onRefresh={load}
                  allBuckets={buckets}
                />
              );
            })}

            {/* Unassigned items (only in manage tab) */}
            {tab === 'manage' && unassigned.length > 0 && (
              <BucketCard
                bucket={{ id: '__unassigned__', name: 'Unassigned', sort_order: 9999 }}
                items={unassigned}
                colorIdx={buckets.length}
                tab={tab}
                quantities={quantities}
                onQtyChange={setQty}
                onMoveItem={() => {}}
                onRefresh={load}
                allBuckets={buckets}
              />
            )}
          </div>

          {/* Add bucket (manage tab) */}
          {tab === 'manage' && (
            <div className="pt-2">
              {addingBucket ? (
                <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                  <input
                    value={newBucketName}
                    onChange={e => setNewBucketName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addBucket()}
                    placeholder="Bucket name (e.g. Box 5 – Snacks)"
                    className="flex-1 border rounded px-3 py-1.5 text-sm"
                    autoFocus
                  />
                  <button onClick={addBucket} className="bg-primary text-primary-foreground px-4 py-1.5 rounded text-sm font-medium">
                    Add
                  </button>
                  <button onClick={() => setAddingBucket(false)} className="p-1.5 text-muted-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingBucket(true)}
                  className="flex items-center gap-2 border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary rounded-xl px-4 py-3 w-full justify-center text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add New Bucket
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
