export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function requireAuth() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const supabase = createAdminClient();
  let query = supabase
    .from('shift_overrides')
    .select('*, shifts(id, name, start_time), profiles(id, name)')
    .order('override_date', { ascending: true });

  if (from) query = query.gte('override_date', from);
  if (to) query = query.lte('override_date', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ overrides: data ?? [] });
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.staff_id || !body?.override_date) {
    return NextResponse.json({ error: 'staff_id and override_date required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('shift_overrides')
    .upsert({
      staff_id: body.staff_id,
      override_date: body.override_date,
      shift_id: body.shift_id ?? null,
      reason: body.reason ?? null,
    }, { onConflict: 'staff_id,override_date' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ override: data });
}
