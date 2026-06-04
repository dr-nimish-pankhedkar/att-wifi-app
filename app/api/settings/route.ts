export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('settings').select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function PUT(request: NextRequest) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: existing } = await supabase.from('settings').select('id').single();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.company_name !== undefined) updates.company_name = body.company_name;
  if (body.shift_start_time !== undefined) updates.shift_start_time = body.shift_start_time;
  if (body.late_threshold_minutes !== undefined)
    updates.late_threshold_minutes = Number(body.late_threshold_minutes);
  if (body.allowed_ips !== undefined) updates.allowed_ips = body.allowed_ips;

  let result;
  if (existing) {
    result = await supabase.from('settings').update(updates).eq('id', existing.id).select().single();
  } else {
    result = await supabase.from('settings').insert(updates).select().single();
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ settings: result.data });
}
