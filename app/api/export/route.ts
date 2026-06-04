export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { formatTimeIST } from '@/lib/time';

export async function GET(request: NextRequest) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const staffId = searchParams.get('staff_id');

  const supabase = createAdminClient();

  let query = supabase
    .from('attendance')
    .select(`
      date, check_in_time, check_out_time, status, notes,
      profiles(name, designation)
    `)
    .order('date', { ascending: false });

  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);
  if (staffId) query = query.eq('staff_id', staffId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => {
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return [
      profile?.name ?? '',
      profile?.designation ?? '',
      r.date,
      r.status,
      r.check_in_time ? formatTimeIST(r.check_in_time) : '',
      r.check_out_time ? formatTimeIST(r.check_out_time) : '',
      r.notes ?? '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  const csv = [
    '"Name","Designation","Date","Status","Check In","Check Out","Notes"',
    ...rows,
  ].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="attendance_export.csv"`,
    },
  });
}
