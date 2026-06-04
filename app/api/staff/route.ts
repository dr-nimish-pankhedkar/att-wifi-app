export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, designation, photo_url, role, shift_id, created_at, shifts(id, name, start_time)')
    .eq('role', 'staff')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff: data });
}

export async function POST(request: NextRequest) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.pin) {
    return NextResponse.json({ error: 'name and pin are required' }, { status: 400 });
  }


  if (!/^\d{4}$/.test(body.pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
  }

  const pin_hash = await bcrypt.hash(body.pin, 10);

  // Create a stub auth user so profiles FK works
  const supabase = createAdminClient();
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: body.email ?? `staff_${Date.now()}@internal.local`,
    password: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
    email_confirm: true,
  });

  if (authErr || !authUser.user) {
    return NextResponse.json({ error: authErr?.message ?? 'Failed to create user' }, { status: 500 });
  }

  const { data, error } = await supabase.from('profiles').insert({
    id: authUser.user.id,
    name: body.name,
    designation: body.designation ?? null,
    pin_hash,
    photo_url: body.photo_url ?? null,
    shift_id: body.shift_id ?? null,
    role: 'staff',
  }).select().single();

  if (error) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ staff: data }, { status: 201 });
}
