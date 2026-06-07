export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** GET — public; returns active kitchen items */
export async function GET() {
  const supabase = createAdminClient();
  const { data: items, error } = await supabase
    .from('daily_kitchen_items')
    .select('*')
    .eq('active', true)
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: items ?? [] });
}

/** POST — create a new kitchen item */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: maxRow } = await supabase
    .from('daily_kitchen_items')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = ((maxRow?.sort_order ?? 0) as number) + 10;

  const { data, error } = await supabase
    .from('daily_kitchen_items')
    .insert({ name: body.name.trim(), unit: body.unit ?? '', sort_order })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
