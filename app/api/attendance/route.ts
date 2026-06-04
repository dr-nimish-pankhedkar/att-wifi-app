export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const staffId = searchParams.get('staff_id');
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const limit = 20;
  const offset = (page - 1) * limit;

  const supabase = createAdminClient();

  let query = supabase
    .from('attendance')
    .select(
      `id, date, check_in_time, check_out_time, status, notes,
       profiles(id, name, designation)`,
      { count: 'exact' }
    )
    .order('date', { ascending: false })
    .order('check_in_time', { ascending: false })
    .range(offset, offset + limit - 1);

  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);
  if (staffId) query = query.eq('staff_id', staffId);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ records: data, total: count, page, limit });
}
