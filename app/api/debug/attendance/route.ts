export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const auth = createClient();
  const { data: { user }, error: authError } = await auth.auth.getUser();

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') ?? new Date().toISOString().slice(0, 7);

  const from = `${month}-01`;
  const to = `${month}-${String(new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate()).padStart(2, '0')}`;

  // Query WITH date filter
  const { data: records, error: dbError, count } = await supabase
    .from('attendance')
    .select('id, staff_id, date, status', { count: 'exact' })
    .gte('date', from)
    .lte('date', to)
    .limit(5);

  // Query WITHOUT date filter — total count across all time
  const { count: totalAllTime, error: totalError } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true });

  // Get min/max dates to see what date range exists
  const { data: dateRange } = await supabase
    .from('attendance')
    .select('date')
    .order('date', { ascending: true })
    .limit(1);

  const { data: dateRangeMax } = await supabase
    .from('attendance')
    .select('date')
    .order('date', { ascending: false })
    .limit(1);

  const { data: staffData } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('role', 'staff');

  return NextResponse.json({
    auth: { loggedIn: !!user, email: user?.email ?? null, authError: authError?.message ?? null },
    query: { month, from, to },
    filteredAttendance: { error: dbError?.message ?? null, countInMonth: count, sampleRows: records ?? [] },
    allTimeAttendance: {
      error: totalError?.message ?? null,
      totalCount: totalAllTime,
      earliestDate: dateRange?.[0]?.date ?? null,
      latestDate: dateRangeMax?.[0]?.date ?? null,
    },
    staff: staffData ?? [],
  });
}
