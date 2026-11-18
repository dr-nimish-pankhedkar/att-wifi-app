export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosUser, unauthorized } from '@/lib/pos/auth';
import { notifyPos } from '@/lib/pos/notify';
import type { KotStatus } from '@/lib/pos/types';

const STATUSES: KotStatus[] = ['new', 'preparing', 'ready', 'served', 'cancelled'];

/** PATCH { kot_status } — kitchen moves items along; captain marks served or cancels a line. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await requirePosUser(request);
  if (!actor) return unauthorized();
  const body = await request.json().catch(() => null);
  const status: KotStatus = body?.kot_status;
  if (!STATUSES.includes(status)) return bad('Invalid status');

  const supabase = createAdminClient();
  const { data: item } = await supabase
    .from('order_items').select('id, order_id, kot_status, orders(status)').eq('id', params.id).maybeSingle();
  if (!item) return bad('Item not found', 404);
  if ((item.orders as unknown as { status: string } | null)?.status !== 'open') return bad('This bill is already closed');
  if (status === 'cancelled' && item.kot_status === 'served' && !actor.isAdmin) {
    return bad('Served items can only be removed by an admin', 403);
  }

  const { error } = await supabase.from('order_items').update({ kot_status: status }).eq('id', item.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await notifyPos('kitchen');
  return NextResponse.json({ ok: true });
}
