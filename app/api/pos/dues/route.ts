export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosUser, unauthorized } from '@/lib/pos/auth';
import { notifyPos } from '@/lib/pos/notify';
import { earnPoints } from '@/lib/pos/loyalty';
import { getLoyaltyConfig } from '@/lib/pos/loyaltyServer';

const SELECT = 'id, bill_no, customer_id, customer_name, customer_phone, subtotal, discount, total, settled_at, due_paid_at, due_paid_mode, pos_tables(name), settled_by_profile:profiles!settled_by(name), due_paid_by_profile:profiles!due_paid_by(name)';

/** GET — unpaid due bills (oldest first) + dues collected today. Visible to all staff. */
export async function GET(request: NextRequest) {
  if (!(await requirePosUser(request))) return unauthorized();
  const supabase = createAdminClient();
  const todayIst = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
  const startOfToday = new Date(`${todayIst}T00:00:00+05:30`).toISOString();
  const [open, collected] = await Promise.all([
    supabase.from('orders').select(SELECT).eq('status', 'settled').eq('payment_mode', 'due').is('due_paid_at', null).order('settled_at'),
    supabase.from('orders').select(SELECT).eq('payment_mode', 'due').gte('due_paid_at', startOfToday).order('due_paid_at', { ascending: false }),
  ]);
  if (open.error) return NextResponse.json({ error: open.error.message }, { status: 500 });
  return NextResponse.json({ dues: open.data ?? [], collected_today: collected.data ?? [] });
}

/** POST { order_id, mode: 'cash'|'upi' } — customer paid their due. */
export async function POST(request: NextRequest) {
  const actor = await requirePosUser(request);
  if (!actor) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body?.order_id || !['cash', 'upi'].includes(body.mode)) return bad('Choose cash or UPI');
  const supabase = createAdminClient();
  const { data: o } = await supabase.from('orders').select('id, customer_id, subtotal, discount, total, payment_mode, due_paid_at, status')
    .eq('id', body.order_id).maybeSingle();
  if (!o || o.status !== 'settled' || o.payment_mode !== 'due') return bad('Due bill not found', 404);
  if (o.due_paid_at) return bad('This due is already marked paid');
  const total = Number(o.total);
  const { data: updated, error } = await supabase.from('orders').update({
    due_paid_at: new Date().toISOString(), due_paid_mode: body.mode, due_paid_by: actor.staffId,
    cash_amount: body.mode === 'cash' ? total : 0, upi_amount: body.mode === 'upi' ? total : 0,
  }).eq('id', o.id).is('due_paid_at', null).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated?.length) return bad('This due is already marked paid');

  // Loyalty points for a due bill are earned when it is actually paid.
  if (o.customer_id) {
    const cfg = await getLoyaltyConfig(supabase);
    const earned = earnPoints(cfg, { subtotal: Number(o.subtotal), discount: Number(o.discount), total });
    if (earned > 0) {
      await supabase.from('loyalty_ledger').insert({
        customer_id: o.customer_id, order_id: o.id, kind: 'earn', points: earned,
        expires_at: cfg.expiry_days > 0 ? new Date(Date.now() + cfg.expiry_days * 86400_000).toISOString() : null,
      });
      await supabase.from('orders').update({ loyalty_earned: earned }).eq('id', o.id);
    }
  }
  await notifyPos('order');
  return NextResponse.json({ ok: true });
}
