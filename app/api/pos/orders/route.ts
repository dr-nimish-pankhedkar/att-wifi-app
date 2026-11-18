export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosUser, unauthorized } from '@/lib/pos/auth';
import { loadMenu, priceLines } from '@/lib/pos/menu';
import { ORDER_SELECT, recalcOrder } from '@/lib/pos/orders';
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

  if (body.client_id) {
    const { data: existing } = await supabase.from('orders').select(ORDER_SELECT).eq('client_id', body.client_id).maybeSingle();
    if (existing) return NextResponse.json({ order: existing, duplicate: true });
  }

  let priced;
  try {
    priced = priceLines(await loadMenu(supabase), lines);
  } catch (e) {
    return bad((e as Error).message);
  }

  let orderId: string | null = null;
  let round = 1;
  if (body.order_id || source === 'dine_in') {
    // Add-on round: to the given order, or to whatever is open on this table.
    const base = supabase.from('orders').select('id').eq('status', 'open');
    const { data: open } = await (body.order_id ? base.eq('id', body.order_id) : base.eq('table_id', body.table_id)).maybeSingle();
    if (body.order_id && !open) return bad('This bill is already closed');
    if (open) {
      orderId = open.id;
      const { data: last } = await supabase
        .from('order_items').select('kot_round').eq('order_id', open.id)
        .order('kot_round', { ascending: false }).limit(1).maybeSingle();
      round = (last?.kot_round ?? 0) + 1;
    }
  }

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

  await recalcOrder(supabase, orderId!);
  const { data: order } = await supabase.from('orders').select(ORDER_SELECT).eq('id', orderId!).single();
  return NextResponse.json({ order }, { status: 201 });
}
