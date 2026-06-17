export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function requireAuth() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('date_of_joining')
    .eq('id', params.id)
    .single();

  const { data: leaves } = await supabase
    .from('leaves')
    .select('*')
    .eq('staff_id', params.id)
    .order('leave_date', { ascending: false });

  const allLeaves = leaves ?? [];

  // Calculate balances
  const doj = profile?.date_of_joining ? new Date(profile.date_of_joining) : null;
  const accruedPL = doj ? Math.max(0, monthsBetween(doj, new Date())) : 0;
  const usedPL = allLeaves.filter((l) => l.type === 'paid' && l.status === 'approved').length;
  const grantedCompOff = allLeaves.filter((l) => l.type === 'comp_off' && l.status === 'approved').length;
  const usedCompOff = allLeaves.filter((l) => l.type === 'comp_off_used' && l.status === 'approved').length;

  return NextResponse.json({
    leaves: allLeaves,
    balance: {
      accrued_pl: accruedPL,
      used_pl: usedPL,
      pl_balance: Math.max(0, accruedPL - usedPL),
      comp_off_balance: Math.max(0, grantedCompOff - usedCompOff),
    },
  });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.leave_date || !body?.type) {
    return NextResponse.json({ error: 'leave_date and type are required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('leaves')
    .insert({
      staff_id: params.id,
      leave_date: body.leave_date,
      type: body.type,
      status: 'approved',
      notes: body.notes ?? null,
      granted_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leave: data }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const leaveId = searchParams.get('leaveId');
  if (!leaveId) return NextResponse.json({ error: 'leaveId required' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('leaves')
    .delete()
    .eq('id', leaveId)
    .eq('staff_id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
