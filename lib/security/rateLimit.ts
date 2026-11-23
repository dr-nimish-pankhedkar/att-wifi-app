import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Brute-force protection for 4-digit PIN logins (only 10,000 combinations).
 * Failed attempts are counted per device IP and across the whole app.
 */
const WINDOW_MIN = 15;
const MAX_FAILS_PER_IP = 8;
const MAX_FAILS_GLOBAL = 60;

export function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

/** Returns an error message if this IP (or the app as a whole) is temporarily locked. */
export async function pinLocked(request: NextRequest): Promise<string | null> {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const supabase = createAdminClient();
  const [mine, all] = await Promise.all([
    supabase.from('auth_attempts').select('*', { count: 'exact', head: true }).eq('key', `pin:${clientIp(request)}`).eq('success', false).gte('created_at', since),
    supabase.from('auth_attempts').select('*', { count: 'exact', head: true }).like('key', 'pin:%').eq('success', false).gte('created_at', since),
  ]);
  if ((mine.count ?? 0) >= MAX_FAILS_PER_IP) return `Too many wrong PINs. Try again in ${WINDOW_MIN} minutes.`;
  if ((all.count ?? 0) >= MAX_FAILS_GLOBAL) return 'PIN login is paused for a few minutes because of many wrong attempts. Please try again shortly.';
  return null;
}

export async function recordPinAttempt(request: NextRequest, success: boolean) {
  const supabase = createAdminClient();
  await supabase.from('auth_attempts').insert({ key: `pin:${clientIp(request)}`, success });
  if (Math.random() < 0.02) {
    await supabase.from('auth_attempts').delete().lt('created_at', new Date(Date.now() - 2 * 86400_000).toISOString());
  }
}
