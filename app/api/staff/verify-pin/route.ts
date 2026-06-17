export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';

/** Verify a staff PIN and return their profile — no attendance side-effects. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.pin || typeof body.pin !== 'string' || body.pin.length !== 4) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, name, designation, photo_url, pin_hash, role');

  if (error || !profiles) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  // Run all comparisons in parallel
  const results = await Promise.all(
    profiles.map(async (p) => ({
      profile: p,
      match: p.pin_hash ? await bcrypt.compare(body.pin, p.pin_hash) : false,
    }))
  );
  const found = results.find((r) => r.match);

  if (!found) {
    return NextResponse.json({ error: 'Incorrect PIN. Please try again.' }, { status: 401 });
  }

  return NextResponse.json({
    id: found.profile.id,
    name: found.profile.name,
    designation: found.profile.designation,
    photo_url: found.profile.photo_url,
  });
}
