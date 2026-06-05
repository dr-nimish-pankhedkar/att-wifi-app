export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { todayIST } from '@/lib/time';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = todayIST();

  // Skip on days off
  const { data: settings } = await supabase
    .from('settings')
    .select('off_days')
    .maybeSingle();

  const dayOfWeek = new Date(today + 'T12:00:00').getDay();
  const offDays: number[] = settings?.off_days
    ? settings.off_days.split(',').map((d: string) => parseInt(d.trim(), 10)).filter((d: number) => !isNaN(d))
    : [1];

  if (offDays.includes(dayOfWeek)) {
    return NextResponse.json({ skipped: 'Day off', day: dayOfWeek });
  }

  const { data: staff } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'staff');

  if (!staff?.length) return NextResponse.json({ marked: 0 });

  const { data: existing } = await supabase
    .from('attendance')
    .select('staff_id')
    .eq('date', today)
    .not('check_in_time', 'is', null);

  const checkedInIds = new Set((existing ?? []).map((r) => r.staff_id));
  const absentStaff = staff.filter((s) => !checkedInIds.has(s.id));

  if (absentStaff.length) {
    await supabase.from('attendance').upsert(
      absentStaff.map((s) => ({ staff_id: s.id, date: today, status: 'absent' }))
    );
  }

  return NextResponse.json({ marked: absentStaff.length });
}
