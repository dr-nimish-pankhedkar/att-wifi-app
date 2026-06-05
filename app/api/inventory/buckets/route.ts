export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function requireAuth() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('inventory_buckets')
    .select('*')
    .order('sort_order')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ buckets: data ?? [] });
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get max sort_order
  const { data: maxRow } = await supabase
    .from('inventory_buckets')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = ((maxRow?.sort_order ?? 0) as number) + 10;

  const { data, error } = await supabase
    .from('inventory_buckets')
    .insert({ name: body.name.trim(), sort_order })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bucket: data });
}
