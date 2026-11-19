/** Loyalty rules — shared by the server (authoritative) and the captain app (preview). */

export interface LoyaltyConfig {
  enabled: boolean;
  name: string;                        // shown to staff/customers, e.g. "cafe tan 90° circle"
  // Earning
  earn_percent: number;                // % of the basis given as points
  earn_basis: 'core' | 'total' | 'core_minus_discount';
  min_order: number;                   // ₹, 0 = none
  max_points_per_order: number;        // 0 = no cap
  expiry_days: number;                 // 0 = never expire
  skip_discounted: boolean;            // no points when a manual discount was given
  // Redeeming
  redeem_enabled: boolean;
  redeem_mode: 'percent' | 'fixed';    // limit per bill: % of the items total, or a fixed ₹
  redeem_value: number;
  redeem_min_core: number;             // bill must be at least this (items total) to redeem
  redeem_max_points: number;           // 0 = no cap
  points_per_rupee: number;            // redeem ratio: N points = ₹1
}

export const DEFAULT_LOYALTY: LoyaltyConfig = {
  enabled: true, name: 'Loyalty',
  earn_percent: 10, earn_basis: 'core', min_order: 0, max_points_per_order: 0, expiry_days: 0, skip_discounted: true,
  redeem_enabled: true, redeem_mode: 'percent', redeem_value: 10, redeem_min_core: 200, redeem_max_points: 100, points_per_rupee: 1,
};

export function normaliseLoyalty(raw: unknown): LoyaltyConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<LoyaltyConfig>;
  const num = (v: unknown, d: number, min = 0) => (Number.isFinite(Number(v)) && Number(v) >= min ? Number(v) : d);
  return {
    enabled: r.enabled ?? DEFAULT_LOYALTY.enabled,
    name: (r.name ?? DEFAULT_LOYALTY.name).toString().slice(0, 60) || DEFAULT_LOYALTY.name,
    earn_percent: Math.min(100, num(r.earn_percent, DEFAULT_LOYALTY.earn_percent)),
    earn_basis: ['core', 'total', 'core_minus_discount'].includes(r.earn_basis as string) ? r.earn_basis! : DEFAULT_LOYALTY.earn_basis,
    min_order: num(r.min_order, 0),
    max_points_per_order: num(r.max_points_per_order, 0),
    expiry_days: Math.floor(num(r.expiry_days, 0)),
    skip_discounted: r.skip_discounted ?? DEFAULT_LOYALTY.skip_discounted,
    redeem_enabled: r.redeem_enabled ?? DEFAULT_LOYALTY.redeem_enabled,
    redeem_mode: r.redeem_mode === 'fixed' ? 'fixed' : 'percent',
    redeem_value: num(r.redeem_value, DEFAULT_LOYALTY.redeem_value),
    redeem_min_core: num(r.redeem_min_core, DEFAULT_LOYALTY.redeem_min_core),
    redeem_max_points: num(r.redeem_max_points, DEFAULT_LOYALTY.redeem_max_points),
    points_per_rupee: num(r.points_per_rupee, 1, 0.01) || 1,
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Most points a customer may use on this bill (whole points). */
export function maxRedeemPoints(c: LoyaltyConfig, subtotal: number, discount: number, balance: number): number {
  if (!c.enabled || !c.redeem_enabled || balance <= 0) return 0;
  if (subtotal < c.redeem_min_core) return 0;
  const rupeeCap = c.redeem_mode === 'percent' ? (subtotal * c.redeem_value) / 100 : c.redeem_value;
  let pts = Math.min(rupeeCap * c.points_per_rupee, balance, (subtotal - discount) * c.points_per_rupee);
  if (c.redeem_max_points > 0) pts = Math.min(pts, c.redeem_max_points);
  return Math.max(0, Math.floor(pts));
}

export const pointsToRupees = (c: LoyaltyConfig, pts: number) => r2(pts / c.points_per_rupee);

/** Points earned on a paid bill. */
export function earnPoints(c: LoyaltyConfig, o: { subtotal: number; discount: number; total: number }): number {
  if (!c.enabled || c.earn_percent <= 0) return 0;
  if (c.skip_discounted && o.discount > 0) return 0;
  const basis = c.earn_basis === 'total' ? o.total : c.earn_basis === 'core_minus_discount' ? o.subtotal - o.discount : o.subtotal;
  if (basis <= 0 || basis < c.min_order) return 0;
  let pts = Math.round(((basis * c.earn_percent) / 100) * 10) / 10;
  if (c.max_points_per_order > 0) pts = Math.min(pts, c.max_points_per_order);
  return pts;
}

export const cleanPhone = (p: unknown) => {
  const d = (p ?? '').toString().replace(/\D/g, '');
  const ten = d.length > 10 ? d.slice(-10) : d;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
};
