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
  const staffId = searchParams.get('staff_id');
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const limit = 20;
  const offset = (page - 1) * limit;

  const supabase = createAdminClient();

  let query = supabase
    .from('attendance')
    .select(
      `id, date, check_in_time, check_out_time, status, half_day, notes,
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

/** POST — admin upsert (backfill or edit) an attendance record */
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.staff_id || !body?.date) {
    return NextResponse.json({ error: 'staff_id and date are required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const payload: Record<string, unknown> = {
    staff_id: body.staff_id,
    date: body.date,
    status: body.status ?? 'present',
    half_day: body.half_day ?? false,
    notes: body.notes ?? null,
    override_by_admin: true,
  };
  if (body.check_in_time !== undefined) payload.check_in_time = body.check_in_time || null;
  if (body.check_out_time !== undefined) payload.check_out_time = body.check_out_time || null;

  const { data, error } = await supabase
    .from('attendance')
    .upsert(payload, { onConflict: 'staff_id,date' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ record: data });
}

/** DELETE — admin remove a record entirely */
export async function DELETE(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('attendance').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

