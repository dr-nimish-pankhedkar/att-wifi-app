export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function requireAuth() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

/** PUT — update an inventory item */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const supabase = createAdminClient();
  const allowed: Record<string, unknown> = {};
  if (body.name !== undefined) allowed.name = body.name;
  if (body.category !== undefined) allowed.category = body.category;
  if (body.unit !== undefined) allowed.unit = body.unit;
  if (body.min_level !== undefined) allowed.min_level = body.min_level;
  if (body.sort_order !== undefined) allowed.sort_order = body.sort_order;
  if (body.active !== undefined) allowed.active = body.active;
  if ('bucket_id' in body) allowed.bucket_id = body.bucket_id;
  if (body.vendor_1 !== undefined) allowed.vendor_1 = body.vendor_1;
  if (body.vendor_2 !== undefined) allowed.vendor_2 = body.vendor_2;

  const { data, error } = await supabase
    .from('inventory_items')
    .update(allowed)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

/** DELETE — soft-delete (set active=false) or hard-delete */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const hard = searchParams.get('hard') === '1';

  const supabase = createAdminClient();

  if (hard) {
    const { error } = await supabase.from('inventory_items').delete().eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from('inventory_items')
      .update({ active: false })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
