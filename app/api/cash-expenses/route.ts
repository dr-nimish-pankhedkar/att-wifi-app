export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/serverAuth';

/**
 * POST — open to staff (PIN-authed) and admins.
 * Body: { amount, description, category, expense_date, staff_id? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !body.amount || Number(body.amount) <= 0) {
    return NextResponse.json({ error: 'amount is required and must be > 0' }, { status: 400 });
  }

  let staffId: string | null = body.staff_id ?? null;
  if (!staffId) {
    const user = await requireAuth(request);
    if (user) staffId = user.id;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('cash_expenses')
    .insert({
      amount:       Number(body.amount),
      description:  body.description ?? '',
      category:     body.category ?? 'Miscellaneous',
      expense_date: body.expense_date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
      staff_id:     staffId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expense: data });
}

/**
 * GET — admin only: full expense history with staff names.
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD&staff_id=&category=
 */
export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from     = searchParams.get('from');
  const to       = searchParams.get('to');
  const staffId  = searchParams.get('staff_id');
  const category = searchParams.get('category');

  const supabase = createAdminClient();

  let query = supabase
    .from('cash_expenses')
    .select('id, amount, description, category, expense_date, created_at, profiles!staff_id(id, name)')
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);

  if (from)     query = query.gte('expense_date', from);
  if (to)       query = query.lte('expense_date', to);
  if (staffId)  query = query.eq('staff_id', staffId);
  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const expenses = (data ?? []).map((e) => ({
    ...e,
    staff_name: (e.profiles as unknown as { name: string } | null)?.name ?? 'Unknown',
  }));

  return NextResponse.json({ expenses });
}
