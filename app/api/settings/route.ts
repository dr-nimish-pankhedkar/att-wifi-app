export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const DEFAULTS = {
  company_name: 'My Company',
  shift_start_time: '09:00:00',
  late_threshold_minutes: 15,
  allowed_ips: '',
  logo_url: null,
};

export async function GET() {
  const supabase = createAdminClient();
  let { data, error } = await supabase.from('settings').select('*').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-create the single settings row if it doesn't exist yet
  if (!data) {
    const insert = await supabase.from('settings').insert(DEFAULTS).select().single();
    if (insert.error) return NextResponse.json({ error: insert.error.message }, { status: 500 });
    data = insert.data;
  }

  return NextResponse.json({ settings: data });
}

export async function PUT(request: NextRequest) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: existing } = await supabase.from('settings').select('id').maybeSingle();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.company_name !== undefined) updates.company_name = body.company_name;
  if (body.shift_start_time !== undefined) updates.shift_start_time = body.shift_start_time;
  if (body.late_threshold_minutes !== undefined)
    updates.late_threshold_minutes = Number(body.late_threshold_minutes);
  if (body.allowed_ips !== undefined) updates.allowed_ips = body.allowed_ips;
  if (body.logo_url !== undefined) updates.logo_url = body.logo_url;
  if (body.off_days !== undefined) updates.off_days = body.off_days;
  if (body.weekend_shift_id !== undefined) updates.weekend_shift_id = body.weekend_shift_id || null;

  let result;
  if (existing) {
    result = await supabase.from('settings').update(updates).eq('id', existing.id).select().single();
  } else {
    result = await supabase.from('settings').insert(updates).select().single();
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ settings: result.data });
}
