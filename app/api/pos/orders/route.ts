export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosUser, unauthorized } from '@/lib/pos/auth';
import { loadMenuCached, priceLines } from '@/lib/pos/menu';
import { ORDER_SELECT } from '@/lib/pos/orders';
import { notifyPos } from '@/lib/pos/notify';
import type { CartLineInput, OrderSource } from '@/lib/pos/types';

const SOURCES: OrderSource[] = ['dine_in', 'takeaway', 'zomato', 'swiggy'];

/** GET ?status=open | ?date=YYYY-MM-DD (IST day) */
export async function GET(request: NextRequest) {
  const actor = await requirePosUser(request);
  if (!actor) return unauthorized();
  const sp = request.nextUrl.searchParams;
  const supabase = createAdminClient();
  let q = supabase.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false }).limit(300);

  const status = sp.get('status');
  if (status) q = q.eq('status', status);
  const date = sp.get('date');
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    q = q.gte('created_at', `${date}T00:00:00+05:30`).lte('created_at', `${date}T23:59:59.999+05:30`);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data });
}

/**
 * POST — create an order and send its first KOT.
 * Idempotent on client_id so offline devices can safely retry.
 * If the table already has an open order, the lines are added to it as a new KOT round.
 */
export async function POST(request: NextRequest) {
  const actor = await requirePosUser(request);
  if (!actor) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body) return bad('Invalid body');

  const source: OrderSource = SOURCES.includes(body.source) ? body.source : 'dine_in';
  const lines: CartLineInput[] = Array.isArray(body.items) ? body.items : [];
  if (lines.length === 0) return bad('Add at least one item');
  if (source === 'dine_in' && !body.table_id && !body.order_id) return bad('Choose a table');

  const supabase = createAdminClient();

  // Independent lookups in parallel: retry check, menu (cached), open order on the table.
  const wantsOpen = body.order_id || source === 'dine_in';
  const openQuery = supabase.from('orders').select('id, source, order_items(kot_round)').eq('status', 'open');
  const [existingRes, menuRes, openRes] = await Promise.all([
    body.client_id ? supabase.from('orders').select(ORDER_SELECT).eq('client_id', body.client_id).maybeSingle() : Promise.resolve({ data: null }),
    loadMenuCached(supabase).then((m) => ({ m }), (e: Error) => ({ e })),
    wantsOpen ? (body.order_id ? openQuery.eq('id', body.order_id) : openQuery.eq('table_id', body.table_id)).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (existingRes.data) return NextResponse.json({ order: existingRes.data, duplicate: true });
  if ('e' in menuRes) return NextResponse.json({ error: menuRes.e.message }, { status: 500 });

  const open = openRes.data as { id: string; source: OrderSource; order_items: { kot_round: number }[] } | null;
  if (body.order_id && !open) return bad('This bill is already closed');

  // Price by channel: an add-on round keeps the original order's channel (e.g. Zomato prices).
  let priced;
  try {
    priced = priceLines(menuRes.m, lines, open?.source ?? source);
  } catch (e) {
    return bad((e as Error).message);
  }
  let orderId: string | null = open?.id ?? null;
  // Add-on round: next KOT number on the open order.
  const round = open ? Math.max(0, ...open.order_items.map((i) => i.kot_round)) + 1 : 1;

  if (!orderId) {
    const { data: created, error } = await supabase
      .from('orders')
      .insert({
        client_id: body.client_id ?? null,
        source,
        table_id: source === 'dine_in' ? body.table_id : null,
        customer_name: body.customer_name?.toString().slice(0, 80) || null,
        customer_phone: body.customer_phone?.toString().replace(/\D/g, '').slice(-10) || null,
        notes: body.notes?.toString().slice(0, 300) || null,
        captain_id: actor.staffId,
      })
      .select('id')
      .single();
    if (error) {
      // Lost a race with a retry of the same client_id
      if (error.code === '23505' && body.client_id) {
        const { data: dup } = await supabase.from('orders').select(ORDER_SELECT).eq('client_id', body.client_id).single();
        return NextResponse.json({ order: dup, duplicate: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    orderId = created.id;
  }

  const { error: itemErr } = await supabase
    .from('order_items')
    .upsert(priced.map((p) => ({ ...p, order_id: orderId, kot_round: round })), { onConflict: 'client_id', ignoreDuplicates: true });
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });

  const [{ data: order }] = await Promise.all([
    supabase.from('orders').select(ORDER_SELECT).eq('id', orderId!).single(),
    notifyPos('order'),
  ]);
  return NextResponse.json({ order }, { status: 201 });
}
