// Order subtotal/total are maintained by database triggers (see supabase/pos-order-totals.sql).

export const ORDER_SELECT =
  'id, bill_no, source, table_id, status, customer_name, customer_phone, subtotal, discount, total, payment_mode, cash_amount, upi_amount, notes, created_at, settled_at, captain_id, public_token, feedback_rating, feedback_comment, customer_id, loyalty_redeemed, loyalty_earned, ' +
  'order_items(id, order_id, menu_item_id, name, variation_name, addons, price, qty, note, kot_round, kot_status, created_at, updated_at)';
