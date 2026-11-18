export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosAdmin, unauthorized } from '@/lib/pos/auth';
import { clearMenuCache } from '@/lib/pos/menu';
import { notifyPos } from '@/lib/pos/notify';

/**
 * POST { source, percent, round_to, overwrite } — bulk-set channel prices to dine-in + percent,
 * rounded up to the nearest `round_to` rupees. { source, clear: true } removes all of them.
 */
export async function POST(request: NextRequest) {
  if (!(await requirePosAdmin(request))) return unauthorized();
  const b = await request.json().catch(() => null);
  if (!b || !['takeaway', 'zomato', 'swiggy'].includes(b.source)) return bad('Choose a channel');
  const supabase = createAdminClient();

  if (b.clear) {
    await supabase.from('menu_channel_prices').delete().eq('source', b.source);
  } else {
    const pct = Number(b.percent);
    const step = Math.max(1, Math.floor(Number(b.round_to) || 1));
    if (!(pct >= 0 && pct <= 200)) return bad('Percent must be between 0 and 200');

    const [{ data: items }, { data: vars }, { data: existing }] = await Promise.all([
      supabase.from('menu_items').select('id, price').eq('active', true),
      supabase.from('menu_variations').select('id, menu_item_id, price').eq('active', true),
      supabase.from('menu_channel_prices').select('menu_item_id, variation_id').eq('source', b.source),
    ]);
    const has = new Set((existing ?? []).map((e) => `${e.menu_item_id}:${e.variation_id ?? ''}`));
    const withVars = new Set((vars ?? []).map((v) => v.menu_item_id));
    const calc = (p: number) => Math.ceil((Number(p) * (1 + pct / 100)) / step) * step;

    const rows = [
      ...(items ?? []).filter((i) => !withVars.has(i.id)).map((i) => ({ menu_item_id: i.id, variation_id: null as string | null, price: calc(i.price) })),
      ...(vars ?? []).map((v) => ({ menu_item_id: v.menu_item_id, variation_id: v.id as string | null, price: calc(v.price) })),
    ].filter((r) => b.overwrite || !has.has(`${r.menu_item_id}:${r.variation_id ?? ''}`))
      .map((r) => ({ ...r, source: b.source }));

    if (b.overwrite) await supabase.from('menu_channel_prices').delete().eq('source', b.source);
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from('menu_channel_prices').insert(rows.slice(i, i + 200));
      if (error) return bad(error.message, 500);
    }
  }
  clearMenuCache();
  await notifyPos('menu');
  return NextResponse.json({ ok: true });
}
