export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { signPosSession } from '@/lib/pos/session';
import { pinLocked, recordPinAttempt } from '@/lib/security/rateLimit';

/** Staff PIN → signed POS session token for captain / kitchen devices. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const pin = body?.pin;
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 400 });
  }

  const locked = await pinLocked(request);
  if (locked) return NextResponse.json({ error: locked }, { status: 429 });

  const supabase = createAdminClient();
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, name, role, pin_hash, last_date');
  if (error || !profiles) return NextResponse.json({ error: 'Server error' }, { status: 500 });

  const results = await Promise.all(
    profiles.map(async (p) => ({ p, ok: p.pin_hash ? await bcrypt.compare(pin, p.pin_hash) : false }))
  );
  const found = results.find((r) => r.ok)?.p;
  await recordPinAttempt(request, !!found);
  if (!found) return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });

  const todayIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
  if (found.last_date && found.last_date < todayIST) {
    return NextResponse.json({ error: 'Access ended. Contact the admin.' }, { status: 403 });
  }

  const { token, exp } = signPosSession({ sid: found.id, name: found.name, role: found.role });
  return NextResponse.json({ token, exp, staff: { id: found.id, name: found.name, role: found.role } });
}
