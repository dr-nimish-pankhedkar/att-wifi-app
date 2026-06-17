export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/inventory/consumption?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * For each active item:
 *   opening = most recent log on or before `from`
 *   closing = most recent log on or before `to`
 *   consumption = opening - closing  (positive = used, negative = restocked)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to   = searchParams.get('to');
  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: items, error: iErr } = await supabase
    .from('inventory_items')
    .select('id, name, unit, category')
    .eq('active', true)
    .order('category')
    .order('sort_order');

  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  const itemIds = (items ?? []).map(i => i.id);
  if (itemIds.length === 0) return NextResponse.json({ rows: [] });

  // Fetch all logs up to `to` date for these items — ordered so we can find latest per item
  const { data: logs, error: lErr } = await supabase
    .from('inventory_logs')
    .select('item_id, quantity, log_date')
    .in('item_id', itemIds)
    .lte('log_date', to)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

  const allLogs = logs ?? [];

  // For each item: find latest log ≤ from (opening) and latest log ≤ to (closing)
  const rows = (items ?? []).map(item => {
    const itemLogs = allLogs.filter(l => l.item_id === item.id);
    const opening  = itemLogs.find(l => l.log_date <= from);
    const closing  = itemLogs.find(l => l.log_date <= to);

    return {
      id:            item.id,
      name:          item.name,
      unit:          item.unit,
      category:      item.category,
      opening_qty:   opening?.quantity  ?? null,
      opening_date:  opening?.log_date  ?? null,
      closing_qty:   closing?.quantity  ?? null,
      closing_date:  closing?.log_date  ?? null,
      consumption:
        opening?.quantity != null && closing?.quantity != null
          ? opening.quantity - closing.quantity
          : null,
    };
  });

  return NextResponse.json({ rows });
}
