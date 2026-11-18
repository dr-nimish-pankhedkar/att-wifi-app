/**
 * Tell every open POS screen (captain phones, kitchen tablet) that something changed,
 * via a Supabase Realtime broadcast. The message carries no data — screens re-fetch
 * through the authenticated API — so nothing private goes over the public channel.
 */
import { POS_CHANNEL } from './types';

export async function notifyPos(kind: 'order' | 'kitchen' | 'menu' = 'order') {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: POS_CHANNEL, event: 'changed', payload: { kind } }] }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    /* screens still poll as a fallback */
  }
}
