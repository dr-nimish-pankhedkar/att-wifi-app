import type { SupabaseClient } from '@supabase/supabase-js';

/** Recompute subtotal/total from non-cancelled lines. */
export async function recalcOrder(supabase: SupabaseClient, orderId: string) {
  const { data: lines } = await supabase
    .from('order_items')
    .select('price, qty, kot_status')
    .eq('order_id', orderId);
  const subtotal = (lines ?? [])
    .filter((l) => l.kot_status !== 'cancelled')
    .reduce((s, l) => s + Number(l.price) * l.qty, 0);
  const { data: order } = await supabase.from('orders').select('discount').eq('id', orderId).single();
  const discount = Math.min(Number(order?.discount ?? 0), subtotal);
  const total = Math.round((subtotal - discount) * 100) / 100;
  await supabase.from('orders').update({ subtotal, total, discount }).eq('id', orderId);
  return { subtotal, discount, total };
}

export const ORDER_SELECT =
  'id, bill_no, source, table_id, status, customer_name, customer_phone, subtotal, discount, total, payment_mode, cash_amount, upi_amount, notes, created_at, settled_at, captain_id, public_token, feedback_rating, feedback_comment, ' +
  'order_items(id, order_id, menu_item_id, name, variation_name, addons, price, qty, note, kot_round, kot_status, created_at, updated_at)';
