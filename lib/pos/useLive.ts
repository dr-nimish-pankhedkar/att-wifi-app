'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { POS_CHANNEL } from './types';

/**
 * Keep a screen fresh without the user doing anything:
 *  - instant: Supabase Realtime ping when any order/kitchen/menu change happens
 *  - on returning to the app / tab, and when the internet comes back
 *  - fallback poll every `fallbackMs`
 * `refresh` must update state quietly (no loading spinners) so the screen never blinks.
 */
export function usePosLive(refresh: () => void, enabled: boolean, fallbackMs = 15_000) {
  const ref = useRef(refresh);
  ref.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Coalesce bursts (e.g. several items updated at once) into one fetch.
    const run = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; ref.current(); }, 150);
    };

    const supabase = createClient();
    const channel = supabase.channel(POS_CHANNEL).on('broadcast', { event: 'changed' }, run).subscribe();

    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', run);
    window.addEventListener('online', run);
    const poll = setInterval(() => { if (document.visibilityState === 'visible') run(); }, fallbackMs);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', run);
      window.removeEventListener('online', run);
      supabase.removeChannel(channel);
    };
  }, [enabled, fallbackMs]);
}
