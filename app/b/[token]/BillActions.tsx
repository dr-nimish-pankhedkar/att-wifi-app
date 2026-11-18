'use client';

import { useState } from 'react';

type Rating = 'loved' | 'okay' | 'improve';
const OPTIONS: { key: Rating; label: string; emoji: string }[] = [
  { key: 'loved', label: 'Loved it!', emoji: '😍' },
  { key: 'okay', label: 'Okay', emoji: '🙂' },
  { key: 'improve', label: 'Needs improvement', emoji: '😕' },
];

export default function BillActions({ token, reviewUrl, settled, initialRating, title }: {
  token: string; reviewUrl: string; settled: boolean; initialRating: Rating | null; title: string;
}) {
  const [rating, setRating] = useState<Rating | null>(initialRating);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(!!initialRating);
  const [busy, setBusy] = useState(false);

  async function send(r: Rating, c?: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/public/bill/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: r, comment: c }),
      });
      if (res.ok) setSent(true);
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-6 space-y-4 print:hidden">
      {settled && (
        <section className="rounded-xl bg-amber-50 p-4 text-center">
          <p className="font-semibold">How was your visit to {title}?</p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {OPTIONS.map((o) => (
              <button key={o.key} disabled={busy}
                onClick={() => { setRating(o.key); setSent(false); send(o.key); }}
                className={`rounded-lg border bg-white py-2 text-sm ${rating === o.key ? 'border-amber-500 ring-2 ring-amber-300' : ''}`}>
                <div className="text-2xl">{o.emoji}</div>{o.label}
              </button>
            ))}
          </div>

          {rating && rating !== 'loved' && (
            <div className="mt-3 text-left">
              <textarea className="w-full rounded-lg border p-2 text-sm" rows={3} maxLength={500}
                placeholder="What could we do better? (only the café team sees this)" value={comment} onChange={(e) => setComment(e.target.value)} />
              <button disabled={busy || !comment.trim()} onClick={() => send(rating, comment)}
                className="mt-2 w-full rounded-lg bg-stone-800 text-white py-2 text-sm disabled:opacity-40">Send feedback</button>
            </div>
          )}
          {sent && <p className="text-sm text-green-700 mt-2">Thank you for your feedback! 🙏</p>}

          {reviewUrl && (
            <a href={reviewUrl} target="_blank" rel="noopener noreferrer"
              className="mt-3 block rounded-lg bg-blue-600 text-white font-semibold py-3">
              ⭐ Rate us on Google
            </a>
          )}
        </section>
      )}

      <button onClick={() => window.print()} className="w-full rounded-lg border py-3 text-sm font-medium">
        Download / print PDF
      </button>
    </div>
  );
}
