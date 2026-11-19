'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ChefHat, CloudOff, LogOut, Minus, Plus, Receipt, RefreshCw, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PosLogin from '@/components/pos/PosLogin';
import ItemOptionsDialog, { type PickedLine } from '@/components/pos/ItemOptionsDialog';
import QuickNav from '@/components/pos/QuickNav';
import { usePosLive } from '@/lib/pos/useLive';
import { cn } from '@/lib/utils';
import {
  dropQueued, enqueue, flushQueue, getQueue, getSession, isNetworkError, posApi, SessionExpired, setSession, uid,
  type QueuedOrder, type StoredSession,
} from '@/lib/pos/client';
import { billText, whatsappLink } from '@/lib/pos/billText';
import { AGGREGATORS_IN_POS, channelPrice, fromPrice, rupee, SOURCE_LABEL, type Area, type BillSettings, type Menu, type MenuItem, type OrderRow, type OrderSource, type PaymentMode, type PosTable } from '@/lib/pos/types';

interface OpenOrder { id: string; bill_no: number; source: OrderSource; table_id: string | null; total: number; created_at: string; customer_name: string | null; ready: boolean; pending: boolean }
interface Floor { areas: Area[]; tables: PosTable[]; open_orders: OpenOrder[] }
type Target = { kind: 'table'; table: PosTable } | { kind: 'source'; source: OrderSource } | { kind: 'order'; orderId: string; openBill?: boolean };

const CACHE_MENU = 'pos.cache.menu';
const CACHE_FLOOR = 'pos.cache.floor';
const cacheGet = <T,>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
const cacheSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

const STATUS_STYLE: Record<string, string> = {
  new: 'bg-amber-100 text-amber-800', preparing: 'bg-blue-100 text-blue-800', ready: 'bg-green-100 text-green-800',
  served: 'bg-muted text-muted-foreground', cancelled: 'bg-red-50 text-red-400 line-through',
};

export default function CaptainPage() {
  const [session, setSess] = useState<StoredSession | null>(null);
  const [booted, setBooted] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [floor, setFloor] = useState<Floor | null>(null);
  const [queue, setQueueState] = useState<QueuedOrder[]>([]);
  const [online, setOnline] = useState(true);
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    setSess(getSession());
    setMenu(cacheGet<Menu>(CACHE_MENU));
    setFloor(cacheGet<Floor>(CACHE_FLOOR));
    setQueueState(getQueue());
    setOnline(navigator.onLine);
    setBooted(true);
  }, []);

  const handleErr = useCallback((e: unknown) => {
    if (e instanceof SessionExpired) { setSess(null); return; }
    if (isNetworkError(e)) { setOnline(false); return; }
    toast.error((e as Error).message);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [m, f] = await Promise.all([posApi<Menu>('/api/pos/menu'), posApi<Floor>('/api/pos/floor')]);
      setMenu(m); setFloor(f); cacheSet(CACHE_MENU, m); cacheSet(CACHE_FLOOR, f); setOnline(true);
    } catch (e) { handleErr(e); }
  }, [handleErr]);

  const syncQueue = useCallback(async () => {
    if (!getQueue().length) return;
    const n = await flushQueue();
    setQueueState(getQueue());
    if (n) { toast.success(`${n} offline order${n > 1 ? 's' : ''} sent to kitchen`); refresh(); }
  }, [refresh]);

  useEffect(() => {
    if (!session) return;
    refresh(); syncQueue();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [session, refresh, syncQueue]);
  // Live updates: instant when any order changes, quiet background refresh otherwise.
  usePosLive(() => { refresh(); syncQueue(); }, !!session && !target, 10_000);

  if (!booted) return null;
  if (!session) return <PosLogin title="Captain" subtitle="Enter your PIN to take orders" onLogin={setSess} />;

  if (target) {
    return (
      <OrderScreen
        target={target} menu={menu} floor={floor} onlineHint={online}
        onBack={(closedOrderId?: string) => {
          // A paid/cancelled bill frees its table immediately, before the server round trip.
          if (closedOrderId) setFloor((f) => {
            if (!f) return f;
            const next = { ...f, open_orders: f.open_orders.filter((o) => o.id !== closedOrderId) };
            cacheSet(CACHE_FLOOR, next);
            return next;
          });
          setTarget(null); refresh();
        }}
        onQueued={() => setQueueState(getQueue())}
        onError={handleErr}
        onOpenOrder={(orderId) => setTarget({ kind: 'order', orderId })}
      />
    );
  }

  const openByTable = new Map((floor?.open_orders ?? []).filter((o) => o.table_id).map((o) => [o.table_id!, o]));
  const nonTable = (floor?.open_orders ?? []).filter((o) => !o.table_id);

  return (
    <main className="min-h-screen bg-stone-50 pb-10">
      <header className="sticky top-0 z-20 bg-white border-b px-4 pt-2 pb-3">
        <QuickNav className="-ml-2 mb-1" />
        <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold">Tables</h1>
          <p className="text-xs text-muted-foreground">{session.staff.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {!online && <span className="flex items-center gap-1 text-xs text-red-600"><CloudOff className="w-4 h-4" /> Offline</span>}
          <button onClick={() => { refresh(); syncQueue(); }} className="p-2"><RefreshCw className="w-5 h-5" /></button>
          <button onClick={() => { if (confirm('Log out of this device? You will need a PIN to log in again.')) { setSession(null); setSess(null); } }} className="p-2"><LogOut className="w-5 h-5" /></button>
        </div>
        </div>
      </header>

      {queue.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">{queue.length} order{queue.length > 1 ? 's' : ''} saved on this phone, not yet sent</p>
          <p className="text-amber-800 text-xs mb-2">They will be sent automatically when the internet is back. Tell the kitchen verbally meanwhile.</p>
          {queue.map((q) => (
            <div key={q.client_id} className="flex items-center justify-between py-1">
              <span>{q.label}{q.error && <span className="text-red-600"> — {q.error}</span>}</span>
              {q.error && <button className="text-red-600 text-xs" onClick={() => { dropQueued(q.client_id); setQueueState(getQueue()); }}>Discard</button>}
            </div>
          ))}
        </div>
      )}

      <section className={cn('px-4 mt-4 grid gap-2', AGGREGATORS_IN_POS ? 'grid-cols-3' : 'grid-cols-1')}>
        {((AGGREGATORS_IN_POS ? ['takeaway', 'zomato', 'swiggy'] : ['takeaway']) as OrderSource[]).map((s) => (
          <Button key={s} variant="outline" className="h-12" onClick={() => setTarget({ kind: 'source', source: s })}>
            <ShoppingBag className="w-4 h-4 mr-1" /> {SOURCE_LABEL[s]}
          </Button>
        ))}
      </section>

      {nonTable.length > 0 && (
        <section className="px-4 mt-5">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Open takeaway orders</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {nonTable.map((o) => (
              <div key={o.id} className={cn('rounded-xl border-2 bg-white overflow-hidden', o.ready ? 'border-green-500' : 'border-amber-400')}>
                <button onClick={() => setTarget({ kind: 'order', orderId: o.id })} className="w-full p-3 text-left">
                  <div className="font-semibold">{SOURCE_LABEL[o.source]} #{o.bill_no}{o.ready && <span className="ml-1 text-[10px] text-green-700 animate-pulse">READY</span>}</div>
                  <div className="text-xs text-muted-foreground truncate">{o.customer_name ?? ''}</div>
                  <div className="text-sm font-medium mt-1">{rupee(o.total)}</div>
                </button>
                <button onClick={() => setTarget({ kind: 'order', orderId: o.id, openBill: true })}
                  className="w-full h-7 bg-stone-900 text-white text-xs font-semibold flex items-center justify-center gap-1">
                  <Receipt className="w-3 h-3" /> Bill
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {!floor && <p className="px-4 mt-8 text-center text-muted-foreground">Loading…</p>}
      {floor?.areas.map((a) => {
        const tables = floor.tables.filter((t) => t.area_id === a.id);
        if (!tables.length) return null;
        return (
          <section key={a.id} className="px-4 mt-5">
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">{a.name}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {tables.map((t) => {
                const o = openByTable.get(t.id);
                return (
                  <div key={t.id} className={cn('relative aspect-square rounded-xl border-2 bg-white overflow-hidden',
                    !o && 'border-dashed border-stone-300',
                    o && !o.ready && 'border-amber-400 bg-amber-50',
                    o?.ready && 'border-green-500 bg-green-50')}>
                    <button onClick={() => setTarget({ kind: 'table', table: t })}
                      className={cn('absolute inset-0 flex flex-col items-center justify-center', o && 'pb-7')}>
                      <span className="text-lg font-bold">{t.name}</span>
                      {o && <span className="text-xs font-medium">{rupee(o.total)}</span>}
                      {o?.ready && <span className="text-[10px] text-green-700 font-semibold animate-pulse">READY</span>}
                    </button>
                    {o && (
                      <button onClick={() => setTarget({ kind: 'order', orderId: o.id, openBill: true })}
                        className="absolute bottom-0 inset-x-0 h-7 bg-stone-900 text-white text-xs font-semibold flex items-center justify-center gap-1">
                        <Receipt className="w-3 h-3" /> Bill
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {floor && floor.tables.length === 0 && (
        <p className="px-4 mt-8 text-center text-muted-foreground text-sm">No tables yet. An admin can add them in Admin → POS setup.</p>
      )}
    </main>
  );
}

/* ───────────────────────── Order screen ───────────────────────── */

function OrderScreen({
  target, menu, floor, onlineHint, onBack, onQueued, onError, onOpenOrder,
}: {
  target: Target; menu: Menu | null; floor: Floor | null; onlineHint: boolean;
  onBack: (closedOrderId?: string) => void; onQueued: () => void; onError: (e: unknown) => void; onOpenOrder: (id: string) => void;
}) {
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [cart, setCart] = useState<PickedLine[]>([]);
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [sending, setSending] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [settling, setSettling] = useState(false);
  // Opened via a table's "Bill" button: jump straight to the bill once the order has loaded.
  const autoBill = useRef(target.kind === 'order' && !!target.openBill);
  useEffect(() => {
    if (autoBill.current && order) { autoBill.current = false; setSettling(true); }
  }, [order]);
  const [customer, setCustomer] = useState({ name: '', phone: '' });

  const tableId = target.kind === 'table' ? target.table.id : order?.table_id ?? null;
  const tableName = floor?.tables.find((t) => t.id === tableId)?.name;
  const source: OrderSource = target.kind === 'source' ? target.source : order?.source ?? 'dine_in';
  const title = tableName ? `Table ${tableName}` : SOURCE_LABEL[source];

  const loadOrder = useCallback(async () => {
    let id: string | null = target.kind === 'order' ? target.orderId : null;
    if (target.kind === 'table') id = floor?.open_orders.find((o) => o.table_id === target.table.id)?.id ?? null;
    if (!id) { setOrder(null); return; }
    setLoadingOrder(true);
    try { setOrder((await posApi<{ order: OrderRow }>(`/api/pos/orders/${id}`)).order); }
    catch (e) { onError(e); }
    finally { setLoadingOrder(false); }
  }, [target, floor, onError]);

  useEffect(() => { loadOrder(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  usePosLive(loadOrder, !!order, 10_000);

  const items = useMemo(() => {
    if (!menu) return [];
    const term = q.trim().toLowerCase();
    return menu.items.filter((i) =>
      (cat === 'all' || i.category_id === cat) &&
      (!term || i.name.toLowerCase().includes(term) || (i.short_code ?? '').toLowerCase() === term));
  }, [menu, cat, q]);

  const cartTotal = cart.reduce((s, l) => s + l.unit * l.qty, 0);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  function addSimple(item: MenuItem) {
    if (!item.in_stock) { toast.error(`${item.name} is out of stock`); return; }
    if (item.variations.length || item.addon_group_ids.length) { setPicking(item); return; }
    addLine({ item, variation_id: null, variation_name: null, addons: [], qty: 1, note: '', unit: channelPrice(item, source, null) });
  }
  function addLine(l: PickedLine) {
    setCart((c) => {
      const same = c.findIndex((x) => x.item.id === l.item.id && x.variation_id === l.variation_id && !x.note && !l.note &&
        x.addons.map((a) => a.id).sort().join() === l.addons.map((a) => a.id).sort().join());
      if (same >= 0) return c.map((x, i) => (i === same ? { ...x, qty: Math.min(99, x.qty + l.qty) } : x));
      return [...c, l];
    });
    setPicking(null);
  }

  async function sendKot() {
    if (!cart.length) return;
    const client_id = uid();
    const body = {
      client_id,
      order_id: order?.id,
      source,
      table_id: tableId,
      customer_name: !order ? customer.name || undefined : undefined,
      customer_phone: !order ? customer.phone || undefined : undefined,
      items: cart.map((l) => ({
        client_id: uid(), menu_item_id: l.item.id, variation_id: l.variation_id,
        addon_option_ids: l.addons.map((a) => a.id), qty: l.qty, note: l.note || null,
      })),
    };
    setSending(true);
    try {
      const res = await posApi<{ order: OrderRow }>('/api/pos/orders', { method: 'POST', body: JSON.stringify(body) });
      setOrder(res.order); setCart([]); setShowCart(false);
      toast.success('Sent to kitchen');
      if (target.kind !== 'order') onOpenOrder(res.order.id);
    } catch (e) {
      if (isNetworkError(e)) {
        enqueue({ client_id, body, label: `${title} · ${cartCount} item${cartCount > 1 ? 's' : ''} · ${rupee(cartTotal)}`, queued_at: Date.now() });
        onQueued(); setCart([]); setShowCart(false);
        toast.warning('No internet — order saved on this phone and will be sent automatically. Tell the kitchen now.');
        onBack();
      } else onError(e);
    } finally { setSending(false); }
  }

  async function itemAction(id: string, kot_status: string) {
    try { await posApi(`/api/pos/order-items/${id}`, { method: 'PATCH', body: JSON.stringify({ kot_status }) }); loadOrder(); }
    catch (e) { onError(e); }
  }

  const rounds = useMemo(() => {
    const m = new Map<number, NonNullable<OrderRow['order_items']>>();
    for (const it of order?.order_items ?? []) m.set(it.kot_round, [...(m.get(it.kot_round) ?? []), it]);
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [order]);

  return (
    <main className="min-h-screen bg-stone-50 pb-28">
      <header className="sticky top-0 z-20 bg-white border-b px-3 py-3 flex items-center gap-2">
        <button onClick={() => onBack()} className="p-2"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold truncate">{title}{order && <span className="text-muted-foreground font-normal"> · Bill #{order.bill_no}</span>}</h1>
          {!onlineHint && <p className="text-xs text-red-600">Offline — new orders will be saved on this phone</p>}
        </div>
        <QuickNav compact onTables={() => onBack()} className="shrink-0" />
        {order && (
          <Button size="sm" onClick={() => setSettling(true)}><Receipt className="w-4 h-4 mr-1" /> Bill {rupee(order.total)}</Button>
        )}
      </header>

      {/* Existing order */}
      {loadingOrder && !order && <p className="p-4 text-sm text-muted-foreground">Loading order…</p>}
      {order && (
        <section className="m-3 rounded-xl bg-white border p-3">
          {rounds.map(([round, lines]) => (
            <div key={round} className="mb-2 last:mb-0">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase">KOT {round}</p>
              {lines.map((l) => (
                <div key={l.id} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm', l.kot_status === 'cancelled' && 'line-through text-muted-foreground')}>
                      {l.qty} × {l.name}{l.variation_name ? ` (${l.variation_name})` : ''}
                    </p>
                    {(l.addons.length > 0 || l.note) && (
                      <p className="text-xs text-muted-foreground truncate">{[l.addons.map((a) => a.name).join(', '), l.note].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[l.kot_status])}>{l.kot_status}</span>
                  {l.kot_status === 'ready' && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => itemAction(l.id, 'served')}>Served</Button>}
                  {['new', 'preparing'].includes(l.kot_status) && (
                    <button className="p-1 text-red-500" onClick={() => confirm(`Remove ${l.name}?`) && itemAction(l.id, 'cancelled')}><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {!order && !loadingOrder && target.kind !== 'table' && (
        <section className="m-3 grid grid-cols-2 gap-2">
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Customer name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Phone" inputMode="numeric" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
        </section>
      )}

      {/* Menu */}
      <div className="sticky top-[57px] z-10 bg-stone-50 pt-2 pb-2 px-3 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item or code"
            className="w-full rounded-lg border bg-white pl-9 pr-8 py-2 text-sm" />
          {q && <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setQ('')}><X className="w-4 h-4" /></button>}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <Chip active={cat === 'all'} onClick={() => setCat('all')}>All</Chip>
          {menu?.categories.map((c) => <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</Chip>)}
        </div>
      </div>

      {!menu && <p className="p-4 text-center text-muted-foreground text-sm">Loading menu…</p>}
      {(() => {
        const tile = (i: MenuItem) => {
          const inCart = cart.filter((l) => l.item.id === i.id).reduce((s, l) => s + l.qty, 0);
          return (
            <button key={i.id} onClick={() => addSimple(i)} disabled={!i.in_stock}
              className={cn('relative rounded-xl border bg-white p-3 text-left min-h-[72px] active:scale-[0.98] transition',
                !i.in_stock && 'opacity-40', inCart > 0 && 'border-primary ring-1 ring-primary')}>
              <span className={cn('absolute top-2 right-2 h-3 w-3 border flex items-center justify-center', i.food_type === 'veg' ? 'border-green-600' : 'border-red-600')}>
                <span className={cn('h-1.5 w-1.5 rounded-full', i.food_type === 'veg' ? 'bg-green-600' : 'bg-red-600')} />
              </span>
              <p className="text-sm font-medium pr-4 leading-tight">{i.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {i.variations.length > 1 ? `from ${rupee(fromPrice(i, source))}` : rupee(fromPrice(i, source))}{!i.in_stock && ' · out of stock'}
              </p>
              {inCart > 0 && <span className="absolute bottom-2 right-2 text-xs font-bold text-primary">×{inCart}</span>}
            </button>
          );
        };
        const grid = 'px-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2';
        // "All" without a search: sectioned like the printed menu card.
        if (cat === 'all' && !q.trim() && menu) {
          return menu.categories.map((c) => {
            const list = items.filter((i) => i.category_id === c.id);
            if (!list.length) return null;
            return (
              <section key={c.id} className="mb-4">
                <h3 className="px-3 pb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{c.name}</h3>
                <div className={grid}>{list.map(tile)}</div>
              </section>
            );
          });
        }
        return <div className={grid}>{items.map(tile)}</div>;
      })()}

      {/* Cart bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t p-3 flex gap-2">
          <Button variant="outline" className="flex-1 h-12" onClick={() => setShowCart(true)}>
            {cartCount} item{cartCount > 1 ? 's' : ''} · {rupee(cartTotal)}
          </Button>
          <Button className="flex-1 h-12" disabled={sending} onClick={sendKot}>
            <ChefHat className="w-4 h-4 mr-1" /> {sending ? 'Sending…' : 'Send KOT'}
          </Button>
        </div>
      )}

      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New items for {title}</DialogTitle></DialogHeader>
          {cart.map((l, idx) => (
            <div key={idx} className="flex items-center gap-2 border-b pb-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{l.item.name}{l.variation_name ? ` (${l.variation_name})` : ''}</p>
                {(l.addons.length > 0 || l.note) && <p className="text-xs text-muted-foreground">{[l.addons.map((a) => a.name).join(', '), l.note].filter(Boolean).join(' · ')}</p>}
                <p className="text-xs">{rupee(l.unit * l.qty)}</p>
              </div>
              <button className="h-8 w-8 rounded-full border flex items-center justify-center"
                onClick={() => setCart((c) => c.flatMap((x, i) => (i !== idx ? [x] : x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : [])))}><Minus className="w-3 h-3" /></button>
              <span className="w-5 text-center text-sm">{l.qty}</span>
              <button className="h-8 w-8 rounded-full border flex items-center justify-center"
                onClick={() => setCart((c) => c.map((x, i) => (i === idx ? { ...x, qty: Math.min(99, x.qty + 1) } : x)))}><Plus className="w-3 h-3" /></button>
            </div>
          ))}
          <Button className="h-12" disabled={sending || !cart.length} onClick={sendKot}>
            <ChefHat className="w-4 h-4 mr-1" /> Send KOT · {rupee(cartTotal)}
          </Button>
        </DialogContent>
      </Dialog>

      <ItemOptionsDialog item={picking} groups={menu?.addon_groups ?? []} source={source} onClose={() => setPicking(null)} onAdd={addLine} />

      {order && (
        <SettleDialog open={settling} order={order} bill={menu?.bill ?? { title: '', footer: '', address: '', phone: '', fssai: '', review_url: '' }} tableName={tableName}
          onClose={() => setSettling(false)} onError={onError}
          onDone={(closed) => { setSettling(false); if (closed) onBack(order.id); else loadOrder(); }} />
      )}
    </main>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn('shrink-0 rounded-full px-3 py-1.5 text-sm border', active ? 'bg-primary text-primary-foreground border-primary' : 'bg-white')}>
      {children}
    </button>
  );
}

/* ───────────────────────── Settle bill ───────────────────────── */

function SettleDialog({ open, order, bill, tableName, onClose, onDone, onError }: {
  open: boolean; order: OrderRow; bill: BillSettings; tableName?: string;
  onClose: () => void; onDone: (closed: boolean) => void; onError: (e: unknown) => void;
}) {
  const [paid, setPaid] = useState<OrderRow | null>(null);
  const [discount, setDiscount] = useState('0');
  const [mode, setMode] = useState<PaymentMode>('upi');
  const [cash, setCash] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPaid(null);
    setDiscount(String(order.discount ?? 0)); setName(order.customer_name ?? ''); setPhone(order.customer_phone ?? '');
    setMode(order.source === 'zomato' || order.source === 'swiggy' ? 'online' : 'upi'); setCash('');
    // Only reset when the dialog opens — background refreshes of the order must not wipe the form.
  }, [open, order.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtotal = Number(order.subtotal);
  const disc = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = Math.round((subtotal - disc) * 100) / 100;
  const cashN = Number(cash) || 0;

  async function settle() {
    if (phone && phone.replace(/\D/g, '').length < 10) { toast.error('Enter a 10-digit phone number or leave it blank'); return; }
    setBusy(true);
    try {
      const res = await posApi<{ order: OrderRow }>(`/api/pos/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'settle', payment_mode: mode, discount: disc, customer_name: name, customer_phone: phone,
          cash_amount: mode === 'split' ? cashN : undefined, upi_amount: mode === 'split' ? Math.round((total - cashN) * 100) / 100 : undefined,
        }),
      });
      setPaid(res.order);
    } catch (e) { onError(e); } finally { setBusy(false); }
  }

  async function cancelOrder() {
    const reason = prompt('Reason for cancelling this order?');
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      await posApi(`/api/pos/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'cancel', reason }) });
      toast.success('Order cancelled');
      onDone(true);
    } catch (e) { onError(e); } finally { setBusy(false); }
  }

  const lines = (order.order_items ?? []).filter((l) => l.kot_status !== 'cancelled');

  if (paid) {
    const link = whatsappLink(phone, billText(paid, bill, window.location.origin));
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onDone(true)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bill #{paid.bill_no} paid · {rupee(Number(paid.total))}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{tableName ? `Table ${tableName} is now free.` : 'Order closed.'}</p>
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Customer WhatsApp number" inputMode="numeric"
            value={phone} onChange={(e) => setPhone(e.target.value)} />
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer"
              className="h-12 rounded-md bg-green-600 text-white font-semibold flex items-center justify-center">
              Send bill on WhatsApp
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">Enter a 10-digit number to send the bill on WhatsApp.</p>
          )}
          <Button variant="outline" className="h-12" onClick={() => onDone(true)}>Done</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Bill #{order.bill_no}</DialogTitle></DialogHeader>
        <div className="text-sm space-y-1">
          {lines.map((l) => (
            <div key={l.id} className="flex justify-between gap-2">
              <span>{l.qty} × {l.name}{l.variation_name ? ` (${l.variation_name})` : ''}{l.addons.length ? ` + ${l.addons.map((a) => a.name).join(', ')}` : ''}</span>
              <span>{rupee(Number(l.price) * l.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2 font-medium"><span>Subtotal</span><span>{rupee(subtotal)}</span></div>
          <div className="flex justify-between items-center"><span>Discount ₹</span>
            <input className="w-24 rounded border px-2 py-1 text-right" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{rupee(total)}</span></div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Phone (for review msg)" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div className={cn('grid gap-2', AGGREGATORS_IN_POS || order.source === 'zomato' || order.source === 'swiggy' ? 'grid-cols-4' : 'grid-cols-3')}>
          {((AGGREGATORS_IN_POS || order.source === 'zomato' || order.source === 'swiggy' ? ['cash', 'upi', 'split', 'online'] : ['cash', 'upi', 'split']) as PaymentMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={cn('rounded-lg border py-3 text-sm font-medium capitalize', mode === m ? 'bg-primary text-primary-foreground border-primary' : 'bg-white')}>
              {m === 'online' ? 'Zomato/Swiggy' : m === 'upi' ? 'UPI' : m}
            </button>
          ))}
        </div>
        {mode === 'split' && (
          <div className="flex items-center gap-2 text-sm">
            <span>Cash ₹</span>
            <input className="w-24 rounded border px-2 py-1" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} />
            <span className="text-muted-foreground">UPI {rupee(Math.max(0, total - cashN))}</span>
          </div>
        )}

        <Button className="h-12" disabled={busy || lines.length === 0 || (mode === 'split' && (cashN <= 0 || cashN >= total))} onClick={settle}>
          {busy ? 'Saving…' : `Mark paid · ${rupee(total)}`}
        </Button>
        <button className="text-sm text-red-600" disabled={busy} onClick={cancelOrder}>Cancel whole order</button>
      </DialogContent>
    </Dialog>
  );
}
