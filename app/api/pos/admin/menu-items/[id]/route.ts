export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosAdmin, requirePosUser, unauthorized } from '@/lib/pos/auth';
import { saveMenuItem } from '@/lib/pos/saveMenuItem';
import { clearMenuCache } from '@/lib/pos/menu';
import { notifyPos } from '@/lib/pos/notify';

/**
 * PATCH — admins edit anything. Any logged-in staff may flip only `in_stock`
 * (so the captain/kitchen can mark an item "finished for today").
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = await request.json().catch(() => null);
  if (!body) return bad('Invalid body');
  const admin = await requirePosAdmin(request);
  if (!admin) {
    const staff = await requirePosUser(request);
    if (!staff) return unauthorized();
    if (Object.keys(body).some((k) => k !== 'in_stock')) return bad('Only an admin can edit menu items', 403);
  }
  const res = await saveMenuItem(createAdminClient(), params.id, body);
  if (res.error) return bad(res.error);
  clearMenuCache();
  await notifyPos('menu');
  return NextResponse.json({ id: res.id });
}

/** DELETE — removes the item if it was never sold; otherwise hides it so old bills keep their history. */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await requirePosAdmin(request))) return unauthorized();
  const supabase = createAdminClient();
  const { count } = await supabase.from('order_items').select('*', { count: 'exact', head: true }).eq('menu_item_id', params.id);
  if (count) {
    await supabase.from('menu_items').update({ active: false }).eq('id', params.id);
    return NextResponse.json({ ok: true, deactivated: true });
  }
  const { error } = await supabase.from('menu_items').delete().eq('id', params.id);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
