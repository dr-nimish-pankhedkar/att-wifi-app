export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function requireAdmin() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const supabase = createAdminClient();

  const updates: Record<string, unknown> = {};
  if (body?.name) updates.name = body.name;
  if (body?.designation !== undefined) updates.designation = body.designation;
  if (body?.photo_url !== undefined) updates.photo_url = body.photo_url;
  if (body?.shift_id !== undefined) updates.shift_id = body.shift_id || null;
  if (body?.date_of_joining !== undefined) updates.date_of_joining = body.date_of_joining || null;
  if (body?.birthdate !== undefined) updates.birthdate = body.birthdate || null;
  if (body?.pin) {
    if (!/^\d{4}$/.test(body.pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
    }
    updates.pin_hash = await bcrypt.hash(body.pin, 10);
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  // Delete auth user (cascades to profiles via FK)
  const { error } = await supabase.auth.admin.deleteUser(params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
