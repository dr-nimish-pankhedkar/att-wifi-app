export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** GET — public; returns active kitchen items + today's logs */
export async function GET() {
  const supabase = createAdminClient();

  const { data: items, error } = await supabase
    .from('daily_kitchen_items')
    .select('id, name, unit, sort_order')
    .eq('active', true)
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: items ?? [] });
}
