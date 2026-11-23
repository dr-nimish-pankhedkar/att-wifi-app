import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/serverAuth';
import { STAFF_COOKIE, verifyPosSession } from './session';

export const ADMIN_ROLES = ['admin', 'founder'];

export interface PosActor {
  staffId: string | null;
  name: string;
  role: string;
  isAdmin: boolean;
}

/** Any logged-in POS user: staff with a PIN session, or a signed-in admin. */
export async function requirePosUser(request: NextRequest): Promise<PosActor | null> {
  const session = verifyPosSession(request.headers.get('x-pos-session')) ?? verifyPosSession(request.cookies.get(STAFF_COOKIE)?.value);
  if (session) {
    return {
      staffId: session.sid,
      name: session.name,
      role: session.role,
      isAdmin: ADMIN_ROLES.includes(session.role),
    };
  }
  return requirePosAdmin(request);
}

/** Signed-in Supabase user whose profile role is admin/founder. */
export async function requirePosAdmin(request: NextRequest): Promise<PosActor | null> {
  const user = await requireAuth(request);
  if (!user) return null;
  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('id, name, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !ADMIN_ROLES.includes(profile.role)) return null;
  return { staffId: profile.id, name: profile.name, role: profile.role, isAdmin: true };
}

export const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
