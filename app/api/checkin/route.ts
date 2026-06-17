export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAllowedIP, getClientIP } from '@/lib/wifi';
import { todayIST, shiftTimeToday } from '@/lib/time';

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const supabase = createAdminClient();

  // Fetch global settings
  const { data: settings } = await supabase
    .from('settings')
    .select('shift_start_time, late_threshold_minutes, allowed_ips, off_days, weekend_shift_id')
    .maybeSingle();

  const allowlist: string[] = settings?.allowed_ips
    ? settings.allowed_ips.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  if (!isAllowedIP(ip, allowlist)) {
    return NextResponse.json({ error: 'You must be on office WiFi to check in' }, { status: 403 });
  }

  // Check if today is a day off (using IST date)
  const today = todayIST();
  const dayOfWeek = new Date(today + 'T12:00:00').getDay(); // 0=Sun,1=Mon...6=Sat
  const offDays: number[] = settings?.off_days
    ? settings.off_days.split(',').map((d: string) => parseInt(d.trim(), 10)).filter((d: number) => !isNaN(d))
    : [1]; // Monday off by default

  if (offDays.includes(dayOfWeek)) {
    return NextResponse.json({ error: 'Today is a day off. Enjoy your rest! 🎉' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.pin || typeof body.pin !== 'string' || body.pin.length !== 4) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 400 });
  }

  // Fetch staff profiles
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, name, designation, photo_url, pin_hash, role, shift_id');

  if (profileErr || !profiles) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  // Run all bcrypt comparisons in parallel
  const comparisons = await Promise.all(
    profiles.map(async (p) => ({ profile: p, ok: await bcrypt.compare(body.pin, p.pin_hash) }))
  );
  const matched = comparisons.find((r) => r.ok)?.profile ?? null;

  if (!matched) {
    return NextResponse.json({ error: 'Incorrect PIN. Please try again.' }, { status: 401 });
  }

  // ── Shift resolution ──────────────────────────────────────────
  // Priority: date-specific override > weekend shift > staff's assigned shift > global default
  let shiftStart = settings?.shift_start_time ?? '09:00:00';
  let lateThreshold = settings?.late_threshold_minutes ?? 15;

  // 1. Date-specific override for this staff on today
  const { data: dateOverride } = await supabase
    .from('shift_overrides')
    .select('shift_id')
    .eq('staff_id', matched.id)
    .eq('override_date', today)
    .maybeSingle();

  let resolvedShiftId: string | null = null;
  if (dateOverride) {
    resolvedShiftId = dateOverride.shift_id;
  } else {
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    resolvedShiftId = isWeekend && settings?.weekend_shift_id
      ? settings.weekend_shift_id
      : matched.shift_id;
  }

  // 2. Fetch the resolved shift's times
  if (resolvedShiftId) {
    const { data: shift } = await supabase
      .from('shifts')
      .select('start_time, late_threshold_minutes')
      .eq('id', resolvedShiftId)
      .single();
    if (shift) {
      shiftStart = shift.start_time;
      lateThreshold = shift.late_threshold_minutes;
    }
  }
  // ─────────────────────────────────────────────────────────────

  const now = new Date();

  const { data: existing } = await supabase
    .from('attendance')
    .select('id, check_in_time, check_out_time, status')
    .eq('staff_id', matched.id)
    .eq('date', today)
    .maybeSingle();

  let action: 'check_in' | 'check_out';
  let status: string;

  if (!existing || !existing.check_in_time) {
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
    action = 'check_out';
    status = existing.status;

    await supabase
      .from('attendance')
      .update({ check_out_time: now.toISOString() })
      .eq('staff_id', matched.id)
      .eq('date', today);
  }

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
