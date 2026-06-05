export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function requireAdminAuth() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

/** GET — public; staff need this without an auth session */
export async function GET() {
  const supabase = createAdminClient();

  const { data: items, error } = await supabase
    .from('inventory_items')
    .select('*, inventory_buckets(id, name, sort_order)')
    .eq('active', true)
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const itemIds = (items ?? []).map((i) => i.id);
  const latestLogs: Record<string, { quantity: number; log_date: string; notes: string | null }> = {};

  if (itemIds.length > 0) {
    const { data: logs } = await supabase
      .from('inventory_logs')
      .select('item_id, quantity, log_date, notes')
      .in('item_id', itemIds)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false });

    for (const log of logs ?? []) {
      if (!latestLogs[log.item_id]) {
        latestLogs[log.item_id] = {
          quantity: log.quantity,
          log_date: log.log_date,
          notes: log.notes,
        };
      }
    }
  }

  const result = (items ?? []).map((item) => ({
    ...item,
    latest: latestLogs[item.id] ?? null,
  }));

  return NextResponse.json({ items: result });
}

/** POST — admin only: create a new inventory item */
export async function POST(request: NextRequest) {
  const user = await requireAdminAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  let maxQuery = supabase.from('inventory_items').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  if (body.bucket_id) maxQuery = maxQuery.eq('bucket_id', body.bucket_id);
  const { data: maxRow } = await maxQuery.maybeSingle();

  const sort_order = ((maxRow?.sort_order ?? 0) as number) + 10;

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      category: body.category ?? '',
      name: body.name,
      unit: body.unit ?? '',
      min_level: body.min_level ?? 0,
      sort_order,
      bucket_id: body.bucket_id ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
