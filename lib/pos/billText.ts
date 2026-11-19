import type { BillSettings, OrderRow } from './types';

const r = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const billUrl = (origin: string, token: string) => `${origin.replace(/\/$/, '')}/b/${token}`;

/**
 * WhatsApp message: Google review ask first (most customers never open links further down),
 * then a compact bill summary with the link to the full bill.
 */
export function billText(order: OrderRow, bill: BillSettings, origin: string, loyalty?: { name: string; earned: number; balance: number } | null): string {
  const when = new Date(order.settled_at ?? order.created_at).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const name = bill.title || 'us';
  const out = [
    order.customer_name ? `Hi ${order.customer_name.split(' ')[0]}! 👋` : 'Hi there! 👋',
    `Thank you for visiting *${name}* 🙏`,
  ];
  if (bill.review_url) {
    out.push(
      '',
      '⭐⭐⭐⭐⭐',
      '*Enjoyed your visit? Please rate us on Google!*',
      'It takes just 10 seconds and helps a small café like ours more than you know 💛',
      `👉 ${bill.review_url}`,
    );
  }
  out.push('', `🧾 *Bill #${order.bill_no}* · ${r(Number(order.total))} · ${when}`);
  if (Number(order.loyalty_redeemed) > 0) out.push(`🎁 ${r(Number(order.loyalty_redeemed))} paid with points`);
  if (order.public_token) out.push(`View bill: ${billUrl(origin, order.public_token)}`);
  if (loyalty && (loyalty.earned > 0 || loyalty.balance > 0)) {
    out.push('', `💛 *${loyalty.name}*${loyalty.earned > 0 ? `: you earned *${loyalty.earned} points* today` : ''}`, `Balance: *${loyalty.balance} points* — use them on your next visit!`);
  }
  if (bill.footer.trim()) out.push('', bill.footer.trim());
  return out.join('\n').trim();
}

/** wa.me link for an Indian 10-digit number (or a number that already has a country code). */
export function whatsappLink(phone: string, text: string): string | null {
  const d = phone.replace(/\D/g, '');
  const full = d.length === 10 ? `91${d}` : d.length >= 11 && d.length <= 15 ? d : null;
  return full ? `https://wa.me/${full}?text=${encodeURIComponent(text)}` : null;
}
