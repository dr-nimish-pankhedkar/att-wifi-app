export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePosAdmin, unauthorized, bad } from '@/lib/pos/auth';
import { computeFinance } from '@/lib/finance/compute';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (IST dates, inclusive) — finance dashboard data. */
export async function GET(request: NextRequest) {
  if (!(await requirePosAdmin(request))) return unauthorized();
  const from = request.nextUrl.searchParams.get('from') ?? '';
  const to = request.nextUrl.searchParams.get('to') ?? '';
  if (!DATE.test(from) || !DATE.test(to) || from > to) return bad('Invalid date range');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) return bad('Choose a range of up to 400 days');

  const supabase = createAdminClient();
  const [orders, expenses, salaries, profiles, attendance, cash] = await Promise.all([
    supabase.from('orders')
      .select('total, discount, cash_amount, upi_amount, payment_mode, settled_at, feedback_rating, order_items(name, price, qty, kot_status)')
      .eq('status', 'settled')
      .gte('settled_at', `${from}T00:00:00+05:30`).lte('settled_at', `${to}T23:59:59.999+05:30`)
      .limit(20000),
    supabase.from('cash_expenses').select('amount, category, expense_date, description').gte('expense_date', from).lte('expense_date', to),
    supabase.from('staff_salary').select('staff_id, base_pay, fuel_allowance, fixed_bonus'),
    supabase.from('profiles').select('id, name, role, date_of_joining, last_date'),
    supabase.from('attendance').select('staff_id, date, status, half_day').gte('date', from).lte('date', to),
    supabase.from('counter_cash_logs').select('log_date, total, entry_type, cash_taken').gte('log_date', from).lte('log_date', to),
  ]);
  const err = [orders, expenses, salaries, profiles, attendance, cash].find((r) => r.error)?.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const people = new Map((profiles.data ?? []).map((p) => [p.id, p]));
  const result = computeFinance({
    from, to,
    orders: (orders.data ?? []).map((o) => ({ ...o, items: (o.order_items ?? []) as never })) as never,
    expenses: (expenses.data ?? []) as never,
    salaries: (salaries.data ?? []).map((s) => {
      const p = people.get(s.staff_id);
      return {
        staff_id: s.staff_id, name: p?.name ?? 'Unknown',
        // fixed_bonus accrues monthly (paid every 6 months), so it is part of the monthly cost
        monthly: Number(s.base_pay) + Number(s.fuel_allowance) + Number(s.fixed_bonus),
        date_of_joining: p?.date_of_joining ?? null, last_date: p?.last_date ?? null,
      };
    }),
    attendance: (attendance.data ?? []) as never,
    cashLogs: (cash.data ?? []) as never,
  });
  // Names for people with attendance but no salary set up
  const unsalaried = result.attendance_unsalaried.map((a) => ({ ...a, name: people.get(a.staff_id)?.name ?? 'Unknown' }));
  return NextResponse.json({ ...result, attendance_unsalaried: unsalaried });
}
