export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import BillActions from './BillActions';

export const metadata: Metadata = { title: 'Your bill', robots: { index: false, follow: false } };

const r = (n: number) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TYPE: Record<string, string> = { dine_in: 'Dine-in', takeaway: 'Takeaway', zomato: 'Zomato', swiggy: 'Swiggy' };
const PAY: Record<string, string> = { cash: 'Cash', upi: 'UPI', split: 'Cash + UPI', online: 'Online (aggregator)' };

interface Line { id: string; name: string; variation_name: string | null; addons: { name: string; price: number }[]; price: number; qty: number; kot_status: string; created_at: string }

/** Public, read-only bill page sent to customers on WhatsApp. Unguessable token; no customer phone shown. */
export default async function BillPage({ params }: { params: { token: string } }) {
  if (!/^[0-9a-f]{16}$/.test(params.token)) notFound();
  const supabase = createAdminClient();
  const [{ data: o }, { data: st }] = await Promise.all([
    supabase.from('orders')
      .select('bill_no, source, status, customer_name, subtotal, discount, loyalty_redeemed, loyalty_earned, total, payment_mode, created_at, settled_at, feedback_rating, pos_tables(name), profiles!captain_id(name), order_items(id, name, variation_name, addons, price, qty, kot_status, created_at)')
      .eq('public_token', params.token).maybeSingle(),
    supabase.from('settings').select('company_name, bill_title, bill_address, bill_phone, bill_fssai, review_url').limit(1).maybeSingle(),
  ]);
  if (!o || o.status === 'cancelled') notFound();

  const lines = ((o.order_items ?? []) as Line[])
    .filter((l) => l.kot_status !== 'cancelled')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const qty = lines.reduce((s, l) => s + l.qty, 0);
  const title = st?.bill_title || st?.company_name || 'Bill';
  const when = new Date(o.settled_at ?? o.created_at).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const table = (o.pos_tables as unknown as { name: string } | null)?.name;
  const biller = (o.profiles as unknown as { name: string } | null)?.name;

  return (
    <main className="min-h-screen bg-stone-100 py-6 px-3 print:bg-white print:p-0">
      <div className="mx-auto max-w-md bg-white rounded-2xl shadow-sm p-5 print:shadow-none print:rounded-none">
        <header className="text-center border-b pb-4">
          <h1 className="text-2xl font-bold">{title}</h1>
          {st?.bill_address && <p className="text-xs text-stone-500 mt-1">{st.bill_address}</p>}
          {st?.bill_phone && <p className="text-xs text-stone-500">Ph: {st.bill_phone}</p>}
        </header>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 py-4 text-sm border-b">
          <div><dt className="text-stone-500 text-xs">Bill no.</dt><dd className="font-medium">#{o.bill_no}</dd></div>
          <div><dt className="text-stone-500 text-xs">Date</dt><dd className="font-medium">{when}</dd></div>
          <div><dt className="text-stone-500 text-xs">Order type</dt><dd className="font-medium">{TYPE[o.source]}{table ? ` · Table ${table}` : ''}</dd></div>
          {biller && <div><dt className="text-stone-500 text-xs">Served by</dt><dd className="font-medium">{biller}</dd></div>}
          {o.customer_name && <div className="col-span-2"><dt className="text-stone-500 text-xs">Customer</dt><dd className="font-medium">{o.customer_name}</dd></div>}
        </dl>

        <table className="w-full text-sm my-3">
          <thead>
            <tr className="text-stone-500 text-xs border-b">
              <th className="text-left font-normal py-1">Item</th><th className="font-normal">Qty</th>
              <th className="text-right font-normal">Rate</th><th className="text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-stone-100 align-top">
                <td className="py-1.5 pr-2">
                  {l.name}{l.variation_name ? ` (${l.variation_name})` : ''}
                  {l.addons?.length > 0 && <div className="text-xs text-stone-500">+ {l.addons.map((a) => a.name).join(', ')}</div>}
                </td>
                <td className="text-center">{l.qty}</td>
                <td className="text-right">{Number(l.price).toFixed(2)}</td>
                <td className="text-right">{(Number(l.price) * l.qty).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="text-sm space-y-1 border-t pt-3">
          <div className="flex justify-between text-stone-600"><span>Items</span><span>{qty}</span></div>
          <div className="flex justify-between"><span>Subtotal</span><span>{r(Number(o.subtotal))}</span></div>
          {Number(o.discount) > 0 && <div className="flex justify-between text-green-700"><span>Discount</span><span>−{r(Number(o.discount))}</span></div>}
          {Number(o.loyalty_redeemed) > 0 && <div className="flex justify-between text-green-700"><span>Loyalty points used</span><span>−{r(Number(o.loyalty_redeemed))}</span></div>}
          <div className="flex justify-between text-lg font-bold pt-1"><span>Total</span><span>{r(Number(o.total))}</span></div>
          {o.status === 'settled' && o.payment_mode && <p className="text-stone-600">Paid via {PAY[o.payment_mode]}</p>}
          {o.status === 'open' && <p className="text-amber-700">Payment pending</p>}
          {Number(o.loyalty_earned) > 0 && <p className="text-amber-700">🎁 You earned {Number(o.loyalty_earned)} loyalty points on this bill</p>}
        </div>

        {st?.bill_fssai && <p className="text-center text-xs text-stone-500 mt-4">FSSAI: {st.bill_fssai}</p>}
        <p className="text-center text-xs text-stone-400 mt-1">Not a tax invoice</p>

        <BillActions token={params.token} settled={o.status === 'settled'} initialRating={o.feedback_rating} title={title} />
      </div>
    </main>
  );
}
