export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .order('start_time');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shifts: data });
}

export async function POST(request: NextRequest) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.start_time) {
    return NextResponse.json({ error: 'name and start_time are required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('shifts')
    .insert({
      name: body.name,
      start_time: body.start_time,
      end_time: body.end_time ?? null,
      late_threshold_minutes: body.late_threshold_minutes ?? 15,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shift: data }, { status: 201 });
}
