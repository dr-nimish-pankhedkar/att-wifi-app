'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { ShoppingCart, ClipboardList, Package, Settings2, Plus, Trash2, Pencil, Check, X } from 'lucide-react';

/* ── Types ─────────────────────────────────────────────── */

interface InventoryItem {
  id: string;
  category: string;
  name: string;
  unit: string;
  min_level: number;
  sort_order: number;
  active: boolean;
  latest: { quantity: number; log_date: string; notes: string | null } | null;
}

type Tab = 'stock' | 'log' | 'shopping' | 'manage';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'stock', label: 'Current Stock', icon: <Package className="w-4 h-4" /> },
  { id: 'log', label: 'Log Stock Check', icon: <ClipboardList className="w-4 h-4" /> },
  { id: 'shopping', label: 'Shopping List', icon: <ShoppingCart className="w-4 h-4" /> },
  { id: 'manage', label: 'Manage Items', icon: <Settings2 className="w-4 h-4" /> },
];

/* ── Stock color logic ──────────────────────────────────── */

function stockStatus(item: InventoryItem): 'none' | 'critical' | 'low' | 'ok' {
  if (!item.latest) return 'none';
  const qty = item.latest.quantity;
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
    st === 'critical'
      ? 'bg-red-100 text-red-700 border border-red-300'
      : st === 'low'
      ? 'bg-amber-100 text-amber-700 border border-amber-300'
      : 'bg-green-100 text-green-700 border border-green-300';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {item.latest.quantity} {item.unit}
    </span>
  );
}

/* ── Group items by category ────────────────────────────── */

function groupBy(items: InventoryItem[]) {
  const map: Record<string, InventoryItem[]> = {};
  for (const item of items) {
    if (!map[item.category]) map[item.category] = [];
    map[item.category].push(item);
  }
  return map;
}

/* ═══════════════════════════════════════════════════════════
   CURRENT STOCK TAB
══════════════════════════════════════════════════════════ */

function StockTab({ items }: { items: InventoryItem[] }) {
  const groups = groupBy(items);
  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([cat, catItems]) => (
        <div key={cat}>
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{cat}</h3>
          <div className="rounded-lg border divide-y overflow-hidden">
            {catItems.map((item) => {
              const st = stockStatus(item);
              const rowCls =
                st === 'critical'
                  ? 'bg-red-50'
                  : st === 'low'
                  ? 'bg-amber-50'
                  : '';
              return (
                <div key={item.id} className={`flex items-center justify-between px-4 py-2.5 ${rowCls}`}>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{item.name}</span>
                    {item.min_level > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">min: {item.min_level} {item.unit}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <StockBadge item={item} />
                    {item.latest && (
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {new Date(item.latest.log_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   LOG STOCK CHECK TAB
══════════════════════════════════════════════════════════ */

function LogTab({ items, onSaved }: { items: InventoryItem[]; onSaved: () => void }) {
  const todayIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
  const [logDate, setLogDate] = useState(todayIST);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Pre-fill with latest known quantities when items load
  useEffect(() => {
    const pre: Record<string, string> = {};
    for (const item of items) {
      if (item.latest) pre[item.id] = String(item.latest.quantity);
    }
    setQuantities(pre);
  }, [items]);

  function setQty(id: string, val: string) {
    setQuantities((prev) => ({ ...prev, [id]: val }));
  }

  async function handleSave() {
    const entries = items
      .filter((item) => quantities[item.id] !== '' && quantities[item.id] !== undefined)
      .map((item) => ({ item_id: item.id, quantity: Number(quantities[item.id]) }));

    if (entries.length === 0) {
      toast.error('Enter at least one quantity');
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
    const { saved } = await res.json();
    toast.success(`Saved ${saved} items for ${logDate}`);
    onSaved();
  }

  const groups = groupBy(items);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium">Check Date:</label>
        <input
          type="date"
          value={logDate}
          max={todayIST}
          onChange={(e) => setLogDate(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm"
        />
        <span className="text-xs text-muted-foreground">Enter quantities you physically counted</span>
      </div>

      {Object.entries(groups).map(([cat, catItems]) => (
        <div key={cat}>
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{cat}</h3>
          <div className="rounded-lg border divide-y overflow-hidden">
            {catItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-2">
                <span className="flex-1 text-sm">{item.name}</span>
                <span className="text-xs text-muted-foreground w-12 text-right">{item.unit}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={quantities[item.id] ?? ''}
                  onChange={(e) => setQty(item.id, e.target.value)}
                  placeholder="qty"
                  className="w-24 border rounded px-2 py-1 text-sm text-right"
                />
                {item.min_level > 0 && (
                  <span className="text-xs text-muted-foreground w-20 hidden sm:block">
                    min {item.min_level}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="sticky bottom-4 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Stock Check'}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SHOPPING LIST TAB
══════════════════════════════════════════════════════════ */

function ShoppingTab({ items }: { items: InventoryItem[] }) {
  const needed = items.filter((item) => {
    if (!item.latest) return item.min_level > 0; // never logged, assume needed if has min
    return item.min_level > 0 && item.latest.quantity <= item.min_level;
  });

  if (needed.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">All stocked up!</p>
        <p className="text-sm">No items are at or below minimum level.</p>
      </div>
    );
  }

  const groups = groupBy(needed);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {needed.length} item{needed.length !== 1 ? 's' : ''} need restocking
      </p>
      {Object.entries(groups).map(([cat, catItems]) => (
        <div key={cat}>
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{cat}</h3>
          <div className="rounded-lg border divide-y overflow-hidden">
            {catItems.map((item) => {
              const qty = item.latest?.quantity ?? null;
              const diff = qty !== null ? item.min_level - qty : null;
              return (
                <div key={item.id} className="flex items-center justify-between px-4 py-2.5 bg-red-50">
                  <span className="text-sm font-medium">{item.name}</span>
                  <div className="text-right text-sm">
                    {qty !== null ? (
                      <>
                        <span className="text-red-600 font-medium">{qty} {item.unit}</span>
                        <span className="text-muted-foreground ml-1">/ min {item.min_level}</span>
                        {diff !== null && diff > 0 && (
                          <span className="ml-2 text-xs text-red-700 font-semibold">need +{diff}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-amber-600 italic text-xs">never logged</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MANAGE ITEMS TAB
══════════════════════════════════════════════════════════ */

const CATEGORIES = [
  'Dressings', 'Masale', 'Sachets', 'Beverage',
  'Crispies', 'Packaging', 'Freezer', 'Extras',
];

interface EditingItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  min_level: string;
}

function ManageTab({ items, onRefresh }: { items: InventoryItem[]; onRefresh: () => void }) {
  const [editing, setEditing] = useState<EditingItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', category: CATEGORIES[0], unit: '', min_level: '0' });
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    const res = await fetch(`/api/inventory/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editing.name,
        category: editing.category,
        unit: editing.unit,
        min_level: Number(editing.min_level),
      }),
    });
    setSaving(false);
    if (!res.ok) { toast.error('Save failed'); return; }
    toast.success('Item updated');
    setEditing(null);
    onRefresh();
  }

  async function toggleActive(item: InventoryItem) {
    const res = await fetch(`/api/inventory/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active }),
    });
    if (!res.ok) { toast.error('Update failed'); return; }
    onRefresh();
  }

  async function addItem() {
    if (!newItem.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newItem, min_level: Number(newItem.min_level) }),
    });
    setSaving(false);
    if (!res.ok) { toast.error('Add failed'); return; }
    toast.success('Item added');
    setAdding(false);
    setNewItem({ name: '', category: CATEGORIES[0], unit: '', min_level: '0' });
    onRefresh();
  }

  const groups = groupBy(items);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive items
        </label>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {adding && (
        <div className="rounded-lg border p-4 bg-muted/30 space-y-3">
          <h4 className="font-medium text-sm">New Item</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                value={newItem.name}
                onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                placeholder="Item name"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <select
                value={newItem.category}
                onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value }))}
                className="w-full border rounded px-2 py-1.5 text-sm mt-1"
              >
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Unit</label>
              <input
                value={newItem.unit}
                onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))}
                className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                placeholder="kg / pkt"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Min Level</label>
              <input
                type="number"
                min={0}
                step="any"
                value={newItem.min_level}
                onChange={(e) => setNewItem((p) => ({ ...p, min_level: e.target.value }))}
                className="w-full border rounded px-2 py-1.5 text-sm mt-1"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addItem}
              disabled={saving}
              className="bg-primary text-primary-foreground px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => setAdding(false)} className="px-4 py-1.5 rounded text-sm border">
              Cancel
            </button>
          </div>
        </div>
      )}

      {Object.entries(groups).map(([cat, catItems]) => {
        const visible = showInactive ? catItems : catItems.filter((i) => i.active);
        if (visible.length === 0) return null;
        return (
          <div key={cat}>
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">{cat}</h3>
            <div className="rounded-lg border divide-y overflow-hidden">
              {visible.map((item) => (
                <div key={item.id} className={`px-4 py-2.5 ${!item.active ? 'opacity-50' : ''}`}>
                  {editing?.id === item.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={editing.name}
                        onChange={(e) => setEditing((p) => p && ({ ...p, name: e.target.value }))}
                        className="flex-1 min-w-32 border rounded px-2 py-1 text-sm"
                      />
                      <select
                        value={editing.category}
                        onChange={(e) => setEditing((p) => p && ({ ...p, category: e.target.value }))}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                      <input
                        value={editing.unit}
                        onChange={(e) => setEditing((p) => p && ({ ...p, unit: e.target.value }))}
                        className="w-16 border rounded px-2 py-1 text-sm"
                        placeholder="unit"
                      />
                      <input
                        type="number"
                        value={editing.min_level}
                        onChange={(e) => setEditing((p) => p && ({ ...p, min_level: e.target.value }))}
                        className="w-20 border rounded px-2 py-1 text-sm"
                        placeholder="min"
                      />
                      <button onClick={saveEdit} disabled={saving} className="p-1 text-green-600">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditing(null)} className="p-1 text-muted-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{item.unit}</span>
                        {item.min_level > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">min: {item.min_level}</span>
                        )}
                        {!item.active && <span className="ml-2 text-xs text-red-500">(inactive)</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            setEditing({
                              id: item.id,
                              name: item.name,
                              category: item.category,
                              unit: item.unit,
                              min_level: String(item.min_level),
                            })
                          }
                          className="p-1.5 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => toggleActive(item)}
                          className="p-1.5 text-muted-foreground hover:text-foreground"
                          title={item.active ? 'Deactivate' : 'Activate'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>('stock');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/inventory');
    if (res.ok) {
      const { items: data } = await res.json();
      setItems(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Summary counts for header
  const critical = items.filter((i) => stockStatus(i) === 'critical').length;
  const low = items.filter((i) => stockStatus(i) === 'low').length;
  const neverLogged = items.filter((i) => !i.latest).length;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {items.length} items
            {critical > 0 && <span className="ml-2 text-red-600 font-medium">{critical} critical</span>}
            {low > 0 && <span className="ml-2 text-amber-600 font-medium">{low} low</span>}
            {neverLogged > 0 && <span className="ml-2 text-gray-500">{neverLogged} not logged</span>}
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> Below min
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> Near min (≤1.5×)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-400 inline-block" /> Good
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Loading inventory…</div>
      ) : (
        <>
          {tab === 'stock' && <StockTab items={items} />}
          {tab === 'log' && <LogTab items={items} onSaved={load} />}
          {tab === 'shopping' && <ShoppingTab items={items} />}
          {tab === 'manage' && <ManageTab items={items} onRefresh={load} />}
        </>
      )}
    </div>
  );
}
