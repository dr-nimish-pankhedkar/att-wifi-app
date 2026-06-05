export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function requireAuth() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const supabase = createAdminClient();
  const allowed: Record<string, unknown> = {};
  if (body.name !== undefined) allowed.name = body.name;
  if (body.sort_order !== undefined) allowed.sort_order = body.sort_order;

  const { data, error } = await supabase
    .from('inventory_buckets')
    .update(allowed)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bucket: data });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const moveTo = searchParams.get('move_to'); // optional: move items to another bucket

  const supabase = createAdminClient();

  // Reassign items before deleting
  await supabase
    .from('inventory_items')
    .update({ bucket_id: moveTo ?? null })
    .eq('bucket_id', params.id);

  const { error } = await supabase.from('inventory_buckets').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
