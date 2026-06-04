export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { todayIST } from '@/lib/time';

export async function GET() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const today = todayIST();

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'staff');

  const total = profiles?.length ?? 0;

  const { data: records } = await supabase
    .from('attendance')
    .select(`
      id, date, check_in_time, check_out_time, status,
      profiles(id, name, designation, photo_url)
    `)
    .eq('date', today);

  const present = records?.filter((r) => r.status === 'present').length ?? 0;
  const late = records?.filter((r) => r.status === 'late').length ?? 0;
  const absent = total - (present + late);

  return NextResponse.json({ total, present, late, absent, records: records ?? [] });
}
