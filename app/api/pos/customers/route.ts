export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePosUser, unauthorized } from '@/lib/pos/auth';
import { getLoyaltyConfig } from '@/lib/pos/loyaltyServer';

/**
 * GET — all customers (phone, name, points balance, visits) + loyalty rules.
 * Devices keep this list in memory only, so name ↔ phone suggestions are instant while typing.
 */
export async function GET(request: NextRequest) {
  if (!(await requirePosUser(request))) return unauthorized();
  const supabase = createAdminClient();
  const all: { id: string; phone: string; name: string | null; visits: number; total_spent: number; last_visit_at: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('customers')
      .select('id, phone, name, visits, total_spent, last_visit_at').order('last_visit_at', { ascending: false, nullsFirst: false }).range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const balances = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('customer_balances').select('customer_id, balance').range(from, from + 999);
    for (const b of data ?? []) balances.set(b.customer_id, Number(b.balance));
    if (!data || data.length < 1000) break;
  }
  const loyalty = await getLoyaltyConfig(supabase);
  return NextResponse.json({
    loyalty,
    customers: all.map((c) => ({ id: c.id, phone: c.phone, name: c.name, visits: c.visits, total_spent: Number(c.total_spent), last_visit_at: c.last_visit_at, balance: balances.get(c.id) ?? 0 })),
  });
}
