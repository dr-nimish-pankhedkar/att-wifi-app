'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AdminNav from '@/components/admin/AdminNav';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Check, X, GripVertical, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface KitchenItem { id: string; name: string; unit: string; category: string; sort_order: number; }
interface LogEntry    { item_id: string; shift: 'in' | 'closing'; quantity: number; }
interface EntryRecord { item_id: string; shift: 'in' | 'closing'; quantity: number; created_at: string; logged_by_name: string | null; }

const DEFAULT_CATEGORIES = ['Vegetables', 'Grocery', 'Miscellaneous'];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  });
}

type Tab = 'view' | 'manage';

function todayIST() {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
}
function shiftDate(date: string, days: number) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function fmt(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ══════════════════════════════════════════════════
   MANAGE TAB — bucket cards + drag between buckets
══════════════════════════════════════════════════ */

const DK_COLORS = [
  { border: 'border-teal-500',    bg: 'bg-teal-50',    header: 'bg-teal-500',    text: 'text-teal-700'    },
  { border: 'border-violet-500',  bg: 'bg-violet-50',  header: 'bg-violet-500',  text: 'text-violet-700'  },
  { border: 'border-orange-500',  bg: 'bg-orange-50',  header: 'bg-orange-500',  text: 'text-orange-700'  },
  { border: 'border-blue-500',    bg: 'bg-blue-50',    header: 'bg-blue-500',    text: 'text-blue-700'    },
  { border: 'border-rose-500',    bg: 'bg-rose-50',    header: 'bg-rose-500',    text: 'text-rose-700'    },
  { border: 'border-emerald-500', bg: 'bg-emerald-50', header: 'bg-emerald-500', text: 'text-emerald-700' },
  { border: 'border-amber-500',   bg: 'bg-amber-50',   header: 'bg-amber-500',   text: 'text-amber-700'   },
  { border: 'border-indigo-500',  bg: 'bg-indigo-50',  header: 'bg-indigo-500',  text: 'text-indigo-700'  },
];

function DKBucketCard({ category, items, colorIdx, dragItemId, onDragStart, onDrop, onRenameCategory, onRefresh }: {
  category: string;
  items: KitchenItem[];
  colorIdx: number;
  dragItemId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (dragId: string, targetId: string | null, targetCategory: string) => void;
  onRenameCategory: (oldCat: string, newCat: string) => void;
  onRefresh: () => void;
}) {
  const color = DK_COLORS[colorIdx % DK_COLORS.length];
  const [isOver, setIsOver]         = useState(false);
  const [overItemId, setOverItemId] = useState<string | null>(null);
  const [renaming, setRenaming]     = useState(false);
  const [catDraft, setCatDraft]     = useState(category);
  const [addingItem, setAddingItem] = useState(false);
  const [newItem, setNewItem]       = useState({ name: '', unit: '' });
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState({ name: '', unit: '' });
  const [saving, setSaving]         = useState(false);

  async function saveRename() {
    const newCat = catDraft.trim();
    if (!newCat || newCat === category) { setRenaming(false); return; }
    await Promise.all(items.map(item =>
      fetch(`/api/daily-kitchen/items/${item.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCat }),
      })
    ));
    onRenameCategory(category, newCat);
    setRenaming(false);
    onRefresh();
  }

  async function saveEdit(id: string) {
    if (!editForm.name.trim()) return;
    setSaving(true);
    await fetch(`/api/daily-kitchen/items/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editForm.name.trim(), unit: editForm.unit.trim() }),
    });
    setSaving(false);
    setEditingId(null);
    onRefresh();
  }

  async function deleteItem(id: string, name: string) {
    if (!confirm(`Remove "${name}"?`)) return;
    await fetch(`/api/daily-kitchen/items/${id}`, { method: 'DELETE' });
    toast.success('Item removed');
    onRefresh();
  }

  async function addItem() {
    if (!newItem.name.trim()) return;
    setSaving(true);
    await fetch('/api/daily-kitchen/items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newItem.name.trim(), unit: newItem.unit.trim(), category }),
    });
    setSaving(false);
    setAddingItem(false);
    setNewItem({ name: '', unit: '' });
    onRefresh();
  }

  return (
    <div
      className={cn(`rounded-xl border-2 overflow-hidden shadow-sm transition-all`, color.border, isOver && 'ring-2 ring-primary ring-offset-1')}
      onDragOver={e => { e.preventDefault(); setIsOver(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsOver(false); }}
      onDrop={e => { e.preventDefault(); setIsOver(false); if (dragItemId) onDrop(dragItemId, null, category); }}
    >
      {/* Header */}
      <div className={`${color.header} text-white px-4 py-2.5 flex items-center justify-between`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {renaming ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                value={catDraft}
                onChange={e => setCatDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveRename()}
                className="flex-1 bg-white/20 text-white placeholder-white/60 rounded px-2 py-0.5 text-sm font-semibold outline-none border border-white/40"
                autoFocus
              />
              <button onClick={saveRename} className="p-1 hover:bg-white/20 rounded"><Check className="w-4 h-4" /></button>
              <button onClick={() => { setRenaming(false); setCatDraft(category); }} className="p-1 hover:bg-white/20 rounded"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <>
              <span className="font-bold text-sm truncate">{category}</span>
              <span className="text-white/60 text-xs shrink-0">{items.length} items</span>
            </>
          )}
        </div>
        {!renaming && (
          <button onClick={() => setRenaming(true)} className="p-1 hover:bg-white/20 rounded ml-2 shrink-0" title="Rename bucket">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Item rows */}
      <div className="divide-y">
        {items.map(item => (
          <div
            key={item.id}
            draggable={editingId !== item.id}
            onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; onDragStart(item.id); }}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOverItemId(item.id); setIsOver(false); }}
            onDragLeave={() => setOverItemId(null)}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); setOverItemId(null); setIsOver(false); if (dragItemId) onDrop(dragItemId, item.id, category); }}
            onDragEnd={() => setOverItemId(null)}
            className={cn(
              'px-3 py-2 transition-colors',
              dragItemId === item.id && 'opacity-40',
              overItemId === item.id && dragItemId !== item.id && 'bg-primary/5 border-t-2 border-primary',
            )}
          >
            {editingId === item.id ? (
              <div className="flex items-center gap-2">
                <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveEdit(item.id)}
                  className="flex-1 border rounded px-2 py-1 text-sm" autoFocus />
                <input value={editForm.unit} onChange={e => setEditForm(p => ({ ...p, unit: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveEdit(item.id)}
                  className="w-14 border rounded px-2 py-1 text-sm" placeholder="unit" />
                <button onClick={() => saveEdit(item.id)} disabled={saving} className="p-1 text-green-600"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-muted-foreground/30 cursor-grab active:cursor-grabbing shrink-0" />
                <span className="flex-1 text-sm font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground">{item.unit || '—'}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => { setEditingId(item.id); setEditForm({ name: item.name, unit: item.unit }); }}
                    className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteItem(item.id, item.name)}
                    className="p-1.5 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add item footer */}
      <div className={`px-3 py-2 ${color.bg}`}>
        {addingItem ? (
          <div className="flex items-center gap-2">
            <input value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="Item name" className="flex-1 border rounded px-2 py-1 text-sm" autoFocus />
            <input value={newItem.unit} onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="unit" className="w-14 border rounded px-2 py-1 text-sm" />
            <button onClick={addItem} disabled={saving}
              className={`px-3 py-1 rounded text-xs font-medium ${color.header} text-white disabled:opacity-50`}>
              {saving ? '…' : 'Add'}
            </button>
            <button onClick={() => setAddingItem(false)} className="p-1 text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => setAddingItem(true)}
            className={`flex items-center gap-1.5 text-xs font-medium ${color.text} hover:underline`}>
            <Plus className="w-3.5 h-3.5" /> Add item
          </button>
        )}
      </div>
    </div>
  );
}

function ManageTab({ items, onRefresh }: { items: KitchenItem[]; onRefresh: () => void }) {
  const [localItems, setLocalItems]       = useState<KitchenItem[]>(items);
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [dragItemId, setDragItemId]       = useState<string | null>(null);
  const [addingBucket, setAddingBucket]   = useState(false);
  const [newBucketName, setNewBucketName] = useState('');

  useEffect(() => { setLocalItems(items); }, [items]);

  const itemCategories = Array.from(new Set(localItems.map(i => i.category || 'Miscellaneous')));
  const allCategories  = Array.from(new Set([...itemCategories, ...extraCategories]));

  function handleDrop(dragId: string, targetId: string | null, targetCategory: string) {
    const dragItem = localItems.find(i => i.id === dragId);
    if (!dragItem) return;

    let updated = localItems.filter(i => i.id !== dragId);
    const moved = { ...dragItem, category: targetCategory };

    if (targetId) {
      const idx = updated.findIndex(i => i.id === targetId);
      updated.splice(idx, 0, moved);
    } else {
      updated.push(moved);
    }

    setLocalItems(updated);
    setDragItemId(null);

    const promises: Promise<unknown>[] = [];
    if (dragItem.category !== targetCategory) {
      promises.push(fetch(`/api/daily-kitchen/items/${dragId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: targetCategory }),
      }));
    }
    const affected = new Set([dragItem.category || 'Miscellaneous', targetCategory]);
    for (const cat of affected) {
      updated.filter(i => (i.category || 'Miscellaneous') === cat).forEach((item, i) => {
        promises.push(fetch(`/api/daily-kitchen/items/${item.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: (i + 1) * 10 }),
        }));
      });
    }
    Promise.all(promises).then(() => onRefresh());
  }

  function handleRenameCategory(oldCat: string, newCat: string) {
    setLocalItems(prev => prev.map(i => (i.category || 'Miscellaneous') === oldCat ? { ...i, category: newCat } : i));
    setExtraCategories(prev => prev.map(c => c === oldCat ? newCat : c));
  }

  function addBucket() {
    const name = newBucketName.trim();
    if (!name || allCategories.includes(name)) { toast.error(allCategories.includes(name) ? 'Already exists' : 'Name required'); return; }
    setExtraCategories(prev => [...prev, name]);
    setAddingBucket(false);
    setNewBucketName('');
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {allCategories.map((cat, idx) => (
          <DKBucketCard
            key={cat}
            category={cat}
            items={localItems.filter(i => (i.category || 'Miscellaneous') === cat)}
            colorIdx={idx}
            dragItemId={dragItemId}
            onDragStart={setDragItemId}
            onDrop={handleDrop}
            onRenameCategory={handleRenameCategory}
            onRefresh={onRefresh}
          />
        ))}
      </div>

      {/* Add new bucket */}
      <div className="pt-1">
        {addingBucket ? (
          <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
            <input value={newBucketName} onChange={e => setNewBucketName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBucket()}
              placeholder="Bucket name (e.g. Dairy)"
              className="flex-1 border rounded px-3 py-1.5 text-sm" autoFocus />
            <button onClick={addBucket} className="bg-primary text-primary-foreground px-4 py-1.5 rounded text-sm font-medium">Add</button>
            <button onClick={() => setAddingBucket(false)} className="p-1.5 text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <button onClick={() => setAddingBucket(true)}
            className="flex items-center gap-2 border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary rounded-xl px-4 py-3 w-full justify-center text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Add New Bucket
          </button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════ */

export default function DailyKitchenAdminPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [tab, setTab]              = useState<Tab>('view');
  const [date, setDate]            = useState(todayIST());
  const [items, setItems]          = useState<KitchenItem[]>([]);
  const [logs, setLogs]            = useState<LogEntry[]>([]);
  const [prevLogs, setPrevLogs]    = useState<LogEntry[]>([]);
  const [entries, setEntries]      = useState<EntryRecord[]>([]);
  const [loading, setLoading]      = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/admin/login');
    });
  }, [router, supabase.auth]);

  const load = useCallback(async (d: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const prev = shiftDate(d, -1);
    const [iRes, lRes, pRes] = await Promise.all([
      fetch('/api/daily-kitchen/items'),
      fetch(`/api/daily-kitchen/log?date=${d}`),
      fetch(`/api/daily-kitchen/log?date=${prev}`),
    ]);
    const { items: iData }           = await iRes.json();
    const { logs: lData, entries: eData } = await lRes.json();
    const { logs: pData }            = await pRes.json();
    setItems(iData ?? []);
    setLogs(lData ?? []);
    setEntries(eData ?? []);
    setPrevLogs(pData ?? []);
    if (!opts?.silent) setExpandedItems(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { load(date, { silent: true }); }, 350);
  }, [load, date]);

  const logMap: Record<string, { in?: number; closing?: number }> = {};
  for (const l of logs) {
    if (!logMap[l.item_id]) logMap[l.item_id] = {};
    logMap[l.item_id][l.shift] = l.quantity;
  }
  const prevClosing: Record<string, number> = {};
  for (const l of prevLogs) {
    if (l.shift === 'closing') prevClosing[l.item_id] = l.quantity;
  }

  const getConsumption = (itemId: string) => {
    const todayIn      = logMap[itemId]?.in;
    const todayClose   = logMap[itemId]?.closing;
    const yestClose    = prevClosing[itemId];
    if (todayClose === undefined) return undefined;
    return (yestClose ?? 0) + (todayIn ?? 0) - todayClose;
  };

  const entriesByItem: Record<string, EntryRecord[]> = {};
  for (const e of entries) {
    if (!entriesByItem[e.item_id]) entriesByItem[e.item_id] = [];
    entriesByItem[e.item_id].push(e);
  }

  function toggleHistory(itemId: string) {
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  }

  const inCount      = logs.filter(l => l.shift === 'in').length;
  const closingCount = logs.filter(l => l.shift === 'closing').length;

  const itemCategories = Array.from(new Set(items.map(i => i.category || 'Miscellaneous')));
  const itemsByCategory = itemCategories.map(cat => ({
    category: cat,
    items: items.filter(i => (i.category || 'Miscellaneous') === cat),
  }));

  const TABS = [
    { id: 'view'   as Tab, label: 'Daily Log'   },
    { id: 'manage' as Tab, label: 'Manage Items' },
  ];

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <AdminNav />
      <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-auto">

        {/* Header */}
        <div className="mb-4">
          <h2 className="text-xl sm:text-2xl font-bold">Daily Kitchen</h2>
          <p className="text-muted-foreground text-sm">Morning IN · Closing · Consumption</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b gap-0.5 mb-5 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── VIEW TAB ── */}
        {tab === 'view' && (
          <>
            {/* Date nav */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button onClick={() => setDate(d => shiftDate(d, -1))}
                className="p-2 rounded-lg border hover:bg-muted transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input type="date" value={date} max={todayIST()}
                onChange={e => setDate(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm font-medium bg-background min-w-0"
              />
              <button onClick={() => setDate(d => shiftDate(d, 1))} disabled={date >= todayIST()}
                className="p-2 rounded-lg border hover:bg-muted transition-colors disabled:opacity-40">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setDate(todayIST())}
                className="text-xs px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors font-medium">
                Today
              </button>
              <span className="text-sm text-muted-foreground basis-full sm:basis-auto sm:ml-1">{fmt(date)}</span>
            </div>

            {/* Summary chips */}
            <div className="flex flex-wrap gap-2 sm:gap-3 mb-4">
              <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium border',
                inCount > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400'
                  : 'bg-muted text-muted-foreground border-transparent')}>
                🌅 Morning IN · {inCount} items
              </div>
              <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium border',
                closingCount > 0
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-400'
                  : 'bg-muted text-muted-foreground border-transparent')}>
                🌙 Closing · {closingCount} items
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center pt-20">
                <div className="h-8 w-8 border-2 border-muted border-t-foreground rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {itemsByCategory.map(({ category, items: catItems }) => (
                    <div key={category}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">{category}</p>
                      <div className="rounded-xl border overflow-hidden overflow-x-auto">
                        <table className="w-full text-sm min-w-[480px]">
                          <thead>
                            <tr className="bg-muted/50 text-muted-foreground">
                              <th className="text-left px-4 py-2 font-medium">Item</th>
                              <th className="text-center px-3 py-2 font-medium w-12">Unit</th>
                              <th className="text-center px-4 py-2 font-medium w-24">🌅 IN</th>
                              <th className="text-center px-4 py-2 font-medium w-24">🌙 Closing</th>
                              <th className="text-center px-4 py-2 font-medium w-28">📊 Consumed</th>
                              <th className="text-center px-3 py-2 font-medium w-16">Log</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {catItems.map(item => {
                              const row  = logMap[item.id] ?? {};
                              const cons = getConsumption(item.id);
                              const itemEntries = entriesByItem[item.id] ?? [];
                              const isExpanded = expandedItems.has(item.id);
                              return (
                                <React.Fragment key={item.id}>
                                  <tr className="hover:bg-muted/30 transition-colors">
                                    <td className="px-4 py-2.5 font-medium">{item.name}</td>
                                    <td className="px-3 py-2.5 text-center text-muted-foreground text-xs">{item.unit}</td>
                                    <td className="px-4 py-2.5 text-center">
                                      {row.in !== undefined
                                        ? <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 font-semibold text-sm">{row.in}</span>
                                        : <span className="text-muted-foreground/40">—</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      {row.closing !== undefined
                                        ? <span className="inline-block px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300 font-semibold text-sm">{row.closing}</span>
                                        : <span className="text-muted-foreground/40">—</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      {cons === undefined
                                        ? <span className="text-muted-foreground/40">—</span>
                                        : cons <= 0
                                          ? <span className="text-muted-foreground text-sm">{cons}</span>
                                          : <span className="inline-block px-2 py-0.5 rounded-md bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300 font-semibold text-sm">{cons}</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                      {itemEntries.length > 0 ? (
                                        <button
                                          onClick={() => toggleHistory(item.id)}
                                          className={cn(
                                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-colors',
                                            isExpanded
                                              ? 'bg-primary/10 text-primary'
                                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                          )}>
                                          <Clock className="w-3 h-3" />
                                          {itemEntries.length}
                                        </button>
                                      ) : (
                                        <span className="text-muted-foreground/30 text-xs">—</span>
                                      )}
                                    </td>
                                  </tr>
                                  {isExpanded && (
                                    <tr key={`${item.id}-history`} className="bg-muted/20">
                                      <td colSpan={6} className="px-4 py-2">
                                        <div className="flex flex-col gap-1.5">
                                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Activity Log</p>
                                          {itemEntries.map((entry, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-xs">
                                              <span className={cn(
                                                'shrink-0 px-1.5 py-0.5 rounded font-medium',
                                                entry.shift === 'in'
                                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                                                  : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                                              )}>
                                                {entry.shift === 'in' ? '🌅 IN' : '🌙 Closing'}
                                              </span>
                                              <span className="font-semibold tabular-nums">{entry.quantity} {item.unit}</span>
                                              <span className="text-muted-foreground">·</span>
                                              <span className="text-muted-foreground">{fmtTime(entry.created_at)}</span>
                                              {entry.logged_by_name && (
                                                <>
                                                  <span className="text-muted-foreground">·</span>
                                                  <span className="text-muted-foreground">{entry.logged_by_name}</span>
                                                </>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── MANAGE TAB ── */}
        {tab === 'manage' && (
          loading ? (
            <div className="flex justify-center pt-20">
              <div className="h-8 w-8 border-2 border-muted border-t-foreground rounded-full animate-spin" />
            </div>
          ) : (
            <ManageTab items={items} onRefresh={refresh} />
          )
        )}
      </main>
    </div>
  );
}
