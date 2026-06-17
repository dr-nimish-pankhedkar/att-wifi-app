export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function requireAuth() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data: salary } = await supabase
    .from('staff_salary')
    .select('*')
    .eq('staff_id', params.id)
    .maybeSingle();

  // Get current month override
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthKey = monthStart.toISOString().split('T')[0];
  const { data: override } = await supabase
    .from('salary_overrides')
    .select('*')
    .eq('staff_id', params.id)
    .eq('month', monthKey)
    .maybeSingle();

  // Get all overrides for history
  const { data: overrides } = await supabase
    .from('salary_overrides')
    .select('*')
    .eq('staff_id', params.id)
    .order('month', { ascending: false });

  return NextResponse.json({ salary, override, overrides: overrides ?? [] });
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const supabase = createAdminClient();

  if (body.type === 'override') {
    // Upsert monthly override
    const monthKey = body.month; // e.g. '2024-06-01'
    const { data, error } = await supabase
      .from('salary_overrides')
      .upsert({
        staff_id: params.id,
        month: monthKey,
        base_pay_override: body.base_pay_override ?? null,
        fuel_override: body.fuel_override ?? null,
        bonus_override: body.bonus_override ?? null,
        notes: body.notes ?? null,
      }, { onConflict: 'staff_id,month' })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ override: data });
  }

  // Upsert base salary
  const { data, error } = await supabase
    .from('staff_salary')
    .upsert({
      staff_id: params.id,
      base_pay: body.base_pay ?? 0,
      fuel_allowance: body.fuel_allowance ?? 0,
      fixed_bonus: body.fixed_bonus ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'staff_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ salary: data });
}
