'use client';

import { createClient } from './client';

/**
 * Fetch wrapper that includes the current Supabase access token as a Bearer header.
 * The browser Supabase client auto-refreshes expired tokens, so this always sends
 * a fresh token without relying on server-side cookie propagation.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const supabase = createClient();

  let { data: { session } } = await supabase.auth.getSession();

  // Proactively refresh if within 60 s of expiry
  if (session && session.expires_at && session.expires_at < Math.floor(Date.now() / 1000) + 60) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return fetch(url, { ...options, headers });
}
