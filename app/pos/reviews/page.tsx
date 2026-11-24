'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, MessageCircle, Star } from 'lucide-react';
import PosLogin from '@/components/pos/PosLogin';
import QuickNav from '@/components/pos/QuickNav';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getSession, posApi, SessionExpired, type StoredSession } from '@/lib/pos/client';
import { whatsappLink } from '@/lib/pos/billText';

interface Cust { id: string; name: string | null; phone: string; visits: number; last_visit: string }
interface Data { days: number; skipped: number; cafe: string; review_url: string; customers: Cust[] }

function firstName(n: string | null) { return (n ?? '').trim().split(/\s+/)[0] ?? ''; }

function message(c: Cust, d: Data) {
  const hi = firstName(c.name) ? `Hi ${firstName(c.name)}! 😊` : 'Hi! 😊';
  const again = c.visits > 1 ? 'Thank you for coming back to us again —' : 'Thank you for visiting us —';
  return [
    hi,
    `${again} it truly means the world to our small team at ${d.cafe || 'Café Tan 90°'} ☕💛`,
    '',
    'Every Google review helps more people discover us. If you enjoyed your time with us, could you spare 30 seconds to rate us? ⭐⭐⭐⭐⭐',
    '',
    `👉 ${d.review_url}`,
    '',
    'It would make our day! 🙏 See you again soon.',
  ].join('\n');
}

export default function ReviewRequestsPage() {
  const [session, setSess] = useState<StoredSession | null>(null);
  const [booted, setBooted] = useState(false);
  const [days, setDays] = useState(4);
  const [data, setData] = useState<Data | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => { setSess(getSession()); setBooted(true); }, []);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try { setData(await posApi<Data>(`/api/pos/review-requests?days=${d}`)); setSent(new Set()); }
    catch (e) { if (e instanceof SessionExpired) setSess(null); else toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (session) load(days); }, [session, days, load]);

  if (!booted) return null;
  if (!session) return <PosLogin title="Google reviews" subtitle="Enter your PIN" onLogin={setSess} />;

  const pending = data?.customers.filter((c) => !sent.has(c.id)) ?? [];
  const next = pending[0];

  function send(c: Cust) {
    if (!data) return;
    const link = whatsappLink(c.phone, message(c, data));
    if (!link) { toast.error('Bad phone number'); return; }
    window.open(link, '_blank', 'noopener');
    setSent((s) => new Set(s).add(c.id));
    posApi('/api/pos/review-requests', { method: 'POST', body: JSON.stringify({ customer_id: c.id }) }).catch(() => {});
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-10 bg-white border-b px-3 py-2 flex items-center justify-between">
        <h1 className="font-semibold flex items-center gap-1"><Star className="w-4 h-4 text-amber-500" /> Google review requests</h1>
        <QuickNav compact />
      </header>

      <main className="p-3 space-y-3 max-w-lg mx-auto">
        <div className="flex items-center gap-2 text-sm">
          <span>Customers from the last</span>
          {[3, 4, 7].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={cn('rounded-full border px-3 py-1', days === d && 'bg-stone-900 text-white border-stone-900')}>{d} days</button>
          ))}
        </div>

        {data && !data.review_url && (
          <p className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">Add your Google review link first: Admin → POS setup → Bill & WhatsApp.</p>
        )}

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {data && data.review_url && !loading && (
          <>
            <div className="rounded-xl bg-white border p-4 space-y-3">
              <p className="text-sm">
                <b>{pending.length}</b> to send{sent.size > 0 && <> · <b>{sent.size}</b> sent</>}
                {data.skipped > 0 && <span className="text-muted-foreground"> · {data.skipped} skipped (asked recently or unhappy)</span>}
              </p>
              {next ? (
                <Button className="w-full h-14 text-base bg-green-600 hover:bg-green-700" onClick={() => send(next)}>
                  <MessageCircle className="w-5 h-5 mr-2" /> Send to {next.name || next.phone}
                </Button>
              ) : (
                <p className="text-center font-medium text-green-700">All done for today 🎉</p>
              )}
              <p className="text-xs text-muted-foreground">Tap → WhatsApp opens with the message ready → press Send → come back and tap again for the next customer.</p>
            </div>

            <ul className="rounded-xl bg-white border divide-y">
              {data.customers.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name || 'No name'}</p>
                    <p className="text-xs text-muted-foreground">{c.phone} · {c.visits} visit{c.visits === 1 ? '' : 's'} · {new Date(c.last_visit).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  {sent.has(c.id)
                    ? <span className="text-xs text-green-700 flex items-center gap-1"><Check className="w-4 h-4" /> Sent</span>
                    : <button className="text-xs rounded-full border px-3 py-1" onClick={() => send(c)}>Send</button>}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
