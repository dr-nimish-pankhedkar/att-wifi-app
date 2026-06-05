export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function requireAuth() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  return user;
}

/** GET — all active items with their latest stock log */
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: items, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('active', true)
    .order('category')
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get latest log per item
  const itemIds = (items ?? []).map((i) => i.id);
  let latestLogs: Record<string, { quantity: number; log_date: string; notes: string | null }> = {};

  if (itemIds.length > 0) {
    // Fetch recent logs sorted by log_date desc, then pick first per item_id
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

/** POST — create a new inventory item */
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.category || !body?.name) {
    return NextResponse.json({ error: 'category and name are required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get max sort_order in category
  const { data: maxRow } = await supabase
    .from('inventory_items')
    .select('sort_order')
    .eq('category', body.category)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = ((maxRow?.sort_order ?? 0) as number) + 10;

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      category: body.category,
      name: body.name,
      unit: body.unit ?? '',
      min_level: body.min_level ?? 0,
      sort_order,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
