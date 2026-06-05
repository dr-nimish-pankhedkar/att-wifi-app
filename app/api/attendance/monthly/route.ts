export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function requireAuth() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

/** GET /api/attendance/monthly?month=2024-06 — all staff, all days, no pagination */
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month'); // e.g. '2024-06'
  if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 });

  const from = `${month}-01`;
  const lastDay = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;

  const supabase = createAdminClient();
  const { data: records, error } = await supabase
    .from('attendance')
    .select('id, staff_id, date, check_in_time, check_out_time, status, half_day, notes, override_by_admin')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ records: records ?? [] });
}
