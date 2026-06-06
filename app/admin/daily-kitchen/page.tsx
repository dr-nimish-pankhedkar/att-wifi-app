'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import AdminNav from '@/components/admin/AdminNav';
import { ChevronLeft, ChevronRight, Sun, Moon, Settings2, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface KitchenItem { id: string; name: string; unit: string; sort_order: number; }
interface LogEntry    { item_id: string; shift: 'in' | 'closing'; quantity: number; }

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
   MANAGE TAB — item CRUD
══════════════════════════════════════════════════ */

function ManageTab({ items, onRefresh }: { items: KitchenItem[]; onRefresh: () => void }) {
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState({ name: '', unit: '' });
  const [addingNew, setAddingNew]   = useState(false);
  const [newItem, setNewItem]       = useState({ name: '', unit: '' });
  const [saving, setSaving]         = useState(false);

  async function saveEdit(id: string) {
    if (!editForm.name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    const res = await fetch(`/api/daily-kitchen/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editForm.name.trim(), unit: editForm.unit.trim() }),
    });
    setSaving(false);
    if (!res.ok) { toast.error('Save failed'); return; }
    setEditingId(null);
    onRefresh();
  }

  async function deleteItem(id: string, name: string) {
    if (!confirm(`Remove "${name}" from daily kitchen list?`)) return;
    const res = await fetch(`/api/daily-kitchen/items/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Delete failed'); return; }
    toast.success('Item removed');
    onRefresh();
  }

  async function addItem() {
    if (!newItem.name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    const res = await fetch('/api/daily-kitchen/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newItem.name.trim(), unit: newItem.unit.trim() }),
    });
    setSaving(false);
    if (!res.ok) { toast.error('Add failed'); return; }
    toast.success('Item added');
    setAddingNew(false);
    setNewItem({ name: '', unit: '' });
    onRefresh();
  }

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground flex justify-between">
        <span>Item ({items.length})</span>
        <span>Unit</span>
      </div>
      <div className="divide-y divide-border">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2 px-4 py-2">
            {editingId === item.id ? (
              <>
                <input
                  value={editForm.name}
                  onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveEdit(item.id)}
                  className="flex-1 border rounded px-2 py-1 text-sm"
                  placeholder="Item name"
                  autoFocus
                />
                <input
                  value={editForm.unit}
                  onChange={e => setEditForm(p => ({ ...p, unit: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveEdit(item.id)}
                  className="w-20 border rounded px-2 py-1 text-sm text-center"
                  placeholder="unit"
                />
                <button onClick={() => saveEdit(item.id)} disabled={saving}
                  className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditingId(null)}
                  className="p-1.5 text-muted-foreground hover:bg-muted rounded">
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground w-20 text-center">{item.unit || '—'}</span>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => { setEditingId(item.id); setEditForm({ name: item.name, unit: item.unit }); }}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteItem(item.id, item.name)}
                    className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {/* Add new item row */}
        <div className="px-4 py-2.5 bg-muted/20">
          {addingNew ? (
            <div className="flex items-center gap-2">
              <input
                value={newItem.name}
                onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                placeholder="Item name"
                className="flex-1 border rounded px-2 py-1.5 text-sm"
                autoFocus
              />
              <input
                value={newItem.unit}
                onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                placeholder="unit"
                className="w-20 border rounded px-2 py-1.5 text-sm text-center"
              />
              <button onClick={addItem} disabled={saving}
                className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50">
                {saving ? '…' : 'Add'}
              </button>
              <button onClick={() => { setAddingNew(false); setNewItem({ name: '', unit: '' }); }}
                className="p-1.5 text-muted-foreground hover:bg-muted rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => setAddingNew(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <Plus className="w-4 h-4" /> Add item
            </button>
          )}
        </div>
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

  const [tab, setTab]         = useState<Tab>('view');
  const [date, setDate]       = useState(todayIST());
  const [items, setItems]     = useState<KitchenItem[]>([]);
  const [logs, setLogs]       = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/admin/login');
    });
  }, [router, supabase.auth]);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const [iRes, lRes] = await Promise.all([
      fetch('/api/daily-kitchen/items'),
      fetch(`/api/daily-kitchen/log?date=${d}`),
    ]);
    const { items: iData } = await iRes.json();
    const { logs: lData }  = await lRes.json();
    setItems(iData ?? []);
    setLogs(lData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const logMap: Record<string, { in?: number; closing?: number }> = {};
  for (const l of logs) {
    if (!logMap[l.item_id]) logMap[l.item_id] = {};
    logMap[l.item_id][l.shift] = l.quantity;
  }

  const inCount      = logs.filter(l => l.shift === 'in').length;
  const closingCount = logs.filter(l => l.shift === 'closing').length;

  const TABS = [
    { id: 'view'   as Tab, label: 'Daily Log',    icon: <Sun className="w-4 h-4" /> },
    { id: 'manage' as Tab, label: 'Manage Items',  icon: <Settings2 className="w-4 h-4" /> },
  ];

  return (
    <div className="flex min-h-screen">
      <AdminNav />
      <main className="flex-1 p-4 md:p-6 overflow-auto">

        {/* Header */}
        <div className="mb-4">
          <h2 className="text-2xl font-bold">Daily Kitchen</h2>
          <p className="text-muted-foreground text-sm">Morning IN &amp; Closing counts</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b gap-0.5 mb-5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── VIEW TAB ── */}
        {tab === 'view' && (
          <>
            {/* Date nav */}
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setDate(d => shiftDate(d, -1))}
                className="p-2 rounded-lg border hover:bg-muted transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input type="date" value={date} max={todayIST()}
                onChange={e => setDate(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm font-medium bg-background"
              />
              <button onClick={() => setDate(d => shiftDate(d, 1))} disabled={date >= todayIST()}
                className="p-2 rounded-lg border hover:bg-muted transition-colors disabled:opacity-40">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setDate(todayIST())}
                className="text-xs px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors font-medium">
                Today
              </button>
              <span className="text-sm text-muted-foreground ml-1">{fmt(date)}</span>
            </div>

            {/* Summary chips */}
            <div className="flex gap-3 mb-4">
              <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border',
                inCount > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400'
                  : 'bg-muted text-muted-foreground border-transparent')}>
                <Sun className="w-3.5 h-3.5" /> Morning IN · {inCount} items
              </div>
              <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border',
                closingCount > 0
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-400'
                  : 'bg-muted text-muted-foreground border-transparent')}>
                <Moon className="w-3.5 h-3.5" /> Closing · {closingCount} items
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center pt-20">
                <div className="h-8 w-8 border-2 border-muted border-t-foreground rounded-full animate-spin" />
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                      <th className="text-left px-4 py-2.5 font-medium">Item</th>
                      <th className="text-center px-3 py-2.5 font-medium w-16">Unit</th>
                      <th className="text-center px-4 py-2.5 font-medium w-24">
                        <span className="flex items-center justify-center gap-1"><Sun className="w-3.5 h-3.5 text-amber-500" /> IN</span>
                      </th>
                      <th className="text-center px-4 py-2.5 font-medium w-24">
                        <span className="flex items-center justify-center gap-1"><Moon className="w-3.5 h-3.5 text-indigo-500" /> Closing</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((item, idx) => {
                      const row = logMap[item.id] ?? {};
                      return (
                        <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">{idx + 1}</td>
                          <td className="px-4 py-2.5 font-medium">{item.name}</td>
                          <td className="px-3 py-2.5 text-center text-muted-foreground text-xs">{item.unit}</td>
                          <td className="px-4 py-2.5 text-center">
                            {row.in !== undefined
                              ? <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 font-semibold text-sm min-w-[3rem]">{row.in}</span>
                              : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {row.closing !== undefined
                              ? <span className="inline-block px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300 font-semibold text-sm min-w-[3rem]">{row.closing}</span>
                              : <span className="text-muted-foreground/40">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
            <ManageTab items={items} onRefresh={() => load(date)} />
          )
        )}
      </main>
    </div>
  );
}
