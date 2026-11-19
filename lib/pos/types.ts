/** Realtime channel used to ping POS screens to refresh (carries no data). */
export const POS_CHANNEL = 'pos-events';

/**
 * Punching Zomato/Swiggy orders into the POS is switched off: aggregator orders are handled in
 * their own apps (true revenue depends on commission, ads and offers). Planned: import them from
 * the aggregators' emailed reports instead. Flip to true to show the buttons, online prices and payment mode again.
 */
export const AGGREGATORS_IN_POS = false;

export type OrderSource = 'dine_in' | 'takeaway' | 'zomato' | 'swiggy';
export type KotStatus = 'new' | 'preparing' | 'ready' | 'served' | 'cancelled';
export type PaymentMode = 'cash' | 'upi' | 'split' | 'online';

export const SOURCE_LABEL: Record<OrderSource, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  zomato: 'Zomato',
  swiggy: 'Swiggy',
};

export interface Variation { id: string; group_name: string; name: string; price: number; sort_order: number; active: boolean }
export interface AddonOption { id: string; name: string; price: number; sort_order: number; active: boolean }
export interface AddonGroup { id: string; name: string; min_select: number; max_select: number; sort_order: number; active: boolean; options: AddonOption[] }
export interface MenuItem {
  id: string; category_id: string | null; name: string; price: number; short_code: string | null;
  description: string | null; food_type: 'veg' | 'nonveg' | 'egg'; sort_order: number;
  active: boolean; in_stock: boolean;
  variations: Variation[]; addon_group_ids: string[];
  /** Channel price overrides; missing = dine-in price. */
  channel_prices: ChannelPrice[];
}
export type PriceChannel = 'takeaway' | 'zomato' | 'swiggy';
export const PRICE_CHANNELS: PriceChannel[] = ['zomato', 'swiggy', 'takeaway'];
export interface ChannelPrice { source: PriceChannel; variation_id: string | null; price: number }

/** Price of an item (or one of its options) for an order channel. */
export function channelPrice(item: MenuItem, source: OrderSource, variationId: string | null): number {
  const base = item.variations.length ? item.variations.find((v) => v.id === variationId)?.price ?? item.price : item.price;
  if (source === 'dine_in') return base;
  const o = item.channel_prices?.find((c) => c.source === source && (c.variation_id ?? null) === (item.variations.length ? variationId : null));
  return o ? o.price : base;
}

/** Lowest price shown on the item tile for a channel. */
export function fromPrice(item: MenuItem, source: OrderSource): number {
  if (!item.variations.length) return channelPrice(item, source, null);
  return Math.min(...item.variations.map((v) => channelPrice(item, source, v.id)));
}
export interface Category { id: string; name: string; sort_order: number; active: boolean }
export interface BillSettings { title: string; footer: string; address: string; phone: string; fssai: string; review_url: string }
export interface Menu { categories: Category[]; items: MenuItem[]; addon_groups: AddonGroup[]; bill: BillSettings }

export interface Area { id: string; name: string; sort_order: number; active: boolean }
export interface PosTable { id: string; name: string; area_id: string | null; seats: number; sort_order: number; active: boolean }

export interface CartLineInput {
  client_id: string;
  menu_item_id: string;
  variation_id?: string | null;
  addon_option_ids?: string[];
  qty: number;
  note?: string | null;
}

export interface OrderItemRow {
  id: string; order_id: string; menu_item_id: string | null; name: string; variation_name: string | null;
  addons: { id: string; name: string; price: number }[]; price: number; qty: number; note: string | null;
  kot_round: number; kot_status: KotStatus; created_at: string; updated_at: string;
}

export interface OrderRow {
  id: string; bill_no: number; source: OrderSource; table_id: string | null; status: 'open' | 'settled' | 'cancelled';
  customer_name: string | null; customer_phone: string | null; subtotal: number; discount: number; total: number;
  payment_mode: PaymentMode | null; cash_amount: number; upi_amount: number; notes: string | null;
  created_at: string; settled_at: string | null; captain_id: string | null;
  public_token?: string; customer_id?: string | null; loyalty_redeemed?: number; loyalty_earned?: number; feedback_rating?: 'loved' | 'okay' | 'improve' | null; feedback_comment?: string | null;
  order_items?: OrderItemRow[];
}

export const rupee = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
