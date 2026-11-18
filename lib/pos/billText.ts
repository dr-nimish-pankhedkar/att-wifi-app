import type { BillSettings, OrderRow } from './types';

const r = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const billUrl = (origin: string, token: string) => `${origin.replace(/\/$/, '')}/b/${token}`;

/** Short WhatsApp message with a link to the full bill page (which has the invoice, PDF and feedback). */
export function billText(order: OrderRow, bill: BillSettings, origin: string): string {
  const when = new Date(order.settled_at ?? order.created_at).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const name = bill.title || 'us';
  const out = [
    order.customer_name ? `Dear ${order.customer_name},` : 'Hello!',
    '',
    `Thank you for visiting *${name}*! Your bill is ready 🧾`,
    '',
    `💰 Amount: *${r(Number(order.total))}*`,
    `📅 ${when} · Bill #${order.bill_no}`,
  ];
  if (order.public_token) out.push(`🔗 View bill: ${billUrl(origin, order.public_token)}`);
  if (order.public_token) out.push('', 'How was your visit? Tap the link to tell us ⭐');
  if (bill.footer.trim()) out.push('', bill.footer.trim());
  return out.join('\n').trim();
}

/** wa.me link for an Indian 10-digit number (or a number that already has a country code). */
export function whatsappLink(phone: string, text: string): string | null {
  const d = phone.replace(/\D/g, '');
  const full = d.length === 10 ? `91${d}` : d.length >= 11 && d.length <= 15 ? d : null;
  return full ? `https://wa.me/${full}?text=${encodeURIComponent(text)}` : null;
}
