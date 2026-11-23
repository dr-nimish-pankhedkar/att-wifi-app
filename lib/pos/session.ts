import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed POS device session for staff who log in with their PIN
 * (captains, kitchen). Stateless: payload + HMAC, verified on every request.
 */
export interface PosSession {
  sid: string;   // staff profile id
  name: string;
  role: string;
  exp: number;   // unix seconds
}

// Devices stay logged in; the app silently renews the session while it is in use.
export const SESSION_DAYS = 30;

function secret(): string {
  const s = process.env.POS_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('POS_SESSION_SECRET is not configured');
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

export function signPosSession(data: Omit<PosSession, 'exp'>, ttlSeconds = SESSION_DAYS * 86400): { token: string; exp: number } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = b64url(JSON.stringify({ ...data, exp }));
  const sig = b64url(createHmac('sha256', secret()).update(payload).digest());
  return { token: `${payload}.${sig}`, exp };
}

/** HttpOnly cookie set after a staff PIN check on the kiosk pages (stock, kitchen log, cash, expenses). */
export const STAFF_COOKIE = 'staff_session';
export const STAFF_COOKIE_SECONDS = 12 * 3600;

export function verifyPosSession(token: string | null | undefined): PosSession | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as PosSession;
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}
