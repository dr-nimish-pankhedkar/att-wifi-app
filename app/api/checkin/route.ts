export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPrivateIP, getClientIP } from '@/lib/wifi';
import { todayIST, shiftTimeToday } from '@/lib/time';

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  if (!isPrivateIP(ip)) {
    return NextResponse.json(
      { error: 'You must be on office WiFi to check in' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body?.pin || typeof body.pin !== 'string' || body.pin.length !== 4) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch all staff profiles (we must compare bcrypt hashes)
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, name, designation, photo_url, pin_hash, role');

  if (profileErr || !profiles) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  // Find matching staff by PIN
  let matched = null;
  for (const profile of profiles) {
    if (await bcrypt.compare(body.pin, profile.pin_hash)) {
      matched = profile;
      break;
    }
  }

  if (!matched) {
    return NextResponse.json({ error: 'Incorrect PIN. Please try again.' }, { status: 401 });
  }

  // Fetch settings
  const { data: settings } = await supabase
    .from('settings')
    .select('shift_start_time, late_threshold_minutes')
    .single();

  const shiftStart = settings?.shift_start_time ?? '09:00:00';
  const lateThreshold = settings?.late_threshold_minutes ?? 15;

  const today = todayIST();
  const now = new Date();

  // Check if already checked in today
  const { data: existing } = await supabase
    .from('attendance')
    .select('id, check_in_time, check_out_time, status')
    .eq('staff_id', matched.id)
    .eq('date', today)
    .single();

  let action: 'check_in' | 'check_out';
  let status: string;

  if (!existing || !existing.check_in_time) {
    // First punch → check-in
    action = 'check_in';

    const shiftStartTime = shiftTimeToday(shiftStart);
    const deadline = new Date(shiftStartTime.getTime() + lateThreshold * 60 * 1000);
    status = now <= deadline ? 'present' : 'late';

    await supabase.from('attendance').upsert({
      staff_id: matched.id,
      date: today,
      check_in_time: now.toISOString(),
      status,
    });
  } else {
    // Second punch → check-out
    action = 'check_out';
    status = existing.status;

    await supabase
      .from('attendance')
      .update({ check_out_time: now.toISOString() })
      .eq('staff_id', matched.id)
      .eq('date', today);
  }

  // Fetch last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const fromDate = sevenDaysAgo.toISOString().split('T')[0];

  const { data: last7days } = await supabase
    .from('attendance')
    .select('date, status, check_in_time, check_out_time')
    .eq('staff_id', matched.id)
    .gte('date', fromDate)
    .order('date', { ascending: true });

  return NextResponse.json({
    name: matched.name,
    designation: matched.designation,
    photo_url: matched.photo_url,
    action,
    time: now.toISOString(),
    status,
    last7days: last7days ?? [],
  });
}
