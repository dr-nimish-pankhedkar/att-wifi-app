import { SOURCE_LABEL, type BillSettings, type OrderRow } from './types';

const r = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const PAY: Record<string, string> = { cash: 'Cash', upi: 'UPI', split: 'Cash + UPI', online: 'Online' };

/** Plain-text bill for WhatsApp (uses *bold*). */
export function billText(order: OrderRow, bill: BillSettings, tableName?: string | null): string {
  const when = new Date(order.settled_at ?? order.created_at).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const lines = (order.order_items ?? []).filter((l) => l.kot_status !== 'cancelled').map((l) => {
    const extra = [l.variation_name, ...l.addons.map((a) => a.name)].filter(Boolean).join(', ');
    return `${l.qty} × ${l.name}${extra ? ` (${extra})` : ''} — ${r(Number(l.price) * l.qty)}`;
  });
  const out = [
    bill.title ? `*${bill.title}*` : '',
    `Bill #${order.bill_no} · ${when}`,
    tableName ? `Table ${tableName}` : SOURCE_LABEL[order.source],
    order.customer_name ? `Hi ${order.customer_name}!` : '',
    '',
    ...lines,
    '──────────',
  ];
  if (Number(order.discount) > 0) {
    out.push(`Subtotal ${r(Number(order.subtotal))}`, `Discount −${r(Number(order.discount))}`);
  }
  out.push(`*Total ${r(Number(order.total))}*${order.payment_mode ? ` · Paid by ${PAY[order.payment_mode]}` : ''}`);
  if (bill.footer.trim()) out.push('', bill.footer.trim());
  return out.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n').trim();
}

/** wa.me link for an Indian 10-digit number (or a number that already has a country code). */
export function whatsappLink(phone: string, text: string): string | null {
  const d = phone.replace(/\D/g, '');
  const full = d.length === 10 ? `91${d}` : d.length >= 11 && d.length <= 15 ? d : null;
  return full ? `https://wa.me/${full}?text=${encodeURIComponent(text)}` : null;
}
