export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { signPosSession, verifyPosSession } from '@/lib/pos/session';

/** POST — renew a still-valid device session (keeps phones/tablets logged in). */
export async function POST(request: NextRequest) {
  const s = verifyPosSession(request.headers.get('x-pos-session'));
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Staff whose employment has ended lose access at the next renewal.
  const { data: p } = await createAdminClient().from('profiles').select('id, name, role, last_date').eq('id', s.sid).maybeSingle();
  const todayIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
  if (!p || (p.last_date && p.last_date < todayIST)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, exp } = signPosSession({ sid: p.id, name: p.name, role: p.role });
  return NextResponse.json({ token, exp, staff: { id: p.id, name: p.name, role: p.role } });
}
