export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePosUser, unauthorized } from '@/lib/pos/auth';

/** Areas + tables with the open order on each table, and open non-table orders. */
export async function GET(request: NextRequest) {
  const actor = await requirePosUser(request);
  if (!actor) return unauthorized();
  const all = request.nextUrl.searchParams.get('all') === '1' && actor.isAdmin;
  const supabase = createAdminClient();

  const [areas, tables, open] = await Promise.all([
    supabase.from('pos_areas').select('*').order('sort_order'),
    supabase.from('pos_tables').select('*').order('sort_order'),
    supabase
      .from('orders')
      .select('id, bill_no, source, table_id, total, created_at, customer_name, order_items(kot_status)')
      .eq('status', 'open')
      .order('created_at'),
  ]);
  const err = [areas, tables, open].find((r) => r.error)?.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const openOrders = (open.data ?? []).map((o) => {
    const st = (o.order_items ?? []).map((i: { kot_status: string }) => i.kot_status);
    return {
      id: o.id, bill_no: o.bill_no, source: o.source, table_id: o.table_id, total: Number(o.total),
      created_at: o.created_at, customer_name: o.customer_name,
      ready: st.includes('ready'),
      pending: st.some((s: string) => s === 'new' || s === 'preparing'),
    };
  });

  return NextResponse.json({
    areas: (areas.data ?? []).filter((a) => all || a.active),
    tables: (tables.data ?? []).filter((t) => all || t.active),
    open_orders: openOrders,
  });
}
