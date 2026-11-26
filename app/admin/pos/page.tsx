'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2, X } from 'lucide-react';
import AdminNav from '@/components/admin/AdminNav';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';
import { authFetch } from '@/lib/supabase/authFetch';
import { cn } from '@/lib/utils';
import { billText, whatsappLink } from '@/lib/pos/billText';
import { normaliseLoyalty, type LoyaltyConfig } from '@/lib/pos/loyalty';
import { describeRule, type MilestoneRule } from '@/lib/pos/milestones';
import { AGGREGATORS_IN_POS, fromPrice, rupee, SOURCE_LABEL, type BillSettings, type AddonGroup, type Area, type Category, type Menu, type MenuItem, type OrderRow, type PosTable } from '@/lib/pos/types';

type Tab = 'floor' | 'menu' | 'addons' | 'sales' | 'bill' | 'loyalty';

async function api<T = unknown>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await authFetch(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Request failed');
  return data as T;
}
const fail = (e: unknown) => toast.error((e as Error).message);

/** Swap sort_order of row i with its neighbour, then reload. */
async function move<T extends { id: string; sort_order: number }>(entity: string, list: T[], i: number, dir: -1 | 1, reload: () => void, url = `/api/pos/admin/${entity}`) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  const a = list[i], b = list[j];
  const sa = a.sort_order === b.sort_order ? b.sort_order + dir : b.sort_order;
  try {
    await Promise.all([api(`${url}/${a.id}`, 'PATCH', { sort_order: Math.max(0, sa) }), api(`${url}/${b.id}`, 'PATCH', { sort_order: a.sort_order })]);
    reload();
  } catch (e) { fail(e); }
}

export default function PosAdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('floor');

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/admin/login'); else setReady(true);
    });
  }, [router]);

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <AdminNav />
      <main className="flex-1 p-4 md:p-6 overflow-auto max-w-5xl">
        <h1 className="text-2xl font-bold mb-1">POS setup</h1>
        <p className="text-sm text-muted-foreground mb-4">Tables, menu and add-ons used by the captain app (/pos) and kitchen screen (/kitchen).</p>
        <div className="flex gap-2 mb-5 overflow-x-auto">
          {([['floor', 'Floor & tables'], ['menu', 'Menu'], ['addons', 'Add-ons'], ['sales', 'Bills'], ['loyalty', 'Loyalty & customers'], ['bill', 'Bill & WhatsApp']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn('px-4 py-2 rounded-lg text-sm font-medium border shrink-0', tab === k ? 'bg-primary text-primary-foreground border-primary' : 'bg-background')}>{l}</button>
          ))}
        </div>
        {ready && tab === 'floor' && <FloorTab />}
        {ready && tab === 'menu' && <MenuTab />}
        {ready && tab === 'addons' && <AddonsTab />}
        {ready && tab === 'sales' && <BillsTab />}
        {ready && tab === 'bill' && <BillMessageTab />}
        {ready && tab === 'loyalty' && <LoyaltyTab />}
      </main>
    </div>
  );
}

/* ───────────── Floor & tables ───────────── */

function FloorTab() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [tables, setTables] = useState<PosTable[]>([]);
  const load = useCallback(async () => {
    try {
      const f = await api<{ areas: Area[]; tables: PosTable[] }>('/api/pos/floor?all=1');
      setAreas(f.areas); setTables(f.tables);
    } catch (e) { fail(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addArea() {
    const name = prompt('Area name (e.g. Ground Floor, Terrace)');
    if (!name?.trim()) return;
    try { await api('/api/pos/admin/areas', 'POST', { name }); load(); } catch (e) { fail(e); }
  }
  async function addTable(area: Area) {
    const existing = tables.filter((t) => t.area_id === area.id);
    const suggestion = existing.length ? existing[existing.length - 1].name.replace(/\d+$/, (n) => String(Number(n) + 1)) : '';
    const name = prompt(`New table in ${area.name}`, suggestion);
    if (!name?.trim()) return;
    try { await api('/api/pos/admin/tables', 'POST', { name, area_id: area.id }); load(); } catch (e) { fail(e); }
  }
  async function patch(entity: string, id: string, body: object) {
    try { await api(`/api/pos/admin/${entity}/${id}`, 'PATCH', body); load(); } catch (e) { fail(e); }
  }
  async function remove(entity: string, id: string, label: string) {
    if (!confirm(`Delete ${label}?`)) return;
    try {
      const r = await api<{ deactivated?: boolean }>(`/api/pos/admin/${entity}/${id}`, 'DELETE');
      if (r.deactivated) toast.info(`${label} has past bills, so it was hidden instead of deleted`);
      load();
    } catch (e) { fail(e); }
  }

  return (
    <div className="space-y-4">
      {areas.map((a, ai) => {
        const list = tables.filter((t) => t.area_id === a.id);
        return (
          <div key={a.id} className={cn('rounded-xl border p-4', !a.active && 'opacity-60')}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-semibold flex-1">{a.name}{!a.active && ' (hidden)'}</h2>
              <IconBtn onClick={() => move('areas', areas, ai, -1, load)}><ArrowUp className="w-4 h-4" /></IconBtn>
              <IconBtn onClick={() => move('areas', areas, ai, 1, load)}><ArrowDown className="w-4 h-4" /></IconBtn>
              <IconBtn onClick={() => { const n = prompt('Rename area', a.name); if (n?.trim()) patch('areas', a.id, { name: n }); }}><Pencil className="w-4 h-4" /></IconBtn>
              <IconBtn onClick={() => patch('areas', a.id, { active: !a.active })}>{a.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</IconBtn>
              <IconBtn onClick={() => remove('areas', a.id, a.name)}><Trash2 className="w-4 h-4 text-red-600" /></IconBtn>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {list.map((t, ti) => (
                <div key={t.id} className={cn('rounded-lg border p-2 text-center', !t.active && 'opacity-50 border-dashed')}>
                  <div className="font-bold text-lg">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.seats} seats</div>
                  <div className="flex justify-center gap-1 mt-1">
                    <IconBtn onClick={() => move('tables', list, ti, -1, load)}><ArrowUp className="w-3 h-3 -rotate-90" /></IconBtn>
                    <IconBtn onClick={() => move('tables', list, ti, 1, load)}><ArrowDown className="w-3 h-3 -rotate-90" /></IconBtn>
                    <IconBtn onClick={() => {
                      const n = prompt('Table name', t.name); if (!n?.trim()) return;
                      const s = prompt('Seats', String(t.seats)); patch('tables', t.id, { name: n, seats: Number(s) || t.seats });
                    }}><Pencil className="w-3 h-3" /></IconBtn>
                    <IconBtn onClick={() => patch('tables', t.id, { active: !t.active })}>{t.active ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}</IconBtn>
                    <IconBtn onClick={() => remove('tables', t.id, `table ${t.name}`)}><Trash2 className="w-3 h-3 text-red-600" /></IconBtn>
                  </div>
                  {areas.length > 1 && (
                    <select className="mt-1 w-full text-xs border rounded" value={t.area_id ?? ''} onChange={(e) => patch('tables', t.id, { area_id: e.target.value })}>
                      {areas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  )}
                </div>
              ))}
              <button onClick={() => addTable(a)} className="rounded-lg border-2 border-dashed p-2 text-sm text-muted-foreground flex flex-col items-center justify-center min-h-[90px]">
                <Plus className="w-5 h-5" /> Add table
              </button>
            </div>
          </div>
        );
      })}
      <Button variant="outline" onClick={addArea}><Plus className="w-4 h-4 mr-1" /> Add area / floor</Button>
    </div>
  );
}

function IconBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="p-1.5 rounded hover:bg-muted">{children}</button>;
}

/* ───────────── Menu ───────────── */

function MenuTab() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [editing, setEditing] = useState<Partial<MenuItem> | null>(null);
  const [filter, setFilter] = useState('');
  const load = useCallback(async () => { try { setMenu(await api<Menu>('/api/pos/menu?all=1')); } catch (e) { fail(e); } }, []);
  useEffect(() => { load(); }, [load]);

  async function patchItem(id: string, body: object) {
    try { await api(`/api/pos/admin/menu-items/${id}`, 'PATCH', body); load(); } catch (e) { fail(e); }
  }
  async function catAction(c: Category, action: 'rename' | 'toggle' | 'delete') {
    try {
      if (action === 'rename') { const n = prompt('Category name', c.name); if (!n?.trim()) return; await api(`/api/pos/admin/categories/${c.id}`, 'PATCH', { name: n }); }
      if (action === 'toggle') await api(`/api/pos/admin/categories/${c.id}`, 'PATCH', { active: !c.active });
      if (action === 'delete') { if (!confirm(`Delete category ${c.name}?`)) return; await api(`/api/pos/admin/categories/${c.id}`, 'DELETE'); }
      load();
    } catch (e) { fail(e); }
  }
  async function addCategory() {
    const name = prompt('New category name'); if (!name?.trim()) return;
    try { await api('/api/pos/admin/categories', 'POST', { name }); load(); } catch (e) { fail(e); }
  }

  if (!menu) return <p className="text-muted-foreground">Loading…</p>;
  const term = filter.toLowerCase();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className="flex-1 min-w-[200px] rounded-lg border px-3 py-2 text-sm" placeholder="Search items" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Button onClick={() => setEditing({ category_id: menu.categories[0]?.id, variations: [], addon_group_ids: [], food_type: 'veg', active: true, in_stock: true })}><Plus className="w-4 h-4 mr-1" /> Item</Button>
        <Button variant="outline" onClick={addCategory}><Plus className="w-4 h-4 mr-1" /> Category</Button>
      </div>

      {AGGREGATORS_IN_POS && <OnlinePriceTool onDone={load} />}

      {menu.categories.map((c, ci) => {
        const items = menu.items.filter((i) => i.category_id === c.id && (!term || i.name.toLowerCase().includes(term)));
        if (term && !items.length) return null;
        return (
          <div key={c.id} className={cn('rounded-xl border', !c.active && 'opacity-60')}>
            <div className="flex items-center gap-1 px-4 py-2 bg-muted/40 rounded-t-xl">
              <h2 className="font-semibold flex-1">{c.name}{!c.active && ' (hidden)'} <span className="text-muted-foreground font-normal text-sm">· {items.length}</span></h2>
              <IconBtn onClick={() => move('categories', menu.categories, ci, -1, load)}><ArrowUp className="w-4 h-4" /></IconBtn>
              <IconBtn onClick={() => move('categories', menu.categories, ci, 1, load)}><ArrowDown className="w-4 h-4" /></IconBtn>
              <IconBtn onClick={() => catAction(c, 'rename')}><Pencil className="w-4 h-4" /></IconBtn>
              <IconBtn onClick={() => catAction(c, 'toggle')}>{c.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</IconBtn>
              <IconBtn onClick={() => catAction(c, 'delete')}><Trash2 className="w-4 h-4 text-red-600" /></IconBtn>
            </div>
            <div className="divide-y">
              {items.map((i, ii) => (
                <div key={i.id} className={cn('flex items-center gap-2 px-4 py-2', !i.active && 'opacity-50')}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{i.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {i.variations.length ? i.variations.map((v) => `${v.name} ${rupee(v.price)}`).join(' / ') : rupee(i.price)}
                      {i.addon_group_ids.length > 0 && ` · add-ons: ${menu.addon_groups.filter((g) => i.addon_group_ids.includes(g.id)).map((g) => g.name).join(', ')}`}
                      {(['zomato', 'swiggy'] as const).map((src) => i.channel_prices.some((c) => c.source === src) ? ` · ${src === 'zomato' ? 'Zomato' : 'Swiggy'} ${rupee(fromPrice(i, src))}` : '').join('')}
                    </p>
                  </div>
                  <button onClick={() => patchItem(i.id, { in_stock: !i.in_stock })}
                    className={cn('text-xs px-2 py-1 rounded-full border', i.in_stock ? 'border-green-600 text-green-700' : 'border-red-500 text-red-600')}>
                    {i.in_stock ? 'In stock' : 'Out of stock'}
                  </button>
                  <IconBtn onClick={() => move('menu-items', items, ii, -1, load, '/api/pos/admin/menu-items')}><ArrowUp className="w-4 h-4" /></IconBtn>
                  <IconBtn onClick={() => move('menu-items', items, ii, 1, load, '/api/pos/admin/menu-items')}><ArrowDown className="w-4 h-4" /></IconBtn>
                  <IconBtn onClick={() => patchItem(i.id, { active: !i.active })}>{i.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</IconBtn>
                  <IconBtn onClick={() => setEditing(i)}><Pencil className="w-4 h-4" /></IconBtn>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {editing && <ItemEditor item={editing} menu={menu} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function ItemEditor({ item, menu, onClose, onSaved }: { item: Partial<MenuItem>; menu: Menu; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: item.name ?? '', category_id: item.category_id ?? '', price: String(item.price ?? ''), short_code: item.short_code ?? '',
    description: item.description ?? '', food_type: item.food_type ?? 'veg',
  });
  const [group, setGroup] = useState(item.variations?.[0]?.group_name ?? 'Preparation');
  const [vars, setVars] = useState<{ id?: string; name: string; price: string }[]>((item.variations ?? []).map((v) => ({ id: v.id, name: v.name, price: String(v.price) })));
  const [addons, setAddons] = useState<string[]>(item.addon_group_ids ?? []);
  const [busy, setBusy] = useState(false);
  // Online prices keyed by `${channel}|${option name or ''}`; blank = same as dine-in.
  const [chan, setChan] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of item.channel_prices ?? []) {
      const vname = c.variation_id ? item.variations?.find((v) => v.id === c.variation_id)?.name ?? '' : '';
      m[`${c.source}|${vname}`] = String(c.price);
    }
    return m;
  });

  async function save() {
    setBusy(true);
    const body = {
      ...f, price: Number(f.price || 0), variation_group: group,
      variations: vars.filter((v) => v.name.trim()).map((v) => ({ id: v.id, name: v.name, price: Number(v.price) })),
      addon_group_ids: addons,
      channel_prices: Object.entries(chan)
        .filter(([k, v]) => v.trim() !== '' && (k.split('|')[1] === '' ? vars.filter((x) => x.name.trim()).length === 0 : vars.some((x) => x.name.trim() === k.split('|')[1])))
        .map(([k, v]) => ({ source: k.split('|')[0] as 'zomato' | 'swiggy', variation: k.split('|')[1] || null, price: Number(v) })),
    };
    try {
      if (item.id) await api(`/api/pos/admin/menu-items/${item.id}`, 'PATCH', body);
      else await api('/api/pos/admin/menu-items', 'POST', body);
      toast.success('Saved'); onSaved();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function del() {
    if (!item.id || !confirm(`Delete ${item.name}?`)) return;
    try {
      const r = await api<{ deactivated?: boolean }>(`/api/pos/admin/menu-items/${item.id}`, 'DELETE');
      if (r.deactivated) toast.info('This item has past bills, so it was hidden instead of deleted');
      onSaved();
    } catch (e) { fail(e); }
  }

  const inp = 'w-full rounded-lg border px-3 py-2 text-sm';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item.id ? 'Edit item' : 'New item'}</DialogTitle></DialogHeader>
        <label className="text-sm">Name<input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Category
            <select className={inp} value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
              {menu.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Type
            <select className={inp} value={f.food_type} onChange={(e) => setF({ ...f, food_type: e.target.value as MenuItem['food_type'] })}>
              <option value="veg">Veg</option><option value="egg">Egg</option><option value="nonveg">Non-veg</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Price ₹{vars.length > 0 && <span className="text-muted-foreground"> (set per option)</span>}
            <input className={inp} inputMode="decimal" disabled={vars.length > 0} value={vars.length ? '' : f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </label>
          <label className="text-sm">Short code<input className={inp} value={f.short_code} onChange={(e) => setF({ ...f, short_code: e.target.value })} /></label>
        </div>

        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Options</span>
            <input className="flex-1 rounded border px-2 py-1 text-sm" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Group name e.g. Size" />
          </div>
          <p className="text-xs text-muted-foreground">e.g. Regular / Jain, Small / Large. Leave empty if the item has a single price.</p>
          {vars.map((v, i) => (
            <div key={i} className="flex gap-2">
              <input className="flex-1 rounded border px-2 py-1 text-sm" placeholder="Option" value={v.name} onChange={(e) => setVars(vars.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input className="w-24 rounded border px-2 py-1 text-sm" placeholder="₹" inputMode="decimal" value={v.price} onChange={(e) => setVars(vars.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
              <button onClick={() => setVars(vars.filter((_, j) => j !== i))}><X className="w-4 h-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setVars([...vars, { name: '', price: f.price }])}><Plus className="w-3 h-3 mr-1" /> Option</Button>
        </div>

        {AGGREGATORS_IN_POS && <div className="rounded-lg border p-3 text-sm">
          <p className="font-medium">Online prices</p>
          <p className="text-xs text-muted-foreground mb-2">Leave blank to use the dine-in price.</p>
          <div className="grid grid-cols-[1fr_70px_80px_80px] gap-2 items-center">
            <span className="text-xs text-muted-foreground"></span><span className="text-xs text-muted-foreground">Dine-in</span>
            <span className="text-xs text-muted-foreground">Zomato</span><span className="text-xs text-muted-foreground">Swiggy</span>
            {(vars.filter((v) => v.name.trim()).length ? vars.filter((v) => v.name.trim()).map((v) => ({ key: v.name.trim(), label: v.name, price: v.price })) : [{ key: '', label: 'Price', price: f.price }]).map((row) => (
              <div key={row.key} className="contents">
                <span className="truncate">{row.label}</span>
                <span>₹{row.price || '–'}</span>
                {(['zomato', 'swiggy'] as const).map((src) => (
                  <input key={src} className="rounded border px-2 py-1" inputMode="decimal" placeholder={row.price || ''}
                    value={chan[`${src}|${row.key}`] ?? ''} onChange={(e) => setChan({ ...chan, [`${src}|${row.key}`]: e.target.value })} />
                ))}
              </div>
            ))}
          </div>
        </div>}

        {menu.addon_groups.length > 0 && (
          <div className="text-sm">
            <p className="font-medium mb-1">Add-ons offered</p>
            <div className="flex flex-wrap gap-2">
              {menu.addon_groups.map((g) => (
                <label key={g.id} className="flex items-center gap-1 border rounded-full px-3 py-1">
                  <input type="checkbox" checked={addons.includes(g.id)} onChange={(e) => setAddons(e.target.checked ? [...addons, g.id] : addons.filter((x) => x !== g.id))} />
                  {g.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="text-sm">Description (optional)<textarea className={inp} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>

        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
          {item.id && <Button variant="outline" className="text-red-600" onClick={del}><Trash2 className="w-4 h-4" /></Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Add-ons ───────────── */

function AddonsTab() {
  const [groups, setGroups] = useState<AddonGroup[]>([]);
  const load = useCallback(async () => { try { setGroups((await api<Menu>('/api/pos/menu?all=1')).addon_groups); } catch (e) { fail(e); } }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => { try { await fn(); load(); } catch (e) { fail(e); } };

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.id} className={cn('rounded-xl border p-4', !g.active && 'opacity-60')}>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="font-semibold flex-1">{g.name} <span className="text-sm font-normal text-muted-foreground">· pick {g.min_select}–{g.max_select}</span></h2>
            <IconBtn onClick={() => {
              const n = prompt('Group name', g.name); if (!n?.trim()) return;
              const mn = Number(prompt('Minimum to pick (0 = optional)', String(g.min_select)));
              const mx = Number(prompt('Maximum to pick', String(g.max_select)));
              run(() => api(`/api/pos/admin/addon-groups/${g.id}`, 'PATCH', { name: n, min_select: mn, max_select: Math.max(1, mx) }));
            }}><Pencil className="w-4 h-4" /></IconBtn>
            <IconBtn onClick={() => run(() => api(`/api/pos/admin/addon-groups/${g.id}`, 'PATCH', { active: !g.active }))}>{g.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</IconBtn>
            <IconBtn onClick={() => confirm(`Delete ${g.name}?`) && run(() => api(`/api/pos/admin/addon-groups/${g.id}`, 'DELETE'))}><Trash2 className="w-4 h-4 text-red-600" /></IconBtn>
          </div>
          <div className="divide-y">
            {g.options.map((o) => (
              <div key={o.id} className={cn('flex items-center gap-2 py-1.5', !o.active && 'opacity-50')}>
                <span className="flex-1 text-sm">{o.name}</span>
                <span className="text-sm">{rupee(o.price)}</span>
                <IconBtn onClick={() => {
                  const n = prompt('Name', o.name); if (!n?.trim()) return;
                  const p = prompt('Price ₹', String(o.price));
                  run(() => api(`/api/pos/admin/addon-options/${o.id}`, 'PATCH', { name: n, price: Number(p) }));
                }}><Pencil className="w-4 h-4" /></IconBtn>
                <IconBtn onClick={() => run(() => api(`/api/pos/admin/addon-options/${o.id}`, 'PATCH', { active: !o.active }))}>{o.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</IconBtn>
                <IconBtn onClick={() => confirm(`Delete ${o.name}?`) && run(() => api(`/api/pos/admin/addon-options/${o.id}`, 'DELETE'))}><Trash2 className="w-4 h-4 text-red-600" /></IconBtn>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => {
            const n = prompt('Add-on name'); if (!n?.trim()) return;
            const p = prompt('Price ₹', '0');
            run(() => api('/api/pos/admin/addon-options', 'POST', { group_id: g.id, name: n, price: Number(p) || 0 }));
          }}><Plus className="w-3 h-3 mr-1" /> Option</Button>
        </div>
      ))}
      <Button variant="outline" onClick={() => {
        const n = prompt('Add-on group name (e.g. Extra toppings)'); if (!n?.trim()) return;
        const mx = Number(prompt('How many can a customer pick at most?', '1')) || 1;
        run(() => api('/api/pos/admin/addon-groups', 'POST', { name: n, min_select: 0, max_select: mx }));
      }}><Plus className="w-4 h-4 mr-1" /> Add-on group</Button>
    </div>
  );
}

/* ───────────── Bills ───────────── */

const minsBetween = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
const fmtMin = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`);

/** Kitchen time per KOT round: from sending the KOT to the last item marked Ready. */
function kotTimes(o: OrderRow) {
  const rounds = new Map<number, { start: string; ready: string | null; pending: boolean }>();
  for (const l of o.order_items ?? []) {
    if (l.kot_status === 'cancelled') continue;
    const r = rounds.get(l.kot_round) ?? { start: l.created_at, ready: null, pending: false };
    if (l.created_at < r.start) r.start = l.created_at;
    if (l.ready_at) { if (!r.ready || l.ready_at > r.ready) r.ready = l.ready_at; } else r.pending = true;
    rounds.set(l.kot_round, r);
  }
  return Array.from(rounds.entries()).sort((a, b) => a[0] - b[0])
    .map(([round, r]) => ({ round, mins: r.ready && !r.pending ? minsBetween(r.start, r.ready) : null }));
}

function timingStats(orders: OrderRow[], alertMin = 20) {
  const kots = orders.filter((o) => o.status !== 'cancelled').flatMap(kotTimes).map((k) => k.mins).filter((m): m is number => m !== null);
  const seats = orders.filter((o) => o.status === 'settled' && o.table_id && o.settled_at).map((o) => minsBetween(o.created_at, o.settled_at!));
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  return { avgKot: avg(kots), lateKots: kots.filter((m) => m >= alertMin).length, avgTable: avg(seats) };
}

function BillsTab() {
  const today = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
  const [date, setDate] = useState(today);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [bill, setBill] = useState<BillSettings>({ title: '', footer: '', address: '', phone: '', fssai: '', review_url: '' });
  const load = useCallback(async () => { try { setOrders((await api<{ orders: OrderRow[] }>(`/api/pos/orders?date=${date}`)).orders); } catch (e) { fail(e); } }, [date]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<Menu>('/api/pos/menu').then((m) => setBill(m.bill)).catch(() => {});
  }, []);

  const s = useMemo(() => {
    const settled = orders.filter((o) => o.status === 'settled');
    const sum = (f: (o: OrderRow) => number) => settled.reduce((a, o) => a + f(o), 0);
    return {
      count: settled.length, total: sum((o) => Number(o.total)), cash: sum((o) => Number(o.cash_amount)), upi: sum((o) => Number(o.upi_amount)),
      online: sum((o) => (o.payment_mode === 'online' ? Number(o.total) : 0)), discount: sum((o) => Number(o.discount)),
      open: orders.filter((o) => o.status === 'open').length, cancelled: orders.filter((o) => o.status === 'cancelled').length,
      due: sum((o) => (o.payment_mode === 'due' && !o.due_paid_at ? Number(o.total) : 0)),
      ...timingStats(orders, bill.kot_alert_minutes ?? 20),
    };
  }, [orders, bill.kot_alert_minutes]);

  return (
    <div className="space-y-4">
      <input type="date" className="rounded-lg border px-3 py-2 text-sm" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['Sales', rupee(s.total)], ['Bills', String(s.count)], ['Cash', rupee(s.cash)], ['UPI', rupee(s.upi)], ...(AGGREGATORS_IN_POS ? [['Zomato/Swiggy', rupee(s.online)]] : []), ['Discounts', rupee(s.discount)], ['Due (unpaid)', rupee(s.due)], ['Still open', String(s.open)], ['Cancelled', String(s.cancelled)],
          ['Avg kitchen time', s.avgKot !== null ? `${s.avgKot} min` : '—'], [`KOTs over ${bill.kot_alert_minutes ?? 20} min`, String(s.lateKots)], ['Avg time on table', s.avgTable !== null ? fmtMin(s.avgTable) : '—']].map(([l, v]) => (
          <div key={l} className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-bold">{v}</p></div>
        ))}
      </div>
      <div className="rounded-xl border divide-y">
        {orders.map((o) => (
          <div key={o.id}>
            <button className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm" onClick={() => setOpen(open === o.id ? null : o.id)}>
              <span className="font-semibold w-14">#{o.bill_no}</span>
              <span className="flex-1">{SOURCE_LABEL[o.source]}{o.customer_name ? ` · ${o.customer_name}` : ''}</span>
              <span className={cn('text-xs px-2 rounded-full', o.status === 'settled' ? 'bg-green-100 text-green-800' : o.status === 'open' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700')}>{o.status}{o.payment_mode ? ` · ${o.payment_mode}` : ''}</span>
              {o.feedback_rating && <span>{{ loved: '😍', okay: '🙂', improve: '😕' }[o.feedback_rating]}</span>}
              <span className="w-20 text-right font-medium">{rupee(Number(o.total))}</span>
            </button>
            {open === o.id && (
              <div className="px-4 pb-3 text-sm text-muted-foreground space-y-0.5">
                {(o.order_items ?? []).map((l) => (
                  <div key={l.id} className={cn('flex justify-between', l.kot_status === 'cancelled' && 'line-through')}>
                    <span>{l.qty} × {l.name}{l.variation_name ? ` (${l.variation_name})` : ''}{l.addons.length ? ` + ${l.addons.map((a) => a.name).join(', ')}` : ''}</span>
                    <span>{rupee(Number(l.price) * l.qty)}</span>
                  </div>
                ))}
                {o.customer_phone && <p>Phone: {o.customer_phone}</p>}
                {(() => {
                  const k = kotTimes(o); const seat = o.settled_at && o.table_id ? minsBetween(o.created_at, o.settled_at) : null;
                  if (!k.length && seat === null) return null;
                  return <p className="text-xs">⏱ {k.map((x) => `KOT ${x.round}: ${x.mins === null ? 'not ready yet' : `${x.mins} min`}`).join(' · ')}{seat !== null && <> · On table {fmtMin(seat)}</>}</p>;
                })()}
                <p className="text-xs">
                  {o.taken_by?.name && <>Order taken by {o.taken_by.name}</>}
                  {o.settled_by_profile?.name && <> · Billed by {o.settled_by_profile.name}{Number(o.discount) > 0 && <span className="text-amber-700 font-medium"> (gave {rupee(Number(o.discount))} discount)</span>}</>}
                  {o.cancelled_by_profile?.name && <> · Cancelled by {o.cancelled_by_profile.name}{o.cancel_reason ? `: “${o.cancel_reason}”` : ''}</>}
                </p>
                {o.feedback_rating && (
                  <p className="mt-1 text-foreground">Feedback: {{ loved: '😍 Loved it', okay: '🙂 Okay', improve: '😕 Needs improvement' }[o.feedback_rating]}{o.feedback_comment ? ` — “${o.feedback_comment}”` : ''}</p>
                )}
                {o.status === 'settled' && o.customer_phone && (() => {
                  const link = whatsappLink(o.customer_phone, billText(o, bill, window.location.origin));
                  return link ? <a href={link} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 mr-2 rounded-md bg-green-600 text-white text-sm px-3 py-1.5">Send bill on WhatsApp</a> : null;
                })()}
                {o.status === 'settled' && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={async () => {
                    if (!confirm('Reopen this bill so it can be corrected?')) return;
                    try { await api(`/api/pos/orders/${o.id}`, 'PATCH', { action: 'reopen' }); load(); } catch (e) { fail(e); }
                  }}>Reopen bill</Button>
                )}
              </div>
            )}
          </div>
        ))}
        {orders.length === 0 && <p className="p-4 text-sm text-muted-foreground">No bills on this day.</p>}
      </div>
    </div>
  );
}

/* ───────────── WhatsApp bill message ───────────── */

function BillMessageTab() {
  const [bill, setBill] = useState<BillSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Menu>('/api/pos/menu').then((m) => setBill(m.bill)).catch(fail); }, []);
  if (!bill) return <p className="text-muted-foreground">Loading…</p>;

  const sample = billText({
    id: 'x', bill_no: 101, source: 'dine_in', table_id: null, status: 'settled', customer_name: 'Rahul', customer_phone: null,
    subtotal: 165, discount: 10, total: 155, payment_mode: 'upi', cash_amount: 0, upi_amount: 155, notes: null,
    created_at: new Date().toISOString(), settled_at: new Date().toISOString(), captain_id: null, public_token: 'sample',
    order_items: [
      { id: '1', order_id: 'x', menu_item_id: null, name: 'Cold Coffee', variation_name: null, addons: [], price: 60, qty: 2, note: null, kot_round: 1, kot_status: 'served', created_at: '', updated_at: '' },
      { id: '2', order_id: 'x', menu_item_id: null, name: 'Puneri Shev Pav', variation_name: 'Jain', addons: [], price: 45, qty: 1, note: null, kot_round: 1, kot_status: 'served', created_at: '', updated_at: '' },
    ],
  }, bill, typeof window !== 'undefined' ? window.location.origin : '');

  async function save() {
    setBusy(true);
    try { await api('/api/pos/admin/bill-settings', 'PATCH', bill); toast.success('Saved'); } catch (e) { fail(e); } finally { setBusy(false); }
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-3">
        <label className="text-sm block">Heading (your café name)
          <input className="w-full rounded-lg border px-3 py-2 text-sm" value={bill.title} onChange={(e) => setBill({ ...bill, title: e.target.value })} />
        </label>
        <label className="text-sm block">Address
          <input className="w-full rounded-lg border px-3 py-2 text-sm" value={bill.address} onChange={(e) => setBill({ ...bill, address: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm block">Phone
            <input className="w-full rounded-lg border px-3 py-2 text-sm" value={bill.phone} onChange={(e) => setBill({ ...bill, phone: e.target.value })} />
          </label>
          <label className="text-sm block">FSSAI no.
            <input className="w-full rounded-lg border px-3 py-2 text-sm" value={bill.fssai} onChange={(e) => setBill({ ...bill, fssai: e.target.value })} />
          </label>
        </div>
        <label className="text-sm block">Kitchen alarm if a KOT is not ready within (minutes)
          <input type="number" min={5} max={90} className="w-full rounded-lg border px-3 py-2 text-sm" value={bill.kot_alert_minutes ?? 20}
            onChange={(e) => setBill({ ...bill, kot_alert_minutes: Number(e.target.value) })} />
        </label>
        <label className="text-sm block">Google review link (shown at the top of the WhatsApp message)
          <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="https://g.page/r/…/review" value={bill.review_url} onChange={(e) => setBill({ ...bill, review_url: e.target.value })} />
        </label>
        <label className="text-sm block">Closing message on WhatsApp (thank-you, Instagram…)
          <textarea className="w-full rounded-lg border px-3 py-2 text-sm" rows={8} value={bill.footer} onChange={(e) => setBill({ ...bill, footer: e.target.value })} />
        </label>
        <Button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
      </div>
      <div>
        <p className="text-sm font-medium mb-2">WhatsApp message preview</p>
        <pre className="whitespace-pre-wrap rounded-xl bg-[#e7fbd8] p-4 text-sm font-sans">{sample}</pre>
      </div>
    </div>
  );
}

/* ───────────── Bulk online prices ───────────── */

function OnlinePriceTool({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<'zomato' | 'swiggy'>('zomato');
  const [percent, setPercent] = useState('20');
  const [roundTo, setRoundTo] = useState('5');
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  async function apply(clear = false) {
    if (clear && !confirm(`Remove all ${source} prices? Items will use dine-in prices.`)) return;
    setBusy(true);
    try {
      await api('/api/pos/admin/channel-prices', 'POST', clear ? { source, clear: true } : { source, percent: Number(percent), round_to: Number(roundTo), overwrite });
      toast.success('Online prices updated'); onDone();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!open) return <button className="text-sm text-primary underline" onClick={() => setOpen(true)}>Set Zomato / Swiggy prices for all items…</button>;
  return (
    <div className="rounded-xl border p-4 space-y-3 text-sm">
      <p className="font-medium">Set online prices in bulk</p>
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded border px-2 py-1" value={source} onChange={(e) => setSource(e.target.value as 'zomato' | 'swiggy')}>
          <option value="zomato">Zomato</option><option value="swiggy">Swiggy</option>
        </select>
        <span>= dine-in +</span>
        <input className="w-16 rounded border px-2 py-1" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />
        <span>%, rounded up to ₹</span>
        <input className="w-14 rounded border px-2 py-1" inputMode="numeric" value={roundTo} onChange={(e) => setRoundTo(e.target.value)} />
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Also replace prices I already set by hand</label>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => apply()}>Apply</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => apply(true)}>Clear {source} prices</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
      </div>
      <p className="text-xs text-muted-foreground">Fine-tune any single item afterwards with ✏️ → Online prices.</p>
    </div>
  );
}

/* ───────────── Loyalty & customers ───────────── */

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid sm:grid-cols-[220px_1fr] gap-1 sm:gap-3 items-start text-sm py-1.5">
      <span className="font-medium pt-2">{label}{hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}</span>
      <div>{children}</div>
    </label>
  );
}

interface CustomerRow { id: string; phone: string; name: string | null; visits: number; total_spent: number; last_visit_at: string | null; balance: number }

function MilestonesSection() {
  const [rules, setRules] = useState<MilestoneRule[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ milestones: MilestoneRule[] }>('/api/pos/admin/milestones').then((r) => setRules(r.milestones)).catch(fail); }, []);
  if (!rules) return null;
  const upd = (i: number, p: Partial<MilestoneRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
  async function save() {
    setBusy(true);
    try { const r = await api<{ milestones: MilestoneRule[] }>('/api/pos/admin/milestones', 'PUT', { milestones: rules }); setRules(r.milestones); toast.success('Milestones saved'); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  const inp = 'rounded-lg border px-2 py-1.5 text-sm';
  return (
    <section className="rounded-xl border p-4 space-y-3">
      <div>
        <h3 className="font-semibold">Visit milestones</h3>
        <p className="text-xs text-muted-foreground">Rewards for regulars, tracked by mobile number. One visit = one day with a paid bill. After a reward, counting starts again.</p>
      </div>
      {rules.map((r, i) => (
        <div key={r.id} className="rounded-lg border p-3 grid grid-cols-2 sm:grid-cols-7 gap-2 items-end">
          <label className="text-xs sm:col-span-2">Name<input className={cn(inp, 'w-full')} value={r.name} onChange={(e) => upd(i, { name: e.target.value })} /></label>
          <label className="text-xs">Visits<input type="number" min={2} className={cn(inp, 'w-full')} value={r.visits} onChange={(e) => upd(i, { visits: Number(e.target.value) })} /></label>
          <label className="text-xs">Min bill ₹<input type="number" min={0} className={cn(inp, 'w-full')} value={r.min_bill} onChange={(e) => upd(i, { min_bill: Number(e.target.value) })} /></label>
          <label className="text-xs">Within days<input type="number" min={0} className={cn(inp, 'w-full')} value={r.within_days} onChange={(e) => upd(i, { within_days: Number(e.target.value) })} /></label>
          <label className="text-xs sm:col-span-2">Reward<input className={cn(inp, 'w-full')} value={r.reward} onChange={(e) => upd(i, { reward: e.target.value })} /></label>
          <p className="text-xs text-muted-foreground col-span-2 sm:col-span-4">{describeRule(r)}{r.within_days === 0 ? ' (0 days = no time limit)' : ''}</p>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={r.enabled} onChange={(e) => upd(i, { enabled: e.target.checked })} /> On</label>
          <button className="text-xs text-red-600 text-right" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setRules([...rules, { id: `m${Date.now().toString(36)}`, name: 'Regulars card', visits: 8, within_days: 0, reward: 'Free Surti Cold Coco or Classic Shev Pav', min_bill: 100, enabled: true }])}>
          <Plus className="w-4 h-4 mr-1" /> Add milestone
        </Button>
        <Button size="sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save milestones'}</Button>
      </div>
    </section>
  );
}

function LoyaltyTab() {
  const [cfg, setCfg] = useState<LoyaltyConfig | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await api<{ loyalty: LoyaltyConfig; customers: CustomerRow[] }>('/api/pos/customers');
      setCfg(r.loyalty); setCustomers(r.customers);
    } catch (e) { fail(e); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!cfg) return <p className="text-muted-foreground">Loading…</p>;

  const set = <K extends keyof LoyaltyConfig>(k: K, v: LoyaltyConfig[K]) => setCfg({ ...cfg, [k]: v });
  const num = (k: keyof LoyaltyConfig) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value === '' ? 0 : Number(e.target.value)) as never);
  async function save() {
    setBusy(true);
    try { const r = await api<{ loyalty: LoyaltyConfig }>('/api/pos/admin/loyalty', 'PATCH', normaliseLoyalty(cfg)); setCfg(r.loyalty); toast.success('Loyalty settings saved'); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function adjust(c: Partial<CustomerRow>) {
    const phone = c.phone ?? prompt('Customer mobile number') ?? '';
    if (!phone) return;
    const pts = prompt(`Points to add for ${c.name ?? phone} (use a minus sign to remove, e.g. -20)`);
    if (!pts) return;
    const note = prompt('Reason (e.g. "birthday gift", "correction")');
    if (!note) return;
    try { await api('/api/pos/admin/loyalty/adjust', 'POST', { phone, name: c.name, points: Number(pts), note }); toast.success('Points updated'); load(); }
    catch (e) { fail(e); }
  }

  const term = q.trim().toLowerCase();
  const shown = customers.filter((c) => !term || c.phone.includes(term) || c.name?.toLowerCase().includes(term)).slice(0, 200);
  const outstanding = customers.reduce((a, c) => a + Math.max(0, c.balance), 0);
  const inp = 'w-full rounded-lg border px-3 py-2 text-sm';

  return (
    <div className="space-y-6">
      <MilestonesSection />
      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Loyalty programme</h2>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Active</label>
        </div>
        <Row label="Programme name"><input className={inp} value={cfg.name} onChange={(e) => set('name', e.target.value)} /></Row>

        <h3 className="text-sm font-semibold mt-4 mb-1">Earning points</h3>
        <Row label="Points given (%)" hint="e.g. 10 = ₹100 bill earns 10 points"><input className={inp} inputMode="decimal" value={cfg.earn_percent} onChange={num('earn_percent')} /></Row>
        <Row label="Calculated on">
          <select className={inp} value={cfg.earn_basis} onChange={(e) => set('earn_basis', e.target.value as LoyaltyConfig['earn_basis'])}>
            <option value="core">Items total (before discount)</option>
            <option value="core_minus_discount">Items total minus discount</option>
            <option value="total">Final amount paid</option>
          </select>
        </Row>
        <Row label="Min bill to earn (₹)" hint="0 = any bill"><input className={inp} inputMode="decimal" value={cfg.min_order} onChange={num('min_order')} /></Row>
        <Row label="Max points per bill" hint="0 = no limit"><input className={inp} inputMode="decimal" value={cfg.max_points_per_order} onChange={num('max_points_per_order')} /></Row>
        <Row label="Points expire after (days)" hint="0 = never"><input className={inp} inputMode="numeric" value={cfg.expiry_days} onChange={num('expiry_days')} /></Row>
        <Row label="No points on discounted bills"><input type="checkbox" className="mt-2" checked={cfg.skip_discounted} onChange={(e) => set('skip_discounted', e.target.checked)} /></Row>

        <h3 className="text-sm font-semibold mt-4 mb-1">Using points</h3>
        <Row label="Allow using points"><input type="checkbox" className="mt-2" checked={cfg.redeem_enabled} onChange={(e) => set('redeem_enabled', e.target.checked)} /></Row>
        <Row label="Limit per bill">
          <div className="flex gap-2">
            <select className="rounded-lg border px-2 py-2 text-sm" value={cfg.redeem_mode} onChange={(e) => set('redeem_mode', e.target.value as LoyaltyConfig['redeem_mode'])}>
              <option value="percent">% of items total</option><option value="fixed">Fixed ₹</option>
            </select>
            <input className={inp} inputMode="decimal" value={cfg.redeem_value} onChange={num('redeem_value')} />
          </div>
        </Row>
        <Row label="Min bill to use points (₹)"><input className={inp} inputMode="decimal" value={cfg.redeem_min_core} onChange={num('redeem_min_core')} /></Row>
        <Row label="Max points per bill" hint="0 = no limit"><input className={inp} inputMode="decimal" value={cfg.redeem_max_points} onChange={num('redeem_max_points')} /></Row>
        <Row label="Points per ₹1" hint="1 = 1 point is worth ₹1"><input className={inp} inputMode="decimal" value={cfg.points_per_rupee} onChange={num('points_per_rupee')} /></Row>

        <p className="text-xs text-muted-foreground mt-2">
          Example with these settings: a ₹{Math.max(cfg.redeem_min_core, 250)} bill earns {Math.round(Math.max(cfg.redeem_min_core, 250) * cfg.earn_percent) / 100} points,
          and a customer can use up to {cfg.redeem_mode === 'percent' ? `${cfg.redeem_value}% of the bill` : `₹${cfg.redeem_value}`}
          {cfg.redeem_max_points > 0 ? ` (max ${cfg.redeem_max_points} points)` : ''} on bills of ₹{cfg.redeem_min_core}+.
        </p>
        <Button className="mt-3" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save loyalty settings'}</Button>
      </section>

      <section className="rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold">Customers <span className="text-sm font-normal text-muted-foreground">· {customers.length} · {Math.round(outstanding).toLocaleString('en-IN')} points outstanding</span></h2>
          <div className="flex gap-2">
            <input className="rounded-lg border px-3 py-1.5 text-sm" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button size="sm" variant="outline" onClick={() => adjust({})}>Add points</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b">
              <th className="py-1.5 font-medium">Name</th><th className="font-medium">Mobile</th>
              <th className="font-medium text-right">Points</th><th className="font-medium text-right">Visits</th>
              <th className="font-medium text-right">Spent</th><th></th>
            </tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-1.5">{c.name || '—'}</td>
                  <td className="tabular-nums">{c.phone}</td>
                  <td className={cn('text-right tabular-nums', c.balance > 0 && 'text-amber-700 font-medium')}>{c.balance}</td>
                  <td className="text-right tabular-nums">{c.visits}</td>
                  <td className="text-right tabular-nums">{rupee(c.total_spent)}</td>
                  <td className="text-right"><button className="text-xs underline" onClick={() => adjust(c)}>Adjust</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers.length > shown.length && !term && <p className="text-xs text-muted-foreground mt-2">Showing the 200 most recent — search to find others.</p>}
        </div>
      </section>
    </div>
  );
}
