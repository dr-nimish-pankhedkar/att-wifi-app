export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosUser, unauthorized } from '@/lib/pos/auth';
import type { KotStatus } from '@/lib/pos/types';

/** GET — open kitchen tickets: one ticket per order + KOT round, oldest first. */
export async function GET(request: NextRequest) {
  if (!(await requirePosUser(request))) return unauthorized();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('order_items')
    .select('id, order_id, name, variation_name, addons, qty, note, kot_round, kot_status, created_at, orders!inner(bill_no, source, table_id, status, customer_name, pos_tables(name))')
    .in('kot_status', ['new', 'preparing', 'ready'])
    .eq('orders.status', 'open')
    .order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = (typeof data)[number];
  const tickets = new Map<string, { key: string; order_id: string; bill_no: number; source: string; table: string | null; customer_name: string | null; round: number; created_at: string; items: Row[] }>();
  for (const r of data ?? []) {
    const o = r.orders as unknown as { bill_no: number; source: string; customer_name: string | null; pos_tables: { name: string } | null };
    const key = `${r.order_id}:${r.kot_round}`;
    if (!tickets.has(key)) {
      tickets.set(key, { key, order_id: r.order_id, bill_no: o.bill_no, source: o.source, table: o.pos_tables?.name ?? null, customer_name: o.customer_name, round: r.kot_round, created_at: r.created_at, items: [] });
    }
    tickets.get(key)!.items.push(r);
  }
  return NextResponse.json({ tickets: Array.from(tickets.values()), server_time: new Date().toISOString() });
}

/** POST { order_id, round, kot_status } — move a whole ticket at once. */
export async function POST(request: NextRequest) {
  if (!(await requirePosUser(request))) return unauthorized();
  const body = await request.json().catch(() => null);
  const status: KotStatus = body?.kot_status;
  if (!body?.order_id || !body?.round || !['preparing', 'ready', 'served'].includes(status)) return bad('Invalid request');
  const from: Record<string, KotStatus[]> = { preparing: ['new'], ready: ['new', 'preparing'], served: ['ready'] };
  const { error } = await createAdminClient()
    .from('order_items')
    .update({ kot_status: status })
    .eq('order_id', body.order_id)
    .eq('kot_round', body.round)
    .in('kot_status', from[status]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
