import { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createAdminClient } from './admin';
import { createClient } from './server';

/** Roles allowed into the admin panel and admin APIs. */
export const ADMIN_ROLES = ['admin', 'founder'];

/**
 * Resolve the signed-in Supabase user from either:
 *  1. Authorization: Bearer <token>  (sent by browser client via authFetch)
 *  2. Cookie-based session           (refreshed by middleware)
 * This only proves *someone* is signed in — use requireAuth/getAdminUser for access checks.
 */
export async function getSessionUser(request?: NextRequest): Promise<User | null> {
  const authHeader = request?.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await createAdminClient().auth.getUser(authHeader.slice(7));
    if (user) return user;
  }
  const { data: { user } } = await createClient().auth.getUser();
  return user;
}

async function hasAdminRole(user: User | null): Promise<boolean> {
  if (!user) return false;
  const { data } = await createAdminClient().from('profiles').select('role').eq('id', user.id).maybeSingle();
  return !!data && ADMIN_ROLES.includes(data.role);
}

/**
 * Admin gate for API routes: a signed-in user whose profile role is admin/founder.
 * (Any other signed-in account — e.g. a self-registered one — is rejected.)
 */
export async function requireAuth(request: NextRequest): Promise<User | null> {
  const user = await getSessionUser(request);
  return (await hasAdminRole(user)) ? user : null;
}

/** Same as requireAuth for handlers without a request object (cookie session only). */
export async function getAdminUser(): Promise<User | null> {
  const user = await getSessionUser();
  return (await hasAdminRole(user)) ? user : null;
}
