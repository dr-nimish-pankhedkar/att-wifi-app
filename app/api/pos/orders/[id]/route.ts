export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosUser, unauthorized } from '@/lib/pos/auth';
import { ORDER_SELECT } from '@/lib/pos/orders';
import { notifyPos } from '@/lib/pos/notify';
import { cleanPhone, earnPoints, maxRedeemPoints, pointsToRupees } from '@/lib/pos/loyalty';
import { getBalance, getLoyaltyConfig, upsertCustomer } from '@/lib/pos/loyaltyServer';
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
 *  { action: 'settle', payment_mode, cash_amount?, upi_amount?, discount?, customer_name?, customer_phone?, redeem_points? }
 *  { action: 'cancel', reason }
 *  { action: 'reopen' }   (admins only, for a settled bill entered wrongly)
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await requirePosUser(request);
  if (!actor) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body?.action) return bad('action is required');

  const supabase = createAdminClient();
  const { data: order } = await supabase.from('orders').select('id, status, total, customer_id, customer_phone, customer_name').eq('id', params.id).maybeSingle();
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
    Object.assign(patch, { status: 'open', settled_at: null, settled_by: null, payment_mode: null, cash_amount: 0, upi_amount: 0, loyalty_redeemed: 0, loyalty_earned: 0 });
    // Undo the points this bill earned/used, and its visit.
    await supabase.from('loyalty_ledger').delete().eq('order_id', order.id);
    if (order.customer_id) {
      const { data: c } = await supabase.from('customers').select('visits, total_spent').eq('id', order.customer_id).single();
      if (c) await supabase.from('customers').update({ visits: Math.max(0, c.visits - 1), total_spent: Math.max(0, Number(c.total_spent) - Number(order.total)) }).eq('id', order.customer_id);
    }
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
      Object.assign(patch, { status: 'cancelled', cancel_reason: body.reason.toString().slice(0, 200), cancelled_by: actor.staffId });
      await supabase.from('order_items').update({ kot_status: 'cancelled' }).eq('order_id', order.id).in('kot_status', ['new', 'preparing', 'ready']);
    }
  }

  // Customer + loyalty (settle only): link the customer by phone and apply any points used.
  const loyaltyCfg = body.action === 'settle' ? await getLoyaltyConfig(supabase) : null;
  let customerId: string | null = order.customer_id ?? null;
  let redeemPoints = 0;
  if (body.action === 'settle') {
    const rawPhone = body.customer_phone !== undefined ? body.customer_phone : order.customer_phone;
    const phone = cleanPhone(rawPhone);
    if (rawPhone && rawPhone.toString().replace(/\D/g, '') && !phone) return bad('Enter a valid 10-digit mobile number, or leave it blank');
    customerId = phone ? await upsertCustomer(supabase, phone, body.customer_name ?? order.customer_name) : null;
    patch.customer_id = customerId;
    if (phone) patch.customer_phone = phone;
    redeemPoints = Math.floor(Number(body.redeem_points) || 0);
    patch.loyalty_redeemed = 0;
  }

  if (Object.keys(patch).length) {
    const { error } = await supabase.from('orders').update(patch).eq('id', order.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.action === 'settle' && redeemPoints > 0) {
    if (!customerId || !loyaltyCfg) return bad('Add the customer’s phone number to use points');
    const { data: o } = await supabase.from('orders').select('subtotal, discount').eq('id', order.id).single();
    const balance = await getBalance(supabase, customerId);
    const max = maxRedeemPoints(loyaltyCfg, Number(o?.subtotal ?? 0), Number(o?.discount ?? 0), balance);
    if (redeemPoints > max) return bad(max > 0 ? `Only ${max} points can be used on this bill` : 'Points can’t be used on this bill');
    await supabase.from('orders').update({ loyalty_redeemed: pointsToRupees(loyaltyCfg, redeemPoints) }).eq('id', order.id);
  }

  const { data: t } = await supabase.from('orders').select('subtotal, discount, total').eq('id', order.id).single();
  const totals = { subtotal: Number(t?.subtotal ?? 0), discount: Number(t?.discount ?? 0), total: Number(t?.total ?? 0) };
  let loyaltyResult: { name: string; earned: number; redeemed: number; balance: number } | null = null;

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
      .update({ status: 'settled', payment_mode: mode, cash_amount: cash, upi_amount: upi, settled_at: new Date().toISOString(), settled_by: actor.staffId })
      .eq('id', order.id).eq('status', 'open');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Anything still on the kitchen board for a paid bill is treated as served.
    await supabase.from('order_items').update({ kot_status: 'served' }).eq('order_id', order.id).in('kot_status', ['new', 'preparing', 'ready']);

    if (customerId && loyaltyCfg) {
      const earned = earnPoints(loyaltyCfg, totals);
      const rows = [];
      if (redeemPoints > 0) rows.push({ customer_id: customerId, order_id: order.id, kind: 'redeem', points: -redeemPoints });
      if (earned > 0) rows.push({
        customer_id: customerId, order_id: order.id, kind: 'earn', points: earned,
        expires_at: loyaltyCfg.expiry_days > 0 ? new Date(Date.now() + loyaltyCfg.expiry_days * 86400_000).toISOString() : null,
      });
      if (rows.length) await supabase.from('loyalty_ledger').insert(rows);
      if (earned > 0) await supabase.from('orders').update({ loyalty_earned: earned }).eq('id', order.id);
      const { data: c } = await supabase.from('customers').select('visits, total_spent').eq('id', customerId).single();
      await supabase.from('customers').update({
        visits: (c?.visits ?? 0) + 1, total_spent: Number(c?.total_spent ?? 0) + totals.total, last_visit_at: new Date().toISOString(),
      }).eq('id', customerId);
      if (loyaltyCfg.enabled) {
        loyaltyResult = { name: loyaltyCfg.name, earned, redeemed: redeemPoints, balance: await getBalance(supabase, customerId) };
      }
    }
  }

  const [{ data: fresh }] = await Promise.all([
    supabase.from('orders').select(ORDER_SELECT).eq('id', order.id).single(),
    notifyPos('order'),
  ]);
  return NextResponse.json({ order: fresh, loyalty: loyaltyResult });
}
