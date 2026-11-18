export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosUser, unauthorized } from '@/lib/pos/auth';
import { ORDER_SELECT } from '@/lib/pos/orders';
import { notifyPos } from '@/lib/pos/notify';
import type { PaymentMode } from '@/lib/pos/types';

const MODES: PaymentMode[] = ['cash', 'upi', 'split', 'online'];

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requirePosUser(request))) return unauthorized();
  const { data, error } = await createAdminClient().from('orders').select(ORDER_SELECT).eq('id', params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return bad('Order not found', 404);
  return NextResponse.json({ order: data });
}

/**
 * PATCH actions:
 *  { action: 'update', customer_name?, customer_phone?, discount?, table_id?, notes? }
 *  { action: 'settle', payment_mode, cash_amount?, upi_amount?, discount?, customer_name?, customer_phone? }
 *  { action: 'cancel', reason }
 *  { action: 'reopen' }   (admins only, for a settled bill entered wrongly)
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await requirePosUser(request);
  if (!actor) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body?.action) return bad('action is required');

  const supabase = createAdminClient();
  const { data: order } = await supabase.from('orders').select('id, status').eq('id', params.id).maybeSingle();
  if (!order) return bad('Order not found', 404);

  const patch: Record<string, unknown> = {};
  if (body.customer_name !== undefined) patch.customer_name = body.customer_name?.toString().slice(0, 80) || null;
  if (body.customer_phone !== undefined) patch.customer_phone = body.customer_phone?.toString().replace(/\D/g, '').slice(-10) || null;
  if (body.notes !== undefined) patch.notes = body.notes?.toString().slice(0, 300) || null;
  if (body.discount !== undefined) {
    const d = Number(body.discount);
    if (!(d >= 0)) return bad('Invalid discount');
    patch.discount = d;
  }

  if (body.action === 'reopen') {
    if (!actor.isAdmin) return bad('Only an admin can reopen a bill', 403);
    if (order.status !== 'settled') return bad('Only settled bills can be reopened');
    Object.assign(patch, { status: 'open', settled_at: null, payment_mode: null, cash_amount: 0, upi_amount: 0 });
  } else {
    if (order.status !== 'open') return bad('This bill is already closed');

    if (body.action === 'update' && body.table_id) {
      const { data: busy } = await supabase.from('orders').select('id').eq('status', 'open').eq('table_id', body.table_id).neq('id', order.id).maybeSingle();
      if (busy) return bad('That table already has an open order');
      patch.table_id = body.table_id;
      patch.source = 'dine_in';
    }

    if (body.action === 'cancel') {
      if (!body.reason?.toString().trim()) return bad('Give a reason for cancelling');
      Object.assign(patch, { status: 'cancelled', cancel_reason: body.reason.toString().slice(0, 200) });
      await supabase.from('order_items').update({ kot_status: 'cancelled' }).eq('order_id', order.id).in('kot_status', ['new', 'preparing', 'ready']);
    }
  }

  if (Object.keys(patch).length) {
    const { error } = await supabase.from('orders').update(patch).eq('id', order.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data: t } = await supabase.from('orders').select('subtotal, total').eq('id', order.id).single();
  const totals = { subtotal: Number(t?.subtotal ?? 0), total: Number(t?.total ?? 0) };

  if (body.action === 'settle') {
    const mode: PaymentMode = body.payment_mode;
    if (!MODES.includes(mode)) return bad('Choose a payment mode');
    if (totals.subtotal <= 0) return bad('Bill has no items');
    let cash = 0, upi = 0;
    if (mode === 'cash') cash = totals.total;
    else if (mode === 'upi') upi = totals.total;
    else if (mode === 'split') {
      cash = Number(body.cash_amount) || 0;
      upi = Number(body.upi_amount) || 0;
      if (Math.abs(cash + upi - totals.total) > 0.01) return bad(`Cash + UPI must equal ${totals.total}`);
    }
    const { error } = await supabase
      .from('orders')
      .update({ status: 'settled', payment_mode: mode, cash_amount: cash, upi_amount: upi, settled_at: new Date().toISOString() })
      .eq('id', order.id).eq('status', 'open');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Anything still on the kitchen board for a paid bill is treated as served.
    await supabase.from('order_items').update({ kot_status: 'served' }).eq('order_id', order.id).in('kot_status', ['new', 'preparing', 'ready']);
  }

  const [{ data: fresh }] = await Promise.all([
    supabase.from('orders').select(ORDER_SELECT).eq('id', order.id).single(),
    notifyPos('order'),
  ]);
  return NextResponse.json({ order: fresh });
}
