export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * POST — staff: save a shift log
 * Body: { log_date, shift: 'in'|'closing', entries: [{item_id, quantity}], staff_id? }
 * IN shift is additive (quantities accumulate throughout the day).
 * Closing shift is a snapshot overwrite (remaining stock at end of day).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.log_date || !body?.shift || !Array.isArray(body.entries)) {
    return NextResponse.json({ error: 'log_date, shift, and entries[] required' }, { status: 400 });
  }
  if (!['in', 'closing'].includes(body.shift)) {
    return NextResponse.json({ error: 'shift must be "in" or "closing"' }, { status: 400 });
  }

  const supabase = createAdminClient();

  let loggedBy: string | null = body.staff_id ?? null;
  if (!loggedBy) {
    try {
      const auth = createClient();
      const { data: { user } } = await auth.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        loggedBy = profile?.id ?? null;
      }
    } catch { /* non-fatal */ }
  }

  const newRows = (body.entries as Array<{ item_id: string; quantity: number }>)
    .filter((e) => e.item_id && e.quantity !== undefined && e.quantity !== null && Number(e.quantity) > 0)
    .map((e) => ({
      item_id: e.item_id,
      quantity: Number(e.quantity),
      log_date: body.log_date,
      shift: body.shift,
      logged_by: loggedBy,
    }));

  if (newRows.length === 0) return NextResponse.json({ saved: 0 });

  // Always record individual submissions in the audit trail BEFORE accumulation
  await supabase.from('daily_kitchen_log_entries').insert(
    newRows.map(r => ({
      item_id:    r.item_id,
      log_date:   r.log_date,
      shift:      r.shift,
      quantity:   r.quantity,   // original submitted amount, not cumulative
      logged_by:  r.logged_by,
    }))
  );

  let rows = newRows;

  // Morning IN is additive — add to whatever was already logged this shift
  if (body.shift === 'in') {
    const { data: existing } = await supabase
      .from('daily_kitchen_logs')
      .select('item_id, quantity')
      .eq('log_date', body.log_date)
      .eq('shift', 'in')
      .in('item_id', newRows.map((r) => r.item_id));

    const existingMap: Record<string, number> = {};
    for (const e of existing ?? []) existingMap[e.item_id] = e.quantity;

    rows = newRows.map((r) => ({
      ...r,
      quantity: (existingMap[r.item_id] ?? 0) + r.quantity,
    }));
  }
  // Closing is a snapshot — just overwrite with the value entered

  const { data, error } = await supabase
    .from('daily_kitchen_logs')
    .upsert(rows, { onConflict: 'item_id,log_date,shift' })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: data?.length ?? 0 });
}

/**
 * GET — fetch logs for a date
 * ?date=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });

  const supabase = createAdminClient();
  const [{ data: logs, error }, { data: entries }] = await Promise.all([
    supabase
      .from('daily_kitchen_logs')
      .select('item_id, shift, quantity, logged_by, profiles!logged_by(name)')
      .eq('log_date', date),
    supabase
      .from('daily_kitchen_log_entries')
      .select('item_id, shift, quantity, created_at, profiles!logged_by(name)')
      .eq('log_date', date)
      .order('created_at', { ascending: true }),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapName = (row: { profiles: unknown }) =>
    (row.profiles as unknown as { name: string } | null)?.name ?? null;

  return NextResponse.json({
    logs: (logs ?? []).map(l => ({ ...l, logged_by_name: mapName(l) })),
    entries: (entries ?? []).map(e => ({ ...e, logged_by_name: mapName(e) })),
  });
}
