'use client';

/** Browser-side helpers for POS devices: PIN session, API calls, offline order queue. */

const SESSION_KEY = 'pos.session';
const QUEUE_KEY = 'pos.queue';

export interface StoredSession { token: string; exp: number; staff: { id: string; name: string; role: string } }

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, val: string | null) {
  try { if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch { /* private mode */ }
}

export function getSession(): StoredSession | null {
  const raw = safeGet(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as StoredSession;
    if (s.exp * 1000 < Date.now()) { safeSet(SESSION_KEY, null); return null; }
    return s;
  } catch { return null; }
}
export const setSession = (s: StoredSession | null) => safeSet(SESSION_KEY, s ? JSON.stringify(s) : null);

export async function posLogin(pin: string): Promise<StoredSession> {
  const res = await fetch('/api/pos/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Login failed');
  setSession(data);
  return data;
}

export class SessionExpired extends Error {}

export async function posApi<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const s = getSession();
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(s ? { 'x-pos-session': s.token } : {}), ...(init.headers ?? {}) },
  });
  if (res.status === 401) { setSession(null); throw new SessionExpired('Please log in again'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/* ── Offline queue: orders that could not reach the server are kept on the device and retried. ── */

export interface QueuedOrder { client_id: string; body: Record<string, unknown>; label: string; queued_at: number; error?: string }

export function getQueue(): QueuedOrder[] {
  try { return JSON.parse(safeGet(QUEUE_KEY) ?? '[]'); } catch { return []; }
}
function setQueue(q: QueuedOrder[]) { safeSet(QUEUE_KEY, JSON.stringify(q)); }
export function enqueue(o: QueuedOrder) { setQueue([...getQueue().filter((x) => x.client_id !== o.client_id), o]); }

/** Is this a network failure (offline / server unreachable) rather than a rejected request? */
export const isNetworkError = (e: unknown) => e instanceof TypeError;

let flushing = false;
/** Try to send every queued order. Returns how many were sent. */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const o of getQueue()) {
      try {
        await posApi('/api/pos/orders', { method: 'POST', body: JSON.stringify(o.body) });
        setQueue(getQueue().filter((x) => x.client_id !== o.client_id));
        sent++;
      } catch (e) {
        if (isNetworkError(e) || e instanceof SessionExpired) break;
        // Server rejected it (e.g. item removed from menu): keep it, show the reason.
        setQueue(getQueue().map((x) => (x.client_id === o.client_id ? { ...x, error: (e as Error).message } : x)));
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}
export function dropQueued(client_id: string) { setQueue(getQueue().filter((x) => x.client_id !== client_id)); }
