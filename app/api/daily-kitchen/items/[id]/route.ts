export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** PUT — edit item name / unit / sort_order / active */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const supabase = createAdminClient();
  const update: Record<string, unknown> = {};
  if (body.name     !== undefined) update.name      = body.name;
  if (body.unit     !== undefined) update.unit      = body.unit;
  if (body.category !== undefined) update.category  = body.category;
  if (body.active   !== undefined) update.active    = body.active;
  if (body.sort_order !== undefined) update.sort_order = body.sort_order;

  const { data, error } = await supabase
    .from('daily_kitchen_items')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

/** DELETE — soft delete (set active = false) */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('daily_kitchen_items')
    .update({ active: false })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
