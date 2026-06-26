import { NextRequest } from 'next/server';
import { createAdminClient } from './admin';
import { createClient } from './server';

/**
 * Resolve the current user from either:
 *  1. Authorization: Bearer <token>  (sent by browser client via authFetch — most reliable)
 *  2. Cookie-based session           (refreshed by middleware)
 */
export async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const admin = createAdminClient();
    const { data: { user } } = await admin.auth.getUser(authHeader.slice(7));
    if (user) return user;
  }
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}
